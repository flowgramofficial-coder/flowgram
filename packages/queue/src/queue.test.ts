import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { backoffStrategy, jitteredBackoffMs, RateLimitedError } from "./backoff.js";
import { TokenBucket } from "./tokenBucket.js";
import { createBreaker } from "./breaker.js";

describe("jittered exponential backoff", () => {
  it("doubles per attempt with bounded jitter and a cap", () => {
    expect(jitteredBackoffMs(1, 1000, 300000, () => 0)).toBe(1000);
    expect(jitteredBackoffMs(3, 1000, 300000, () => 0)).toBe(4000);
    expect(jitteredBackoffMs(3, 1000, 300000, () => 0.999)).toBeLessThan(4000 * 1.5 + 1);
    expect(jitteredBackoffMs(30, 1000, 300000, () => 0.5)).toBe(300000);
  });
  it("uses the bucket's retry estimate for rate-limit errors", () => {
    const ms = backoffStrategy(2, "jitteredExponential", new RateLimitedError(2000));
    expect(ms).toBeGreaterThanOrEqual(2000);
    expect(ms).toBeLessThan(2500);
  });
});

const url = process.env.TEST_VALKEY_URL;

// In CI the integration suites must run: a missing service is a failure, never a silent skip.
if (process.env.CI && !url) throw new Error("integration test services are not configured in CI");
describe.skipIf(!url)("Valkey token bucket (atomic Lua)", () => {
  const redis = new Redis(url ?? "redis://localhost:6379");
  afterAll(async () => { await redis.quit(); });

  it("allows a burst up to capacity then rejects with a retry estimate", async () => {
    const b = new TokenBucket(redis, { capacity: 5, refillPerSec: 1 });
    const id = randomUUID();
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await b.acquire(id, 1, 1_000_000));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results[5]?.allowed).toBe(false);
    expect(results[5]?.retryAfterMs).toBeGreaterThan(0);
    expect(results[5]?.retryAfterMs).toBeLessThanOrEqual(1000);
  });

  it("refills over time", async () => {
    const b = new TokenBucket(redis, { capacity: 2, refillPerSec: 2 });
    const id = randomUUID();
    await b.acquire(id, 1, 5_000_000);
    await b.acquire(id, 1, 5_000_000);
    expect((await b.acquire(id, 1, 5_000_000)).allowed).toBe(false);
    expect((await b.acquire(id, 1, 5_000_000 + 1_000)).allowed).toBe(true);
  });

  it("never over-grants under heavy concurrency (atomicity)", async () => {
    const b = new TokenBucket(redis, { capacity: 10, refillPerSec: 0.0001 });
    const id = randomUUID();
    const res = await Promise.all(Array.from({ length: 200 }, () => b.acquire(id, 1, 9_000_000)));
    expect(res.filter((r) => r.allowed)).toHaveLength(10);
  });

  it("isolates accounts from each other", async () => {
    const b = new TokenBucket(redis, { capacity: 1, refillPerSec: 0.0001 });
    const a = randomUUID(), c = randomUUID();
    expect((await b.acquire(a, 1, 7_000_000)).allowed).toBe(true);
    expect((await b.acquire(a, 1, 7_000_000)).allowed).toBe(false);
    expect((await b.acquire(c, 1, 7_000_000)).allowed).toBe(true);
  });
});

describe("circuit breaker", () => {
  it("opens after repeated provider failures and then fails fast", async () => {
    let calls = 0;
    const br = createBreaker("t", async () => { calls++; throw new Error("503"); },
      { volumeThreshold: 3, errorThresholdPercentage: 50, resetTimeoutMs: 60_000 });
    for (let i = 0; i < 6; i++) await br.fire().catch(() => undefined);
    expect(br.opened).toBe(true);
    const before = calls;
    await br.fire().catch(() => undefined);
    expect(calls).toBe(before);
    br.shutdown();
  });
});
