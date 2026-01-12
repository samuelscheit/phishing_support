// import { Browser, launch } from "puppeteer-core";
import path from "path";
import fs from "fs";
import { tmpdir } from "os";

import {
	CDPSession,
	Frame,
	HTTPResponse,
	launch,
	Page,
	Protocol,
	PuppeteerLifeCycleEvent,
	type Browser,
	type GoToOptions,
} from "rebrowser-puppeteer-core";
import sanitize from "sanitize-filename";
import OpenAI from "openai";
import { config } from "dotenv";
import type { Stream } from "openai/streaming";
import type { ResponseStreamEvent } from "openai/resources/responses/responses.mjs";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";
import { SocksProxyAgent } from "socks-proxy-agent";
import { fetch } from "netbun";
import axios from "axios";
import { HttpProxyAgent } from "http-proxy-agent";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({
	path: path.join(__dirname, "..", "..", ".env"),
	quiet: true,
});

let browserPromise: Promise<Browser> | null = null;

export async function getBrowser() {
	if (browserPromise) return browserPromise;
	// TODO: harden puppeteer/browser for security

	const isDocker = process.env.DOCKER === "true" || process.env.PUPPETEER_NO_SANDBOX === "true";
	const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

	const userDataDir = path.join(tmpdir(), "puppeteer-user-data");
	fs.mkdirSync(userDataDir, { recursive: true });
	console.log(`Created temporary user data directory at: ${userDataDir}`);

	const args: string[] = [
		`--screen-size=1920,1080`,
		"--disable-extensions",
		"--disable-file-system",
		"--disable-dev-shm-usage",
		"--disable-blink-features=AutomationControlled",
		"--disable-features=site-per-process",
		"--disable-advertisements",
		"--enable-javascript",
		"--disable-blink-features=AutomationControlled",
		"--disable-gpu",
		"--enable-webgl",
		`--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36`,
	];

	// Chromium inside containers commonly requires disabling sandbox.
	if (isDocker) {
		args.push("--no-sandbox", "--disable-setuid-sandbox");
	}

	browserPromise = launch({
		executablePath: chromePath,
		headless: false,
		// userDataDir,
		ignoreDefaultArgs: ["--enable-automation"],
		args,
		downloadBehavior: {
			policy: "deny",
		},
		acceptInsecureCerts: true,
		dumpio: true,
	});

	return browserPromise;
}

async function waitForCDPElement({
	cdp,
	nodeId,
	selector,
	intervalMs = 50,
	timeoutMs = 30000,
}: {
	cdp: CDPSession;
	nodeId: number;
	selector: string;
	timeoutMs?: number;
	intervalMs?: number;
}) {
	const start = Date.now();

	while (true) {
		if (Date.now() - start > timeoutMs) {
			throw new Error(`Timeout waiting for element matching selector: ${selector}`);
		}

		const { nodeId: elementNodeId } = await cdp.send("DOM.querySelector", {
			nodeId,
			selector,
		});

		if (elementNodeId && elementNodeId !== 0) {
			return elementNodeId;
		}

		await sleep(intervalMs);
	}
}

function recursiveSearchDocument(document: Protocol.DOM.Node, predicate: (node: Protocol.DOM.Node) => boolean): Protocol.DOM.Node | null {
	if (predicate(document)) {
		return document;
	}

	for (const child of document.children || []) {
		const result = recursiveSearchDocument(child, predicate);
		if (result) {
			return result;
		}
	}
	for (const child of document.shadowRoots || []) {
		const result = recursiveSearchDocument(child, predicate);
		if (result) {
			return result;
		}
	}

	return null;
}

export class DeferredPromise<T> {
	public promise: Promise<T>;
	public resolve!: (value: T | PromiseLike<T>) => void;
	public reject!: (reason?: any) => void;

	constructor() {
		this.promise = new Promise<T>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}

	then(onfulfilled?: (value: T) => void, onrejected?: (reason: any) => void) {
		return this.promise.then(onfulfilled, onrejected);
	}

	catch(onrejected?: (reason: any) => void) {
		return this.promise.catch(onrejected);
	}
}

const isCloudflareChallengeUrl = (url: string) =>
	url.includes("challenges.cloudflare.com") || url.includes("/cdn-cgi/challenge-platform/") || url.includes("cf-challenge");

