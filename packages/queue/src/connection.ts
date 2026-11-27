import { Redis, type RedisOptions } from "ioredis";

/** BullMQ workers require maxRetriesPerRequest: null; producers should fail fast instead. */
export function createConnection(url: string, role: "producer" | "worker" = "producer"): Redis {
  const opts: RedisOptions = role === "worker"
    ? { maxRetriesPerRequest: null, enableReadyCheck: true }
    : { maxRetriesPerRequest: 2, enableOfflineQueue: false, connectTimeout: 2_000 };
  return new Redis(url, opts);
}
