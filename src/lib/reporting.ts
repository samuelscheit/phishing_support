import { ReportsEntity, SubmissionsEntity } from "./db/entities";

export async function finalizeSubmissionReport(params: {
	submissionId: bigint;
	phishing: boolean;
	reportType: string;
	reportData?: any;
}) {
	if (params.phishing) {
		await ReportsEntity.create({
			submissionId: params.submissionId,
			type: params.reportType,
			data: params.reportData ?? {},
		});
		await SubmissionsEntity.update(params.submissionId, { status: "reported" });
	} else {
		await SubmissionsEntity.update(params.submissionId, { status: "invalid" });
	}
}
