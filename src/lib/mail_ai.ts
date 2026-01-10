import { ArtifactsEntity, SubmissionsEntity } from "./db/entities";
import { runStreamedAnalysisRun } from "./analysis_run";
import { publishEvent } from "./event/event_transport";
import { simpleParser } from "mailparser";
import { analyzeHeaders, getAddressesText } from "./mail";
import { getInfo } from "./website_info";
import * as toon from "@toon-format/toon";
import { markSubmissionInvalid, reportEmailPhishing } from "./reporting";

async function emitStep(streamId: bigint | string | undefined, step: string, progress: number) {
	if (!streamId) return;
	await publishEvent(`run:${streamId}`, { type: "analysis.step", step, progress });
}

export async function parseMail(eml: string) {
	const parsedMail = await simpleParser(eml, { skipTextToHtml: true });

	const headers = analyzeHeaders(parsedMail.headerLines.map((x) => x.line).join("\n"));

	const whois = await getInfo(headers.routing.originatingIp!);

	return {
		eml,
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
			},
		},
		whois,
	};
}

export type MailData = Awaited<ReturnType<typeof parseMail>>;

export async function analyzeMail(emlContent: string, stream_id: bigint) {
	try {
		const mail = await parseMail(emlContent);

		// Create submission
		const submissionId = await SubmissionsEntity.create({
			kind: "email",
			data: { kind: "email", email: mail },
			dedupeKey: `${mail.from}`,
			id: stream_id,
		});

		// Save EML artifact
		await ArtifactsEntity.saveBuffer({
			submissionId,
			name: "mail.eml",
			kind: "eml",
			mimeType: "message/rfc822",
			buffer: Buffer.from(emlContent, "utf-8"),
		});

		await emitStep(stream_id, "start", 0);
		await SubmissionsEntity.update(submissionId, { status: "running" });

		await emitStep(stream_id, "analysis_run", 30);

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
${toon.encode({ ...mail, eml: undefined })}`,
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
			await reportEmailPhishing({
				submissionId,
				streamId: stream_id,
				mail,
				analysisText: analysis.output_text,
			});
		} else {
			await markSubmissionInvalid(submissionId);
		}

		await emitStep(stream_id, "completed", 100);
	} catch (error) {
		console.error("Email analysis failed:", error);
		await SubmissionsEntity.update(stream_id, { status: "failed", info: String(error) });
		await emitStep(stream_id, "failed", 100);
	}
}
