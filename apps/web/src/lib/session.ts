import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { sessions, users } from "@flowgram/db";
import { env } from "./env";
import { services } from "./server";

export const COOKIE = "fg_session";
const ABSOLUTE_TTL_MS = 14 * 24 * 3600_000;
const ROTATE_AFTER_MS = 15 * 60_000;
const MFA_PENDING_TTL_MS = 10 * 60_000;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export interface Session { userId: string; workspaceId: string; email: string; emailVerified: boolean; mfaPassed: boolean }

async function setCookie(token: string, expires: Date) {
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: env.secureCookies, sameSite: "lax", path: "/", expires });
}

export async function createSession(userId: string, workspaceId: string, mfaPassed: boolean): Promise<void> {
  const { db } = services();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (mfaPassed ? ABSOLUTE_TTL_MS : MFA_PENDING_TTL_MS));
  await db.insert(sessions).values({ tokenHash: sha(token), userId, workspaceId, expiresAt, mfaPassed });
  await setCookie(token, expiresAt);
}

/**
 * The ONLY place a workspace id enters the app. It comes from the server-side session row, never from
 * request bodies, query strings or headers (anti-IDOR / anti-BOLA).
 */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const { db } = services();
  const [row] = await db.select({
    hash: sessions.tokenHash, userId: sessions.userId, workspaceId: sessions.workspaceId, rotatedAt: sessions.rotatedAt,
    expiresAt: sessions.expiresAt, mfaPassed: sessions.mfaPassed, email: users.email, verified: users.emailVerifiedAt,
  }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  if (!row) return null;

  // Rotate the token periodically so a stolen cookie has a short useful life.
  if (row.mfaPassed && Date.now() - row.rotatedAt.getTime() > ROTATE_AFTER_MS) {
    try {
      const next = randomBytes(32).toString("base64url");
      await db.update(sessions).set({ tokenHash: sha(next), rotatedAt: new Date() }).where(eq(sessions.tokenHash, row.hash));
      await setCookie(next, row.expiresAt);
    } catch { /* cookies are read-only inside some render contexts; rotation happens on the next action */ }
  }
  return { userId: row.userId, workspaceId: row.workspaceId, email: row.email, emailVerified: !!row.verified, mfaPassed: row.mfaPassed };
}

/** Use at the top of every server component, action and route handler that touches tenant data. */
export async function requireSession(opts: { verified?: boolean } = {}): Promise<Session> {
  const s = await getSession();
  if (!s || !s.mfaPassed) redirect("/login");
  if (opts.verified !== false && !s.emailVerified) redirect("/verify-email");
  return s;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await services().db.delete(sessions).where(eq(sessions.tokenHash, sha(token)));
  jar.delete(COOKIE);
}

export async function markMfaPassed(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return;
  const next = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ABSOLUTE_TTL_MS);
  await services().db.update(sessions).set({ mfaPassed: true, tokenHash: sha(next), expiresAt, rotatedAt: new Date() }).where(eq(sessions.tokenHash, sha(token)));
  await setCookie(next, expiresAt);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  // Behind Cloudflare the connecting client is in CF-Connecting-IP; fall back to the first XFF hop.
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** CSRF defence for route handlers (server actions are checked by Next itself): Origin must match. */
export async function assertSameOrigin(): Promise<void> {
  const origin = (await headers()).get("origin");
  if (!origin || origin !== env.appOrigin) throw new Response("bad origin", { status: 403 });
}
