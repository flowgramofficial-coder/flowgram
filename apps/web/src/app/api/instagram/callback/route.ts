import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { auditLogs, igAccounts, withTenant } from "@flowgram/db";
import { IgClient, exchangeCodeForShortToken, exchangeForLongLived } from "@flowgram/ig-client";
import { encryptSecret } from "@flowgram/security";
import { env } from "@/lib/env";
import { services } from "@/lib/server";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const back = (q: string) => NextResponse.redirect(`${env.appOrigin}/app/settings?${q}`);

export async function GET(req: NextRequest) {
  const s = await requireSession();
  const { redis, db, keys } = services();
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back("ig=denied");

  // Single-use state check (GETDEL), and it must belong to THIS session's user and workspace.
  const state = p.get("state") ?? "";
  const raw = state ? await redis.getdel(`fg:oauth:${state}`) : null;
  const bound = raw ? (JSON.parse(raw) as { userId: string; workspaceId: string }) : null;
  if (!bound || bound.userId !== s.userId || bound.workspaceId !== s.workspaceId) return back("ig=invalid_state");
  const code = p.get("code");
  if (!code) return back("ig=missing_code");

  try {
    // Instagram appends "#_" to the code in some flows; it is not part of it.
    const short = await exchangeCodeForShortToken({ appId: env.metaAppId, appSecret: env.metaAppSecret, redirectUri: env.metaRedirectUri, code: code.replace(/#_$/, "") });
    const long = await exchangeForLongLived({ appSecret: env.metaAppSecret, shortToken: short.accessToken });
    const ig = new IgClient();
    const me = await ig.getMe(long.accessToken);

    const id = crypto.randomUUID();
    const enc = await encryptSecret(keys, long.accessToken, id); // AAD binds the ciphertext to this row id
    await withTenant(db, s.workspaceId, async (tx) => {
      await tx.insert(igAccounts).values({
        id, workspaceId: s.workspaceId, igUserId: me.userId, username: me.username,
        encryptedAccessToken: enc.ciphertext, encryptedDek: enc.encryptedDek,
        tokenExpiresAt: new Date(Date.now() + long.expiresInSec * 1000), status: "active",
      });
      await tx.insert(auditLogs).values({ workspaceId: s.workspaceId, actor: s.userId, action: "ig.connected", metadata: { username: me.username } });
    });
    await ig.subscribeWebhooks(long.accessToken, me.userId);
    await withTenant(db, s.workspaceId, async (tx) => {
      await tx.update(igAccounts).set({ webhookSubscribed: true }).where(eq(igAccounts.id, id));
    });
    return back("ig=connected");
  } catch (e) {
    const unique = e instanceof Error && /ig_accounts_ig_user_id_unique|duplicate key/.test(e.message + String((e as { cause?: unknown }).cause));
    return back(unique ? "ig=already_connected" : "ig=failed");
  }
}
