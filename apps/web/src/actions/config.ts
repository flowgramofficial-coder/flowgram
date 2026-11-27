"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { aiKnowledgeChunks, aiPersonaConfigs, commentRules, igAccounts, welcomeBotConfigs, workspaces } from "@flowgram/db";
import { createEmbedderFromEnv, toPgVector } from "@flowgram/ai-engine";
import { invalidateRules } from "@flowgram/queue";
import { MAX_RULES_PER_BATCH, commentRuleBatchSchema, commentRuleInputSchema, personaConfigInputSchema, welcomeConfigInputSchema } from "@flowgram/shared";
import { z } from "zod";
import { services } from "@/lib/server";
import { applyRuleBatch } from "@/lib/rules";
import { mutate } from "@/lib/tenant";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof z.ZodError ? (e.issues[0]?.message ?? "Invalid input") : e instanceof Error ? e.message : "Something went wrong" });

/** Verifies the account belongs to the session's workspace. RLS would hide it anyway; this gives a clean error. */
async function ownAccount(tx: Parameters<Parameters<typeof mutate>[0]>[0], igAccountId: string): Promise<void> {
  const [a] = await tx.select({ id: igAccounts.id }).from(igAccounts).where(eq(igAccounts.id, igAccountId)).limit(1);
  if (!a) throw new Error("Instagram account not found");
}

export async function saveRule(raw: unknown, ruleId?: string): Promise<ActionResult<{ id: string }>> {
  try {
    const rule = commentRuleInputSchema.parse(raw);
    const out = await mutate((tx, s) => applyRuleBatch(tx, s.workspaceId, [{ id: ruleId, rule }]), { action: ruleId ? "rule.updated" : "rule.created", metadata: { ruleId } });
    await invalidateRules(services().redis, rule.igAccountId); // workers see the edit immediately, not after 60s
    revalidatePath("/app/rules");
    return { ok: true, data: { id: out.ids[0]! } };
  } catch (e) { return fail(e); }
}

/** Saves several new and edited rules in one transaction (all or nothing). */
export async function saveRulesBatch(raw: unknown): Promise<ActionResult<{ ids: string[] }>> {
  try {
    const items = commentRuleBatchSchema.parse(raw);
    const out = await mutate((tx, s) => applyRuleBatch(tx, s.workspaceId, items), { action: "rule.batch_saved", metadata: { created: items.filter((i) => !i.id).length, updated: items.filter((i) => i.id).length } });
    await Promise.all(out.igAccountIds.map((a) => invalidateRules(services().redis, a)));
    revalidatePath("/app/rules");
    return { ok: true, data: { ids: out.ids } };
  } catch (e) { return fail(e); }
}

export async function deleteRules(raw: unknown): Promise<ActionResult> {
  try {
    const ids = z.array(z.string().uuid()).min(1).max(MAX_RULES_PER_BATCH).parse(raw);
    const accts = await mutate(async (tx) => {
      const gone = await tx.delete(commentRules).where(inArray(commentRules.id, ids)).returning({ a: commentRules.igAccountId });
      if (gone.length !== new Set(ids).size) throw new Error("Rule not found");
      return [...new Set(gone.map((g) => g.a))];
    }, { action: "rule.batch_deleted", metadata: { count: ids.length } });
    await Promise.all(accts.map((a) => invalidateRules(services().redis, a)));
    revalidatePath("/app/rules");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function setRuleActive(ruleId: string, isActive: boolean): Promise<ActionResult> {
  try {
    const acct = await mutate(async (tx) => {
      const [r] = await tx.update(commentRules).set({ isActive }).where(eq(commentRules.id, ruleId)).returning({ a: commentRules.igAccountId });
      if (!r) throw new Error("Rule not found");
      return r.a;
    }, { action: isActive ? "rule.enabled" : "rule.disabled", metadata: { ruleId } });
    await invalidateRules(services().redis, acct);
    revalidatePath("/app/rules");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteRule(ruleId: string): Promise<ActionResult> {
  try {
    const acct = await mutate(async (tx) => {
      const [r] = await tx.delete(commentRules).where(eq(commentRules.id, ruleId)).returning({ a: commentRules.igAccountId });
      if (!r) throw new Error("Rule not found");
      return r.a;
    }, { action: "rule.deleted", metadata: { ruleId } });
    await invalidateRules(services().redis, acct);
    revalidatePath("/app/rules");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function saveWelcome(raw: unknown): Promise<ActionResult> {
  try {
    const input = welcomeConfigInputSchema.parse(raw);
    await mutate(async (tx, s) => {
      await ownAccount(tx, input.igAccountId);
      const v = { workspaceId: s.workspaceId, isActive: input.isActive, delaySeconds: input.delaySeconds, messageTemplate: input.messageTemplate, icebreakers: input.icebreakers };
      await tx.insert(welcomeBotConfigs).values({ ...v, igAccountId: input.igAccountId })
        .onConflictDoUpdate({ target: welcomeBotConfigs.igAccountId, set: v });
    }, { action: "welcome.saved" });
    revalidatePath("/app/welcome");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Pro gate, enforced server-side from the database row. The UI lock is cosmetic only. */
async function assertPro(tx: Parameters<Parameters<typeof mutate>[0]>[0], workspaceId: string): Promise<void> {
  const [w] = await tx.select({ plan: workspaces.plan, st: workspaces.subscriptionStatus }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!w || w.plan !== "pro" || w.st !== "active") throw new Error("The AI Persona is part of the Pro plan.");
}

export async function savePersona(raw: unknown): Promise<ActionResult> {
  try {
    const input = personaConfigInputSchema.parse(raw);
    await mutate(async (tx, s) => {
      await assertPro(tx, s.workspaceId);
      await ownAccount(tx, input.igAccountId);
      const { igAccountId, ...rest } = input;
      const v = { workspaceId: s.workspaceId, ...rest };
      await tx.insert(aiPersonaConfigs).values({ ...v, igAccountId }).onConflictDoUpdate({ target: aiPersonaConfigs.igAccountId, set: v });
    }, { action: "persona.saved" });
    revalidatePath("/app/persona");
    return { ok: true };
  } catch (e) { return fail(e); }
}

const knowledgeSchema = z.object({
  igAccountId: z.string().uuid(),
  topic: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(2000),
}).strict();

export async function addKnowledge(raw: unknown): Promise<ActionResult> {
  try {
    const input = knowledgeSchema.parse(raw);
    if (!process.env.EMBEDDING_API_KEY && !process.env.GEMINI_API_KEY) throw new Error("Knowledge embedding is not configured on this server.");
    const vec = toPgVector(await createEmbedderFromEnv().embed(`${input.topic}\n${input.content}`));
    await mutate(async (tx, s) => {
      await assertPro(tx, s.workspaceId);
      await ownAccount(tx, input.igAccountId);
      await tx.insert(aiKnowledgeChunks).values({ workspaceId: s.workspaceId, igAccountId: input.igAccountId, topic: input.topic, content: input.content, embedding: JSON.parse(vec) as number[] });
    }, { action: "knowledge.added" });
    revalidatePath("/app/persona");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteKnowledge(id: string): Promise<ActionResult> {
  try {
    z.string().uuid().parse(id);
    await mutate(async (tx) => { await tx.delete(aiKnowledgeChunks).where(and(eq(aiKnowledgeChunks.id, id))); }, { action: "knowledge.deleted" });
    revalidatePath("/app/persona");
    return { ok: true };
  } catch (e) { return fail(e); }
}
