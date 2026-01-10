import { NextRequest, NextResponse } from "next/server";
import { SubmissionsEntity, ArtifactsEntity } from "@/lib/db/entities";
import { analyzeMail, parseMail } from "@/lib/mail_ai";
import { generateId } from "../../../../lib/db/ids";

export async function POST(req: NextRequest) {
	try {
		const formData = await req.formData();
		const file = formData.get("file") as File;

		if (!file) {
			return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
		}

		const bytes = await file.arrayBuffer();
		const buffer = Buffer.from(bytes);
		const emlContent = buffer.toString("utf-8");

		const mailData = parseMail(emlContent);

		// Create submission
		const submissionId = await SubmissionsEntity.create({
			kind: "email",
			data: { kind: "email", email: mailData },
			dedupeKey: `${mailData.from}`,
		});

		// Save EML artifact
		await ArtifactsEntity.saveBuffer({
			submissionId,
			name: "mail.eml",
			kind: "eml",
			mimeType: "message/rfc822",
			buffer: buffer,
		});

		const stream_id = generateId();

		analyzeMail(emlContent, submissionId, stream_id).catch(console.error);

		return NextResponse.json({ submissionId: submissionId });
	} catch (err) {
		console.error("Submission error:", err);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}
