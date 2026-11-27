import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commentRules, createDb, createPool, igAccounts, withTenant, workspaces } from "@flowgram/db";
import { FREE_MAX_COMMENT_RULES, FREE_RULE_LIMIT_MESSAGE, type CommentRuleBatchItem, type CommentRuleInput } from "@flowgram/shared";
import { applyRuleBatch } from "./rules";

const appUrl = process.env.TEST_DATABASE_APP_URL;
const ownerUrl = process.env.TEST_DATABASE_OWNER_URL;
// In CI the integration suites must run: a missing service is a failure, never a silent skip.
if (process.env.CI && (!appUrl || !ownerUrl)) throw new Error("integration test services are not configured in CI");

describe.skipIf(!appUrl || !ownerUrl)("comment rule plan limits (server-side, real Postgres RLS)", () => {
  const appPool = createPool(appUrl ?? "", 6);
  const ownerPool = createPool(ownerUrl ?? "", 2);
  const db = createDb(appPool);
  const made: string[] = [];

  const rule = (igAccountId: string, name: string, over: Partial<CommentRuleInput> = {}): CommentRuleInput => ({
    name, isActive: true, igAccountId, mediaScope: "any", targetMediaId: null, matchType: "keywords", keywords: ["link"],
    publicReplyEnabled: false, publicReplyTemplates: [], dmTemplate: "Hi {username}", ctaLabel: null, ctaUrl: null, priority: 0, ...over,
  });
  const news = (acct: string, n: number, tag = "r"): CommentRuleBatchItem[] => Array.from({ length: n }, (_, i) => ({ rule: rule(acct, `${tag}${i}`) }));

  async function workspace(plan: "free" | "pro") {
    const ws = randomUUID(), acct = randomUUID();
    made.push(ws);
    await withTenant(db, ws, async (tx) => {
      await tx.insert(workspaces).values({ id: ws, ownerUserId: `u-${ws}` });
      await tx.insert(igAccounts).values({ id: acct, workspaceId: ws, igUserId: `ig-${randomUUID()}`, username: "x", encryptedAccessToken: Buffer.from("t"), encryptedDek: Buffer.from("d"), tokenExpiresAt: new Date(Date.now() + 86_400_000) });
    });
    if (plan === "pro") await ownerPool.query("update workspaces set plan='pro', subscription_status='active' where id=$1", [ws]);
    return { ws, acct, run: (items: CommentRuleBatchItem[]) => withTenant(db, ws, (tx) => applyRuleBatch(tx, ws, items)),
      count: () => withTenant(db, ws, async (tx) => (await tx.select().from(commentRules)).length) };
  }

  beforeAll(() => { expect(FREE_MAX_COMMENT_RULES).toBe(5); });
  afterAll(async () => {
    await ownerPool.query("delete from workspaces where id = any($1)", [made]).catch(() => {});
    await appPool.end(); await ownerPool.end();
  });

  it("Free: five rules in one batch are saved, the sixth is rejected", async () => {
    const w = await workspace("free");
    const r = await w.run(news(w.acct, 5));
    expect(r.created).toBe(5);
    await expect(w.run(news(w.acct, 1, "sixth"))).rejects.toThrow(FREE_RULE_LIMIT_MESSAGE);
    expect(await w.count()).toBe(5);
  });

  it("Free: a batch that would cross the limit saves nothing (atomic)", async () => {
    const w = await workspace("free");
    await w.run(news(w.acct, 3));
    await expect(w.run(news(w.acct, 3, "over"))).rejects.toThrow(FREE_RULE_LIMIT_MESSAGE);
    expect(await w.count()).toBe(3);
    await w.run(news(w.acct, 2, "fits"));
    expect(await w.count()).toBe(5);
  });

  it("Free: bulk-editing five existing rules still works at the limit", async () => {
    const w = await workspace("free");
    const { ids } = await w.run(news(w.acct, 5));
    const edited = ids.map((id, i) => ({ id, rule: rule(w.acct, `edited${i}`, { isActive: false, keywords: ["link", "guide"], dmTemplate: "New text {username}" }) }));
    const r = await w.run(edited);
    expect(r.updated).toBe(5);
    const rows = await withTenant(db, w.ws, (tx) => tx.select().from(commentRules));
    expect(rows.every((x) => !x.isActive && x.dmTemplate === "New text {username}" && x.keywords.length === 2)).toBe(true);
    expect(rows).toHaveLength(5);
  });

  it("Free: a mixed batch of edits plus new rules over the limit is rejected and edits roll back", async () => {
    const w = await workspace("free");
    const { ids } = await w.run(news(w.acct, 4));
    await expect(w.run([{ id: ids[0]!, rule: rule(w.acct, "renamed") }, ...news(w.acct, 2, "extra")])).rejects.toThrow(FREE_RULE_LIMIT_MESSAGE);
    const rows = await withTenant(db, w.ws, (tx) => tx.select().from(commentRules));
    expect(rows).toHaveLength(4);
    expect(rows.some((x) => x.name === "renamed")).toBe(false);
  });

  it("Free: two simultaneous saves cannot both slip under the limit", async () => {
    const w = await workspace("free");
    await w.run(news(w.acct, 1));
    const results = await Promise.allSettled([w.run(news(w.acct, 3, "a")), w.run(news(w.acct, 3, "b"))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await w.count()).toBe(4);
  });

  it("Pro: creates and edits 8 rules in batches with no ceiling", async () => {
    const w = await workspace("pro");
    const { ids } = await w.run(news(w.acct, 8));
    expect(ids).toHaveLength(8);
    await w.run(news(w.acct, 4, "more"));
    const r = await w.run(ids.map((id, i) => ({ id, rule: rule(w.acct, `pro-edit${i}`, { keywords: ["a", "b", "c"] }) })));
    expect(r.updated).toBe(8);
    expect(await w.count()).toBe(12);
  });

  it("a canceled Pro workspace (plan pro, status canceled) is held to the Free limit", async () => {
    const w = await workspace("pro");
    await ownerPool.query("update workspaces set subscription_status='canceled' where id=$1", [w.ws]);
    await expect(w.run(news(w.acct, 6))).rejects.toThrow(FREE_RULE_LIMIT_MESSAGE);
  });

  it("rejects another tenant's rule id and another tenant's Instagram account", async () => {
    const a = await workspace("pro"), b = await workspace("pro");
    const { ids } = await b.run(news(b.acct, 1));
    await expect(a.run([{ id: ids[0]!, rule: rule(a.acct, "steal") }])).rejects.toThrow("Rule not found");
    await expect(a.run([{ rule: rule(b.acct, "wrong-account") }])).rejects.toThrow("Instagram account not found");
    expect(await b.count()).toBe(1);
  });

  it("rejects the same rule twice in one save", async () => {
    const w = await workspace("pro");
    const { ids } = await w.run(news(w.acct, 1));
    await expect(w.run([{ id: ids[0]!, rule: rule(w.acct, "x") }, { id: ids[0]!, rule: rule(w.acct, "y") }])).rejects.toThrow("twice");
  });
});
