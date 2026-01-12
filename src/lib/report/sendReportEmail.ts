import { ReportsEntity, SubmissionsEntity } from "../db/entities";
import { mailer } from "../utils";
import { ReportDraft } from "./generateReportDraft";

type ReportAttachment = {
	filename: string;
	content: Buffer;
	contentType?: string;
};

export async function sendReportEmail(params: { submissionId: bigint; draft: ReportDraft; attachments?: ReportAttachment[]; data?: any }) {
	const from = process.env.SMTP_FROM || "Phishing Support <report@phishing.support>";

	const mailSendResult = await mailer.sendMail({
		from,
		to: params.draft.to,
		subject: params.draft.subject,
		text: `${params.draft.body}\n\n`,
		attachments: params.attachments,
	});

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
