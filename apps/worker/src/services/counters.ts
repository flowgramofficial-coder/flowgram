import { sql } from "drizzle-orm";
import { withTenant } from "@flowgram/db";
import type { Ctx } from "../context.js";

const HASH = "fg:counters";
const FLUSHING = "fg:counters:flushing";

const month = (d: Date) => d.toISOString().slice(0, 7);
const day = (d: Date) => d.toISOString().slice(0, 10);

export interface BumpArgs {
  workspaceId: string;
  igAccountId: string;
  scope: "account" | "rule";
  scopeId: string;
  metric: string;
  by?: number;
}

/** Hot path: one HINCRBY per bucket, no database round trip. */
export async function bump(ctx: Ctx, a: BumpArgs): Promise<void> {
  const now = ctx.now();
  const by = a.by ?? 1;
  const p = ctx.redis.pipeline();
  for (const bucket of [month(now), day(now)]) {
    p.hincrby(HASH, [a.workspaceId, a.igAccountId, a.scope, a.scopeId, bucket, a.metric].join("|"), by);
  }
  await p.exec();
}

/**
 * Drain Valkey counters into PostgreSQL. RENAME makes the swap atomic, so increments that arrive
 * during the flush land in a fresh hash. If a previous flush crashed after RENAME, its leftovers are
 * drained first. Delivery is at-least-once: a crash between commit and DEL could double-count one
 * batch of analytics (quota enforcement does not depend on this path).
 */
export async function flushCounters(ctx: Ctx): Promise<number> {
  if (!(await ctx.redis.exists(FLUSHING))) {
    if (!(await ctx.redis.exists(HASH))) return 0;
    await ctx.redis.rename(HASH, FLUSHING).catch(() => undefined); // another pod won the race
  }
  const all = await ctx.redis.hgetall(FLUSHING);
  const byWs = new Map<string, Array<[string[], number]>>();
  for (const [field, v] of Object.entries(all)) {
    const parts = field.split("|");
    const ws = parts[0];
    if (parts.length !== 6 || !ws) continue;
    (byWs.get(ws) ?? byWs.set(ws, []).get(ws)!).push([parts, Number(v)]);
  }
  let rows = 0;
  for (const [ws, items] of byWs) {
    await withTenant(ctx.db, ws, async (tx) => {
      for (const [p, value] of items) {
        await tx.execute(sql`
          insert into usage_counters (workspace_id, ig_account_id, scope, scope_id, bucket, metric, value)
          values (${p[0]}, ${p[1]}, ${p[2]}, ${p[3]}, ${p[4]}, ${p[5]}, ${value})
          on conflict (workspace_id, scope, scope_id, bucket, metric)
          do update set value = usage_counters.value + excluded.value`);
        rows++;
      }
    }).catch((err: unknown) => {
      // e.g. workspace deleted mid-flight (FK violation): drop that tenant's batch, keep the rest.
      ctx.log.warn({ ws, err: String(err) }, "counter flush skipped tenant");
    });
  }
  await ctx.redis.del(FLUSHING);
  return rows;
}
