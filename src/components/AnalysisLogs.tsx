"use client";

import { useEffect, useState, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

type LogEntry = {
	id: string;
	timestamp: string;
	level: string;
	message: string;
	details?: any;
};

export function AnalysisLogs({ runId }: { runId: string }) {
	const [logs, setLogs] = useState<string[]>([]);
	const scrollRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const res = new EventSource(`/api/stream/${runId}`);

		res.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				if (data.type === "token") {
					setLogs((prev) => {
						const last = prev[prev.length - 1] || "";
						// If it looks like a new chunk of text, append or combine
						return [...prev.slice(0, -1), last + data.content];
					});
				} else if (data.type === "log") {
					setLogs((prev) => [...prev, data.message]);
				}
			} catch (e) {
				// Handle non-JSON lines if any
				setLogs((prev) => [...prev, event.data]);
			}
		};

		res.onerror = () => {
			res.close();
		};

		return () => res.close();
	}, [runId]);

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [logs]);

	return (
		<ScrollArea className="h-[400px] w-full rounded-md border bg-black p-4 font-mono text-sm text-green-500">
			<div ref={scrollRef}>
				{logs.map((log, i) => (
					<div key={i} className="whitespace-pre-wrap mb-1">
						{log}
					</div>
				))}
				<div className="animate-pulse inline-block w-2 h-4 bg-green-500 ml-1" />
			</div>
		</ScrollArea>
	);
}
