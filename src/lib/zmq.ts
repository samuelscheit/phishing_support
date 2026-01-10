import * as zmq from "zeromq";
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

export async function publishEvent(topic: string, data: any) {
	try {
		const pub = await getZmqPublisher();
		await pub.send([topic, JSON.stringify(data)]);
	} catch (error) {
		console.error("Failed to publish ZeroMQ event:", error);
	}
}

export async function subscribeToEvents(topic: string) {
	const subscriber = new zmq.Subscriber();
	subscriber.connect(ZMQ_PUB_ADDRESS);
	subscriber.subscribe(topic);
	return subscriber;
}
