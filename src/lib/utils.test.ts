import { dirname, join } from "node:path";
import fs from "node:fs";
import { model } from "./utils";

const response = await model.completions.create({
	model: "gpt-5.2",
	prompt: "Generate a 1 page shorty story about a robot learning to love in the style of Edgar Allan Poe.",
	stream: true,
});

for await (const chunk of response) {
	console.log(chunk);
}

console.log(response);

// const browser = await getBrowser();

// const { page, context } = await getBrowserPage();

// // await page.goto("https://infosimples.github.io/detect-headless/");
// await page.goto("https://ext.to/");

// // await page.goto("https://bot-detector.rebrowser.net/");

// const imagepath = join(__dirname, "..", "..", "data", "headless_test.png");

// fs.mkdirSync(dirname(imagepath), { recursive: true });

// // await page.waitForSelector(".container-fluid", { visible: true });

// await page.screenshot({ path: imagepath, captureBeyondViewport: true, fullPage: true });

// await page.close();

// await browser.close();

// process.exit(0);
