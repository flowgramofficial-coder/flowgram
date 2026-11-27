import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { services } from "@/lib/server";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const SCOPES = ["instagram_business_basic", "instagram_business_manage_messages", "instagram_business_manage_comments"];

export async function GET() {
  const s = await requireSession();
  const state = randomBytes(24).toString("base64url");
  // Bound to the user and workspace that started the flow; single-use; 5-minute TTL.
  await services().redis.set(`fg:oauth:${state}`, JSON.stringify({ userId: s.userId, workspaceId: s.workspaceId }), "EX", 300);
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: env.metaAppId, redirect_uri: env.metaRedirectUri, response_type: "code", scope: SCOPES.join(","), state,
  }).toString();
  return NextResponse.redirect(url);
}
