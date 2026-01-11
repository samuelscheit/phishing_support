import * as toon from "@toon-format/toon";

import { ReportsEntity, SubmissionsEntity } from "./db/entities";
import { runStreamedAnalysisRun } from "./analysis_run";
import { max_output_tokens, mailer, getBrowserPage, sleep } from "./utils";
import type { WhoISInfo } from "./website_info";
import { MailData } from "./mail_ai";
import { GoogleAuth } from "google-auth-library";
// @ts-ignore
import anticaptcha from "@antiadmin/anticaptchaofficial";

type ReportDraft = {
	to: string;
	subject: string;
	body: string;
};

type ReportAttachment = {
	filename: string;
	content: Buffer;
	contentType?: string;
};

async function generateReportDraft(params: {
	submissionId: bigint;
	system: string;
	user: string;
	withoutHeader?: boolean;
}): Promise<ReportDraft> {
	const { result } = await runStreamedAnalysisRun({
		submissionId: params.submissionId,
		options: {
			model: "gpt-5.2",
			input: [
				{ role: "system", content: params.system },
				{ role: "user", content: params.user },
			],
			max_output_tokens,
			text: {
				format: {
					type: "json_schema",
					name: "report_email",
					schema: {
						type: "object",
						properties: params.withoutHeader
							? {
									body: { type: "string" },
								}
							: {
									to: { type: "string" },
									subject: { type: "string" },
									body: { type: "string" },
								},
						required: params.withoutHeader ? ["body"] : ["to", "subject", "body"],
						additionalProperties: false,
					},
					strict: true,
				},
				verbosity: "low",
			},
			stream: true,
		},
	});
	if (!result.output_parsed) throw new Error("Failed to parse report draft response: " + result.output_text);

	return result.output_parsed as ReportDraft;
}

async function sendReportEmail(params: { submissionId: bigint; draft: ReportDraft; attachments?: ReportAttachment[]; data?: any }) {
	const from = process.env.SMTP_FROM || "Phishing Support <report@phishing.support>";

	// const mailSendResult = await mailer.sendMail({
	// 	from,
	// 	to: params.draft.to,
	// 	subject: params.draft.subject,
	// 	text: `${params.draft.body}\n\n`,
	// 	attachments: params.attachments,
	// });
	const mailSendResult = {
		messageId: "",
	};

	console.log("---- Report Email ----");
	console.log("From:", from);
	console.log("To:", params.draft.to);
	console.log("Subject:", params.draft.subject);
	console.log("Body:", params.draft.body);
	if (params.attachments) {
		console.log("Attachments:", params.attachments.map((a) => a.filename).join(", "));
	}
	console.log("----------------------");

	await ReportsEntity.create({
		submissionId: params.submissionId,
		to: params.draft.to,
		subject: params.draft.subject,
		body: params.draft.body,
		providerMessageId: mailSendResult.messageId,
	});

	await SubmissionsEntity.update(params.submissionId, { status: "reported" });
}

export async function reportWebsitePhishing(params: {
	submissionId: bigint;
	url: string;
	whois: WhoISInfo;
	analysisText: string;
	archive: { screenshotPng: Buffer; mhtml: Buffer };
}) {
	const system = `You are an expert phishing analyst. Draft a concise report to the abuse contact about a phishing website hosted on their infrastructure.

The report must include:
1) A short summary of the phishing analysis.
2) The phishing website URL and relevant WHOIS/RDAP/DNS/hosting details.
3) A clear request for investigation and takedown/mitigation.

Write on behalf of "the team of https://phishing.support".
Tone: professional and factual.`;

	const user = `Draft the report based on this analysis:

${params.analysisText}

Phishing Website URL:
${params.url}

WhoIS/DNS:
${toon.encode(params.whois)}`;

	const draft = await generateReportDraft({
		submissionId: params.submissionId,
		system,
		user,
	});

	await sendReportEmail({
		submissionId: params.submissionId,
		draft,
		attachments: [
			{
				filename: "website.mhtml",
				content: params.archive.mhtml,
				contentType: "text/mhtml",
			},
			{
				filename: "website.png",
				content: params.archive.screenshotPng,
				contentType: "image/png",
			},
		],
		data: { url: params.url },
	});
}

