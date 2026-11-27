import { sql } from "drizzle-orm";
import { withTenant } from "@flowgram/db";
import type { Ctx } from "../context.js";

const key = (ws: string, month: string) => `fg:quota:${ws}:${month}`;

// Atomic check-and-increment: never exceeds the limit, even under concurrent workers.
const CONSUME = `
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
if used >= tonumber(ARGV[1]) then return -1 end
return redis.call('INCR', KEYS[1])
`;

/** On a cold key (new month, flushed cache) seed from the durable counter in PostgreSQL. */
async function seed(ctx: Ctx, ws: string, month: string): Promise<void> {
  const k = key(ws, month);
  if (await ctx.redis.exists(k)) return;
  const used = await withTenant(ctx.db, ws, async (tx) => {
    const r = await tx.execute(sql`select coalesce(sum(value), 0)::int as n from usage_counters
      where workspace_id = ${ws} and scope = 'account' and metric = 'dm_sent' and bucket = ${month}`);
    return (r.rows[0] as { n: number }).n;
  });
  await ctx.redis.set(k, String(used), "EX", 40 * 24 * 3600, "NX");
}

export async function consumeQuota(ctx: Ctx, ws: string, limit: number): Promise<boolean> {
  const month = ctx.now().toISOString().slice(0, 7);
  await seed(ctx, ws, month);
  const k = key(ws, month);
  const res = (await ctx.redis.eval(CONSUME, 1, k, String(limit))) as number;
  if (res >= 0) await ctx.redis.expire(k, 40 * 24 * 3600);
  return res >= 0;
}

/** Give a unit back when the send did not happen, so a retry can consume it again. */
export async function refundQuota(ctx: Ctx, ws: string): Promise<void> {
  const k = key(ws, ctx.now().toISOString().slice(0, 7));
  const v = Number((await ctx.redis.get(k)) ?? 0);
  if (v > 0) await ctx.redis.decr(k);
}
