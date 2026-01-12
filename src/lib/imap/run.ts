import { startImapListener } from "./imap_listener";

startImapListener().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
