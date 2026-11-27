import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { auditLogs, workspaces, withTenant } from "@flowgram/db";
import { invalidateEntitlement } from "@flowgram/queue";
import type { StripeEventJob } from "@flowgram/shared";
import type { Ctx } from "../context.js";
import { eventSeen, markEventSeen } from "../services/events.js";

export const FREE_MONTHLY_DM_QUOTA = 100;
export const PRO_MONTHLY_DM_QUOTA = 1_000_000;

/** Stripe statuses that keep Pro features on. past_due keeps access during Stripe's retry window only if configured. */
export const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export interface PlanChange { plan: "free" | "pro"; subscriptionStatus: string; monthlyDmQuota: number }

export function planFromSubscription(sub: Pick<Stripe.Subscription, "status">): PlanChange {
  const active = ACTIVE_STATUSES.has(sub.status);
  return {
    plan: active ? "pro" : "free",
    // the DB column drives the AI gate (== 'active'), so trialing is normalised to active
    subscriptionStatus: active ? "active" : sub.status,
    monthlyDmQuota: active ? PRO_MONTHLY_DM_QUOTA : FREE_MONTHLY_DM_QUOTA,
  };
}

/**
 * Workspace id is stamped into Stripe metadata at Checkout creation (server-side, from the session),
 * so the webhook never has to trust anything from a client.
 */
async function resolveWorkspaceId(ctx: Ctx, obj: { metadata?: Stripe.Metadata | null; customer?: unknown }): Promise<string | null> {
  const fromMeta = obj.metadata?.workspace_id;
  if (fromMeta && /^[0-9a-f-]{36}$/i.test(fromMeta)) return fromMeta;
  return null;
}

export async function processStripeEvent(ctx: Ctx, job: StripeEventJob): Promise<"applied" | "ignored" | "duplicate"> {
  const key = `stripe:${job.eventId}`;
  if (await eventSeen(ctx, key)) return "duplicate";
  const event = JSON.parse(job.payload) as Stripe.Event;
  let ws: string | null = null;
  let change: (PlanChange & { customerId?: string; subscriptionId?: string }) | null = null;

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      ws = await resolveWorkspaceId(ctx, { metadata: s.metadata });
      if (ws && s.mode === "subscription" && s.payment_status !== "unpaid") {
        change = {
          plan: "pro", subscriptionStatus: "active", monthlyDmQuota: PRO_MONTHLY_DM_QUOTA,
          customerId: typeof s.customer === "string" ? s.customer : s.customer?.id,
          subscriptionId: typeof s.subscription === "string" ? s.subscription : s.subscription?.id,
        };
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      ws = await resolveWorkspaceId(ctx, { metadata: sub.metadata });
      const effective = event.type === "customer.subscription.deleted" ? { status: "canceled" as const } : sub;
      if (ws) change = { ...planFromSubscription(effective), customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id, subscriptionId: sub.id };
      break;
    }
    default:
      break;
  }

  if (!ws || !change) { await markEventSeen(ctx, key); return "ignored"; }
  const target = ws;
  const applied = change;
  await withTenant(ctx.db, target, async (tx) => {
    await tx.update(workspaces).set({
      plan: applied.plan, subscriptionStatus: applied.subscriptionStatus, monthlyDmQuota: applied.monthlyDmQuota,
      ...(applied.customerId ? { stripeCustomerId: applied.customerId } : {}),
      ...(applied.subscriptionId ? { stripeSubscriptionId: applied.subscriptionId } : {}),
    }).where(eq(workspaces.id, target));
    await tx.insert(auditLogs).values({ workspaceId: target, actor: "stripe", action: "plan.changed", metadata: { event: event.type, plan: applied.plan, status: applied.subscriptionStatus } });
  });
  await invalidateEntitlement(ctx.redis, target); // takes effect for workers immediately, not after the 30s TTL
  await markEventSeen(ctx, key);
  return "applied";
}
