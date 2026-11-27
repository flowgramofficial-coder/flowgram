import { and, eq } from "drizzle-orm";
import { commentRules, withTenant } from "@flowgram/db";
import { RULES_TTL_SEC, rulesCacheKey } from "@flowgram/queue";
import type { Ctx } from "../context.js";

export type CachedRule = typeof commentRules.$inferSelect;

/** Active rules for an account from Valkey (60s TTL; the web app deletes the key on every edit). */
export async function loadActiveRules(ctx: Ctx, workspaceId: string, igAccountId: string): Promise<CachedRule[]> {
  const k = rulesCacheKey(igAccountId);
  const hit = await ctx.redis.get(k);
  if (hit) return JSON.parse(hit) as CachedRule[];
  const rules = await withTenant(ctx.db, workspaceId, (tx) =>
    tx.select().from(commentRules).where(and(eq(commentRules.igAccountId, igAccountId), eq(commentRules.isActive, true))));
  await ctx.redis.set(k, JSON.stringify(rules), "EX", RULES_TTL_SEC);
  return rules;
}
