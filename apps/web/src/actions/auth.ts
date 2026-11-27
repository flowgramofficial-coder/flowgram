"use server";
import { redirect } from "next/navigation";
import { credentialsSchema, beginTotpEnrollment, checkTotp, logIn, signUp } from "@/lib/auth";
import { LIMITS, hit } from "@/lib/ratelimit";
import { services } from "@/lib/server";
import { clientIp, createSession, destroySession, getSession, markMfaPassed, requireSession } from "@/lib/session";
import { verifyTurnstile } from "@/lib/turnstile";

export type FormState = { error?: string; info?: string; otpauth?: string; secret?: string } | undefined;

async function guard(kind: "login" | "signup", email: string, form: FormData): Promise<string | null> {
  const ip = await clientIp();
  const wait = await hit(services().redis, LIMITS[kind], `ip:${ip}`, `acct:${email}`);
  if (wait !== null) return `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.`;
  const ok = await verifyTurnstile(
    String(form.get("cf-turnstile-response") ?? ""),
    ip,
    String(form.get("challengeToken") ?? ""),
    String(form.get("challengeAnswer") ?? ""),
  );
  if (!ok) return "Human verification failed. Please retry.";
  return null;
}

export async function signUpAction(_: FormState, form: FormData): Promise<FormState> {
  if (form.get("acceptTerms") !== "on") {
    return { error: "You must accept the Terms & Conditions to create an account." };
  }
  const password = String(form.get("password") ?? "");
  const confirmPassword = String(form.get("confirmPassword") ?? "");
  if (password !== confirmPassword) return { error: "Passwords do not match." };
  const parsed = credentialsSchema.safeParse({ email: form.get("email"), password });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  const blocked = await guard("signup", parsed.data.email, form);
  if (blocked) return { error: blocked };
  const r = await signUp(parsed.data.email, parsed.data.password);
  if (!r.ok) return { error: r.error };
  await createSession(r.userId, r.workspaceId, true);
  redirect("/verify-email");
}

export async function logInAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Incorrect email or password." };
  const blocked = await guard("login", parsed.data.email, form);
  if (blocked) return { error: blocked };
  const r = await logIn(parsed.data.email, parsed.data.password);
  if (!r.ok) return { error: r.error };
  await createSession(r.userId, r.workspaceId, !r.needsMfa);
  redirect(r.needsMfa ? "/login/2fa" : "/app");
}

export async function verifyTotpAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s) redirect("/login");
  const wait = await hit(services().redis, LIMITS.totp, `user:${s.userId}`);
  if (wait !== null) return { error: "Too many attempts. Please wait a few minutes." };
  if (!(await checkTotp(s.userId, String(form.get("code") ?? "")))) return { error: "That code didn't work." };
  await markMfaPassed();
  redirect("/app");
}

export async function startTotpAction(): Promise<FormState> {
  const s = await requireSession();
  const { otpauth, secret } = await beginTotpEnrollment(s.userId, s.email);
  return { otpauth, secret };
}

export async function confirmTotpAction(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireSession();
  const wait = await hit(services().redis, LIMITS.totp, `user:${s.userId}`);
  if (wait !== null) return { error: "Too many attempts. Please wait a few minutes." };
  if (!(await checkTotp(s.userId, String(form.get("code") ?? ""), true))) return { error: "That code didn't match. Try the next one." };
  return { info: "Two-factor authentication is on." };
}

export async function logOutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
