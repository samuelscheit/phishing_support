import { logStream, mailer, max_output_tokens, model } from "./util";
import fs from "fs";
import path from "path";
import { config } from "dotenv";
import { getInfo } from "./website_info";
import * as toon from "@toon-format/toon";
import { uniqBy } from "lodash";
import { archiveWebsite } from "./website_archive";

config({
	path: path.join(__dirname, "..", "..", ".env"),
	quiet: true,
});

export async function analyzeWebsite(link: string) {
	await archiveWebsite(link);

	const dirname = path.join(__dirname, "..", "..", "data", "website_assets", new URL(link).hostname);

	const text = fs.readFileSync(path.join(dirname, "website.txt"), "utf-8");
	const html = fs.readFileSync(path.join(dirname, "website.html"), "utf-8");

	const image = fs.readFileSync(path.join(dirname, "website.png"));

	console.log("Analyzing website with AI model...");

	const whois = await getInfo(link);

	const response = await model.responses.create({
		model: "gpt-5.2",
		input: [
			{
				role: "user",
				content: [
					{
						type: "input_text",
						text: `You are an expert phishing website analyst. Your task is to analyze the provided website and determine if it is a phishing website.

Here is the website link: ${link}

WhoIs information:
${toon.encode(whois)}

Here is the website text content:
<website_text>
${text}
</website_text>

Here is the website raw html skeleton:
${html}

Please provide a detailed analysis of the website, including any content and identifiying features, also if its trying to impersonate another brand or service.
Use web search if necessary to gather more information about the content/brand. (the website might be new and doesn't have any web results yet). (also you might not be able to access the website directly use the provided website text and screenshot).`,
					},
					{
						type: "input_image",
						detail: "high",
						image_url: `data:image/png;base64,${image.toString("base64")}`,
					},
				],
			},
		],
		reasoning: {
			effort: "medium",
			summary: "detailed",
		},
		tools: [
			{
				type: "web_search",
			},
		],
		stream: true,
	});

	const analysis = await logStream(response);
	console.dir(analysis, { depth: null });
	fs.writeFileSync(path.join(dirname, "analysis_result.json"), JSON.stringify(analysis, null, 2));

	// const analysis = {
	// 	output_text:
	// 		"## Verdict\n**Highly likely phishing / credential-harvesting site (very high confidence).** The page is designed to **impersonate Trade Republic** and capture a victim’s **phone number (and likely subsequent login factors such as PIN/OTP on the next steps)**.\n\n---\n\n## 1) What the site is pretending to be (brand impersonation)\nThe page text and layout clearly present themselves as **“Trade Republic. Invest, spend and bank.”** and shows a German login flow:\n\n- “**Melden Sie sich mit Ihrer Telefonnummer an.**” (Log in with your phone number)\n- Country code selector (default **+49**, Germany)\n- “Weiter” (Continue)\n- Links like “KONTO ERÖFFNEN” and “Ich habe den Zugang zur Telefonnummer verloren”\n- Language selector “Deutsch”\n- “Cookies verwalten”\n\nThis matches Trade Republic’s real-world product concept (a German broker/bank) and their common account identifier: **your phone number is used as the “username.”** ([support.traderepublic.com](https://support.traderepublic.com/de-de/853-How-can-I-connect-my-new-phone-number-to-my-account?utm_source=openai))  \nTrade Republic is a German online broker/bank and their public website is associated with **traderepublic.com**. ([en.wikipedia.org](https://en.wikipedia.org/wiki/Trade_Republic?utm_source=openai))\n\n**Conclusion:** The page is almost certainly a **Trade Republic look-alike** intended to trick Trade Republic customers into entering login details.\n\n---\n\n## 2) Domain / URL analysis (major red flags)\n### a) Domain is not an official Trade Republic domain\n- Suspicious URL provided: `https://saewar.com/De56Mgw1A`\n- Known/official Trade Republic domains (legitimate brand presence):\n  - `traderepublic.com` (long-established) ([whois.com](https://www.whois.com/whois/traderepublic.com?utm_source=openai))\n  - Trade Republic also uses other domains in its ecosystem such as `trade.re` (registered to Trade Republic Bank GmbH per WHOIS listing). ([whois.com](https://www.whois.com/whois/trade.re?utm_source=openai))\n\n**“saewar.com” has no brand relationship to Trade Republic** and is not a plausible Trade Republic property.\n\n### b) Extremely new domain registration (classic phishing signal)\nYour WHOIS/RDAP shows:\n- **Registration:** **2026-01-08**  \n- **Last changed:** **2026-01-08**  \n- **Expiration:** **2027-01-08**\n\nThat means the domain was created **one day ago** (relative to today, **2026-01-09**). Fresh domains + financial-login themes are strongly associated with phishing campaigns.\n\n### c) Random-looking path token\n`/De56Mgw1A` looks like a **campaign/unique tracking slug** commonly used in:\n- SMS phishing (“smishing”) links\n- Email phishing links\n- Rotating, disposable credential-harvesting pages\n\nLegitimate banks/brokers typically use consistent, branded paths (e.g., `/login`, `/auth`) on their own domains.\n\n---\n\n## 3) Hosting / DNS characteristics (supporting indicators)\nFrom the data you provided:\n\n- **A record:** `34.141.3.207` → Google Cloud allocation (customer space)  \n- Nameservers: **DNSPod** (`a.dnspod.com`, `b.dnspod.com`, `c.dnspod.com`)\n- **DNSSEC not enabled** (`delegationSigned: false`)\n- No MX/TXT records shown (often seen in throwaway phish domains that only host web pages)\n\nNone of these alone prove phishing, but **combined with brand impersonation + brand-mismatched domain + 1-day-old registration**, they strongly support malicious intent.\n\n---\n\n## 4) Page-content / UX indicators consistent with phishing\nBased on your screenshot + extracted text:\n\n- The page is a **minimal login prompt** asking for a phone number first, which is a common **step-1 data capture** technique.\n- For financial services, attackers often do:\n  1) Phone number collection  \n  2) PIN/password collection  \n  3) SMS TAN / OTP interception (“enter the code we sent you”)  \n  4) Account takeover / device pairing attempts\n\n- The page contains **just enough** UI elements (“open account”, “lost access”, cookies, language) to feel real, but it’s hosted on a **non-brand domain** with a **throwaway-looking URL**—a hallmark of phishing kits.\n\n---\n\n## 5) Overall risk rating\n**Risk: Critical (financial account takeover likely).**\n\nIf a user proceeds, likely outcomes include:\n- Trade Republic account takeover attempts\n- OTP/TAN harvesting\n- Unauthorized trades/withdrawals (depending on controls)\n- Identity data capture (later steps may ask for ID details)\n\n---\n\n## 6) Recommended response actions (practical)\n1. **Do not enter any information** on that site.\n2. If anyone already interacted with it:\n   - Change Trade Republic credentials / security settings immediately (as applicable)\n   - Review device authorizations and recent activity\n   - Contact Trade Republic support through official channels (start from known official domains, not links)\n3. **Report / takedown:**\n   - Report to the registrar/abuse contact shown (Tencent/DNSPod abuse email in your RDAP)\n   - Report to Google Cloud abuse (the IP is in Google Cloud customer space; Google has abuse reporting processes)\n   - Report to Trade Republic as brand impersonation\n\n---\n\n## Final conclusion\nThis is **not** a legitimate Trade Republic login page. It is **almost certainly a phishing site impersonating Trade Republic**, primarily indicated by the **brand mismatch (saewar.com vs. Trade Republic domains)** and the **one-day-old registration date (2026-01-08)** combined with a **credential-collection login flow**. ([whois.com](https://www.whois.com/whois/traderepublic.com?utm_source=openai))",
	// };

	const structuredResponse = await model.responses.parse({
		model: "gpt-5-nano",
		max_output_tokens: 500,
		input: [
			{
				role: "system",
				content: `Answer {"phishing":true} if the analysis concludes that the email is phishing or malicious. Otherwise answer {"phishing":false}. Provide no other text.`,
			},
			{
				role: "user",
				content: analysis.output_text,
			},
		],
		text: {
			format: {
				type: "json_schema",
				name: "PhishingResult",
				schema: {
					type: "object",
					properties: {
						phishing: { type: "boolean" },
					},
					required: ["phishing"],
					additionalProperties: false,
				},
				strict: true,
			},
			verbosity: "low",
		},
	});

	// const structuredResponse = {
	// 	output_parsed: { phishing: true },
	// 	output_text: "",
	// };

	if (!structuredResponse.output_parsed) {
		throw new Error(`Failed to parse structured response: ${JSON.stringify(structuredResponse.output_text)}`);
	}

	const { phishing } = structuredResponse.output_parsed;

	if (!phishing) {
		console.log("The website is NOT phishing.");
		process.exit(0);
	}

	const ip_rdaps = uniqBy(whois.ip_rdaps, (x) => x.abuse?.email || x.handle);

	ip_rdaps.map(async (rdap) => {
		if (!rdap.abuse) return;

		const reportMailStream = await model.responses.create({
			model: "gpt-5.2",
			input: [
				{
					role: "system",
					content: `You are an expert phishing analyst. Your task is to draft a concise report to the IP address space's abuse contact about a phishing website hosted on their IP address space.

	The report should include:
	1) A summary of the phishing analysis (be confident, no need to mention uncertainty)
	2) The phishing website URL and WhoIs/DNS/hosting details
	3) Request for takedown of the phishing site and any further investigation/mitigation.

	The website's content along with screenshot will automatically be attached as an attachment.
	You act on behalf of "the team of https://phishing.support".
	The tone should be professional and factual.`,
				},
				{
					role: "user",
					content: `Draft the report based on this analysis:

	${analysis.output_text}

	Phishing Website URL:
	${link}

	One DNS A/AAAA Record of domain ${link}
	points to IP: ${rdap.ip} of ${rdap.name || rdap.handle}

	RDAP information:
	${toon.encode(rdap)}`,
				},
			],
			max_output_tokens,
			tool_choice: "required",
			text: {
				format: {
					type: "json_schema",
					name: "send_mail",
					schema: {
						type: "object",
						properties: {
							to: { type: "string", description: "Recipient email address" },
							subject: { type: "string", description: "Email subject" },
							body: { type: "string", description: "Email body content" },
						},
						required: ["to", "subject", "body"],
						additionalProperties: false,
					},
					strict: true,
				},
				verbosity: "low",
			},
			stream: true,
		});

		const reportMailResult = await logStream(reportMailStream);
		console.dir(reportMailResult, { depth: null });

		fs.writeFileSync(
			path.join(dirname, `abuse_report_to_${rdap.abuse?.email || rdap.handle}.json`),
			JSON.stringify(reportMailResult.output_parsed, null, 2)
		);

		// const reportMailResult = {
		// 	output_parsed: {
		// 		to: "google-cloud-compliance@google.com",
		// 		subject: "Phishing site hosted on Google Cloud IP 34.141.3.207 (Trade Republic impersonation) – takedown request",
		// 		body: "Hello Google Cloud Abuse Team,\n\nWe are the team at https://phishing.support reporting a phishing/credential-harvesting website hosted within Google Cloud customer IP space.\n\n1) Summary of phishing analysis\n- Verdict: Highly likely phishing (very high confidence).\n- The site impersonates “Trade Republic” (German broker/bank) and presents a login flow requesting a victim’s phone number (“Melden Sie sich mit Ihrer Telefonnummer an”, +49 default, “Weiter”), consistent with credential/OTP harvesting patterns.\n- The domain is not associated with Trade Republic (not under traderepublic.com / trade.re) and appears newly registered (2026-01-08), which is strongly indicative of a phishing campaign.\n\n2) Phishing URL and DNS/hosting details\n- Phishing URL: https://saewar.com/De56Mgw1A\n- Domain: saewar.com (newly registered per provided WHOIS/RDAP: 2026-01-08; expires 2027-01-08)\n- DNS A record: saewar.com -> 34.141.3.207\n- IP / Netblock: 34.141.3.207 within ARIN NET-34-128-0-0-1 (34.128.0.0/10), Org/Handle: GOOGL-2 (Google LLC / Google Cloud customer space)\n- Nameservers: a.dnspod.com, b.dnspod.com, c.dnspod.com\n\n3) Request / action needed\nPlease investigate and disable the content/account hosting this phishing page on 34.141.3.207, and take any additional mitigation steps appropriate (e.g., suspension of the responsible project, blocking further malicious hosting, preservation of relevant logs for follow-up).\n\nThe phishing page content, screenshot, and the WHOIS/RDAP details referenced above are included as attachments.\n\nRegards,\nTeam @ https://phishing.support",
		// 	},
		// };

		const { to, subject, body } = reportMailResult.output_parsed;

		const mailSendResult = await mailer.sendMail({
			from: process.env.SMTP_FROM || "Phishing Support <report@phishing.support>",
			// to,
			// TODO: change back to actual abuse contact
			to: "samuel.scheit@me.com",
			subject,
			text: body + "\n\n",
			attachments: [
				{
					filename: "website.mhtml",
					content: fs.createReadStream(path.join(dirname, "website.mhtml")),
					contentType: "text/mhtml",
				},
				{
					filename: "website.png",
					content: image,
					contentType: "image/png",
				},
			],
		});

		console.dir(mailSendResult, { depth: null });
	});
}
