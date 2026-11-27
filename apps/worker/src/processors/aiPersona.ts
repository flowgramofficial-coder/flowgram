import { and, desc, eq, sql } from "drizzle-orm";
import { aiPersonaConfigs, auditLogs, dmMessages, igAccounts, igContacts, withTenant } from "@flowgram/db";
import {
  MAX_TOKENS, buildPrompt, filterOutput, isWithinActiveHours, matchHandoffTopic, toPgVector, type HistoryTurn,
} from "@flowgram/ai-engine";
import { emitAlert } from "@flowgram/queue";
import { LIMITS, type AiPersonaJob } from "@flowgram/shared";
import type { Ctx } from "../context.js";
import { bump } from "../services/counters.js";
import { getEntitlement, isProActive } from "../services/entitlement.js";
import { sendDm } from "../services/sender.js";

export type AiOutcome =
  | "not_pro" | "no_config" | "paused" | "outside_hours" | "handoff" | "follower_rate_limited"
  | "filtered" | "sent" | "send_skipped";

const HANDOFF_REPLY = "Thanks for reaching out! I'm going to pass this to the team so you get a proper answer. We'll get back to you soon.";
const FALLBACK_REPLY = "Thanks for your message! I'll get back to you on this shortly.";

async function followerWithinRate(ctx: Ctx, ws: string, senderId: string): Promise<boolean> {
  const k = `fg:airate:${ws}:${senderId}`;
  const n = await ctx.redis.incr(k);
  if (n === 1) await ctx.redis.expire(k, 3600);
  return n <= LIMITS.aiRepliesPerFollowerPerHour;
}

