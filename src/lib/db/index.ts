import "dotenv/config";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import path, { join } from "path";
import { fileURLToPath } from "url";
import { Database } from "bun:sqlite";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({
	path: path.join(__dirname, "..", "..", "..", ".env"),
	quiet: true,
});

console.log("Using DB file:", process.env.DB_FILE_NAME);

export const db = drizzle(
	new Database(process.env.DB_FILE_NAME!, {
		safeIntegers: true,
	}),
	{
		logger: false,
	}
);

let migrationsFolder = join(__dirname, "..", "..", "..", "drizzle");

if (__dirname.startsWith("/ROOT/")) {
	migrationsFolder = join(process.cwd(), "drizzle");
}

await migrate(db, {
	migrationsFolder,
});
