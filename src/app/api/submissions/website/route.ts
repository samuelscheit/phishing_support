import { NextRequest, NextResponse } from "next/server";
import { analyzeWebsite } from "@/lib/website_ai";
import { generateId } from "@/lib/db/ids";
import { getUserCC, sleep } from "@/lib/utils";
import { SubmissionsEntity } from "@/lib/db/entities";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
	try {
		const { url } = await req.json();

		if (!url) {
			return NextResponse.json({ error: "URL is required" }, { status: 400 });
		}

		const stream_id = generateId();

		const user_country_code = await getUserCC(req);

		const uri = new URL(url);

		// Create submission
		const existingId = await SubmissionsEntity.create({
			kind: "website",
			data: { kind: "website", website: { url } },
			dedupeKey: `website-${uri.hostname}`,
			status: "new",
			source: url,
			id: stream_id,
		});

		if (existingId !== stream_id) {
			// Already exists, return existing ID
			return NextResponse.json({ stream_id: existingId });
		}

		analyzeWebsite(url, stream_id, user_country_code).catch(console.error);

		return NextResponse.json({ stream_id });
	} catch (err) {
		console.error("Submission error:", err);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}
