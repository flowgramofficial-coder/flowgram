import "server-only";
import { auditLogs, withTenant, type Tx } from "@flowgram/db";
import { LIMITS, hit } from "./ratelimit";
import { services } from "./server";
import { clientIp, requireSession, type Session } from "./session";

/**
 * Every mutation goes through here: authenticated session -> per-user mutation rate limit -> a
 * transaction pinned to the session's workspace (RLS). Callers never pass a workspace id.
 */
export async function mutate<T>(fn: (tx: Tx, s: Session) => Promise<T>, audit?: { action: string; metadata?: Record<string, unknown> }): Promise<T> {
  const s = await requireSession();
  const wait = await hit(services().redis, LIMITS.mutate, `user:${s.userId}`, `ip:${await clientIp()}`);
  if (wait !== null) throw new Error("Too many requests. Slow down for a moment.");
  return withTenant(services().db, s.workspaceId, async (tx) => {
    const out = await fn(tx, s);
    if (audit) await tx.insert(auditLogs).values({ workspaceId: s.workspaceId, actor: s.userId, action: audit.action, metadata: audit.metadata ?? {} });
    return out;
  });
}

export async function read<T>(fn: (tx: Tx, s: Session) => Promise<T>): Promise<T> {
  const s = await requireSession();
  return withTenant(services().db, s.workspaceId, (tx) => fn(tx, s));
}