export async function getBrowserPage(p?: Page, proxy_country_code?: string) {
	const browser = await getBrowser();

	const context = await browser.createBrowserContext({
		proxyServer: proxy_country_code ? process.env.PROXY_URL_NO_AUTH : undefined,
	});

	const page = p || (await context.newPage());

	if (proxy_country_code) {
		await page.authenticate({
			username: proxy_country_code.toLowerCase(),
			password: "any",
		});
	}

	let cloudflareWait = new DeferredPromise<void>();

	// await page.setRequestInterception(true);

	// page.on("request", (request) => {
	// 	console.log("Requesting:", request.url());
	// 	request.continue();
	// });

	// page.on("response", async (response) => {
	// 	console.log("Received response:", response.status(), response.url());
	// });

	page.on("console", (msg) => {
		const type = msg.type();
		const text = msg.text();

		console.log(`[Browser Console] [${type}] ${text}`);
	});

	const waitForCloudflare = async (frame: Frame, page: Page) => {
		const source = page.url();

		console.log(`[Cloudflare] challenge (${source}), solving...`);

		await frame.waitForSelector(`body`);

		// @ts-ignore
		const target = browser.targets().find((x) => x._targetId === frame._id)!;
		const cdp = await target.createCDPSession();

		const document = await cdp.send("DOM.getDocument", {
			depth: -1,
			pierce: true,
		});

		const body = recursiveSearchDocument(document.root, (node) => node.nodeName.toLowerCase() === "body");

		const [root] = body?.shadowRoots || [];
		if (!root) throw new Error("No shadow root found in body");
		try {
			const input = await waitForCDPElement({
				cdp,
				nodeId: root.nodeId,
				selector: `input[type="checkbox"]`,
				timeoutMs: 30000,
			});

			const { node } = await cdp.send("DOM.describeNode", {
				nodeId: input,
				depth: -1,
				pierce: true,
			});

			// @ts-ignore
			const handle = (await frame.mainRealm().adoptBackendNode(node.backendNodeId)) as ElementHandle<Element>;

			await handle.click();
		} catch (error) {
			console.warn(`[Cloudflare] no checkbox found:`, (error as Error)?.message);
		}

		await page.waitForNavigation({ timeout: 30000 }).catch((error) => {
			console.warn(`Cloudflare wait timed out:`, error);
		});
		cloudflareWait.resolve();

		return cloudflareWait;
	};

	page.on("framenavigated", async (frame) => {
		const url = frame.url();

		if (isCloudflareChallengeUrl(url)) {
			await waitForCloudflare(frame, page);
		}
	});

	page.on("dialog", async (dialog) => {
		await sleep(1000 * Math.random() + 1000);
		await dialog.dismiss();
	});
	await page.setViewport({ width: 1920, height: 1080 });

	const originalGoto = page.goto.bind(page);

	async function handleResponse(response: HTTPResponse | null, waitUntil?: string, timeout = 30000) {
		// console.log("navigated", "status:", response?.status(), "url:", response?.url(), "headers:", response?.headers()["cf-mitigated"]);

		if (response?.status() === 403 && response.headers()["cf-mitigated"] === "challenge") {
			console.log("[Cloudflare] challenge (403), waiting...");
			// await waitForCloudflare("response 403");
			response = await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 });

			cloudflareWait = new DeferredPromise<void>();

			await cloudflareWait;
			console.log("[Cloudflare] challenge passed");
		}

		if (waitUntil === "networkidle0") {
			await page.waitForNetworkIdle({
				concurrency: 0,
				idleTime: 500,
				timeout,
			});
		} else if (waitUntil === "networkidle2") {
			await page.waitForNetworkIdle({
				concurrency: 2,
				idleTime: 500,
				timeout,
			});
		} else if (waitUntil === "load") {
			const start = Date.now();
			while (true) {
				try {
					const readyState = await page.evaluate(() => document.readyState);
					if (readyState === "complete") break;
				} catch (error) {}
				if (Date.now() - start > timeout) {
					throw new Error(`Timeout waiting for load event`);
				}
				await sleep(50);
			}
		} else if (waitUntil === "domcontentloaded") {
			const start = Date.now();
			while (true) {
				try {
					var readyState = await page.evaluate(() => document.readyState);

					if (readyState === "interactive" || readyState === "complete") break;
				} catch (error) {}
				if (Date.now() - start > timeout) {
					throw new Error(`Timeout waiting for domcontentloaded event`);
				}
				await sleep(50);
			}
		}

		return response;
	}

	page.goto = async (url: string, options?: GoToOptions) => {
		const response = await originalGoto(url, {
			...options,
			waitUntil: "domcontentloaded",
		});

		return await handleResponse(response, (options?.waitUntil as PuppeteerLifeCycleEvent) || "load", options?.timeout || 30000);
	};

	return { page, context };
}

export function pathSafeFilename(input: string, { fallback = "file", maxLen = 180 } = {}) {
	let s = sanitize(input.replaceAll("/", "_")).trim();

	// Windows-Sonderfall: keine abschließenden Punkte/Spaces
	s = s.replace(/[. ]+$/g, "");

	// Leere/ungültige Ergebnisse abfangen
	if (!s || s === "." || s === "..") s = fallback;

	// Länge begrenzen (Platz für Erweiterung lassen)
	if (s.length > maxLen) s = s.slice(0, maxLen);

	return s;
}

