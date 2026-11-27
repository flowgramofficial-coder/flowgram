import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool, resolveIgAccount, withTenant } from "./client.js";
import { auditLogs, commentRules, igAccounts, igContacts, workspaces } from "./schema.js";

const appUrl = process.env.TEST_DATABASE_APP_URL;
const ownerUrl = process.env.TEST_DATABASE_OWNER_URL;

// In CI the integration suites must run: a missing service is a failure, never a silent skip.
if (process.env.CI && (!appUrl || !ownerUrl)) throw new Error("integration test services are not configured in CI");

describe.skipIf(!appUrl || !ownerUrl)("RLS cross-tenant isolation (runs as non-owner flowgram_app)", () => {
  const appPool = createPool(appUrl ?? "", 4);
  const ownerPool = createPool(ownerUrl ?? "", 2);
  const db = createDb(appPool);
  const wsA = randomUUID();
  const wsB = randomUUID();
  const acctA = randomUUID();
  const acctB = randomUUID();
  const igA = `ig-${randomUUID()}`;

  const seed = async (ws: string, acct: string, igUserId: string) => {
    await withTenant(db, ws, async (tx) => {
      await tx.insert(workspaces).values({ id: ws, ownerUserId: `u-${ws}` });
      await tx.insert(igAccounts).values({
        id: acct, workspaceId: ws, igUserId, username: "x",
        encryptedAccessToken: Buffer.from("t"), encryptedDek: Buffer.from("d"),
        tokenExpiresAt: new Date(Date.now() + 86_400_000),
      });
      await tx.insert(commentRules).values({
        workspaceId: ws, igAccountId: acct, name: `rule-${ws}`, mediaScope: "any", matchType: "any", dmTemplate: "hi",
      });
    });
  };

  beforeAll(async () => {
    await seed(wsA, acctA, igA);
    await seed(wsB, acctB, `ig-${randomUUID()}`);
  });

  afterAll(async () => {
    await ownerPool.query("delete from workspaces where id = any($1)", [[wsA, wsB]]).catch(() => {});
    await appPool.end();
    await ownerPool.end();
  });

  it("app role is not a superuser and does not bypass RLS", async () => {
    const r = await appPool.query("select rolsuper, rolbypassrls from pg_roles where rolname = current_user");
    expect(r.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it("tenant A sees only its own rules and workspace", async () => {
    const { rules, wss } = await withTenant(db, wsA, async (tx) => ({
      rules: await tx.select().from(commentRules),
      wss: await tx.select().from(workspaces),
    }));
    expect(rules).toHaveLength(1);
    expect(rules[0]?.workspaceId).toBe(wsA);
    expect(wss.map((w) => w.id)).toEqual([wsA]);
  });

  it("IDOR: querying tenant B's row id from tenant A returns nothing", async () => {
    const rows = await withTenant(db, wsA, (tx) => tx.select().from(igAccounts).where(eq(igAccounts.id, acctB)));
    expect(rows).toHaveLength(0);
  });

  it("cannot insert a row for another tenant", async () => {
    await expect(
      withTenant(db, wsA, (tx) =>
        tx.insert(igContacts).values({ workspaceId: wsB, igAccountId: acctB, senderIgId: "s1" })),
    ).rejects.toThrow();
  });

  it("cannot update or delete another tenant's rows (affects zero)", async () => {
    const upd = await withTenant(db, wsA, (tx) =>
      tx.update(commentRules).set({ name: "pwned" }).where(eq(commentRules.workspaceId, wsB)).returning());
    expect(upd).toHaveLength(0);
    const del = await withTenant(db, wsA, (tx) =>
      tx.delete(igAccounts).where(eq(igAccounts.id, acctB)).returning());
    expect(del).toHaveLength(0);
  });

  it("without a tenant context every tenant table returns zero rows", async () => {
    const r = await db.execute(sql`select count(*)::int as n from comment_rules`);
    expect((r.rows[0] as { n: number }).n).toBe(0);
  });

  it("tenant context does not leak across pooled transactions", async () => {
    await withTenant(db, wsA, async (tx) => { await tx.select().from(commentRules); });
    const r = await db.execute(sql`select current_setting('app.current_workspace_id', true) as v`);
    expect([null, ""]).toContain((r.rows[0] as { v: string | null }).v);
  });

  it("rejects a malformed workspace id before touching the database", async () => {
    await expect(withTenant(db, "x'; drop table workspaces;--", async () => 1)).rejects.toThrow("invalid workspace id");
  });

  it("audit_logs is append-only", async () => {
    await withTenant(db, wsA, (tx) => tx.insert(auditLogs).values({ workspaceId: wsA, actor: "t", action: "rule.edit" }));
    await expect(withTenant(db, wsA, (tx) => tx.update(auditLogs).set({ action: "x" }))).rejects.toThrow();
    await expect(withTenant(db, wsA, (tx) => tx.delete(auditLogs))).rejects.toThrow();
  });

  it("resolve_ig_account maps webhook ids to ids only", async () => {
    expect(await resolveIgAccount(db, igA)).toEqual({ igAccountId: acctA, workspaceId: wsA });
    expect(await resolveIgAccount(db, "nope")).toBeNull();
    const cols = await appPool.query("select * from resolve_ig_account($1)", [igA]);
    expect(Object.keys(cols.rows[0]).sort()).toEqual(["ig_account_id", "workspace_id"]);
  });
});
