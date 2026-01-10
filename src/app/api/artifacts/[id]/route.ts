import { NextRequest, NextResponse } from "next/server";
import { ArtifactsEntity } from "@/lib/db/entities";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		const artifactId = BigInt(id);

		const artifact = await ArtifactsEntity.get(artifactId);
		if (!artifact || !artifact.blob) {
			return new Response("Not found", { status: 404 });
		}

		return new Response(artifact.blob.buffer as ArrayBuffer, {
			headers: {
				"Content-Type": artifact.mimeType || "application/octet-stream",
				"Content-Disposition": `inline; filename="${artifact.name || "artifact"}"`,
			},
		});
	} catch (err) {
		console.error("Failed to get artifact:", err);
		return new Response("Internal Server Error", { status: 500 });
	}
}
