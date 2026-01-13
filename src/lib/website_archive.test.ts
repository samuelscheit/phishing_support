import { readFileSync } from "fs";
import { archiveWebsite } from "./website_archive";

const link = "https://saewar.com/De56Mgw1A";

const result = await archiveWebsite({
	url: link,
	mhtmlSnapshot: readFileSync("/Users/user/Developer/phishing_reporter/data/snapshot_order.atmosgold.com_1768313526708.mhtml"),
});
console.log({
	hostname: result.hostname,
	screenshotBytes: result.screenshotPng.byteLength,
	mhtmlBytes: result.mhtml.byteLength,
	htmlBytes: result.html.byteLength,
	textBytes: result.text.byteLength,
});

process.exit(0);
