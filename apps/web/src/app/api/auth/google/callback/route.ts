import { NextResponse } from "next/server";
import { signInWithGoogle } from "@/lib/auth";
import { services } from "@/lib/server";
import { createSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const err = u.searchParams.get("error");

  if (err || !code || !state) {
    return NextResponse.redirect(new URL("/login?err=google_denied", appOrigin));
  }

  const key = `fg:google_oauth:${state}`;
  const raw = await services().redis.get(key);
  await services().redis.del(key);
  if (!raw) {
    return NextResponse.redirect(new URL("/login?err=google_expired", appOrigin));
  }

  const { verifier, mode } = JSON.parse(raw) as { verifier: string; mode: string };
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL(`${mode}?err=google_not_configured`, appOrigin));
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appOrigin}/api/auth/google/callback`,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenRes.ok || !tokenData.access_token) {
      return NextResponse.redirect(new URL(`${mode}?err=google_token_failed`, appOrigin));
    }

    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { authorization: `Bearer ${tokenData.access_token}` },
      signal: AbortSignal.timeout(8_000),
    });
    const profile = (await userRes.json()) as { email?: string; email_verified?: boolean };
    if (!userRes.ok || !profile.email || !profile.email_verified) {
      return NextResponse.redirect(new URL(`${mode}?err=google_unverified`, appOrigin));
    }

    const r = await signInWithGoogle(profile.email.trim().toLowerCase());
    if (!r.ok) {
      return NextResponse.redirect(new URL(`${mode}?err=google_failed`, appOrigin));
    }
    await createSession(r.userId, r.workspaceId, !r.needsMfa);
    return NextResponse.redirect(new URL(r.needsMfa ? "/login/2fa" : "/app", appOrigin));
  } catch {
    return NextResponse.redirect(new URL(`${mode}?err=google_failed`, appOrigin));
  }
}
