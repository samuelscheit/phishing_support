import { NextRequest, NextResponse } from "next/server";
import { SubmissionsEntity, AnalysisRunsEntity, ReportsEntity, ArtifactsEntity } from "@/lib/db/entities";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		const submissionId = BigInt(id);

		const submission = await SubmissionsEntity.get(submissionId);
		if (!submission) {
			return NextResponse.json({ error: "Submission not found" }, { status: 404 });
		}

		const analysisRuns = await AnalysisRunsEntity.listForSubmission(submissionId);
		const reports = await ReportsEntity.listForSubmission(submissionId);
		const artifacts = await ArtifactsEntity.listForSubmission(submissionId);

		return NextResponse.json({
			...submission,
			id: submission.id,
			analysisRuns,
			reports,
			artifacts,
		});
	} catch (err) {
		console.error("Failed to get submission:", err);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}
