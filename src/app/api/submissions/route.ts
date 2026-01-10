import { NextRequest, NextResponse } from "next/server";
import { SubmissionsEntity } from "@/lib/db/entities";

export async function GET(req: NextRequest) {
	try {
		const submissions = await SubmissionsEntity.list();
		return NextResponse.json(submissions);
	} catch (err) {
		console.error("Failed to list submissions:", err);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}
