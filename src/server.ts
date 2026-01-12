import next from "next";
import { createServer } from "node:http";

import { startImapListener } from "./lib/imap/imap_listener";

function envInt(name: string, defaultValue: number): number {
	const raw = process.env[name];
	if (!raw) return defaultValue;
	const value = Number.parseInt(raw, 10);
	return Number.isFinite(value) ? value : defaultValue;
}

const dev = process.env.NODE_ENV !== "production";
const port = envInt("PORT", 3000);
const hostname = process.env.HOSTNAME ?? (process.env.DOCKER ? "0.0.0.0" : "localhost");

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

await app.prepare();

// Start IMAP listener in the same process
startImapListener().catch((err) => {
	console.error("IMAP listener crashed:", err);
});

const server = createServer((req, res) => {
	try {
		handler(req, res);
	} catch (err) {
		console.error("Request handler error:", err);
		res.statusCode = 500;
		res.end("Internal Server Error");
	}
});

const shutdown = async (signal: string) => {
	console.log(`Received ${signal}, shutting down...`);
	server.close(() => {
		// no-op
	});
	try {
		// Next.js supports graceful shutdown
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await (app as any).close?.();
	} catch (err) {
		console.error("Error closing Next app:", err);
	}
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

server.listen(port, hostname, () => {
	console.log(`Server ready on http://${hostname}:${port} (dev=${dev})`);
});