export async function processAiPersona(ctx: Ctx, d: AiPersonaJob): Promise<AiOutcome> {
  // 1. Strict server-side entitlement gate. Nothing below runs for free workspaces.
  const ent = await getEntitlement(ctx, d.workspaceId);
  if (!isProActive(ent)) return "not_pro";

  const loaded = await withTenant(ctx.db, d.workspaceId, async (tx) => {
    const [cfg] = await tx.select().from(aiPersonaConfigs).where(eq(aiPersonaConfigs.igAccountId, d.igAccountId)).limit(1);
    const [contact] = await tx.select().from(igContacts)
      .where(and(eq(igContacts.igAccountId, d.igAccountId), eq(igContacts.senderIgId, d.senderId))).limit(1);
    const [acct] = await tx.select({ igUserId: igAccounts.igUserId }).from(igAccounts).where(eq(igAccounts.id, d.igAccountId)).limit(1);
    return { cfg, contact, igUserId: acct?.igUserId };
  });
  const { cfg, contact, igUserId } = loaded;
  if (!cfg || !cfg.isActive || !igUserId) return "no_config";

  // 2. Pause / handoff / hours: exit silently.
  if (contact?.handoffFlagged) return "paused";
  if (contact?.aiPausedUntil && contact.aiPausedUntil > ctx.now()) return "paused";
  if (!isWithinActiveHours(cfg.activeHoursJson, ctx.now(), ent!.timezone)) return "outside_hours";

  // 3. Deterministic handoff-topic check, before any LLM call.
  const topic = matchHandoffTopic(d.text, cfg.handoffTopics);
  if (topic) {
    await withTenant(ctx.db, d.workspaceId, async (tx) => {
      // Upsert: the contact row may not exist yet if this job raced ahead of first-contact bookkeeping.
      const pause = sql`now() + make_interval(hours => ${LIMITS.handoffPauseHours})`;
      await tx.insert(igContacts).values({
        workspaceId: d.workspaceId, igAccountId: d.igAccountId, senderIgId: d.senderId,
        welcomeSentAt: ctx.now(), handoffFlagged: true, aiPausedUntil: pause,
      }).onConflictDoUpdate({
        target: [igContacts.igAccountId, igContacts.senderIgId],
        set: { handoffFlagged: true, aiPausedUntil: pause },
      });
      await tx.insert(auditLogs).values({ workspaceId: d.workspaceId, actor: "system", action: "ai.handoff", metadata: { igAccountId: d.igAccountId, senderId: d.senderId, topic } });
    });
    await sendDm(ctx, { workspaceId: d.workspaceId, igAccountId: d.igAccountId, igUserId, recipientId: d.senderId, text: HANDOFF_REPLY, source: "ai_persona", marker: `ai:${d.messageId}:handoff` });
    await emitAlert(ctx.redis, { type: "handoff", workspaceId: d.workspaceId, igAccountId: d.igAccountId, senderId: d.senderId, detail: topic, at: Date.now() });
    await bump(ctx, { workspaceId: d.workspaceId, igAccountId: d.igAccountId, scope: "account", scopeId: d.igAccountId, metric: "ai_handoffs" });
    return "handoff";
  }

  // 4. Per-follower cap so one attacker cannot drain LLM credits.
  if (!(await followerWithinRate(ctx, d.workspaceId, d.senderId))) return "follower_rate_limited";

  // 5. RAG (strictly workspace + account scoped) and recent history.
  let knowledge: Array<{ topic: string; content: string }> = [];
  try {
    const vec = toPgVector(await ctx.embedder.embed(d.text));
    knowledge = await withTenant(ctx.db, d.workspaceId, async (tx) => {
      const r = await tx.execute(sql`
        select topic, content from ai_knowledge_chunks
        where workspace_id = ${d.workspaceId} and ig_account_id = ${d.igAccountId}
        order by embedding <=> ${vec}::vector limit 4`);
      return r.rows as Array<{ topic: string; content: string }>;
    });
  } catch (err) {
    ctx.log.warn({ err: String(err) }, "RAG unavailable; answering without knowledge");
  }
  const rows = await withTenant(ctx.db, d.workspaceId, (tx) =>
    tx.select({ direction: dmMessages.direction, body: dmMessages.body, mid: dmMessages.metaMessageId })
      .from(dmMessages)
      .where(and(eq(dmMessages.igAccountId, d.igAccountId), eq(dmMessages.senderIgId, d.senderId)))
      .orderBy(desc(dmMessages.createdAt)).limit(11));
  const history: HistoryTurn[] = rows.filter((r) => r.mid !== d.messageId).slice(0, 10).reverse()
    .map((r) => ({ role: r.direction === "inbound" ? "user" : "assistant", text: r.body }));

  // 6. Tool-less generation with failover, then the output filter.
  const prompt = buildPrompt({ persona: cfg, knowledge, history, latest: d.text, allowedDomains: cfg.allowedDomains });
  const req = { system: prompt.system, messages: prompt.messages, maxTokens: MAX_TOKENS[cfg.responseLength] };
  let raw: string;
  try {
    raw = await ctx.llm.primary.fire(req);
  } catch (err) {
    if (!ctx.llm.secondary) throw err; // retried by BullMQ with jittered backoff
    raw = await ctx.llm.secondary.fire(req);
  }

  const verdict = filterOutput(raw, cfg.allowedDomains, prompt.canary);
  if (!verdict.ok) {
    await bump(ctx, { workspaceId: d.workspaceId, igAccountId: d.igAccountId, scope: "account", scopeId: d.igAccountId, metric: `ai_filtered_${verdict.reason}` });
    if (verdict.reason === "prompt_leak") ctx.log.warn({ ws: d.workspaceId }, "AI output blocked: prompt leak");
    // Never send an unsafe or empty reply; send a neutral holding message instead.
    const res = await sendDm(ctx, { workspaceId: d.workspaceId, igAccountId: d.igAccountId, igUserId, recipientId: d.senderId, text: FALLBACK_REPLY, source: "ai_persona", marker: `ai:${d.messageId}` });
    return res.sent ? "filtered" : "send_skipped";
  }

  const res = await sendDm(ctx, { workspaceId: d.workspaceId, igAccountId: d.igAccountId, igUserId, recipientId: d.senderId, text: verdict.text, source: "ai_persona", marker: `ai:${d.messageId}` });
  if (res.sent) await bump(ctx, { workspaceId: d.workspaceId, igAccountId: d.igAccountId, scope: "account", scopeId: d.igAccountId, metric: "ai_replies" });
  return res.sent ? "sent" : "send_skipped";
}
