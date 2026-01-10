import { NextRequest, NextResponse } from "next/server";
import { analyzeWebsite } from "@/lib/website_ai";
import { generateId } from "../../../../lib/db/ids";

export async function POST(req: NextRequest) {
	try {
		const { url } = await req.json();

		if (!url) {
			return NextResponse.json({ error: "URL is required" }, { status: 400 });
		}

		const stream_id = generateId();

		analyzeWebsite(url, stream_id).catch(() => {});

		return NextResponse.json({ stream_id });
	} catch (err) {
		console.error("Submission error:", err);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}
