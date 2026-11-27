import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withTenant, workspaces } from "@flowgram/db";
import { env } from "@/lib/env";
import { services } from "@/lib/server";
import { assertSameOrigin, requireSession } from "@/lib/session";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST() {
  try { await assertSameOrigin(); } catch (r) { return r as Response; }
  const s = await requireSession();
  const ws = await withTenant(services().db, s.workspaceId, async (tx) =>
    (await tx.select({ c: workspaces.stripeCustomerId }).from(workspaces).where(eq(workspaces.id, s.workspaceId)).limit(1))[0]);
  if (!ws?.c) return NextResponse.json({ error: "no_customer" }, { status: 409 });
  const portal = await stripe().billingPortal.sessions.create({ customer: ws.c, return_url: `${env.appOrigin}/app/billing` });
  return NextResponse.json({ url: portal.url });
}
