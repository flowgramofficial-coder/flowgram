import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withTenant, workspaces } from "@flowgram/db";
import { env } from "@/lib/env";
import { services } from "@/lib/server";
import { assertSameOrigin, requireSession } from "@/lib/session";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** Creates a Checkout Session. The workspace id is stamped into metadata server-side, from the session. */
export async function POST() {
  try { await assertSameOrigin(); } catch (r) { return r as Response; }
  const s = await requireSession();
  const ws = await withTenant(services().db, s.workspaceId, async (tx) =>
    (await tx.select().from(workspaces).where(eq(workspaces.id, s.workspaceId)).limit(1))[0]);
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (ws.plan === "pro" && ws.subscriptionStatus === "active") return NextResponse.json({ error: "already_pro" }, { status: 409 });

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: env.stripeProPrice, quantity: 1 }],
    ...(ws.stripeCustomerId ? { customer: ws.stripeCustomerId } : { customer_email: s.email }),
    client_reference_id: s.workspaceId,
    metadata: { workspace_id: s.workspaceId },
    subscription_data: { metadata: { workspace_id: s.workspaceId } }, // so subscription.* events carry it too
    success_url: `${env.appOrigin}/app/billing?status=success`,
    cancel_url: `${env.appOrigin}/app/billing?status=cancelled`,
    allow_promotion_codes: true,
  });
  return NextResponse.json({ url: session.url });
}
