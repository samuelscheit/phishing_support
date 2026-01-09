import fs, { writeFileSync } from "fs";
import path from "path";
import { config } from "dotenv";
import { getBrowserPage, pathSafeFilename } from "./util";

export async function archiveWebsite(link: string) {
	const page = await getBrowserPage();

	const dirname = path.join(__dirname, "..", "..", "data", "website_assets", new URL(link).hostname);

	page.on("response", async (response) => {
		const url = response.url();
		if (!url.startsWith("http")) return;

		const uri = new URL(url);

		const pathname = path.join(dirname, pathSafeFilename(`${new Date().getTime()}${uri.pathname}${uri.search}${uri.hash}`));
		const meta_path = `${pathname}.meta.json`;

		fs.mkdirSync(path.dirname(pathname), { recursive: true });

		try {
			const buffer = await response.buffer();
			writeFileSync(pathname, buffer);
			writeFileSync(
				meta_path,
				JSON.stringify(
					{
						url: response.url(),
						status: response.status(),
						headers: response.headers(),
						method: response.request().method(),
						remoteAddress: response.remoteAddress(),
						accessedAt: new Date().toISOString(),
					},
					null,
					"\t"
				)
			);

			console.log(`Saved: ${url} -> ${pathname}`);
		} catch (error) {
			console.error(`Failed to save: ${url}`, error);
		}
	});

	await page.goto(link, {
		waitUntil: "networkidle0",
	});

	await page.screenshot({
		path: path.join(dirname, "website.png"),
		fullPage: true,
		captureBeyondViewport: true,
		type: "png",
	});

	const cdp = await page.target().createCDPSession();

	const result = await cdp.send("Page.captureSnapshot", {
		format: "mhtml",
	});
	fs.writeFileSync(path.join(dirname, "website.mhtml"), result.data);

	// without js/css/style/svg
	const raw_html = await page.evaluate(() => {
		// @ts-ignore
		const doc = globalThis.document.cloneNode(true) as Document;
		const elements = doc.querySelectorAll("script, style, link, svg, noscript, img");
		elements.forEach((el) => el.remove());
		doc.querySelectorAll("*").forEach((el) => {
			el.removeAttribute("style");
		});

		return doc.documentElement.outerHTML;
	});

	fs.writeFileSync(path.join(dirname, "website.html"), raw_html);

	let text = await page.evaluate(() => {
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

	text = (await page.title()) + "\n\n" + description + "\n\n" + text;

	fs.writeFileSync(path.join(dirname, "website.txt"), text);

	await page.close();
}
