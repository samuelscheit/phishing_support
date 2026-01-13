import MailAddressParser from "nodemailer/lib/addressparser";
import MailComposer from "nodemailer/lib/mail-composer";
import parse, { HTMLElement } from "node-html-parser";
import { Parser } from "htmlparser2";
import { ChildNode, DomHandler } from "domhandler";
import render from "dom-serializer";
import { AddressObject, ParsedMail, simpleParser } from "mailparser";

function searchRecursive(nodes: ChildNode[], predicate: (node: ChildNode) => any): ChildNode | null {
	for (const node of nodes) {
		const result = predicate(node);
		if (result) return result as any;

		if ("children" in node && node.children) {
			const found = searchRecursive(node.children, predicate);
			if (found) return found;
		}
	}

	return null;
}

function recursiveReverseSearch(node: ChildNode, predicate: (node: ChildNode) => any): any {
	if (!node) return null;

	const result = predicate(node);
	if (result) return result as any;

	if ("prev" in node && node.prev) {
		const found = recursiveReverseSearch(node.prev, predicate);
		if (found) return found;
	}

	if ("parent" in node && node.parent) {
		return recursiveReverseSearch(node.parent, predicate);
	}
}

function getNodeText(node: ChildNode): string {
	if (!node) return "";
	if ("data" in node && typeof (node as any).data === "string") return (node as any).data;
	if ("children" in node && Array.isArray((node as any).children)) {
		return ((node as any).children as ChildNode[]).map(getNodeText).join("");
	}
	return "";
}

function isElement(node: ChildNode): boolean {
	return !!node && typeof (node as any).type === "string" && (node as any).type === "tag";
}

function elementHasClass(node: ChildNode, className: string): boolean {
	if (!isElement(node)) return false;
	const attribs = (node as any).attribs as Record<string, string> | undefined;
	const raw = attribs?.class;
	if (!raw) return false;
	return raw.split(/\s+/g).includes(className);
}

function isTrivialHtmlNode(node: ChildNode): boolean {
	if (!node) return true;
	// Whitespace text node
	if ((node as any).type === "text") {
		return getNodeText(node).trim().length === 0;
	}
	if (!isElement(node)) return false;
	const name = String((node as any).name || "").toLowerCase();
	if (name === "br") return true;
	// Gmail sometimes inserts empty <u></u> between header and body
	if (name === "u") return getNodeText(node).trim().length === 0;
	return false;
}

function nextNonTrivialSibling(node: ChildNode | null | undefined): ChildNode | null {
	let cur = node as any;
	while (cur && cur.next) {
		cur = cur.next;
		if (!isTrivialHtmlNode(cur)) return cur as ChildNode;
	}
	return null;
}

function findClosestForwardHeaderContainer(node: ChildNode | null | undefined): ChildNode | null {
	let cur = node as any;
	while (cur) {
		if (elementHasClass(cur, "gmail_attr")) return cur as ChildNode;
		cur = cur.parent;
	}
	return null;
}

function findTopLevelAncestor(node: ChildNode | null | undefined): ChildNode | null {
	let cur = node as any;
	if (!cur) return null;
	while (cur && cur.parent) cur = cur.parent;
	return cur as ChildNode;
}

function nodeLooksLikeForwardHeaderLine(node: ChildNode): boolean {
	const text = getNodeText(node).replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\s+/g, " ").trim();
	if (!text) return false;
	// Header lines are usually short; this reduces false positives in long HTML bodies.
	if (text.length > 800) return false;
	return /^(from|von|to|an|subject|betreff|date|datum|sent|gesendet|cc|bcc)\s*:/i.test(text);
}

function splitAfterForwardHeaders(nodes: ChildNode[], startAt: number): string | null {
	let i = startAt;
	let headerCount = 0;
	let sawAnyNonTrivial = false;

	for (; i < nodes.length; i++) {
		const n = nodes[i];
		if (isTrivialHtmlNode(n)) continue;
		sawAnyNonTrivial = true;
		if (nodeLooksLikeForwardHeaderLine(n)) {
			headerCount++;
			continue;
		}
		break;
	}

	// Require multiple header lines to be confident we're skipping a header block.
	if (!sawAnyNonTrivial) return null;
	if (headerCount < 2) return null;
	if (i >= nodes.length) return null;
	return render(nodes.slice(i), { decodeEntities: true });
}

