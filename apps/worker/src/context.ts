import type CircuitBreaker from "opossum";
import type { Redis } from "ioredis";
import type { Db } from "@flowgram/db";
import type { Embedder, GenerateRequest } from "@flowgram/ai-engine";
import type { IgClient } from "@flowgram/ig-client";
import type { Queues, TokenBucket } from "@flowgram/queue";
import type { KeyProvider } from "@flowgram/security";

export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/** Everything a processor needs. Built once in main.ts, faked in tests. */
export interface Ctx {
  db: Db;
  redis: Redis;
  queues: Queues;
  bucket: TokenBucket;
  ig: IgClient;
  keys: KeyProvider;
  /** Runs any Instagram call under a circuit breaker: `ctx.igBreaker.fire(() => ig.sendText(...))`. */
  igBreaker: CircuitBreaker<[() => Promise<unknown>], unknown>;
  llm: {
    primary: CircuitBreaker<[GenerateRequest], string>;
    secondary: CircuitBreaker<[GenerateRequest], string> | null;
  };
  embedder: Embedder;
  log: Logger;
  now: () => Date;
}

export const IG_CALL = <T>(ctx: Ctx, fn: () => Promise<T>): Promise<T> => ctx.igBreaker.fire(fn) as Promise<T>;
