import fs from "fs";
import path from "path";
import { simpleParser, type AddressObject } from "mailparser";
import { getBrowserPage, logStream, mailer, max_output_tokens, model } from "./util";
import { analyzeHeaders } from "./mail";
import * as toon from "@toon-format/toon";
import { getInfo, type RDAPEntity, type WhoISInfo } from "./website_info";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getAddressesText(obj: AddressObject[] | AddressObject | undefined): string {
	if (!obj) return "";

	let addresses: AddressObject[] = [];

	if (Array.isArray(obj)) {
		addresses = obj;
	} else {
		addresses = [obj];
	}

	return addresses.map(getAddressText).join("\n");
}

function getAddressText(obj: AddressObject | undefined): string {
	if (!obj) return "";

	let text = "";

	obj.value.forEach((addr) => {
		text += `"${addr.name}" <${addr.address}>\n`;
	});

	return text.trim();
}

function recursiveGetRemarks(entity: RDAPEntity): string {
	return entity.remarks + (entity.entities ? "\n" + entity.entities.map(recursiveGetRemarks).join("\n") : "");
}

function simplifyWhois(info: WhoISInfo) {
	const rdap = info.ip_rdaps[0]!;

	return {
		ip: rdap.ip,
		name: rdap.name,
		remarks: recursiveGetRemarks(rdap),
	};
}

