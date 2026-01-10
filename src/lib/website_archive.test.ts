import { archiveWebsite } from "./website_archive";

const link = "https://saewar.com/De56Mgw1A";

const result = await archiveWebsite(link);
console.log({
	hostname: result.hostname,
	screenshotBytes: result.screenshotPng.byteLength,
	mhtmlBytes: result.mhtml.byteLength,
	htmlBytes: result.html.byteLength,
	textBytes: result.text.byteLength,
});
