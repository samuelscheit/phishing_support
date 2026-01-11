import "dotenv/config";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join } from "path";
import { fileURLToPath } from "url";
import { Database } from "bun:sqlite";

export const db = drizzle(
	new Database(process.env.DB_FILE_NAME!, {
		safeIntegers: true,
	})
);

let migrationsFolder = join(__dirname, "..", "..", "..", "drizzle");

if (__dirname.startsWith("/ROOT/")) {
	migrationsFolder = join(process.cwd(), "drizzle");
}

await migrate(db, {
	migrationsFolder,
});
