import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_DIRECT_URL ?? "postgres://flowgram_owner:flowgram_owner@localhost:5432/flowgram" },
  strict: true,
  verbose: true,
});
