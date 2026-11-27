import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createPool(connectionString: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString, max, idleTimeoutMillis: 30_000 });
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}

/**
 * Run `fn` inside a transaction scoped to one workspace. `set_config(..., true)`
 * is the parameterised equivalent of SET LOCAL, so it is transaction-local and
 * therefore safe under PgBouncer transaction pooling.
 */
export async function withTenant<T>(db: Db, workspaceId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(workspaceId)) throw new Error("invalid workspace id");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_workspace_id', ${workspaceId}, true)`);
    return fn(tx);
  });
}

/** Ids of active accounts whose token expires within `days` (SECURITY DEFINER; ids only). */
export async function resolveExpiring(db: Db, days: number): Promise<Array<{ igAccountId: string; workspaceId: string }>> {
  const res = await db.execute(sql`select ig_account_id, workspace_id from list_expiring_accounts(${days}::int)`);
  return (res.rows as Array<{ ig_account_id: string; workspace_id: string }>).map((r) => ({ igAccountId: r.ig_account_id, workspaceId: r.workspace_id }));
}

/**
 * Resolve an inbound webhook's Instagram user id to its account + workspace
 * before a tenant is known. Uses a SECURITY DEFINER function that returns
 * only ids, never tokens.
 */
export async function resolveIgAccount(
  db: Db,
  igUserId: string,
): Promise<{ igAccountId: string; workspaceId: string } | null> {
  const res = await db.execute(sql`select ig_account_id, workspace_id from resolve_ig_account(${igUserId})`);
  const row = res.rows[0] as { ig_account_id: string; workspace_id: string } | undefined;
  return row ? { igAccountId: row.ig_account_id, workspaceId: row.workspace_id } : null;
}
