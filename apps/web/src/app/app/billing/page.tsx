import { eq } from "drizzle-orm";
import { workspaces } from "@flowgram/db";
import { PortalButton, UpgradeButton } from "@/components/BillingButtons";
import { read } from "@/lib/tenant";

export const metadata = { title: "Plan and billing" };

export default async function Billing({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const w = await read(async (tx, s) => (await tx.select().from(workspaces).where(eq(workspaces.id, s.workspaceId)).limit(1))[0]);
  const pro = w?.plan === "pro" && w.subscriptionStatus === "active";
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-[26px]">Plan and billing</h1>
      {status === "success" && <p role="status" className="panel p-4">Thanks! Your upgrade can take a few seconds to appear. Refresh this page if it still says Free.</p>}
      {status === "cancelled" && <p role="status" className="panel p-4">Checkout was cancelled. You haven't been charged.</p>}
      <section className="panel p-5">
        <div className="flex items-baseline justify-between"><h2 className="text-[18px]">{pro ? "Pro" : "Free"}</h2><span className="mono">{pro ? "$29 / month" : "$0"}</span></div>
        <p className="mt-2 text-[var(--ink-2)]">{pro ? "Unlimited automated DMs and the AI persona." : `${w?.monthlyDmQuota ?? 100} automated DMs a month. Upgrade for unlimited DMs and the AI persona.`}</p>
        {w && !pro && w.subscriptionStatus !== "none" && <p className="mt-2 text-[13px] text-[var(--warn)]">Your last subscription is {w.subscriptionStatus.replace("_", " ")}, so Pro features are off. Update your payment method to restore them.</p>}
        <div className="mt-5 flex gap-3">{pro || w?.stripeCustomerId ? <PortalButton /> : null}{!pro && <UpgradeButton />}</div>
      </section>
    </div>
  );
}
