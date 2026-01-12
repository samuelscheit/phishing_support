import * as toon from "@toon-format/toon";
import { MailData } from "../mail_ai";
import { generateReportDraft } from "./generateReportDraft";
import { sendReportEmail } from "./sendReportEmail";

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
