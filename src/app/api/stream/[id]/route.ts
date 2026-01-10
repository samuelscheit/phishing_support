import { NextRequest } from "next/server";
import { subscribeToEvents } from "@/lib/zmq";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const topic = `run:${id}`;

	const stream = new ReadableStream({
		async start(controller) {
			const sub = await subscribeToEvents(topic);

			controller.enqueue(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

			try {
				for await (const [msgTopic, msgData] of sub) {
					const data = msgData.toString();
					controller.enqueue(`data: ${data}\n\n`);

					// If the message contains "status": "completed" or something similar, we could close
					// But usually we just let the client close or keep it open for a bit
					const parsed = JSON.parse(data);
					if (parsed.status === "completed" || parsed.status === "error") {
						break;
					}
				}
			} catch (err) {
				console.error("SSE Stream error:", err);
			} finally {
				sub.close();
				controller.close();
			}
		},
		cancel() {
			// Handle cleanup if client disconnects
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
