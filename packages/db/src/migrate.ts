import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { createDb, createPool } from "./client.js";

const url = process.env.DATABASE_DIRECT_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL is required (migrations bypass PgBouncer)");

const pool = createPool(url, 1);
await migrate(createDb(pool), { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
await pool.end();
console.log("migrations applied");
