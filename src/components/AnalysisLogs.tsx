"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

type OutputItem = {
	type?: string;
	content?: Array<{ type?: string; text?: string; refusal?: string }>;
};

function extractOutputText(output?: Array<OutputItem>): string | null {
	if (!output || !Array.isArray(output) || output.length === 0) return null;

	const parts: string[] = [];
	for (const item of output) {
		if (item?.type !== "message" || !Array.isArray(item.content)) continue;
		const chunk = item.content
			.map((c) => {
				if (c.type === "output_text") return c.text || "";
				if (c.type === "refusal") return c.refusal ? `Refusal: ${c.refusal}` : "Refusal";
				return "";
			})
			.join("");
		if (chunk.trim()) parts.push(chunk);
	}

	const text = parts.join("\n\n").trim();
	return text ? text : null;
}

export function AnalysisLogs({ streamId, output }: { streamId: string; output?: Array<OutputItem> }) {
	const [logs, setLogs] = useState<string[]>([]);
	const scrollRef = useRef<HTMLDivElement>(null);
	const streamingIndexRef = useRef<number | null>(null);
	const streamingTextRef = useRef("");
	const outputText = useMemo(() => extractOutputText(output), [output]);

	const appendStreamingText = (delta: string) => {
		streamingTextRef.current += delta;
		setLogs((prev) => {
			if (streamingIndexRef.current === null || streamingIndexRef.current >= prev.length) {
				const next = [...prev, streamingTextRef.current];
				streamingIndexRef.current = next.length - 1;
				return next;
			}

			const next = [...prev];
			next[streamingIndexRef.current] = streamingTextRef.current;
			return next;
		});
	};

	const finalizeStreaming = () => {
		streamingIndexRef.current = null;
		streamingTextRef.current = "";
	};

	useEffect(() => {
		console.log("Starting log stream for", streamId);
		if (outputText) return;
		const res = new EventSource(`/api/stream/${streamId}`);

		res.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				if (data.type === "response.output_text.delta" || data.type === "response.reasoning_summary_text.delta") {
					appendStreamingText(data.delta || "");
					return;
				}

				if (data.type === "analysis.step") {
					finalizeStreaming();
					const progress = typeof data.progress === "number" ? ` (${data.progress}%)` : "";
					setLogs((prev) => [...prev, `Step: ${data.step}${progress}`]);
					return;
				}

				if (data.type === "run.created") {
					finalizeStreaming();
					setLogs((prev) => [...prev, `Run created: #${data.runId}`]);
					return;
				}

				if (data.type === "run.started") {
					finalizeStreaming();
					setLogs((prev) => [...prev, "Run started"]);
					return;
				}

				if (data.type === "run.completed") {
					finalizeStreaming();
					setLogs((prev) => [...prev, "Run completed"]);
					return;
				}

				if (data.type === "run.failed") {
					finalizeStreaming();
					const err = data.error ? `: ${data.error}` : "";
					setLogs((prev) => [...prev, `Run failed${err}`]);
					return;
				}

				if (data.type === "response.output_text.done") {
					finalizeStreaming();
					return;
				}

				if (data.type === "response.completed") {
					finalizeStreaming();
					setLogs((prev) => [...prev, "Response completed"]);
					return;
				}

				if (data.type === "connected") {
					setLogs((prev) => [...prev, "Stream connected"]);
					return;
				}

				finalizeStreaming();
				setLogs((prev) => [...prev, JSON.stringify(data)]);
			} catch (e) {
				// Handle non-JSON lines if any
				finalizeStreaming();
				setLogs((prev) => [...prev, event.data]);
			}
		};

		res.onerror = () => {
			res.close();
		};

		return () => res.close();
	}, [streamId, outputText]);

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [logs]);

	return (
		<ScrollArea className="h-[400px] w-full rounded-md border bg-black p-4 font-mono text-sm text-green-500">
			<div ref={scrollRef}>
				{outputText ? (
					<div className="whitespace-pre-wrap">{outputText}</div>
				) : (
					<>
						{logs.map((log, i) => (
							<div key={i} className="whitespace-pre-wrap mb-1">
								{log}
							</div>
						))}
						<div className="animate-pulse inline-block w-2 h-4 bg-green-500 ml-1" />
					</>
				)}
			</div>
		</ScrollArea>
	);
}
