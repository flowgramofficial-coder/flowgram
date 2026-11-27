import { eq } from "drizzle-orm";
import { UnrecoverableError } from "bullmq";
import { auditLogs, dmMessages, igAccounts, withTenant } from "@flowgram/db";
import { IgApiError, type QuickReply } from "@flowgram/ig-client";
import { RateLimitedError, emitAlert } from "@flowgram/queue";
import { decryptSecret } from "@flowgram/security";
import { IG_CALL, type Ctx } from "../context.js";
import { bump } from "./counters.js";

export type DmSource = "comment_rule" | "welcome_bot" | "ai_persona";

export interface SendArgs {
  workspaceId: string;
  igAccountId: string;
  igUserId: string;
  /** Thread key: the follower's IGSID. */
  recipientId: string;
  text: string;
  quickReplies?: QuickReply[];
  /** Set for the one-per-comment private reply; otherwise a normal DM to recipientId. */
  commentId?: string;
  source: DmSource;
  /** Idempotency marker, unique per logical send (e.g. "comment:<id>:dm"). */
  marker: string;
  /** Counter attribution, e.g. the rule id. */
  statRule?: string;
}

export type SendResult = { sent: true; messageId: string } | { sent: false; reason: "duplicate" };

const BOT_MID_TTL = 900;
const botMidKey = (mid: string) => `fg:botmid:${mid}`;
export const isBotMessage = async (ctx: Ctx, mid: string): Promise<boolean> => (await ctx.redis.exists(botMidKey(mid))) === 1;

async function loadToken(ctx: Ctx, a: SendArgs): Promise<string> {
  return withTenant(ctx.db, a.workspaceId, async (tx) => {
    const [acct] = await tx.select().from(igAccounts).where(eq(igAccounts.id, a.igAccountId)).limit(1);
    if (!acct) throw new UnrecoverableError("account missing");
    if (acct.status !== "active") throw new UnrecoverableError("account needs reauth");
    return decryptSecret(ctx.keys, { ciphertext: acct.encryptedAccessToken, encryptedDek: acct.encryptedDek }, acct.id);
  });
}

/**
 * Delivery semantics: at-most-once for ambiguous failures. The marker is claimed before the call and
 * released only when we provably did not send (token/bucket problems) or Meta definitively rejected the
 * request (HTTP status > 0). A network timeout keeps the marker, because the message may already be
 * delivered and a duplicate DM to a follower is worse than a missed one.
 */
export async function sendDm(ctx: Ctx, a: SendArgs): Promise<SendResult> {
  const mk = `fg:done:${a.marker}`;
  if ((await ctx.redis.set(mk, "1", "EX", 600, "NX")) !== "OK") return { sent: false, reason: "duplicate" };
  const release = () => ctx.redis.del(mk);

  // Phase 1: nothing has been sent yet, so any failure is safe to retry.
  let token: string;
  try {
    token = await loadToken(ctx, a);
    const slot = await ctx.bucket.acquire(a.igAccountId);
    if (!slot.allowed) throw new RateLimitedError(slot.retryAfterMs);
  } catch (err) {
    await release();
    throw err;
  }

  // Phase 2: the Instagram call.
  let messageId: string;
  try {
    const r = await IG_CALL(ctx, () => a.commentId
      ? ctx.ig.sendPrivateReply(token, a.igUserId, a.commentId, a.text)
      : ctx.ig.sendText(token, a.igUserId, a.recipientId, a.text, a.quickReplies));
    messageId = (r as { messageId: string }).messageId;
  } catch (err) {
    if (err instanceof IgApiError) {
      if (err.status > 0) await release();
      if (err.tokenInvalid) {
        await markNeedsReauth(ctx, a);
        throw new UnrecoverableError("instagram token invalid");
      }
      if (!err.retryable) throw new UnrecoverableError(`instagram rejected: ${err.message}`);
    }
    throw err;
  }

  // Phase 3: bookkeeping. The marker stays, so a retry after a failure here cannot double-send.
  await ctx.redis.set(botMidKey(messageId), "1", "EX", BOT_MID_TTL);
  await ctx.redis.expire(mk, 7 * 24 * 3600);
  await withTenant(ctx.db, a.workspaceId, (tx) => tx.insert(dmMessages).values({
    workspaceId: a.workspaceId, igAccountId: a.igAccountId, senderIgId: a.recipientId,
    direction: "outbound", source: a.source, metaMessageId: messageId, body: a.text,
  }).onConflictDoNothing());
  await bump(ctx, { workspaceId: a.workspaceId, igAccountId: a.igAccountId, scope: "account", scopeId: a.igAccountId, metric: "dm_sent" });
  if (a.statRule) await bump(ctx, { workspaceId: a.workspaceId, igAccountId: a.igAccountId, scope: "rule", scopeId: a.statRule, metric: "dm_sent" });
  return { sent: true, messageId };
}

async function markNeedsReauth(ctx: Ctx, a: SendArgs): Promise<void> {
  await withTenant(ctx.db, a.workspaceId, async (tx) => {
    await tx.update(igAccounts).set({ status: "needs_reauth" }).where(eq(igAccounts.id, a.igAccountId));
    await tx.insert(auditLogs).values({ workspaceId: a.workspaceId, actor: "system", action: "ig.token_invalid", metadata: { igAccountId: a.igAccountId } });
  });
  await emitAlert(ctx.redis, { type: "token_invalid", workspaceId: a.workspaceId, igAccountId: a.igAccountId, at: Date.now() });
}
