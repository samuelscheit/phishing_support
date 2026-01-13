import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "module";

console.log("Setting up AsyncLocalStorage...");

// Initialize AsyncLocalStorage before anything else
const als = new AsyncLocalStorage();

// Set up AsyncLocalStorage in the global scope
Object.defineProperty(globalThis, "AsyncLocalStorage", {
	value: AsyncLocalStorage,
	configurable: false,
	writable: false,
	enumerable: true,
});

Object.defineProperty(globalThis, "asyncLocalStorage", {
	value: als,
	configurable: false,
	writable: false,
	enumerable: true,
});

console.log("AsyncLocalStorage initialized and set on globalThis.", globalThis.AsyncLocalStorage);

// Create a require function
const require = createRequire(import.meta.url);

// Get Next.js's module cache
const moduleCache = require.cache;

// Delete Next.js's async-local-storage module if it's already cached
Object.keys(moduleCache).forEach((key) => {
	if (key.includes("next/dist/server/app-render/async-local-storage")) {
		console.log("Clearing cached Next.js async-local-storage module:", key);
		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
		delete moduleCache[key];
	}
});

// Export the AsyncLocalStorage instance for use in other modules
export { als as asyncLocalStorage, AsyncLocalStorage };
