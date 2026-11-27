import type { Redis } from "ioredis";

/** Cache keys are shared between worker (reads) and web (invalidates on edit). */
export const rulesCacheKey = (igAccountId: string) => `fg:rules:${igAccountId}`;
export const entitlementCacheKey = (workspaceId: string) => `fg:ent:${workspaceId}`;
export const alertChannel = (workspaceId: string) => `fg:alerts:${workspaceId}`;

export const RULES_TTL_SEC = 60;
export const ENTITLEMENT_TTL_SEC = 30;

export async function invalidateRules(redis: Redis, igAccountId: string): Promise<void> {
  await redis.del(rulesCacheKey(igAccountId));
}
export async function invalidateEntitlement(redis: Redis, workspaceId: string): Promise<void> {
  await redis.del(entitlementCacheKey(workspaceId));
}

export interface CreatorAlert {
  type: "handoff" | "token_expiring" | "token_invalid" | "human_takeover";
  workspaceId: string;
  igAccountId: string;
  senderId?: string;
  detail?: string;
  at: number;
}
export async function emitAlert(redis: Redis, alert: CreatorAlert): Promise<void> {
  await redis.publish(alertChannel(alert.workspaceId), JSON.stringify(alert));
  // Keep the last 50 so a dashboard that connects later still sees recent alerts.
  const key = `fg:alerts:log:${alert.workspaceId}`;
  await redis.lpush(key, JSON.stringify(alert));
  await redis.ltrim(key, 0, 49);
  await redis.expire(key, 7 * 24 * 3600);
}