export async function reportEmailPhishing(params: { submissionId: bigint; mail: MailData; analysisText: string }) {
	const system = `You are an expert email phishing analyst. Draft a concise report to the abuse contact of the sending IP's owner, reporting a phishing email that originated from their infrastructure.

The report must include:
1) A brief summary of the phishing email (brand impersonated, main action pushed).
2) The sending IP/domain used and any relevant header signals.
3) A request for investigation and mitigation.

The original phishing email with full headers will be attached.
Write on behalf of "the team of https://phishing.support".
Tone: professional and factual.`;

	const user = `Draft the report based on this analysis:

${params.analysisText}

Email:
${toon.encode({ ...params.mail, eml: undefined })}
}`;

	const draft = await generateReportDraft({
		submissionId: params.submissionId,
		system,
		user,
	});

	await sendReportEmail({
		submissionId: params.submissionId,
		draft,
		attachments: [
			{
				filename: "original.eml",
				content: Buffer.from(params.mail.eml, "utf-8"),
				contentType: "message/rfc822",
			},
		],
	});
}

export async function reportToGoogleSafeBrowsing(params: {
	url: string;
	explanation?: string;
	tries?: number;
	submissionId: bigint;
	analysisText: string;
}) {
	if (!params.tries) params.tries = 0;

	if (!params.explanation) {
		const system = `You are an expert phishing analyst. Write a concise explanation for reporting a phishing website to Google Safe Browsing.
The explanation must clearly state that the website is a phishing site and summarize the key reasons why.`;

		const user = `Write the explanation based on this analysis:

${params.analysisText}

Phishing Website URL:
${params.url}
`;

		const draft = await generateReportDraft({
			submissionId: params.submissionId,
			system,
			user,
			withoutHeader: true,
		});

		params.explanation = draft.body;
	}

	if (params.explanation.length > 800) {
		let endOfSentence = params.explanation.lastIndexOf(".", 800);

		if (endOfSentence === -1) {
			endOfSentence = 800;
		}

		params.explanation = params.explanation.slice(0, endOfSentence + 1);
	}

	const { page, context } = await getBrowserPage(undefined, "de");

	try {
		const report_url = `https://safebrowsing.google.com/safebrowsing/report_phish/?hl=de&url=${encodeURIComponent(params.url)}`;

		const { ANTICAPTCHA_API_KEY } = process.env;
		var token = undefined as string | undefined;

		if (ANTICAPTCHA_API_KEY) {
			anticaptcha.setAPIKey(ANTICAPTCHA_API_KEY || "");

			const uri = new URL(report_url);

			console.log("Solving reCAPTCHA v3 for Google Safe Browsing report page...");
			console.log(uri.origin + uri.pathname);

			token = await anticaptcha.solveRecaptchaV3(
				report_url,
				"6LdyJYcqAAAAAIkFpjuB7uz9WgDXmMECefi-8X-d",
				0.9, //minimum score required: 0.3, 0.7 or 0.9
				"submitUrl"
			);
			console.log("solved token:", token);

			// process.exit();

			await page.setRequestInterception(true);

			page.on("request", (req) => {
				const url = req.url();
				// Block specific URL
				if (
					(url.includes("https://www.google.com/recaptcha/api") || url.includes("https://www.gstatic.com/recaptcha/releases")) &&
					url.includes(".js")
				) {
					req.abort();
					console.log("Blocked:", url);
				} else {
					req.continue();
				}
			});
		}

		await page.goto(report_url, {
			waitUntil: "domcontentloaded",
		});

		if (token) {
			await page.evaluate((token) => {
				// Replacement for grecaptcha
				// @ts-ignore
				window.grecaptcha = {
					execute: function (sitekey: string, parameters: any) {
						console.log(`called execute function with sitekey ${sitekey} and parameters`, parameters);

						return new Promise((resolve) => resolve(token));
					},
					ready: function (callback: () => void) {
						callback();
					},
				};

				// @ts-ignore
				window.grecaptcha.enterprise = window.grecaptcha;
			}, token);
		}

		await page.waitForSelector(`#mat-input-0`);

		await page.type(`#mat-input-1`, params.explanation);

		await page.focus(`button[type="submit"]`);
		await sleep(Math.random() * 500 + 500);
		await page.keyboard.press("Enter");

		let card = await page.waitForSelector(`.form-status-card`);
		if (!card) throw new Error("Failed to find submission status card on Google Safe Browsing report page.");

		let hasSuccess = !!(await card.$(".success"));
		let hasFailure = !!(await card.$(".failure"));

		let text = await card.$eval("mat-card-content", (el) => el.textContent?.trim() || "");

		if (hasFailure) {
			console.warn("Google Safe Browsing report failed:", text);
			await sleep(3000); // wait before retrying
			// await page.click(`button[type="submit"]`);

			await page.focus(`button[type="submit"]`);
			await sleep(Math.random() * 500 + 500);
			await page.keyboard.press("Enter");
			await sleep(3000);

			card = await page.waitForSelector(`.form-status-card`);
			if (!card) throw new Error("Failed to find submission status card on Google Safe Browsing report page.");

			hasSuccess = !!(await card.$(".success"));
			hasFailure = !!(await card.$(".failure"));

			text = await card.$eval("mat-card-content", (el) => el.textContent?.trim() || "");

			console.log("Retry result:", text, { hasSuccess, hasFailure });

			if (hasFailure) {
				if (params.tries >= 0) {
					throw new Error("Google Safe Browsing report failed after multiple tries: " + text);
				}

				console.warn("Google Safe Browsing report failed, retrying...", text);
				await page.close();
				return reportToGoogleSafeBrowsing({ ...params, tries: params.tries + 1 });
			}
		}

		if (!hasSuccess) throw new Error("Google Safe Browsing report submission status unknown: " + card.evaluate((el) => el.outerHTML));

		const reportId = await ReportsEntity.create({
			submissionId: params.submissionId,
			to: `Google Safe Browsing`,
			body: params.explanation,
		});

		await context.close();

		return {
			success: true,
			reportId: reportId,
			info: text,
		};
	} catch (err) {
		await context.close();
		throw err;
	}
}

