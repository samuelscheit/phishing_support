import { SubmissionsEntity } from "../db/entities";
import { generateReportDraft } from "./generateReportDraft";

export async function markSubmissionInvalid(submissionId: bigint) {
	await SubmissionsEntity.update(submissionId, { status: "invalid" });
}

export async function generateAbuseExplanation(params: { url: string; analysisText: string; submissionId: bigint; to: string }) {
	const system = `You are an expert phishing analyst. Write a concise explanation for reporting a phishing website to ${params.to}. 
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

	let explanation = draft.body;

	if (explanation.length > 800) {
		let endOfSentence = explanation.lastIndexOf(".", 800);

		if (endOfSentence === -1) {
			endOfSentence = 800;
		}

		explanation = explanation.slice(0, endOfSentence + 1);
	}

	return explanation.trim();
}