function trySplitFromContainer(container: ChildNode, markerNode: ChildNode): string | null {
	if (!("children" in container) || !Array.isArray((container as any).children)) return null;
	const kids = (container as any).children as ChildNode[];
	if (kids.length === 0) return null;

	// Find the topmost child within container that still contains markerNode
	let topChild: ChildNode | null = markerNode;
	let cur: any = markerNode;
	while (cur && cur.parent && cur.parent !== container) {
		cur = cur.parent;
	}
	if (cur && cur.parent === container) topChild = cur as ChildNode;

	const idx = topChild ? kids.indexOf(topChild) : -1;
	if (idx < 0) return null;
	return splitAfterForwardHeaders(kids, idx);
}

function trySplitAfterMarkerInAncestors(markerNode: ChildNode): string | null {
	let cur: any = markerNode;
	while (cur) {
		const parent = cur.parent as any;
		if (parent && Array.isArray(parent.children)) {
			const siblings = parent.children as ChildNode[];
			const idx = siblings.indexOf(cur as ChildNode);
			if (idx >= 0) {
				// Case A: marker node itself is already a header line (e.g., first "From:" div)
				const splitAtMarker = splitAfterForwardHeaders(siblings, idx);
				if (splitAtMarker) return splitAtMarker;
				// Case B: marker node is "Begin forwarded message" and headers come after it
				const splitAfterMarker = splitAfterForwardHeaders(siblings, idx + 1);
				if (splitAfterMarker) return splitAfterMarker;
			}
		}
		cur = parent;
	}
	return null;
}

export async function extractForwardedHtmlBody(parsed: Pick<ParsedMail, "html">): Promise<string> {
	const html = typeof parsed.html === "string" ? parsed.html : "";
	if (!html.trim()) return "";

	const forwardedMarkers = [
		/^-{2,}\s*Forwarded message\s*-{2,}$/i,
		/^Begin forwarded message:?$/i,
		/^[- ]*Original Message[- ]*$/i,
		/^(From|Von):\s*/i,
		/^(Gesendet|Sent):\s*/i,
		/^(Date|Datum):\s*/i,
		/^(To|An):\s*/i,
		/^(Subject|Betreff):\s*/i,
	];

	const dom = await new Promise<ChildNode[]>((resolve, reject) => {
		const handler = new DomHandler((error, dom) => {
			if (error) {
				reject(error);
			} else {
				resolve(dom);
			}
		});

		const parser = new Parser(handler);
		parser.write(html);
		parser.end();
	});

	const markerNode = searchRecursive(dom, (node) => {
		const data = getNodeText(node);
		if (!data) return false;
		const lines = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			for (const re of forwardedMarkers) {
				if (re.test(trimmed)) return node;
			}
		}
		return false;
	});

	if (!markerNode) {
		// No obvious marker; return original HTML as-is.
		return html;
	}

	// Gmail forwarded messages: headers live in <div class="gmail_attr"> ... </div>, body follows.
	const gmailHeader = findClosestForwardHeaderContainer(markerNode);
	if (gmailHeader) {
		const start = nextNonTrivialSibling(gmailHeader);
		if (start && (start as any).parent && Array.isArray((start as any).parent.children)) {
			const siblings = (start as any).parent.children as ChildNode[];
			const idx = siblings.indexOf(start);
			if (idx >= 0) {
				return render(siblings.slice(idx), { decodeEntities: true });
			}
		}
	}

	// iCloud / Apple Mail forwarding style: multiple "From/Subject/Date/To" divs, then the actual HTML body.
	// Try to skip that header block either at the root level or inside a container.
	const top = findTopLevelAncestor(markerNode);
	if (top) {
		const rootIdx = dom.indexOf(top);
		if (rootIdx >= 0) {
			const split = splitAfterForwardHeaders(dom, rootIdx);
			if (split) return split;
		}
		const splitInContainer = trySplitFromContainer(top, markerNode);
		if (splitInContainer) return splitInContainer;
	}
	const splitFromAncestors = trySplitAfterMarkerInAncestors(markerNode);
	if (splitFromAncestors) return splitFromAncestors;

	// Generic fallback: take the next meaningful sibling after the marker text node.
	let start: ChildNode | null = nextNonTrivialSibling(markerNode);
	let climb: any = markerNode;
	while (!start && climb && climb.parent) {
		start = nextNonTrivialSibling(climb);
		climb = climb.parent;
	}

	if (start && (start as any).parent && Array.isArray((start as any).parent.children)) {
		const siblings = (start as any).parent.children as ChildNode[];
		const idx = siblings.indexOf(start);
		if (idx >= 0) {
			return render(siblings.slice(idx), { decodeEntities: true });
		}
	}

	// Last resort: return everything from the marker onward by blanking what came before.
	recursiveReverseSearch(markerNode, (node) => {
		if ("data" in node && typeof (node as any).data === "string") {
			(node as any).data = "";
		}
	});
	return render(dom, { decodeEntities: true });
}

