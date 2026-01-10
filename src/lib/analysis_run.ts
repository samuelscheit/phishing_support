import type { ResponseCreateParamsStreaming, ResponseInputItem } from "openai/resources/responses/responses.mjs";

import { AnalysisRunsEntity } from "./db/entities";
import { logAndPersistStream } from "./artifact";
import { model } from "./utils";
import { publishEvent } from "./event/event_transport";

export async function runStreamedAnalysisRun(params: { submissionId: bigint; options: ResponseCreateParamsStreaming }) {
	if (params.options.stream !== true) {
		throw new Error("runStreamedAnalysisRun requires options.stream === true");
	}

	const inputForDb: Array<ResponseInputItem> | undefined = Array.isArray(params.options.input)
		? (params.options.input as Array<ResponseInputItem>)
		: undefined;

	const runId = await AnalysisRunsEntity.create(params.submissionId, inputForDb);

	if (params.submissionId) await publishEvent(`run:${params.submissionId}`, { type: "run.created", runId });

	try {
		var stream = await model.responses.create(params.options);
	} catch (err) {
		console.dir(params.options, { depth: null });

		throw err;
	}
	// const result = (await logAndPersistStream(stream, runId, [runId, params.streamId])) as TFinal;
	const result = await logAndPersistStream(stream, runId);
	return { runId, result };
}
