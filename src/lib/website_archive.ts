import { getBrowser, getBrowserPage, pathSafeFilename } from "./utils";

export type ArchivedWebsiteResponse = {
	name: string;
	meta: {
		url: string;
		status: number;
		headers: Record<string, string>;
		method: string;
		remoteAddress: unknown;
		accessedAt: string;
	};
	body: Buffer;
};

export type WebsiteArchiveResult = {
	url: string;
	hostname: string;
	screenshotPng: Buffer;
	mhtml: Buffer;
	html: Buffer;
	text: Buffer;
};

async function archiveWebsiteInternal(link: string, country_code?: string): Promise<WebsiteArchiveResult> {
	const browser = await getBrowser();

	const context = await browser.createBrowserContext({
		proxyServer: country_code ? `http://109.199.115.133:3128` : undefined,
	});

	const p = await context.newPage();

	if (country_code) {
		await p.authenticate({
			username: country_code.toLowerCase(),
			password: "any",
		});
	}

	const page = await getBrowserPage(p);

	const url = new URL(link);
	const hostname = url.hostname;

	await page.setRequestInterception(true);

	await new Promise<void>(async (resolve, reject) => {
		page.on("response", (response) => {
			if (!response.request().isNavigationRequest()) return;
			const uri = new URL(response.url());
			if (hostname !== uri.hostname) {
				reject(new Error("Redirected to different hostname"));
			}
		});

		await page.goto(link, {
			waitUntil: "networkidle0",
			timeout: 10000,
		});

		resolve();
	});

	const screenshotPng = await page.screenshot({
		fullPage: true,
		captureBeyondViewport: true,
		type: "png",
	});

	const cdp = await page.target().createCDPSession();
	const snapshot = await cdp.send("Page.captureSnapshot", {
		format: "mhtml",
	});
	const mhtml = Buffer.from(snapshot.data, "utf-8");

	// without js/css/style/svg
	const rawHtml = await page.evaluate(() => {
		// @ts-ignore
		const doc = globalThis.document.cloneNode(true) as Document;
		const elements = doc.querySelectorAll("script, style, link, svg, noscript, img");
		elements.forEach((el) => el.remove());
		doc.querySelectorAll("*").forEach((el) => {
			el.removeAttribute("style");
		});

		return doc.documentElement.outerHTML;
	});

	let innerText = await page.evaluate(() => {
		// @ts-ignore
		return globalThis.document.body.innerText;
	});

	const description = await page.evaluate(() => {
		// @ts-ignore
		return (
			globalThis.document
				.querySelector("meta[name='description'], meta[property='og:description'], meta[property='twitter:description']")
				?.getAttribute("content") || ""
		);
	});

	innerText = (await page.title()) + "\n\n" + description + "\n\n" + innerText;

	await context.close();

	return {
		url: link,
		hostname,
		screenshotPng: Buffer.from(screenshotPng),
		mhtml,
		html: Buffer.from(rawHtml, "utf-8"),
		text: Buffer.from(innerText, "utf-8"),
	};
}

export async function archiveWebsite(link: string, user_country_code?: string): Promise<WebsiteArchiveResult> {
	try {
		return await archiveWebsiteInternal(link, user_country_code);
	} catch (err) {
		console.warn(`First archive attempt failed for ${link} using country code ${user_country_code}: ${(err as Error).message}`);
		return await archiveWebsiteInternal(link);
	}
}
