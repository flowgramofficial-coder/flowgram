import type { Redis } from "ioredis";

/**
 * Atomic token bucket. KEYS[1] = bucket key. ARGV = capacity, refill/sec, cost, now(ms).
 * Time comes from the caller-supplied clock only for tests; production passes the
 * Valkey server clock via TIME so that pods with skewed clocks agree.
 * Returns {allowed(0|1), remaining, retryAfterMs}.
 */
const LUA = `
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
if now == 0 then
  local t = redis.call('TIME')
  now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
end
local data = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end
local elapsed = math.max(0, now - ts)
tokens = math.min(capacity, tokens + (elapsed / 1000) * rate)
local allowed = 0
local retry = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  retry = math.ceil(((cost - tokens) / rate) * 1000)
end
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
redis.call('PEXPIRE', KEYS[1], math.ceil((capacity / rate) * 1000) + 60000)
return {allowed, math.floor(tokens), retry}
`;

export interface BucketResult { allowed: boolean; remaining: number; retryAfterMs: number }

export interface BucketConfig {
  /** Burst size. */
  capacity: number;
  /** Sustained tokens per second. */
  refillPerSec: number;
}

/** Defaults sit well under Meta's per-account messaging budget; tune per environment. */
export const DEFAULT_IG_BUCKET: BucketConfig = { capacity: 20, refillPerSec: 5 };

export class TokenBucket {
  constructor(private readonly redis: Redis, private readonly cfg: BucketConfig = DEFAULT_IG_BUCKET) {
    this.redis.defineCommand("fgTokenBucket", { numberOfKeys: 1, lua: LUA });
  }

  async acquire(igAccountId: string, cost = 1, nowMs = 0): Promise<BucketResult> {
    const res = (await (this.redis as unknown as {
      fgTokenBucket(key: string, ...args: number[]): Promise<[number, number, number]>;
    }).fgTokenBucket(`fg:bucket:${igAccountId}`, this.cfg.capacity, this.cfg.refillPerSec, cost, nowMs));
    return { allowed: res[0] === 1, remaining: res[1], retryAfterMs: res[2] };
  }
}
