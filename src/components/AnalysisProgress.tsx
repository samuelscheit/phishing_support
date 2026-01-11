"use client";

import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Card } from "./ui/card";
import { SubmissionStatus } from "../lib/db/schema";

type ProgressState = {
	step: string | null;
	progress: number | null;
	status: "connecting" | "connected" | "error";
	error?: string;
};

export function AnalysisProgress({ streamId, status }: { streamId: string | bigint; status: SubmissionStatus }) {
	if (status !== "new" && status !== "queued" && status !== "running") {
		return null;
	}

	const [state, setState] = useState<ProgressState>({
		step: null,
		progress: null,
		status: "connecting",
	});

	useEffect(() => {
		const res = new EventSource(`/api/stream/${streamId}`);

		res.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				if (data.type === "connected") {
					setState((prev) => ({ ...prev, status: "connected" }));
					return;
				}

				if (data.type === "analysis.step") {
					setState((prev) => ({
						...prev,
						step: data.step || null,
						progress: typeof data.progress === "number" ? data.progress : prev.progress,
					}));
					return;
				}

				if (data.type === "run.failed") {
					setState((prev) => ({
						...prev,
						status: "error",
						step: "failed",
						progress: typeof prev.progress === "number" ? prev.progress : 100,
						error: data.error ? String(data.error) : undefined,
					}));
				}
			} catch {
				// Ignore non-JSON lines for progress view.
			}
		};

		res.onerror = () => {
			setState((prev) => ({ ...prev, status: "error" }));
			res.close();
		};

		return () => res.close();
	}, [streamId]);

	const value = typeof state.progress === "number" ? state.progress : 0;
	const stepLabel = state.step
		? `Step: ${state.step}${typeof state.progress === "number" ? ` (${state.progress}%)` : ""}`
		: state.status === "connecting"
			? "Connecting..."
			: state.status === "connected"
				? "Waiting for progress..."
				: state.error
					? `Error: ${state.error}`
					: "Stream error";

	return (
		<Card className="p-4 space-y-2 ">
			<div className="text-sm font-semibold font-mono uppercase">{stepLabel}</div>
			<Progress value={value} />
		</Card>
	);
}
