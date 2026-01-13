import { NextRequest, NextResponse } from "next/server";
import { SubmissionsEntity, ArtifactsEntity } from "@/lib/db/entities";
import { analyzeMail, parseMail } from "@/lib/mail_ai";
import { generateId } from "@/lib/db/ids";
import { simpleParser } from "mailparser";
import { getAddressesText } from "@/lib/mail";

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

		console.log("Email submission received, size:", buffer.length);

		const stream_id = await createEmailSubmissionFromEml(emlContent, "web-upload");
		return NextResponse.json({ stream_id });
	} catch (err) {
		console.error("Submission error:", err);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}

export async function createEmailSubmissionFromEml(emlContent: string, source?: string): Promise<bigint> {
	const stream_id = generateId();

	const parsedMail = await simpleParser(emlContent, { skipTextToHtml: true });
	const from = getAddressesText(parsedMail.from);

	const existingId = await SubmissionsEntity.create({
		kind: "email",
		data: { kind: "email" },
		dedupeKey: `email-${from}`,
		id: stream_id,
		source,
	});

	if (existingId !== stream_id) {
		// Already exists, return existing ID
		return existingId;
	}

	analyzeMail(emlContent, stream_id).catch(console.error);

	return stream_id;
}
