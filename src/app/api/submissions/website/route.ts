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

		const user_country_code = await getUserCC(req);
		const stream_id = await createWebsiteSubmission(url, user_country_code);

		return NextResponse.json({ stream_id });
	} catch (err) {
		console.error("Submission error:", err);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}

export async function createWebsiteSubmission(url: string, user_country_code?: string, source?: string): Promise<bigint> {
	const stream_id = generateId();

	// Create submission
	const existingId = await SubmissionsEntity.create({
		kind: "website",
		data: { kind: "website", website: { url } },
		dedupeKey: `website-${new URL(url).hostname}`,
		status: "new",
		source: source || url,
		id: stream_id,
	});

	if (existingId !== stream_id) {
		// Already exists, return existing ID
		return existingId;
	}

	analyzeWebsite(url, stream_id, user_country_code).catch(console.error);

	return stream_id;
}