export async function extractForwardedText(parsed: ParsedMail) {
	const text = (parsed.text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

	const forwardedMarkers = [
		/^-{2,}\s*Forwarded message\s*-{2,}$/i,
		/^Begin forwarded message:?$/i,
		/^[- ]*Original Message[- ]*$/i,
		/^From:\s+/i,
		/^Von:\s+/i,
		/^Sent:\s+/i,
		/^Date:\s+/i,
		/^To:\s+/i,
		/^Subject:\s+/i,
	];

	if (parsed.html) {
		const dom = await new Promise<ChildNode[]>((resolve, reject) => {
			const handler = new DomHandler((error, dom) => {
				if (error) {
					reject(error);
				} else {
					resolve(dom);
				}
			});

			const parser = new Parser(handler);
			parser.write(parsed.html as string);
			parser.end();
		});

		let found = searchRecursive(dom, (node) => {
			if ("data" in node && typeof node.data === "string") {
				const textContent = node.data.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
				for (const line of textContent) {
					for (const re of forwardedMarkers) {
						if (re.test(line.trim())) {
							return node;
						}
					}
				}
			}

			return false;
		});

		if (found) {
			recursiveReverseSearch(found, (node) => {
				if ("data" in node && typeof node.data === "string") {
					node.data = "";
				}
			});

			const rendered = render(dom, { decodeEntities: true });
			return rendered;
		}
	}

	if (text.trim()) {
		const lines = text.split("\n");

		let startIndex = -1;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line) continue;
			const forwardMarker = forwardedMarkers.findIndex((re) => re.test(line));
			if (forwardMarker !== -1) {
				startIndex = i;

				if (forwardMarker === 0 || forwardMarker === 1) {
					startIndex++;
				}

				break;
			}
		}

		if (startIndex >= 0) {
			return lines.slice(startIndex).join("\n").trim();
		}

		const quoted = lines.map((l) => l.replace(/^\s*>\s?/, "")).filter((l) => l.trim().length > 0);

		// If it looks mostly like quoted content, prefer that
		const quotedCount = lines.filter((l) => /^\s*>/.test(l)).length;
		if (quotedCount >= Math.max(5, Math.floor(lines.length * 0.3))) {
			return quoted.join("\n").trim();
		}

		return text.trim();
	}

	return "";
}

function bufferToUtf8String(value: unknown): string {
	if (!value) return "";
	if (Buffer.isBuffer(value)) return value.toString("utf-8");
	if (value instanceof Uint8Array) return Buffer.from(value).toString("utf-8");
	if (typeof value === "string") return value;
	return "";
}