export async function analyzeMail(input: string = "") {
	const parsedMail = await simpleParser(input, { skipTextToHtml: true });
	fs.writeFileSync(path.join(__dirname, "..", "..", "data", "mail.json"), JSON.stringify(parsedMail, null, 2));

	const headers = analyzeHeaders(parsedMail.headerLines.map((x) => x.line).join("\n"));

	const whois = await getInfo(headers.routing.originatingIp!);

	const mail = {
		from: getAddressesText(parsedMail.from),
		to: getAddressesText(parsedMail.to),
		cc: getAddressesText(parsedMail.cc),
		bcc: getAddressesText(parsedMail.bcc),
		subject: parsedMail.subject || "",
		text: (parsedMail.text || "")
			.replaceAll(/(\r?\n)+/g, "\n")
			.replaceAll(/\n/g, " ")
			.trim(),
		headers: {
			...headers,
			routing: {
				...headers.routing,
				whois: simplifyWhois(whois),
			},
		},
	};

	console.dir(mail, { depth: null });
	// console.log(toon.encode(mail));
	// if (1 == 1) process.exit();

	const aiStream = await model.responses.create({
		model: "gpt-5-mini",
		tools: [
			{
				type: "web_search",
			},
		],
		input: [
			{
				role: "system",
				content: `You are an expert email phishing analyst. Your task is to determine whether the email below is phishing, malicious, or legitimate.

	Your analysis must include:
	1) Brand impersonation check
	   - does it mimic a known company/service?
	   - Does the used email domain match the official domain of that brand? Use web search to verify.
	2) Link analysis:
	   - List every URL found.
	   - For each: visible text vs actual URL (if available), domain reputation cues, lookalikes/typos, URL shorteners, redirects, unusual paths (use web search to follow links)
	   - Identify the “primary action” the email tries to push.
	3) Sender authenticity checks (based on headers if provided):
	   - SPF, DKIM, DMARC results and alignment
	   - Return-Path vs From mismatch
	   - Reply-To mismatch
	   - Received chain anomalies, unusual sending IP/ASN or geolocation (if inferable)
	4) Content red flags:
	   - credential collection, payment request, QR codes, fake invoices, “verify account”, “unusual activity”, etc.`,
			},
			{
				role: "user",
				content: `analyze this email:
	${toon.encode(mail)}`,
			},
		],
		stream: true,
		max_output_tokens,
		reasoning: {
			effort: "medium",
			summary: "auto",
		},
	});

	const mail_analysis = await logStream(aiStream);
	console.dir(mail_analysis, { depth: null });

	// const ai_response = {
	// 	output_text:
	// 		"Short answer: This is a phishing message. It impersonates Trade Republic and pushes you to click a suspicious verification link that is NOT on Trade Republic's domain. Do NOT click the saewar.com link — treat the message as malicious and delete or report it.\n\nAnalysis (structured to match your requested checks)\n\n1) Brand impersonation\n- The email tries to impersonate Trade Republic Bank (German broker/neo‑bank). Trade Republic’s official site/domain is traderepublic.com (and official communications will come from @traderepublic.com or other company-controlled domains). ([en.wikipedia.org](https://en.wikipedia.org/wiki/Trade_Republic))\n- The message’s From address is information7@mail7.rzhlzl.com — that does not match traderepublic.com and is not an official Trade Republic sending domain. The headers you supplied confirm the mail originated from mail7.rzhlzl.com (SPF passed for that domain/IP), so the attacker is sending from a third-party/disposable domain rather than Trade Republic’s domain.\n\n2) Link analysis (all URLs present in the email)\n- Visible/embedded URLs:\n  1. https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRriW79msxKVKnNkWXrb4QP7jwTt6GiTJ2New&s\n     - This is a Google-hosted image (gstatic). Likely only used to show a logo/image in the message; not the main threat. (Visible text contains the gstatic URL.)\n  2. https://saewar.com/De56Mgw1A\n     - This is the primary action link (“Jetzt verifizieren” / “Verify now”). Visible text = same URL in the body.\n     - saewar.com is not Trade Republic’s domain and is unrelated to the bank. Attempts to fetch the site during analysis failed (the site did not respond / returned an error), which is suspicious when combined with its use in an account‑verification phishing email. (I could not retrieve a healthy, authoritative site response for saewar.com during checks.) ([]())\n- Domain/reputation cues and red flags:\n  - The action link points to a domain (saewar.com) that does not match the brand (tradeRepublic) — classic credential‑harvesting/phishing pattern.\n  - The link uses a short-looking path /De56Mgw1A (often used by phishing landing pages or redirectors to track victims).\n  - The message explicitly instructs you to click the button and complete verification on “the official Trade Republic Website,” but the link does not point to Trade Republic — that is a mismatch and a phishing indicator.\n- Primary action pushed by the email: Click the “Jetzt verifizieren” link to “verify” your account (likely to capture credentials or personal documents on a fake site).\n\n3) Sender authenticity checks (from the headers you supplied)\n- SPF: result = pass for client IP 34.102.117.75 sending as information7@mail7.rzhlzl.com (the receiving mail system accepted the SPF for the rzhlzl sending domain). That means the sending IP was authorized in the SPF record of rzhlzl.com (or the envelope domain), not that it belongs to Trade Republic.\n- DKIM: result = none (despite a DKIM header block being present in the headers you pasted). Either DKIM could not be validated or the signature was malformed/absent — DKIM did not vouch for Trade Republic.\n- DMARC: header shows a policy string referring to mail7.rzhlzl.com and the header indicates DMARC information related to that sending domain; however, DMARC applies to the domain in the From: header. Because the From: domain is NOT traderepublic.com, DMARC for traderepublic (if configured) is irrelevant here — the attacker used a different domain and passed SPF/DKIM checks for that domain. Also note: legitimate Trade Republic messages will align with Trade Republic’s own DMARC/DKIM/SPF records; this message does not.\n- Return-Path / From match: The envelope/envelope-from appears to be the same sending domain information7@mail7.rzhlzl.com — so technically the envelope and From align to the rzhlzl domain. But the From display name is “Trade Republic,” which is brand spoofing (display name trick).\n- Sending IP geolocation / network: The sending IP 34.102.117.75 is in an address range commonly used by Google Cloud / cloud hosting providers (many phishing campaigns rent cloud VMs or mail services). That explains how SPF could pass when using a cloud VM that the rzhlzl domain authorized. Example: 34.* ranges are used by Google Cloud. ([docs.cloud.google.com](https://docs.cloud.google.com/datastream/docs/ip-allowlists-and-regions?utm_source=openai))\n- Bottom line: the authentication results (SPF pass for rzhlzl) show the message was legitimately sent from the rzhlzl mail infrastructure — but that infrastructure is not Trade Republic. Passing SPF for a non‑brand domain does not make the message legitimate for a different brand it claims to be.\n\n4) Content red flags\n- Urgency / account verification: “Schliessen Sie Ihre Identitätsprüfung ab” / “Jetzt verifizieren” — standard phishing lure (pressure to act).\n- Credential/document collection flow implied: The email directs you to click a link to complete verification (typical credential collection / fake KYC landing page). The line “Bitte laden Sie keine Dokumente per E-Mail hoch” is often used by phishers to push victims to their fake web form instead.\n- Sender/display name impersonation: display name = “Trade Republic” but sender domain not matching brand.\n- Unexpected: If you didn’t recently open an account or request verification, this is unsolicited.\n- Known industry context: regulators and consumer authorities have warned about clone sites impersonating Trade Republic and similar brokers; these scams are an active pattern. ([cincodias.elpais.com](https://cincodias.elpais.com/mercados-financieros/2025-02-17/la-cnmv-advierte-de-un-clon-de-trade-republic-y-otros-ocho-chiringuitos-financieros.html?utm_source=openai))\n\nSupporting external findings (most important internet-sourced points)\n- Official Trade Republic domain: traderepublic.com. Legitimate verification flows should be via Trade Republic’s official domains/apps, not saewar.com. ([en.wikipedia.org](https://en.wikipedia.org/wiki/Trade_Republic))\n- Saewar.com did not return a normal/healthy site during checks (site fetch failed), increasing suspicion that it’s a throwaway / malicious landing zone. ([]())\n- The sending IP (34.102.*) is within address ranges commonly used by Google Cloud / cloud providers — consistent with phishing actors using cloud hosting for mail/web hosting. ([docs.cloud.google.com](https://docs.cloud.google.com/datastream/docs/ip-allowlists-and-regions?utm_source=openai))\n- There are publicly reported clone/fraud campaigns impersonating Trade Republic (regulatory/news warnings), so this exact impersonation is a known tactic. ([cincodias.elpais.com](https://cincodias.elpais.com/mercados-financieros/2025-02-17/la-cnmv-advierte-de-un-clon-de-trade-republic-y-otros-ocho-chiringuitos-financieros.html?utm_source=openai))\n\nVerdict (concise)\n- This is a phishing email. It impersonates Trade Republic but the sending domain (mail7.rzhlzl.com) and the verification link (saewar.com/...) do NOT belong to Trade Republic. The message should be treated as malicious.\n\nRecommended actions (what you should do now)\n1. Do NOT click any links or download attachments from that message.\n2. Do NOT reply or provide any credentials or documents.\n3. Mark the message as phishing in your mail client (Move to Spam/Phishing).\n4. If you have an account at Trade Republic:\n   - Open the official Trade Republic app or go to traderepublic.com by typing the address yourself or using the official app (do not use links from the email) and check for any alerts/requests in your account.\n   - If you suspect compromise, change your Trade Republic password only via the official site/app and enable any available 2FA.\n5. Forward the phishing email (with full headers) to Trade Republic’s abuse/support contact (use the address from Trade Republic’s official site — do not use any contact from the phishing mail). Many companies have an abuse or phishing reporting address; if unsure, use the contact channels on traderepublic.com to report the message. ([en.wikipedia.org](https://en.wikipedia.org/wiki/Trade_Republic))\n6. Optionally report the phishing message to:\n   - Your email provider (use the client’s “Report phishing” function).\n   - Anti‑phishing bodies / authorities in your country (e.g., in the U.S. you can report to the FTC / IC3).\n7. If you clicked the link already: disconnect the device from the network, do not enter credentials further, and change passwords for any account that might be affected. Consider running antivirus scans and, if credentials were entered, contact your bank/financial institution immediately.\n\nIf you want, I can:\n- Draft a short report/template you can forward to Trade Republic / your email provider (including the headers).\n- Do a deeper technical lookup of the sender domains (rzhlzl.com / saewar.com) and provide registrar/WHOIS or hosting details — I attempted basic checks and saewar.com didn’t respond; I can run more lookups and collect WHOIS/hosting evidence if you want that.\n\nWould you like me to prepare a report you can forward to Trade Republic and your email provider (with the exact headers and a short explanation)?",
	// };

	const structuredResponse = await model.responses.parse({
		model: "gpt-5-nano",
		max_output_tokens: 500,
		// reasoning: {
		// effort: "none",
		// },
		input: [
			{
				role: "system",
				content: `Answer {"phishing":true} if the analysis concludes that the email is phishing or malicious. Otherwise answer {"phishing":false}. Provide no other text.`,
			},
			{
				role: "user",
				content: mail_analysis.output_text,
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

	const { phishing } = structuredResponse.output_parsed || {};

	if (!phishing) {
		console.log("The email is NOT phishing.");
		process.exit(0);
	}

	const abuseContact = whois.ip_rdaps[0]?.abuse;

	if (!abuseContact) throw new Error(`No abuse contact found for sending IP: ${JSON.stringify(whois)}`);

	const reportMailStream = await model.responses.create({
		model: "gpt-5.2",
		input: [
			{
				role: "system",
				content: `You are an expert email phishing analyst. Your task is to draft a concise report to the abuse contact of the sending IP's owner, reporting a phishing email that originated from their infrastructure.

	The report must include:
	1) A brief summary of the phishing email (brand impersonated, main action pushed).
	2) The sending IP and domain used.
	3) A request for investigation and mitigation (e.g., blocking the sender, taking down related infrastructure).

	The original phishing email with full headers will automatically be attached as an attachment.
	You act on behalf of "the team of https://phishing.support".
	The tone should be professional and factual.`,
			},
			{
				role: "user",
				content: `Draft the report based on this analysis:

	${toon.encode(mail)}
	${mail_analysis.output_text}

	Sending IP: ${headers.routing.originatingIp}
	Sending Domain: ${headers.routing.originatingServer}

	Abuse Contact:
	${toon.encode(abuseContact)}
	`,
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

	// const reportMailResult = {
	// 	output_parsed: {
	// 		to: "google-cloud-compliance@google.com",
	// 		subject: "Phishing report: Trade Republic impersonation from 34.102.117.75 (mail7.rzhlzl.com)",
	// 		body: "Hello Google Cloud Abuse Team,\n\nWe are reporting a phishing email sent from Google Cloud IP space that impersonates Trade Republic and attempts to lure recipients into completing a fake “account/identity verification”. The email directs the victim to click a “Jetzt verifizieren” link leading to a non-Trade-Republic URL.\n\nSummary of abuse:\n- Impersonated brand: Trade Republic\n- Lure/action: “Complete identity verification / verify your Trade Republic account”\n- Phishing URL: https://saewar.com/De56Mgw1A\n\nSending infrastructure observed:\n- Originating IP: 34.102.117.75\n- HELO / originating server: mail7.rzhlzl.com\n- From / envelope domain used: information7@mail7.rzhlzl.com\n\nRequest:\nPlease investigate the Google Cloud resource/customer responsible for outbound email from 34.102.117.75 and mitigate the abuse (e.g., suspend/disable the offending instance/account, block further SMTP abuse from this sender, and assist with takedown/disablement of related infrastructure used to distribute the phishing campaign).\n\nThe original phishing email with full headers is attached for your review.\n\nRegards,\nThe team of https://phishing.support",
	// 	},
	// 	output_text: "",
	// };

	if (!reportMailResult.output_parsed) {
		throw new Error(`Failed to parse structured report mail result: ${JSON.stringify(reportMailResult.output_text)}`);
	}

	console.dir(reportMailResult, { depth: null });

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
				filename: "phishing_email.eml.txt",
				content: input,
				contentType: "text/plain; charset=utf-8",
			},
		],
	});

	console.dir(mailSendResult, { depth: null });
}
