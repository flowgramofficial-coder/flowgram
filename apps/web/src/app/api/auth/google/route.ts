import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { services } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  const params = new URL(req.url).searchParams;
  const mode = params.get("mode") === "signup" ? "/signup" : "/login";
  if (mode === "/signup" && params.get("acceptedTerms") !== "1") {
    return NextResponse.redirect(new URL("/signup?err=terms_required", appOrigin));
  }

  if (!clientId) {
    return NextResponse.redirect(new URL(`${mode}?err=google_not_configured`, appOrigin));
  }

  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  await services().redis.set(
    `fg:google_oauth:${state}`,
    JSON.stringify({ verifier, mode }),
    "EX",
    300,
  );

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appOrigin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  return NextResponse.redirect(url);
}
