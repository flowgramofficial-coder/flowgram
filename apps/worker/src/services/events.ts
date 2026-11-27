import { sql } from "drizzle-orm";
import { webhookEventsDedup } from "@flowgram/db";
import type { Ctx } from "../context.js";

/**
 * Durable idempotency across Meta's redelivery window (it retries for up to ~36h, far longer than a
 * BullMQ job id is retained). Check at the start, mark at the end, so a failed attempt can be retried.
 */
export async function eventSeen(ctx: Ctx, key: string): Promise<boolean> {
  const r = await ctx.db.execute(sql`select 1 from webhook_events_dedup where event_key = ${key} limit 1`);
  return r.rows.length > 0;
}
export async function markEventSeen(ctx: Ctx, key: string): Promise<void> {
  await ctx.db.insert(webhookEventsDedup).values({ eventKey: key }).onConflictDoNothing();
}
export async function purgeOldEvents(ctx: Ctx, olderThanDays = 3): Promise<void> {
  await ctx.db.execute(sql`delete from webhook_events_dedup where received_at < now() - make_interval(days => ${olderThanDays})`);
}
