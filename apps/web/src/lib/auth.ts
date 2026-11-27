import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { authenticator } from "otplib";
import { and, eq, gt, sql } from "drizzle-orm";
import { auditLogs, emailTokens, users, withTenant, workspaces } from "@flowgram/db";
import { decryptSecret, encryptSecret } from "@flowgram/security";
import { z } from "zod";
import { sendMail } from "./mailer";
import { services } from "./server";

// Argon2id (algorithm 2). OWASP-recommended minimums: m=19 MiB, t=2, p=1; we use 64 MiB.
const ARGON = { algorithm: 2, memoryCost: 65_536, timeCost: 3, parallelism: 1 } as const;
// Verified against a throwaway hash for unknown emails so response time does not reveal account existence.
const DUMMY_HASH = hash("dummy-password-for-timing", ARGON);

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, "Use at least 10 characters").max(200),
}).strict();

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export type AuthResult = { ok: true; userId: string; workspaceId: string; needsMfa: boolean } | { ok: false; error: string };

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { db } = services();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  // Same generic outcome either way, so signup cannot be used to enumerate registered emails.
  if (existing) { await DUMMY_HASH; return { ok: false, error: "Could not create that account. Try signing in instead." }; }
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const passwordHash = await hash(password, ARGON);
  await db.insert(users).values({ id: userId, email, passwordHash });
  await withTenant(db, workspaceId, async (tx) => {
    await tx.insert(workspaces).values({ id: workspaceId, ownerUserId: userId });
    await tx.insert(auditLogs).values({ workspaceId, actor: userId, action: "auth.signup" });
  });
  await sendVerification(userId, email);
  return { ok: true, userId, workspaceId, needsMfa: false };
}

export async function sendVerification(userId: string, email: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await services().db.insert(emailTokens).values({ tokenHash: sha(token), userId, purpose: "verify_email", expiresAt: new Date(Date.now() + 24 * 3600_000) });
  await sendMail(email, "Verify your FlowGram email", `Confirm your email: ${process.env.APP_ORIGIN ?? "http://localhost:3000"}/verify-email/${token}\n\nThis link expires in 24 hours.`);
}

export async function consumeVerification(token: string): Promise<boolean> {
  const { db } = services();
  const [row] = await db.delete(emailTokens)
    .where(and(eq(emailTokens.tokenHash, sha(token)), eq(emailTokens.purpose, "verify_email"), gt(emailTokens.expiresAt, new Date())))
    .returning({ userId: emailTokens.userId });
  if (!row) return false;
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
  return true;
}

export async function logIn(email: string, password: string): Promise<AuthResult> {
  const { db } = services();
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const ok = await verify(u?.passwordHash ?? (await DUMMY_HASH), password);
  if (!u || !ok) return { ok: false, error: "Incorrect email or password." };
  // workspaces is RLS-protected and no tenant is known yet, so use the SECURITY DEFINER lookup (ids only).
  const r = await db.execute(sql`select resolve_workspace_for_owner(${u.id}::text) as id`);
  const workspaceId = (r.rows[0] as { id: string | null } | undefined)?.id;
  if (!workspaceId) return { ok: false, error: "No workspace found for this account." };
  return { ok: true, userId: u.id, workspaceId, needsMfa: u.totpEnabled };
}

/* ---------- TOTP ---------- */
export async function beginTotpEnrollment(userId: string, email: string): Promise<{ otpauth: string; secret: string }> {
  const secret = authenticator.generateSecret();
  const enc = await encryptSecret(services().keys, secret, `totp:${userId}`);
  await services().db.update(users).set({ totpSecretEnc: enc.ciphertext, totpDekEnc: enc.encryptedDek, totpEnabled: false }).where(eq(users.id, userId));
  return { otpauth: authenticator.keyuri(email, "FlowGram", secret), secret };
}

export async function checkTotp(userId: string, code: string, enable = false): Promise<boolean> {
  const { db, keys } = services();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.totpSecretEnc || !u.totpDekEnc) return false;
  const secret = await decryptSecret(keys, { ciphertext: u.totpSecretEnc, encryptedDek: u.totpDekEnc }, `totp:${userId}`);
  authenticator.options = { window: 1 };
  if (!/^\d{6}$/.test(code) || !authenticator.check(code, secret)) return false;
  if (enable) await db.update(users).set({ totpEnabled: true }).where(eq(users.id, userId));
  return true;
}

export async function signInWithGoogle(email: string): Promise<AuthResult> {
  const { db } = services();
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (u) {
    if (!u.emailVerifiedAt) {
      await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, u.id));
    }
    const r = await db.execute(sql`select resolve_workspace_for_owner(${u.id}::text) as id`);
    const workspaceId = (r.rows[0] as { id: string | null } | undefined)?.id;
    if (!workspaceId) return { ok: false, error: "No workspace found for this account." };
    return { ok: true, userId: u.id, workspaceId, needsMfa: u.totpEnabled };
  }
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const oauthMarker = `!google-oauth:${randomBytes(32).toString("hex")}`;
  await db.insert(users).values({ id: userId, email, passwordHash: oauthMarker, emailVerifiedAt: new Date() });
  await withTenant(db, workspaceId, async (tx) => {
    await tx.insert(workspaces).values({ id: workspaceId, ownerUserId: userId });
    await tx.insert(auditLogs).values({ workspaceId, actor: userId, action: "auth.google_signup" });
  });
  return { ok: true, userId, workspaceId, needsMfa: false };
}
