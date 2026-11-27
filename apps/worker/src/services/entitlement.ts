import { eq } from "drizzle-orm";
import { withTenant, workspaces } from "@flowgram/db";
import { ENTITLEMENT_TTL_SEC, entitlementCacheKey } from "@flowgram/queue";
import type { Ctx } from "../context.js";

export interface Entitlement {
  plan: "free" | "pro";
  subscriptionStatus: string;
  monthlyDmQuota: number;
  timezone: string;
}

/** Server-side source of truth, cached 30s and invalidated by the Stripe webhook processor. */
export async function getEntitlement(ctx: Ctx, workspaceId: string): Promise<Entitlement | null> {
  const k = entitlementCacheKey(workspaceId);
  const hit = await ctx.redis.get(k);
  if (hit) return JSON.parse(hit) as Entitlement;
  const row = await withTenant(ctx.db, workspaceId, async (tx) =>
    (await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1))[0]);
  if (!row) return null;
  const ent: Entitlement = { plan: row.plan, subscriptionStatus: row.subscriptionStatus, monthlyDmQuota: row.monthlyDmQuota, timezone: row.timezone };
  await ctx.redis.set(k, JSON.stringify(ent), "EX", ENTITLEMENT_TTL_SEC);
  return ent;
}

export const isProActive = (e: Entitlement | null): boolean => !!e && e.plan === "pro" && e.subscriptionStatus === "active";
