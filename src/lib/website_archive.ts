import { getBrowserPage, pathSafeFilename } from "./utils";

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

export async function archiveWebsite(link: string): Promise<WebsiteArchiveResult> {
	const page = await getBrowserPage();

	const url = new URL(link);
	const hostname = url.hostname;

	await page.goto(link, {
		waitUntil: "networkidle0",
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

	await page.close();

	return {
		url: link,
		hostname,
		screenshotPng: Buffer.from(screenshotPng),
		mhtml,
		html: Buffer.from(rawHtml, "utf-8"),
		text: Buffer.from(innerText, "utf-8"),
	};
}
