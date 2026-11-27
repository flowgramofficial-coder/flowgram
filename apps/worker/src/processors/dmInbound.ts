import { and, eq, isNull, sql } from "drizzle-orm";
import { aiPersonaConfigs, dmMessages, igContacts, resolveIgAccount, welcomeBotConfigs, withTenant } from "@flowgram/db";
import { emitAlert } from "@flowgram/queue";
import type { DmInboundJob } from "@flowgram/shared";
import type { Ctx } from "../context.js";
import { bump } from "../services/counters.js";
import { getEntitlement, isProActive } from "../services/entitlement.js";
import { eventSeen, markEventSeen } from "../services/events.js";
import { isBotMessage, sendDm } from "../services/sender.js";

export type DmOutcome =
  | "unknown_account" | "duplicate" | "bot_echo" | "human_takeover" | "icebreaker" | "icebreaker_unknown"
  | "welcome_scheduled" | "ai_scheduled" | "stored_only";

export async function processDmInbound(ctx: Ctx, d: DmInboundJob): Promise<DmOutcome> {
  const acct = await resolveIgAccount(ctx.db, d.igUserId);
  if (!acct) return "unknown_account";
  const { workspaceId: ws, igAccountId } = acct;
  const eventKey = `dm:${d.messageId}`;
  if (await eventSeen(ctx, eventKey)) return "duplicate";

  // ---- Echo: a message sent FROM the creator's account. The follower is the recipient. ----
  if (d.isEcho) {
    if (await isBotMessage(ctx, d.messageId)) { await markEventSeen(ctx, eventKey); return "bot_echo"; }
    // Not ours, so a human typed it in the Instagram app: pause AI on this thread.
    const cfg = await withTenant(ctx.db, ws, async (tx) =>
      (await tx.select().from(aiPersonaConfigs).where(eq(aiPersonaConfigs.igAccountId, igAccountId)).limit(1))[0]);
    const hours = cfg?.humanTakeoverPauseHours ?? 24;
    await withTenant(ctx.db, ws, async (tx) => {
      await tx.insert(igContacts).values({
        workspaceId: ws, igAccountId, senderIgId: d.recipientId, welcomeSentAt: ctx.now(),
        aiPausedUntil: sql`now() + make_interval(hours => ${hours})`,
      }).onConflictDoUpdate({
        target: [igContacts.igAccountId, igContacts.senderIgId],
        set: { aiPausedUntil: sql`now() + make_interval(hours => ${hours})`, welcomeSentAt: sql`coalesce(${igContacts.welcomeSentAt}, now())` },
      });
      await tx.insert(dmMessages).values({
        workspaceId: ws, igAccountId, senderIgId: d.recipientId, direction: "outbound", source: "human_creator",
        metaMessageId: d.messageId, body: d.text ?? "",
      }).onConflictDoNothing();
    });
    await emitAlert(ctx.redis, { type: "human_takeover", workspaceId: ws, igAccountId, senderId: d.recipientId, at: Date.now() });
    await markEventSeen(ctx, eventKey);
    return "human_takeover";
  }

  // ---- Inbound from a follower ----
  const senderId = d.senderId;
  await withTenant(ctx.db, ws, (tx) => tx.insert(dmMessages).values({
    workspaceId: ws, igAccountId, senderIgId: senderId, direction: "inbound", source: "user",
    metaMessageId: d.messageId, body: d.text ?? "",
  }).onConflictDoNothing());

  // Quick-reply tap: route straight to the configured icebreaker, never through the LLM.
  if (d.quickReplyPayload?.startsWith("IB:")) {
    const id = d.quickReplyPayload.slice(3);
    const cfg = await withTenant(ctx.db, ws, async (tx) =>
      (await tx.select().from(welcomeBotConfigs).where(eq(welcomeBotConfigs.igAccountId, igAccountId)).limit(1))[0]);
    const ib = cfg?.icebreakers.find((i) => i.id === id);
    if (!ib || !cfg?.isActive) { await markEventSeen(ctx, eventKey); return "icebreaker_unknown"; }
    await sendDm(ctx, {
      workspaceId: ws, igAccountId, igUserId: d.igUserId, recipientId: senderId, text: ib.reply,
      source: "welcome_bot", marker: `dm:${d.messageId}:icebreaker`,
    });
    await bump(ctx, { workspaceId: ws, igAccountId, scope: "account", scopeId: igAccountId, metric: "icebreaker_taps" });
    await markEventSeen(ctx, eventKey);
    return "icebreaker";
  }

  // Atomic first-contact detection: only the transaction that wins the insert (or flips
  // welcome_sent_at from NULL) triggers the welcome. Three messages in one second -> one welcome.
  const welcome = await withTenant(ctx.db, ws, async (tx) => {
    const inserted = await tx.insert(igContacts).values({ workspaceId: ws, igAccountId, senderIgId: senderId })
      .onConflictDoNothing().returning({ id: igContacts.id });
    if (inserted.length > 0) {
      const claimed = await tx.update(igContacts).set({ welcomeSentAt: ctx.now() })
        .where(and(eq(igContacts.id, inserted[0]!.id), isNull(igContacts.welcomeSentAt))).returning({ id: igContacts.id });
      return claimed.length > 0;
    }
    const claimed = await tx.update(igContacts).set({ welcomeSentAt: ctx.now() })
      .where(and(eq(igContacts.igAccountId, igAccountId), eq(igContacts.senderIgId, senderId), isNull(igContacts.welcomeSentAt)))
      .returning({ id: igContacts.id });
    return claimed.length > 0;
  });

  if (welcome) {
    const cfg = await withTenant(ctx.db, ws, async (tx) =>
      (await tx.select().from(welcomeBotConfigs).where(eq(welcomeBotConfigs.igAccountId, igAccountId)).limit(1))[0]);
    if (cfg?.isActive) {
      await ctx.queues.dmWelcome.add("welcome", { workspaceId: ws, igAccountId, senderId },
        { jobId: `welcome_${igAccountId}_${senderId}`, delay: cfg.delaySeconds * 1000 });
      await markEventSeen(ctx, eventKey);
      return "welcome_scheduled";
    }
    // welcome bot off: the claim stays so a later activation does not greet old threads
  }

  // Pro AI: strict server-side entitlement before anything is queued.
  const ent = await getEntitlement(ctx, ws);
  if (isProActive(ent) && d.text) {
    const persona = await withTenant(ctx.db, ws, async (tx) =>
      (await tx.select({ on: aiPersonaConfigs.isActive }).from(aiPersonaConfigs).where(eq(aiPersonaConfigs.igAccountId, igAccountId)).limit(1))[0]);
    if (persona?.on) {
      await ctx.queues.aiPersona.add("reply", { workspaceId: ws, igAccountId, senderId, messageId: d.messageId, text: d.text },
        { jobId: `ai_${d.messageId}` });
      await markEventSeen(ctx, eventKey);
      return "ai_scheduled";
    }
  }
  await markEventSeen(ctx, eventKey);
  return "stored_only";
}
