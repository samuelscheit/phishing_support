import * as zmq from "zeromq";
import type { EventSubscriber } from "./event_transport";
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({
	path: path.join(__dirname, "..", "..", ".env"),
	quiet: true,
});

const ZMQ_PUB_ADDRESS = process.env.ZMQ_PUB_ADDRESS || "tcp://127.0.0.1:5555";

let publisher: zmq.Publisher | null = null;

export async function getZmqPublisher() {
	if (!publisher) {
		publisher = new zmq.Publisher();
		await publisher.bind(ZMQ_PUB_ADDRESS);
		console.log(`ZeroMQ Publisher bound to ${ZMQ_PUB_ADDRESS}`);
	}
	return publisher;
}

export async function publishEvent(topic: string, data: unknown) {
	try {
		const pub = await getZmqPublisher();
		await pub.send([topic, JSON.stringify(data)]);
	} catch (error) {
		console.error("Failed to publish ZeroMQ event:", error);
	}
}

export async function subscribeToEvents(topic: string): Promise<EventSubscriber> {
	const subscriber = new zmq.Subscriber();
	subscriber.connect(ZMQ_PUB_ADDRESS);
	subscriber.subscribe(topic);
	return {
		[Symbol.asyncIterator]() {
			const iterator = subscriber[Symbol.asyncIterator]();
			return {
				async next() {
					const { value, done } = await iterator.next();
					if (done || !value) {
						return { value: undefined, done: true };
					}
					const [, msgData] = value as [Buffer, Buffer | string];
					const dataString = typeof msgData === "string" ? msgData : msgData.toString();
					let parsed: unknown = dataString;
					try {
						parsed = JSON.parse(dataString);
					} catch {
						parsed = dataString;
					}
					return { value: parsed, done: false };
				},
			};
		},
		close() {
			subscriber.close();
		},
	};
}
