import type { ResponseCreateParamsStreaming, ResponseInputItem } from "openai/resources/responses/responses.mjs";

import { AnalysisRunsEntity } from "./db/entities";
import { logAndPersistStream } from "./artifact";
import { model } from "./utils";
import { publishEvent } from "./zmq";

export async function runStreamedAnalysisRun<TFinal = any>(params: {
	submissionId: bigint;
	options: ResponseCreateParamsStreaming;
	streamId?: bigint;
}) {
	if (params.options.stream !== true) {
		throw new Error("runStreamedAnalysisRun requires options.stream === true");
	}

	const inputForDb: Array<ResponseInputItem> | undefined = Array.isArray(params.options.input)
		? (params.options.input as Array<ResponseInputItem>)
		: undefined;

	const runId = await AnalysisRunsEntity.create(params.submissionId, inputForDb);

	if (params.streamId) await publishEvent(`run:${params.streamId}`, { type: "run.created", runId, submissionId: params.submissionId });

	const stream = await model.responses.create(params.options);
	const result = (await logAndPersistStream(stream, runId, [runId, params.streamId])) as TFinal;
	return { runId, result };
}
