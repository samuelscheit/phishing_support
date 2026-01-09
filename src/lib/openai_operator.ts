import fs, { writeFileSync } from "fs";
import path from "path";
import { config } from "dotenv";
import { parse } from "node-html-parser";
import { launch } from "puppeteer-core";
import { tmpdir } from "os";
import { getBrowser, getBrowserPage, pathSafeFilename } from "./util";
import { OpenAI } from "openai";

config({
	path: path.join(__dirname, "..", "..", ".env"),
	quiet: true,
});

const link = "https://saewar.com/De56Mgw1A";

const width = 1024;
const height = 768;
const dirname = path.join(__dirname, "..", "..", "data", "website_assets", new URL(link).hostname);

// const page = await getBrowserPage();

// await page.setViewport({ width, height });

// await page.goto(link, {
// 	waitUntil: "networkidle0",
// });

let step = 0;

const model = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
	baseURL: process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1",
});

// const screenshot = await page.screenshot({
// 	fullPage: true,
// 	captureBeyondViewport: true,
// 	type: "jpeg",
// 	quality: 80,
// 	encoding: "base64",
// });

// fs.writeFileSync(path.join(dirname, `website.jpg`), Buffer.from(screenshot, "base64"));

const response = await model.responses.create({
	model: "computer-use-preview",
	tools: [
		{
			type: "computer_use_preview",
			display_width: width,
			display_height: height,
			environment: "browser",
		},
	],
	input: [
		{
			role: "system",
			content: `You are an website analyzer that helps identify phishing websites. Your goal is to gather proof that the website is a phishing website by interacting with the website like a victim would. If prompted for any information, you should provide fake but realistic information and proceed. After each action, describe what you see on the page and suggest the next action to take.`,
		},
		{
			role: "user",
			content: [
				{
					type: "input_text",
					text: `You are now viewing the website at ${link}. Analyze the website and determine if it is a phishing website. Describe what you see and suggest the next action to take.`,
				},
				// {
				// 	type: "input_image",
				// 	image_url: `data:image/jpeg;base64,${screenshot}`,
				// 	detail: "high", // text needs to be visible
				// },
			],
		},
	],
	parallel_tool_calls: false,
	reasoning: {
		effort: "medium",
		summary: "concise",
	},
	truncation: "auto",
	// service_tier: "flex",
});

console.log(response.output);

writeFileSync(path.join(dirname, `analysis_step_${step}.json`), JSON.stringify(response, null, "\t"));
