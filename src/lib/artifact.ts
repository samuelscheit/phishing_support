import { Stream } from "openai/streaming";
import { ResponseStreamEvent } from "openai/resources/responses/responses.mjs";
import { AnalysisRunsEntity } from "./db/entities";
import { publishEvent } from "./zmq";

/**
 * Consumes an OpenAI stream, logs it to stdout, publishes it to ZeroMQ,
 * and persists the final result to the analysis_runs table.
 */
export async function logAndPersistStream(response: Stream<ResponseStreamEvent>, runId: bigint, topics?: (bigint | undefined)[]) {
	const emitEvent = (opts: any) =>
		Promise.all(
			(topics || [runId]).map(async (runId) => {
				if (!runId) return;

				const topic = `run:${runId}`;
				await publishEvent(topic, opts);
			})
		);

	try {
		await emitEvent({ type: "run.started" });

		for await (const chunk of response) {
			// Fan out everything to ZeroMQ
			await emitEvent(chunk);

			// Regular logging to stdout
			if (chunk.type === "response.output_text.delta") {
				process.stdout.write(chunk.delta);
			} else if (chunk.type === "response.reasoning_summary_text.delta") {
				process.stdout.write(chunk.delta);
			} else if (chunk.type === "response.completed") {
				const output = chunk.response.output.at(-1);
				let output_text = chunk.response.output_text || "";
				let output_parsed = null;

				if (output?.type === "message") {
					output_text = output.content
						.map((c) => {
							if (c.type === "output_text") return c.text;
							if (c.type === "refusal") throw new Error(`Model refused to answer: ${c.refusal}`);
							throw new Error(`Unknown output content type: ${JSON.stringify(c)}`);
						})
						.join("");

					if (chunk.response.status === "completed" && chunk.response.text) {
						try {
							output_parsed = JSON.parse(output_text);
						} catch (error) {
							// For non-JSON expected outputs, this is fine
						}
					}
				}

				const result = {
					...chunk.response,
					output_text,
					output_parsed,
				};

				// Persist final result to DB
				await AnalysisRunsEntity.complete(runId, result.output);

				await emitEvent({ type: "run.completed", result });

				return result;
			}
		}

		throw new Error("Stream ended without completion");
	} catch (error) {
		console.error(`Error in logAndPersistStream`, error);
		await AnalysisRunsEntity.fail(runId);
		await emitEvent({ type: "run.failed", runId, error: String(error) });
		throw error;
	}
}
