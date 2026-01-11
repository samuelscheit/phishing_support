import { dirname, join } from "node:path";
import fs from "node:fs";
import { getBrowser, getBrowserPage } from "./utils";

const browser = await getBrowser();

const context = await browser.createBrowserContext({
	proxyServer: `http://109.199.115.133:3128`,
});

const p = await context.newPage();

await p.authenticate({
	username: "de",
	password: "any",
});

const page = await getBrowserPage(p);

await page.goto("https://saewar.com/De56Mgw1A");
// await page.goto("https://ipapi.co/json/");
// https://saewar.com/De56Mgw1A

// await page.goto("https://bot-detector.rebrowser.net/");

const imagepath = join(__dirname, "..", "..", "data", "headless_test.png");

fs.mkdirSync(dirname(imagepath), { recursive: true });

// await page.waitForSelector(".container-fluid", { visible: true });

await page.screenshot({ path: imagepath, captureBeyondViewport: true, fullPage: true });

// await page.close();

// await context.close();

// await browser.close();

// process.exit(0);
