import type { EventSubscriber } from "./event_transport";

type IpcEventMessage = {
	__event_transport: true;
	topic: string;
	data: unknown;
};

function isIpcEventMessage(message: unknown): message is IpcEventMessage {
	if (!message || typeof message !== "object") return false;
	const candidate = message as Partial<IpcEventMessage>;
	return candidate.__event_transport === true && typeof candidate.topic === "string";
}

function getProcess() {
	const globalProcess = (globalThis as { process?: NodeJS.Process }).process;
	return globalProcess;
}

export async function publishEvent(topic: string, data: unknown) {
	const proc = getProcess();
	if (!proc?.send) {
		console.warn(`publishEvent skipped (Bun IPC unavailable): ${topic}`, data);
		return;
	}
	proc.send({
		__event_transport: true,
		topic,
		data,
	} satisfies IpcEventMessage);
}

export async function subscribeToEvents(topic: string): Promise<EventSubscriber> {
	const proc = getProcess();
	if (!proc?.on) {
		console.warn("subscribeToEvents skipped (Bun IPC unavailable)");
		return {
			async *[Symbol.asyncIterator]() {
				return;
			},
			close() {
				// no-op when IPC is not available
			},
		};
	}

	const queue: Array<unknown> = [];
	let pending: ((result: IteratorResult<unknown>) => void) | null = null;

	const push = (payload: unknown) => {
		if (pending) {
			const resolve = pending;
			pending = null;
			resolve({ value: payload, done: false });
			return;
		}
		queue.push(payload);
	};

	const onMessage = (message: unknown) => {
		if (!isIpcEventMessage(message)) return;
		if (message.topic !== topic) return;
		push(message.data);
	};

	proc.on("message", onMessage);

	return {
		[Symbol.asyncIterator]() {
			return {
				next() {
					if (queue.length > 0) {
						const value = queue.shift();
						return Promise.resolve({ value, done: false });
					}
					return new Promise<IteratorResult<unknown>>((resolve) => {
						pending = resolve;
					});
				},
			};
		},
		close() {
			proc.off("message", onMessage);
			if (pending) {
				pending({ value: undefined, done: true });
				pending = null;
			}
		},
	};
}
