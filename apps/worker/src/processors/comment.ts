import { sql } from "drizzle-orm";
import { igContacts, withTenant, resolveIgAccount } from "@flowgram/db";
import { IgApiError } from "@flowgram/ig-client";
import { decryptSecret } from "@flowgram/security";
import { eq } from "drizzle-orm";
import { igAccounts } from "@flowgram/db";
import { interpolate, type CommentJob } from "@flowgram/shared";
import { IG_CALL, type Ctx } from "../context.js";
import { bump } from "../services/counters.js";
import { getEntitlement } from "../services/entitlement.js";
import { eventSeen, markEventSeen } from "../services/events.js";
import { pickRule } from "../services/matcher.js";
import { consumeQuota, refundQuota } from "../services/quota.js";
import { loadActiveRules } from "../services/rules.js";
import { sendDm } from "../services/sender.js";

export type CommentOutcome =
  | "unknown_account" | "own_comment" | "duplicate" | "no_workspace" | "no_match" | "quota_blocked" | "sent" | "send_skipped";

async function postTitle(ctx: Ctx, ws: string, acctId: string, mediaId: string | null): Promise<string> {
  if (!mediaId) return "";
  const k = `fg:caption:${mediaId}`;
  const hit = await ctx.redis.get(k);
  if (hit !== null) return hit;
  try {
    const token = await withTenant(ctx.db, ws, async (tx) => {
      const [a] = await tx.select().from(igAccounts).where(eq(igAccounts.id, acctId)).limit(1);
      return a ? decryptSecret(ctx.keys, { ciphertext: a.encryptedAccessToken, encryptedDek: a.encryptedDek }, a.id) : null;
    });
    if (!token) return "";
    const caption = await IG_CALL(ctx, () => ctx.ig.getMediaCaption(token, mediaId));
    await ctx.redis.set(k, caption, "EX", 3600);
    return caption;
  } catch {
    return ""; // a missing caption must never block the DM
  }
}

export async function processComment(ctx: Ctx, d: CommentJob): Promise<CommentOutcome> {
  const acct = await resolveIgAccount(ctx.db, d.igUserId);
  if (!acct) return "unknown_account";
  if (d.fromId === d.igUserId) return "own_comment";
  const eventKey = `comment:${d.commentId}`;
  if (await eventSeen(ctx, eventKey)) return "duplicate";

  const ent = await getEntitlement(ctx, acct.workspaceId);
  if (!ent) return "no_workspace";
  const rules = await loadActiveRules(ctx, acct.workspaceId, acct.igAccountId);
  const rule = pickRule(rules, d.mediaId, d.text);
  if (!rule) { await markEventSeen(ctx, eventKey); return "no_match"; }

  await bump(ctx, { workspaceId: acct.workspaceId, igAccountId: acct.igAccountId, scope: "rule", scopeId: rule.id, metric: "triggered" });

  // Free plan: monthly cap, enforced atomically before anything is sent.
  let consumed = false;
  if (ent.plan === "free") {
    if (!(await consumeQuota(ctx, acct.workspaceId, ent.monthlyDmQuota))) {
      await bump(ctx, { workspaceId: acct.workspaceId, igAccountId: acct.igAccountId, scope: "rule", scopeId: rule.id, metric: "quota_blocked" });
      await markEventSeen(ctx, eventKey);
      return "quota_blocked";
    }
    consumed = true;
  }

  try {
    const vars = { username: d.fromUsername ?? "", post_title: rule.dmTemplate.includes("{post_title}") || rule.publicReplyTemplates.some((t) => t.includes("{post_title}"))
      ? await postTitle(ctx, acct.workspaceId, acct.igAccountId, d.mediaId) : "" };

    // Public reply first (best effort, once per comment). Its failure must not block the DM.
    if (rule.publicReplyEnabled && rule.publicReplyTemplates.length > 0) {
      const pubMarker = `comment:${d.commentId}:public`;
      if ((await ctx.redis.set(`fg:done:${pubMarker}`, "1", "EX", 7 * 24 * 3600, "NX")) === "OK") {
        try {
          const tpl = rule.publicReplyTemplates[Math.floor(Math.random() * rule.publicReplyTemplates.length)] ?? "";
          const token = await withTenant(ctx.db, acct.workspaceId, async (tx) => {
            const [a] = await tx.select().from(igAccounts).where(eq(igAccounts.id, acct.igAccountId)).limit(1);
            return a ? decryptSecret(ctx.keys, { ciphertext: a.encryptedAccessToken, encryptedDek: a.encryptedDek }, a.id) : null;
          });
          const slot = await ctx.bucket.acquire(acct.igAccountId);
          if (token && slot.allowed) {
            await IG_CALL(ctx, () => ctx.ig.replyToComment(token, d.commentId, interpolate(tpl, vars)));
            await bump(ctx, { workspaceId: acct.workspaceId, igAccountId: acct.igAccountId, scope: "rule", scopeId: rule.id, metric: "public_replies" });
          } else {
            await ctx.redis.del(`fg:done:${pubMarker}`);
          }
        } catch (err) {
          ctx.log.warn({ commentId: d.commentId, err: err instanceof IgApiError ? err.code : String(err) }, "public reply failed; continuing to DM");
        }
      }
    }

    let text = interpolate(rule.dmTemplate, vars);
    if (rule.ctaLabel && rule.ctaUrl) text += `\n\n${rule.ctaLabel}: ${rule.ctaUrl}`;

    const res = await sendDm(ctx, {
      workspaceId: acct.workspaceId, igAccountId: acct.igAccountId, igUserId: d.igUserId, recipientId: d.fromId,
      commentId: d.commentId, text, source: "comment_rule", marker: `comment:${d.commentId}:dm`, statRule: rule.id,
    });

    if (!res.sent) { // a concurrent attempt already sent it; keep its quota unit
      await markEventSeen(ctx, eventKey);
      return "send_skipped";
    }
    // The commenter has now been messaged: record the contact so the welcome bot does not greet them again.
    await withTenant(ctx.db, acct.workspaceId, (tx) => tx.insert(igContacts).values({
      workspaceId: acct.workspaceId, igAccountId: acct.igAccountId, senderIgId: d.fromId,
      senderUsername: d.fromUsername, welcomeSentAt: ctx.now(),
    }).onConflictDoUpdate({
      target: [igContacts.igAccountId, igContacts.senderIgId],
      set: { welcomeSentAt: sql`coalesce(${igContacts.welcomeSentAt}, now())` },
    }));
    await markEventSeen(ctx, eventKey);
    return "sent";
  } catch (err) {
    if (consumed) await refundQuota(ctx, acct.workspaceId);
    throw err;
  }
}
