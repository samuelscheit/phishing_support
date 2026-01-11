import * as toon from "@toon-format/toon";
import { archiveWebsite } from "./website_archive";
import { SubmissionsEntity, ArtifactsEntity } from "./db/entities";
import { getInfo } from "./website_info";
import { runStreamedAnalysisRun } from "./analysis_run";
import { publishEvent } from "./event/event_transport";
import { markSubmissionInvalid, reportToGoogleSafeBrowsing, reportWebsitePhishing } from "./reporting";

export async function emitStep(streamId: bigint | string | undefined, step: string, progress: number) {
	if (!streamId) return;
	await publishEvent(`run:${streamId}`, { type: "analysis.step", step, progress });
}

function retry(fn: () => Promise<any>, retries: number = 3, delayMs: number = 2000): Promise<any> {
	return fn().catch((err) => {
		if (retries > 0) {
			return new Promise((resolve) => setTimeout(resolve, delayMs)).then(() => retry(fn, retries - 1, delayMs));
		} else {
			return Promise.reject(err);
		}
	});
}

export async function analyzeWebsite(url: string, stream_id?: bigint, user_country_code?: string): Promise<bigint> {
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
		id: stream_id,
	});

	try {
		await emitStep(stream_id, "archive_website", 25);
		const archive = await retry(() => archiveWebsite(url, user_country_code), 2, 3000);
		await emitStep(stream_id, "save_artifacts", 40);

		// await ArtifactsEntity.saveWebsiteArtifacts({ submissionId, archive });
		await ArtifactsEntity.saveWebsiteArtifacts({ submissionId, archive });

		await emitStep(stream_id, "analysis_run", 55);

		const { result: analysis } = await runStreamedAnalysisRun({
			submissionId,
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
			await reportWebsitePhishing({
				submissionId,
				url,
				whois,
				analysisText: analysis.output_text,
				archive: {
					screenshotPng: archive.screenshotPng,
					mhtml: archive.mhtml,
				},
			});

			await emitStep(stream_id, "reporting to Google Safe Browsing", 90);

			await reportToGoogleSafeBrowsing({
				url,
				submissionId,
				analysisText: analysis.output_text,
			});
		} else {
			await markSubmissionInvalid(submissionId);
		}

		await emitStep(stream_id, "completed", 100);
	} catch (error) {
		console.error("Website analysis failed:", error);
		await SubmissionsEntity.update(submissionId, { status: "failed", info: String(error) });
		await emitStep(stream_id, "failed", 100);
	}

	return submissionId;
}
