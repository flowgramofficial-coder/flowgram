import { and, eq, inArray, sql } from "drizzle-orm";
import { commentRules, igAccounts, workspaces, type Tx } from "@flowgram/db";
import { FREE_MAX_COMMENT_RULES, FREE_RULE_LIMIT_MESSAGE, type CommentRuleBatchItem } from "@flowgram/shared";

export interface BatchResult { ids: string[]; igAccountIds: string[]; created: number; updated: number }

/**
 * Creates and edits comment rules as one unit inside the caller's tenant transaction.
 * The plan check runs here, not in the UI, so a forged request cannot exceed the Free ceiling.
 * An advisory lock per workspace serialises concurrent saves so two tabs cannot both slip under the limit.
 * Edits never count against the ceiling; only adding rules does (so a downgraded workspace can still tidy up).
 */
export async function applyRuleBatch(tx: Tx, workspaceId: string, items: CommentRuleBatchItem[]): Promise<BatchResult> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"rules:" + workspaceId}, 0))`);

  const editIds = items.flatMap((i) => (i.id ? [i.id] : []));
  if (new Set(editIds).size !== editIds.length) throw new Error("The same rule appears twice in this save.");
  const creates = items.filter((i) => !i.id);

  const [w] = await tx.select({ plan: workspaces.plan, st: workspaces.subscriptionStatus }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!w) throw new Error("Workspace not found");
  const isFree = !(w.plan === "pro" && w.st === "active");

  if (isFree && creates.length > 0) {
    const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(commentRules);
    if ((row?.n ?? 0) + creates.length > FREE_MAX_COMMENT_RULES) throw new Error(FREE_RULE_LIMIT_MESSAGE);
  }

  const accountIds = [...new Set(items.map((i) => i.rule.igAccountId))];
  const owned = await tx.select({ id: igAccounts.id }).from(igAccounts).where(inArray(igAccounts.id, accountIds));
  if (owned.length !== accountIds.length) throw new Error("Instagram account not found");

  if (editIds.length > 0) {
    const found = await tx.select({ id: commentRules.id }).from(commentRules).where(inArray(commentRules.id, editIds));
    if (found.length !== editIds.length) throw new Error("Rule not found");
  }

  const clean = (i: CommentRuleBatchItem) => ({ ...i.rule, workspaceId, keywords: i.rule.keywords.map((k) => k.trim()), updatedAt: new Date() });
  const ids: string[] = [];
  for (const item of items) {
    if (!item.id) continue;
    const [r] = await tx.update(commentRules).set(clean(item)).where(and(eq(commentRules.id, item.id), eq(commentRules.workspaceId, workspaceId))).returning({ id: commentRules.id });
    if (!r) throw new Error("Rule not found");
    ids.push(r.id);
  }
  if (creates.length > 0) {
    const made = await tx.insert(commentRules).values(creates.map(clean)).returning({ id: commentRules.id });
    ids.push(...made.map((m) => m.id));
  }
  return { ids, igAccountIds: accountIds, created: creates.length, updated: editIds.length };
}
