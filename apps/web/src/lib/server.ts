import "server-only";
import { createDb, createPool, type Db } from "@flowgram/db";
import { createConnection } from "@flowgram/queue";
import { keyProviderFromEnv, type KeyProvider } from "@flowgram/security";
import type { Redis } from "ioredis";
import { env } from "./env";

const g = globalThis as unknown as { __fg?: { db: Db; redis: Redis; keys: KeyProvider } };

/** Process-wide singletons (survive Next dev HMR). All traffic goes through PgBouncer via DATABASE_URL. */
export function services() {
  g.__fg ??= {
    db: createDb(createPool(env.databaseUrl, Number(process.env.DB_POOL_MAX ?? 10))),
    redis: createConnection(env.valkeyUrl, "worker"),
    keys: keyProviderFromEnv(),
  };
  return g.__fg;
}