function looksLikeRfc822Message(raw: string): boolean {
	if (!raw) return false;
	// Heuristic: RFC822 message usually starts with a header block, then a blank line.
	// Avoid treating binary blobs as emails.
	if (raw.includes("\u0000")) return false;

	const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const head = normalized.slice(0, 50_000);
	const lines = head.split("\n");

	let headerLines = 0;
	let sawBlankLine = false;
	let hasFrom = false;
	let hasTo = false;
	let hasSubject = false;
	let hasDate = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === "") {
			sawBlankLine = true;
			break;
		}

		// Folded header continuation
		if (/^\s+/.test(line)) continue;

		const m = /^([A-Za-z0-9-]{1,64}):\s*(.*)$/.exec(line);
		if (!m) return false;
		headerLines++;
		const key = m[1].toLowerCase();
		if (key === "from") hasFrom = true;
		if (key === "to" || key === "cc" || key === "bcc") hasTo = true;
		if (key === "subject") hasSubject = true;
		if (key === "date") hasDate = true;
	}

	if (!sawBlankLine) return false;
	if (headerLines < 3) return false;
	if (!hasFrom) return false;
	if (!hasTo && !hasSubject) return false;

	// Many legitimate messages won’t have Date, but it’s a useful additional signal.
	return hasDate || hasSubject || hasTo;
}

function parseMailAddressToObject(address: AddressObject | AddressObject[] | undefined): { address: string; name: string } | undefined {
	if (Array.isArray(address)) {
		return {
			address: address[0].value[0].address!,
			name: address[0].value[0].name || "",
		};
	} else if (typeof address === "object" && address.value.length > 0) {
		return {
			address: address.value[0].address!,
			name: address.value[0].name || "",
		};
	}
	return undefined;
}

export async function extractEmlsFromIncomingMessage(parsed: ParsedMail, listenAddress: string): Promise<string[]> {
	const emls: string[] = [];

	for (const att of parsed.attachments ?? []) {
		const filename = (att.filename ?? "").toLowerCase();
		const contentType = (att.contentType ?? "").toLowerCase();
		const raw = bufferToUtf8String(att.content);
		if (!raw.trim()) continue;

		// Standard cases
		if (filename.endsWith(".eml") || contentType === "message/rfc822") {
			emls.push(raw);
			continue;
		}

		// Also allow other extensions (e.g. .txt) when the content itself appears to be an RFC822 message.
		// Some providers forward EMLs as "text/plain" attachments.
		if (!looksLikeRfc822Message(raw)) continue;

		try {
			const parsedAttachment = await simpleParser(raw, { skipTextToHtml: true });
			if (parsedAttachment.from || parsedAttachment.subject || parsedAttachment.text || parsedAttachment.html) {
				emls.push(raw);
			}
		} catch {
			// Not actually parseable as an email; ignore
		}
	}

	if (emls.length > 0) return emls;

	// No .eml attachments found → synthesize from forwarded/quoted message body
	try {
		const forwardedText = await extractForwardedText({
			text: parsed.text,
		} as any);
		const forwardedHtml = await extractForwardedHtmlBody({
			html: parsed.html,
		});

		const mail = await simpleParser(forwardedText);

		let from = mail.from;

		const von = mail.headers.get("von") as string | undefined;

		if (!from && von) {
			const addresses = MailAddressParser(von, { flatten: true });
			const [address] = addresses;
			from = {
				text: address?.address || "",
				value: addresses,
				html: address?.address || "",
			};
		}

		const composed = await new MailComposer({
			from: parseMailAddressToObject(from),
			to: parseMailAddressToObject(parsed.from),
			bcc: parseMailAddressToObject(mail.bcc),
			cc: parseMailAddressToObject(mail.cc),
			subject: parsed.subject?.replace("Fwd:", "").replace("FW:", "").trim() || mail.subject || "(no subject)",
			text: mail.text || undefined,
			html: forwardedHtml || undefined,
			attachments: (mail.attachments || parsed.attachments).map((x) => ({
				...x,
				contentDisposition: x.contentDisposition as any,
				headers: Object.fromEntries(x.headers.entries()) as any,
				raw: x.content,
			})),
		})
			.compile()
			.build();

		// return [forwardedText];
		return [composed.toString()];
	} catch {}

	return [];
}
