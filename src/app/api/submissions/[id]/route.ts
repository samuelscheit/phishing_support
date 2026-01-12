import { NextRequest, NextResponse } from "next/server";
import { SubmissionsEntity, AnalysisRunsEntity, ReportsEntity, ArtifactsEntity } from "@/lib/db/entities";
import { PageNotFoundError } from "next/dist/shared/lib/utils";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;

		return NextResponse.json(await fetchSubmission(id));
	} catch (err) {
		if (err instanceof PageNotFoundError) {
			return NextResponse.json({ error: "Submission not found" }, { status: 404 });
		}
		console.error("Failed to get submission:", err);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}

export async function fetchSubmission(id: string) {
	const submissionId = BigInt(id);

	const submission = await SubmissionsEntity.get(submissionId);
	if (!submission) {
		throw new PageNotFoundError("Submission not found");
	}

	const analysisRuns = await AnalysisRunsEntity.listForSubmission(submissionId);
	const reports = await ReportsEntity.listForSubmission(submissionId);
	const artifacts = await ArtifactsEntity.listForSubmission(submissionId);

	return {
		...submission,
		id: submission.id,
		analysisRuns,
		reports,
		artifacts,
	};
}