export async function reportToGoogleSafeBrowsingAPI(params: { url: string; projectNumber?: string }) {
	const projectNumber =
		params.projectNumber ||
		process.env.WEBRISK_PROJECT_NUMBER ||
		process.env.GOOGLE_CLOUD_PROJECT_NUMBER ||
		process.env.GOOGLE_CLOUD_PROJECT;

	if (!projectNumber) {
		throw new Error(
			"Missing Google Cloud project number. Set WEBRISK_PROJECT_NUMBER or pass projectNumber to submitWebsiteToGoogleSafeBrowsingBlocklist()."
		);
	}

	const auth = new GoogleAuth({
		scopes: ["https://www.googleapis.com/auth/cloud-platform"],
	});
	const client = await auth.getClient();
	const accessToken = await client.getAccessToken();
	const token = typeof accessToken === "string" ? accessToken : accessToken?.token;

	if (!token) {
		throw new Error("Failed to acquire Google Cloud access token for Web Risk Submission API.");
	}

	const response = await fetch(`https://webrisk.googleapis.com/v1/projects/${projectNumber}/submissions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			uri: params.url,
		}),
	});

	if (!response.ok) {
		const bodyText = await response.text();
		throw new Error(`Web Risk submission failed (${response.status} ${response.statusText}): ${bodyText}`);
	}

	return (await response.json()) as { uri: string; threatTypes?: string[] };
}

export async function markSubmissionInvalid(submissionId: bigint) {
	await SubmissionsEntity.update(submissionId, { status: "invalid" });
}
