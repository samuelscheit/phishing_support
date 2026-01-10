import "dotenv/config";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join } from "path";

export const db = drizzle(process.env.DB_FILE_NAME!);

await migrate(db, {
	migrationsFolder: join(process.cwd(), "drizzle"),
});