export async function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function logStream(response: Stream<ResponseStreamEvent>) {
	for await (const chunk of response) {
		if (chunk.type === "response.output_text.delta") {
			process.stdout.write(chunk.delta);
		} else if (chunk.type === "response.reasoning_summary_text.delta") {
			process.stdout.write(chunk.delta);
		} else if (chunk.type === "response.reasoning_summary_part.done") {
			process.stdout.write("\n[Reasoning Summary Completed]\n");
		} else if (chunk.type === "response.reasoning_summary_part.added") {
			process.stdout.write("\n[Reasoning Summary Added]\n");
		} else if (chunk.type === "response.in_progress") {
			process.stdout.write("\n[Response In Progress]\n");
		} else if (chunk.type === "response.created") {
			process.stdout.write("\n[Response Created]\n");
		} else if (chunk.type === "response.content_part.done") {
			process.stdout.write("\n[Content Part Completed]\n");
		} else if (chunk.type === "response.content_part.added") {
			process.stdout.write("\n[Content Part Added]\n");
		} else if (chunk.type === "response.output_text.done") {
			process.stdout.write("\n[Output Text Completed]\n");
		} else if (chunk.type === "response.reasoning_summary_text.done") {
			process.stdout.write("\n[Reasoning Text Completed]\n");
		} else if (chunk.type === "response.web_search_call.in_progress") {
			process.stdout.write("\n[Web Search in progress...]\n");
		} else if (chunk.type === "response.web_search_call.searching") {
			process.stdout.write(`\n[Searching the web]`);
		} else if (chunk.type === "response.web_search_call.completed") {
			process.stdout.write(`\n[Web Search completed]`);
		} else if (chunk.type === "response.output_item.done") {
			process.stdout.write(`\n[Output item done]\n`);
		} else if (chunk.type === "response.output_item.added") {
			process.stdout.write(`\n[Output item added]\n`);
		} else if (chunk.type === "response.output_text.annotation.added") {
			if ((chunk.annotation as any).url) {
				process.stdout.write(` (${(chunk.annotation as any).url}) `);
			} else {
				console.dir(chunk.annotation, { depth: null });
			}
		} else if (chunk.type === "response.completed") {
			const output = chunk.response.output.at(-1);
			let output_text = chunk.response.output_text || "";
			let output_parsed = null;

			if (output?.type === "message") {
				output_text = output.content
					.map((c) => {
						if (c.type === "output_text") return c.text;
						if (c.type === "refusal") throw new Error(`Model refused to answer: ${c.refusal}`);
						throw new Error(`Unknown output content type: ${JSON.stringify(c)}`);
					})
					.join("");

				if (chunk.response.text) {
					try {
						output_parsed = JSON.parse(output_text);
					} catch (error) {
						throw new Error(`Failed to parse output text as JSON: ${error}\n\nOutput Text:\n${output_text}`);
					}
				}
			}

			return {
				...chunk.response,
				output_text,
				output_parsed,
			};
		} else {
			console.dir(chunk, { depth: null });
		}
	}

	throw new Error("Stream ended without completion");
}

const smtpHost = process.env.SMTP_HOST || "smtp.ethereal.email";
const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
const smtpSecure = process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === "true" : smtpPort === 465;
const smtpUser = process.env.SMTP_USER || "maddison53@ethereal.email";
const smtpPass = process.env.SMTP_PASS || "jn7jnAPss4f63QBp6D";

if (smtpSecure && smtpPort === 587) {
	console.warn("SMTP_SECURE=true with port 587 can cause TLS errors; use SMTP_SECURE=false for STARTTLS.");
}

export const mailer = nodemailer.createTransport({
	host: smtpHost,
	port: smtpPort,
	secure: smtpSecure,
	auth: {
		user: smtpUser,
		pass: smtpPass,
	},
});

export const max_output_tokens = 30000;

export const model = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY ?? "",
	baseURL: process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1",
	// fetch,
	fetchOptions: {
		agent: new HttpProxyAgent(process.env.PROXY_URL!),
		proxy: process.env.PROXY_URL,
	},
});

export async function getUserCC(req: Request) {
	try {
		const ip = req.headers.get("CF-Connecting-IP") || req.headers.get("x-forwarded-for");
		if (!ip) throw new Error("No IP found");

		console.log("Fetching country code for IP:", ip);

		const response = await axios(`https://api.country.is/${ip}`);

		console.log("Country code response:", response.data);
		return response.data.country as string;
	} catch (error) {}
	return "de";
}
