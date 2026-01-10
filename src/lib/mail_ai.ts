import { model } from "./utils";
import { ReportsEntity, SubmissionsEntity } from "./db/entities";
import { runStreamedAnalysisRun } from "./analysis_run";
import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses.mjs";
import { publishEvent } from "./zmq";
import { simpleParser } from "mailparser";
import { analyzeHeaders, getAddressesText } from "./mail";
import { getInfo } from "./website_info";
import * as toon from "@toon-format/toon";

async function emitStep(streamId: bigint | undefined, step: string, progress: number) {
	if (!streamId) return;
	await publishEvent(`run:${streamId}`, { type: "analysis.step", step, progress });
}

export function parseMail(eml: string) {
	return {
		subject: eml.match(/^Subject: (.*)$/m)?.[1] || "No Subject",
		from: eml.match(/^From: (.*)$/m)?.[1] || "Unknown Sender",
		body: eml,
	};
}

export async function analyzeMail(eml: string, submissionId: bigint, stream_id?: bigint) {
	try {
		const parsedMail = await simpleParser(eml, { skipTextToHtml: true });

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
					whois: whois,
				},
			},
		};

		await emitStep(stream_id, "start", 0);
		await SubmissionsEntity.update(submissionId, { status: "running" });

		await emitStep(stream_id, "analysis_run", 35);

		const { result: analysis } = await runStreamedAnalysisRun({
			submissionId,
			streamId: stream_id,
			options: {
				model: "gpt-5.2",
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
					{
						role: "user",
						content: eml,
					},
				],
				reasoning: {
					effort: "medium",
					summary: "detailed",
				},
				tools: [{ type: "web_search" }],
				stream: true,
			},
		});

		await emitStep(stream_id, "structured_response", 70);

		const { result: structuredResponse } = await runStreamedAnalysisRun({
			submissionId,
			streamId: stream_id,
			options: {
				stream: true,
				model: "gpt-5.2",
				input: [
					{
						role: "system",
						content: `Answer {"phishing":true} if the analysis concludes that the email is phishing or malicious. Otherwise answer {"phishing":false}. Provide no other text.`,
					},
					{
						role: "user",
						content: `Analysis Text: ${analysis.output_text}`,
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
			},
		});
		const { phishing } = structuredResponse.output_parsed || ({} as { phishing: boolean });

		if (phishing) {
			await emitStep(stream_id, "reporting", 90);
			await ReportsEntity.create({
				submissionId,
				type: "phishing_email",
				data: {},
			});
			await SubmissionsEntity.update(submissionId, { status: "reported" });
		} else {
			await SubmissionsEntity.update(submissionId, { status: "invalid" });
		}

		await emitStep(stream_id, "completed", 100);
	} catch (error) {
		console.error("Email analysis failed:", error);
		await SubmissionsEntity.update(submissionId, { status: "failed", info: String(error) });
		await emitStep(stream_id, "failed", 100);
	}
}

// const reportMailStream = await model.responses.create({
// 	model: "gpt-5.2",
// 	input: [
// 		{
// 			role: "system",
// 			content: `You are an expert email phishing analyst. Your task is to draft a concise report to the abuse contact of the sending IP's owner, reporting a phishing email that originated from their infrastructure.

// The report must include:
// 1) A brief summary of the phishing email (brand impersonated, main action pushed).
// 2) The sending IP and domain used.
// 3) A request for investigation and mitigation (e.g., blocking the sender, taking down related infrastructure).

// The original phishing email with full headers will automatically be attached as an attachment.
// You act on behalf of "the team of https://phishing.support".
// The tone should be professional and factual.`,
// 		},
// 		{
// 			role: "user",
// 			content: `Draft the report based on this analysis:

// ${toon.encode(mail)}
// ${mail_analysis.output_text}

// Sending IP: ${headers.routing.originatingIp}
// Sending Domain: ${headers.routing.originatingServer}

// Abuse Contact:
// ${toon.encode(abuseContact)}
// `,
// 		},
// 	],
// 	max_output_tokens,
// 	tool_choice: "required",
// 	text: {
// 		format: {
// 			type: "json_schema",
// 			name: "send_mail",
// 			schema: {
// 				type: "object",
// 				properties: {
// 					to: { type: "string", description: "Recipient email address" },
// 					subject: { type: "string", description: "Email subject" },
// 					body: { type: "string", description: "Email body content" },
// 				},
// 				required: ["to", "subject", "body"],
// 				additionalProperties: false,
// 			},
// 			strict: true,
// 		},
// 		verbosity: "low",
// 	},
// 	stream: true,
// });
