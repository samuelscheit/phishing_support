import * as toon from "@toon-format/toon";
import { archiveWebsite } from "./website_archive";
import { ReportsEntity, SubmissionsEntity, ArtifactsEntity } from "./db/entities";
import { getInfo } from "./website_info";
import { runStreamedAnalysisRun } from "./analysis_run";
import { publishEvent } from "./zmq";

export async function emitStep(streamId: bigint | undefined, step: string, progress: number) {
	if (!streamId) return;
	await publishEvent(`run:${streamId}`, { type: "analysis.step", step, progress });
}

export async function analyzeWebsite(url: string, stream_id?: bigint) {
	await emitStep(stream_id, "start", 0);
	const uri = new URL(url);

	await emitStep(stream_id, "whois_lookup", 5);
	const whois = await getInfo(url);

	await emitStep(stream_id, "create_submission", 10);
	// Create submission
	const submissionId = await SubmissionsEntity.create({
		kind: "website",
		data: { kind: "website", website: { url, whois } },
		dedupeKey: `website-${uri.hostname}`,
		status: "running",
		source: url,
	});

	try {
		await emitStep(stream_id, "archive_website", 25);
		const archive = await archiveWebsite(url);
		await emitStep(stream_id, "save_artifacts", 40);
		await ArtifactsEntity.saveWebsiteArtifacts({ submissionId, archive });

		await emitStep(stream_id, "analysis_run", 55);

		const { result: analysis } = await runStreamedAnalysisRun({
			submissionId,
			streamId: stream_id,
			options: {
				model: "gpt-5.2",
				input: [
					{
						role: "user" as const,
						content: [
							{
								type: "input_text" as const,
								text: `You are an expert phishing website analyst. Your task is to analyze the provided website and determine if it is a phishing website.
URL: ${url}
WhoIs information:
${toon.encode(whois)}

Here is the website text content:
<website_text>
${archive.text.toString()}
</website_text>

Here is the website raw html skeleton:
${archive.html.toString()}

Please provide a detailed analysis of the website, including any content and identifiying features, also if its trying to impersonate another brand or service.
Use web search if necessary to gather more information about the content/brand. (the website might be new and doesn't have any web results yet). (also you might not be able to access the website directly use the provided website text and screenshot).`,
							},
							{
								type: "input_image" as const,
								detail: "high" as const,
								image_url: `data:image/png;base64,${archive.screenshotPng.toString("base64")}`,
							},
						],
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

		await emitStep(stream_id, "structured_response", 75);
		const { result: structuredResponse } = await runStreamedAnalysisRun({
			submissionId,
			streamId: stream_id,
			options: {
				model: "gpt-5-nano",
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
				stream: true,
			},
		});

		const { phishing } = structuredResponse.output_parsed || ({} as { phishing: boolean });

		if (phishing) {
			await emitStep(stream_id, "reporting", 90);
			await ReportsEntity.create({
				submissionId,
				type: "phishing_site",
				data: { phishing },
			});
			await SubmissionsEntity.update(submissionId, { status: "reported" });
		} else {
			await SubmissionsEntity.update(submissionId, { status: "invalid" });
		}
		await emitStep(stream_id, "completed", 100);
	} catch (error) {
		console.error("Website analysis failed:", error);
		await SubmissionsEntity.update(submissionId, { status: "failed", info: String(error) });
		await emitStep(stream_id, "failed", 100);
	}

	return submissionId;
}

// const ip_rdaps = uniqBy(whois.ip_rdaps, (x) => x.abuse?.email || x.handle);

// ip_rdaps.map(async (rdap) => {
// 	if (!rdap.abuse) return;

// 	const reportMailStream = await model.responses.create({
// 		model: "gpt-5.2",
// 		input: [
// 			{
// 				role: "system",
// 				content: `You are an expert phishing analyst. Your task is to draft a concise report to the IP address space's abuse contact about a phishing website hosted on their IP address space.

// The report should include:
// 1) A summary of the phishing analysis (be confident, no need to mention uncertainty)
// 2) The phishing website URL and WhoIs/DNS/hosting details
// 3) Request for takedown of the phishing site and any further investigation/mitigation.

// The website's content along with screenshot will automatically be attached as an attachment.
// You act on behalf of "the team of https://phishing.support".
// The tone should be professional and factual.`,
// 			},
// 			{
// 				role: "user",
// 				content: `Draft the report based on this analysis:

// ${analysis.output_text}

// Phishing Website URL:
// ${link}

// One DNS A/AAAA Record of domain ${link}
// points to IP: ${rdap.ip} of ${rdap.name || rdap.handle}

// RDAP information:
// ${toon.encode(rdap)}`,
// 			},
// 		],
// 		max_output_tokens,
// 		tool_choice: "required",
// 		text: {
// 			format: {
// 				type: "json_schema",
// 				name: "send_mail",
// 				schema: {
// 					type: "object",
// 					properties: {
// 						to: { type: "string", description: "Recipient email address" },
// 						subject: { type: "string", description: "Email subject" },
// 						body: { type: "string", description: "Email body content" },
// 					},
// 					required: ["to", "subject", "body"],
// 					additionalProperties: false,
// 				},
// 				strict: true,
// 			},
// 			verbosity: "low",
// 		},
// 		stream: true,
// 	});

// const { to, subject, body } = reportMailResult.output_parsed;

// const mailSendResult = await mailer.sendMail({
// 	from: process.env.SMTP_FROM || "Phishing Support <report@phishing.support>",
// 	// to,
// 	// TODO: change back to actual abuse contact
// 	to: "samuel.scheit@me.com",
// 	subject,
// 	text: body + "\n\n",
// 	attachments: [
// 		{
// 			filename: "website.mhtml",
// 			content: fs.createReadStream(path.join(dirname, "website.mhtml")),
// 			contentType: "text/mhtml",
// 		},
// 		{
// 			filename: "website.png",
// 			content: image,
// 			contentType: "image/png",
// 		},
// 	],
// });
