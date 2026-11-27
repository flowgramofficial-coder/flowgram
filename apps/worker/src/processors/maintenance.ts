import { eq } from "drizzle-orm";
import { auditLogs, igAccounts, resolveExpiring, withTenant } from "@flowgram/db";
import { emitAlert } from "@flowgram/queue";
import { decryptSecret, encryptSecret } from "@flowgram/security";
import { IgApiError } from "@flowgram/ig-client";
import type { Ctx } from "../context.js";
import { flushCounters } from "../services/counters.js";
import { purgeOldEvents } from "../services/events.js";

/** Daily: refresh every long-lived token expiring within 10 days. Failures flag the account for reconnect. */
export async function refreshTokens(ctx: Ctx): Promise<{ refreshed: number; failed: number }> {
  const due = await resolveExpiring(ctx.db, 10);
  let refreshed = 0, failed = 0;
  for (const { igAccountId, workspaceId } of due) {
    try {
      await withTenant(ctx.db, workspaceId, async (tx) => {
        const [a] = await tx.select().from(igAccounts).where(eq(igAccounts.id, igAccountId)).limit(1);
        if (!a) return;
        const token = await decryptSecret(ctx.keys, { ciphertext: a.encryptedAccessToken, encryptedDek: a.encryptedDek }, a.id);
        const next = await ctx.ig.refreshToken(token);
        const enc = await encryptSecret(ctx.keys, next.accessToken, a.id); // fresh DEK on every rotation
        await tx.update(igAccounts).set({
          encryptedAccessToken: enc.ciphertext, encryptedDek: enc.encryptedDek,
          tokenExpiresAt: new Date(ctx.now().getTime() + next.expiresInSec * 1000),
        }).where(eq(igAccounts.id, a.id));
        await tx.insert(auditLogs).values({ workspaceId, actor: "system", action: "ig.token_rotated", metadata: { igAccountId } });
      });
      refreshed++;
    } catch (err) {
      failed++;
      ctx.log.warn({ igAccountId, code: err instanceof IgApiError ? err.code : "other" }, "token refresh failed");
      await withTenant(ctx.db, workspaceId, async (tx) => {
        await tx.update(igAccounts).set({ status: "needs_reauth" }).where(eq(igAccounts.id, igAccountId));
        await tx.insert(auditLogs).values({ workspaceId, actor: "system", action: "ig.token_refresh_failed", metadata: { igAccountId } });
      }).catch(() => undefined);
      await emitAlert(ctx.redis, { type: "token_expiring", workspaceId, igAccountId, at: Date.now() });
    }
  }
  return { refreshed, failed };
}

export async function runMaintenance(ctx: Ctx, job: string): Promise<unknown> {
  switch (job) {
    case "flush-counters": return flushCounters(ctx);
    case "refresh-tokens": return refreshTokens(ctx);
    case "purge-dedup": return purgeOldEvents(ctx);
    default: throw new Error(`unknown maintenance job ${job}`);
  }
}
