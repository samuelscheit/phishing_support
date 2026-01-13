import crypto from "node:crypto";

import { ImapFlow } from "imapflow";
import { config as loadDotenv } from "dotenv";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";

import { SubmissionsEntity } from "@/lib/db/entities";
import { generateId } from "@/lib/db/ids";
import { analyzeMail } from "@/lib/mail_ai";
import { join } from "node:path";
import { createEmailSubmissionFromEml } from "../../app/api/submissions/email/route";

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing env var: ${name}`);
	return value;
}

function envBool(name: string, defaultValue: boolean): boolean {
	const raw = process.env[name];
	if (raw === undefined) return defaultValue;
	return raw === "true" || raw === "1" || raw === "yes";
}

function envInt(name: string, defaultValue: number): number {
	const raw = process.env[name];
	if (!raw) return defaultValue;
	const value = Number.parseInt(raw, 10);
	if (!Number.isFinite(value)) return defaultValue;
	return value;
}

function normalizeAddress(address: string): string {
	return address.trim().toLowerCase();
}

function addressObjectIncludes(obj: AddressObject | AddressObject[] | undefined, address: string): boolean {
	if (!obj) return false;
	const needle = normalizeAddress(address);
	const list = Array.isArray(obj) ? obj : [obj];

	for (const entry of list) {
		for (const v of entry.value ?? []) {
			if (!v.address) continue;
			if (normalizeAddress(v.address) === needle) return true;
		}
	}

	return false;
}

function stripHtmlToText(html: string): string {
	let text = html
		.replace(/<\s*br\s*\/?\s*>/gi, "\n")
		.replace(/<\s*\/p\s*>/gi, "\n")
		.replace(/<\s*\/div\s*>/gi, "\n")
		.replace(/<\s*\/li\s*>/gi, "\n")
		.replace(/<\s*li\b[^>]*>/gi, "- ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/\s+\n/g, "\n")
		.replace(/\n\s+/g, "\n");

	text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	text = text.replace(/\n{3,}/g, "\n\n");
	return text.trim();
}

function extractForwardedText(parsed: ParsedMail): string {
	const text = (parsed.text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	if (text.trim()) {
		const lines = text.split("\n");

		const forwardedMarkers = [
			/^-{2,}\s*Forwarded message\s*-{2,}$/i,
			/^Begin forwarded message:?$/i,
			/^[- ]*Original Message[- ]*$/i,
			/^From:\s+/i,
			/^Sent:\s+/i,
			/^To:\s+/i,
			/^Subject:\s+/i,
		];

		let startIndex = -1;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line) continue;
			if (forwardedMarkers.some((re) => re.test(line))) {
				startIndex = i;
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

	if (parsed.html) {
		const stripped = stripHtmlToText(parsed.html);
		return stripped;
	}

	return "";
}

function buildSyntheticEml(params: { listenAddress: string; subject?: string; body: string }): string {
	const subject = (params.subject ?? "Forwarded message").trim() || "Forwarded message";
	const body = (params.body ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() || "(no content)";

	return [
		`From: unknown <unknown@local>`,
		`To: ${params.listenAddress}`,
		`Subject: ${subject}`,
		`Date: ${new Date().toUTCString()}`,
		`MIME-Version: 1.0`,
		`Content-Type: text/plain; charset="utf-8"`,
		`Content-Transfer-Encoding: 8bit`,
		"",
		body,
		"",
	].join("\r\n");
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

async function extractEmlsFromIncomingMessage(parsed: ParsedMail, listenAddress: string): Promise<string[]> {
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
	const forwardedText = extractForwardedText(parsed);
	const synthetic = buildSyntheticEml({
		listenAddress,
		subject: parsed.subject ? `Fwd: ${parsed.subject}` : undefined,
		body: forwardedText || "(could not extract forwarded content)",
	});
	return [synthetic];
}

export async function startImapListener() {
	// Load .env for standalone execution (Next.js loads env differently depending on runtime)
	loadDotenv({
		path: join(process.cwd(), ".env"),
		quiet: true,
	});

	const listenAddress = requiredEnv("IMAP_LISTEN_ADDRESS");

	const host = requiredEnv("IMAP_HOST");
	const port = envInt("IMAP_PORT", 993);
	const secure = envBool("IMAP_SECURE", true);
	const user = requiredEnv("IMAP_USER");
	const pass = requiredEnv("IMAP_PASS");
	const mailbox = requiredEnv("IMAP_MAILBOX");

	const client = new ImapFlow({
		host,
		port,
		secure,
		auth: {
			user,
			pass,
		},
	});

	let stopped = false;

	const stop = async () => {
		if (stopped) return;
		stopped = true;
		console.log("Stopping IMAP client...");
		try {
			await client.logout();
		} catch {
			// ignore
		}
		console.log("IMAP client stopped.");
		process.exit(0);
	};

	process.on("SIGINT", () => void stop());
	process.on("SIGTERM", () => void stop());

	console.log("Connecting to IMAP server...");

	await client.connect();

	let lock = await client.getMailboxLock(mailbox);
	try {
		const mailboxExists = () => (client.mailbox && typeof client.mailbox === "object" ? (client.mailbox.exists ?? 0) : 0);
		let lastExists = mailboxExists();

		while (!stopped) {
			// Wait for new events from server
			try {
				await client.idle();
			} catch (err) {
				// Connection might have been interrupted; try to continue unless stopping
				if (stopped) break;
				console.error("IMAP idle error:", err);
				await new Promise((r) => setTimeout(r, 2_000));
				continue;
			}

			const currentExists = mailboxExists();
			if (currentExists <= lastExists) continue;

			const range = `${lastExists + 1}:${currentExists}`;
			lastExists = currentExists;

			for await (const msg of client.fetch(range, { uid: true, source: true, flags: true, envelope: true })) {
				try {
					console.log(`Processing new IMAP message UID ${msg.uid}...`, msg);
					const sourcePrefix = `imap:${msg.uid}`;
					const existingSubmissionId = await SubmissionsEntity.findIdBySourcePrefix(sourcePrefix);
					if (existingSubmissionId) {
						console.log(`Skipping IMAP UID ${msg.uid}: already has submission ${existingSubmissionId.toString()}`);
						try {
							await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
						} catch (e) {
							console.error("Failed to mark IMAP message as seen (skip):", e);
						}
						continue;
					}

					const raw = msg.source?.toString("utf-8") ?? "";
					if (!raw.trim()) continue;

					let parsed: ParsedMail;
					try {
						parsed = await simpleParser(raw, { skipTextToHtml: true });
					} catch (err) {
						await SubmissionsEntity.create({
							kind: "email",
							data: { kind: "email" },
							dedupeKey: `imap:${msg.uid}`,
							id: generateId(),
							source: sourcePrefix,
							status: "failed",
							info: `Failed to parse incoming IMAP message: ${String(err)}`,
						});
						console.error("Error parsing IMAP message:", err);
						continue;
					}

					const isToListen =
						addressObjectIncludes(parsed.to, listenAddress) ||
						addressObjectIncludes(parsed.cc, listenAddress) ||
						addressObjectIncludes(parsed.bcc, listenAddress);

					if (!isToListen) continue;

					const emls = await extractEmlsFromIncomingMessage(parsed, listenAddress);

					for (let i = 0; i < emls.length; i++) {
						await createEmailSubmissionFromEml(emls[i], `imap:${msg.uid}${emls.length > 1 ? `:att${i + 1}` : ""}`);
					}

					// Mark original message as seen after successful submission creation
					try {
						await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
					} catch (e) {
						console.error("Failed to mark IMAP message as seen:", e);
						// ignore
					}
				} catch (err) {
					console.error("Error processing new IMAP message:", err);
				}
			}
		}
	} finally {
		lock.release();
		await stop();
	}
}
