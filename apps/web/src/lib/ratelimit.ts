import "server-only";
import type { Redis } from "ioredis";

// Sliding-window log in a sorted set: exact, and atomic in one Lua call.
const LUA = `
local now = tonumber(ARGV[1]); local win = tonumber(ARGV[2]); local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - win)
local n = redis.call('ZCARD', KEYS[1])
if n >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, math.ceil((tonumber(oldest[2]) + win - now) / 1000)}
end
redis.call('ZADD', KEYS[1], now, ARGV[4])
redis.call('PEXPIRE', KEYS[1], win)
return {1, 0}
`;

export interface Limit { name: string; limit: number; windowSec: number }

export const LIMITS = {
  login: { name: "login", limit: 8, windowSec: 600 },
  signup: { name: "signup", limit: 5, windowSec: 3600 },
  reset: { name: "reset", limit: 5, windowSec: 3600 },
  mutate: { name: "mutate", limit: 120, windowSec: 60 },
  totp: { name: "totp", limit: 6, windowSec: 600 },
} satisfies Record<string, Limit>;

/** Returns null when allowed, else seconds until retry. Keyed per IP and, when given, per account. */
export async function hit(redis: Redis, l: Limit, ...keys: Array<string | null | undefined>): Promise<number | null> {
  for (const k of keys.filter((x): x is string => !!x)) {
    const now = Date.now();
    const [ok, retry] = (await redis.eval(LUA, 1, `fg:rl:${l.name}:${k}`, now, l.windowSec * 1000, l.limit, `${now}-${Math.random()}`)) as [number, number];
    if (!ok) return retry;
  }
  return null;
}
