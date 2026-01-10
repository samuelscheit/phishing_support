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

		const stream_id = generateId();

		await analyzeMail(emlContent, stream_id).catch(console.error);

		return NextResponse.json({ stream_id });
	} catch (err) {
		console.error("Submission error:", err);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}
