export type EventSubscriber = {
	[Symbol.asyncIterator](): AsyncIterator<unknown>;
	close(): void;
};

const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined" || true;
let transportImplPromise: Promise<typeof import("./zmq") | typeof import("./ipc_transport") | typeof import("./same_process")> | null =
	null;

async function getTransportImpl() {
	if (!transportImplPromise) {
		transportImplPromise = isBunRuntime ? import("./same_process") : import("./zmq");
	}
	return transportImplPromise;
}

export async function publishEvent(topic: string, data: unknown) {
	console.log("Publishing event", topic, data);
	// console.log("Publishing event", topic, data);
	const { publishEvent: transportPublishEvent } = await getTransportImpl();
	return transportPublishEvent(topic, data);
}

export async function subscribeToEvents(topic: string): Promise<EventSubscriber> {
	const { subscribeToEvents: transportSubscribeToEvents } = await getTransportImpl();
	return transportSubscribeToEvents(topic);
}
