import { simpleParser, type AddressObject } from "mailparser";
import fs from "fs";
import path from "path";
import { config } from "dotenv";
import { parse } from "node-html-parser";
import { launch } from "puppeteer-core";
import { tmpdir } from "os";
import { getBrowser, getBrowserPage } from "./utils";
import is_ip_private from "private-ip";
import { analyzeSMTPHeadersFromRaw } from "@bernierllc/smtp-analyzer";

export function getAddressesText(obj: AddressObject[] | AddressObject | undefined): string {
	if (!obj) return "";

	let addresses: AddressObject[] = [];

	if (Array.isArray(obj)) {
		addresses = obj;
	} else {
		addresses = [obj];
	}

	return addresses.map(getAddressText).join("\n");
}

function getAddressText(obj: AddressObject | undefined): string {
	if (!obj) return "";

	let text = "";

	obj.value.forEach((addr) => {
		text += `"${addr.name}" <${addr.address}>\n`;
	});

	return text.trim();
}

export function getMailLinks(result: Awaited<ReturnType<typeof simpleParser>>) {
	try {
		if (!result.html) throw new Error("No HTML content found");

		const doc = parse(result.html);

		return doc.querySelectorAll("a").map((link) => {
			const href = link.getAttribute("href");

			return {
				href: href || "",
				text: link.text.trim(),
			};
		});
	} catch (error) {
		console.error("Error processing HTML content:", error);
	}
	return [];
}

export async function getMailImage(result: Awaited<ReturnType<typeof simpleParser>>) {
	const page = await getBrowserPage();

	try {
		if (!result.html) throw new Error("No HTML content found");

		await page.setViewport({ width: 1080, height: 720 });

		await page.setJavaScriptEnabled(false);

		await page.setContent(result.html, {
			waitUntil: "networkidle0",
		});

		await page.screenshot({
			path: path.join(__dirname, "..", "..", "data", "mail.png"),
			fullPage: true,
			captureBeyondViewport: true,
			type: "png",
		});
	} catch (error) {
		console.error("Error processing HTML content:", error);
	}

	await page.close();
}

function normalizeHeaderValue(value: unknown): string[] {
	if (value === undefined || value === null) return [];
	if (Array.isArray(value)) {
		return value.flatMap((entry) => normalizeHeaderValue(entry));
	}
	if (typeof value === "string") return [value];
	if (typeof value === "number" || typeof value === "boolean") return [String(value)];
	if (typeof value === "object") {
		const obj = value as Record<string, unknown>;
		if (typeof obj.text === "string") return [obj.text];
		if (typeof obj.value === "string") return [obj.value];
	}
	return [String(value)];
}

type HeaderMap = Map<string, string | string[]>;

function getHeaderValues(headers: HeaderMap, key: string): string[] {
	const value = headers.get(key);
	return normalizeHeaderValue(value);
}

type ReceivedHop = {
	fromHost: string;
	fromIp: string;
	byHost: string;
	withProto: string;
	// raw: string;
};

function parseReceived(lines: string[]): ReceivedHop[] {
	return lines.map((line) => {
		const compact = line.replace(/\s+/g, " ").trim();
		const fromMatch = compact.match(/\bfrom\s+([^\s]+)\b/i);
		const byMatch = compact.match(/\bby\s+([^\s]+)\b/i);
		const withMatch = compact.match(/\bwith\s+([^\s;]+)\b/i);
		const ipMatch = compact.match(/\[([0-9a-fA-F:.]+)\]/);

		return {
			fromHost: fromMatch?.[1] ?? "",
			fromIp: ipMatch?.[1] ?? "",
			byHost: byMatch?.[1] ?? "",
			withProto: withMatch?.[1] ?? "",
			// raw: compact,
		};
	});
}

export function analyzeHeaders(headers: string) {
	const result = analyzeSMTPHeadersFromRaw(headers);
	if (!result.success || !result.data) throw new Error(result.error);

	const headersMap = new Map();

	const headerLines = headers.split(/\r?\n/);
	headerLines.forEach((line) => {
		const sepIndex = line.indexOf(":");
		if (sepIndex > 0) {
			const key = line.slice(0, sepIndex).trim().toLowerCase();
			const value = line.slice(sepIndex + 1).trim();
			if (headersMap.has(key)) {
				const existing = headersMap.get(key);
				if (Array.isArray(existing)) {
					existing.push(value);
					headersMap.set(key, existing);
				} else {
					headersMap.set(key, [existing, value]);
				}
			} else {
				headersMap.set(key, value);
			}
		}
	});

	const dmarcPolicy = getHeaderValues(headersMap, "x-dmarc-policy");
	const dmarcInfo = getHeaderValues(headersMap, "x-dmarc-info");
	const arcInfo = getHeaderValues(headersMap, "x-arc-info");

	const hops = parseReceived(result.data.routing.totalHops.map((x) => x.raw));
	const sourceHop = [...hops].find((hop) => hop.fromIp && !is_ip_private(hop.fromIp)) || [...hops].reverse().find((hop) => hop.fromIp);

	result.data.routing.totalHops.forEach((x) => {
		// @ts-ignore
		delete x.raw;
	});
	delete result.data.authentication.rawHeader;
	const signature = result.data.securityHeaders.dkimSignature;
	delete result.data.securityHeaders.receivedSpf;
	delete result.data.securityHeaders.dkimSignature;

	return {
		authentication: {
			...result.data.authentication,
			...result.data.securityHeaders,
			dmarc: {
				policy: dmarcPolicy[0] || "",
				info: dmarcInfo[0] || "",
			},
			dkim: {
				...result.data.authentication.dkim,
				signature,
			},
			arc: arcInfo[0] || "",
		},
		routing: {
			...result.data.routing,
			...(sourceHop
				? {
						originatingIp: sourceHop.fromIp,
						originatingServer: sourceHop.fromHost,
					}
				: {}),
		},
	};

	// return {
	// 	identifiers: {
	// 		returnPath: getHeaderValues(headers, "return-path")[0] || "",
	// 		messageId: getHeaderValues(headers, "message-id")[0] || "",
	// 		subject: getHeaderValues(headers, "subject")[0] || "",
	// 		date: getHeaderValues(headers, "date")[0] || "",
	// 	},
	// 	client: {
	// 		mailer: getHeaderValues(headers, "x-mailer")[0] || "",
	// 	},
	// 	auth: {
	// 		results: parseAuthResults(authResults),
	// 		receivedSpf: receivedSpf[0] || "",
	// 		dmarcPolicy: dmarcPolicy[0] || "",
	// 		dmarcInfo: dmarcInfo[0] || "",
	// 	},
	// 	received: {
	// 		hops,
	// 		sourceIp: sourceHop?.fromIp || "",
	// 		sourceHost: sourceHop?.fromHost || "",
	// 	},
	// };
}
