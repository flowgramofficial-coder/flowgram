import { eq } from "drizzle-orm";
import { igAccounts, workspaces } from "@flowgram/db";
import { Shell } from "@/components/Shell";
import { read } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { email, plan, handle } = await read(async (tx, s) => {
    const [w] = await tx.select({ plan: workspaces.plan, st: workspaces.subscriptionStatus }).from(workspaces).where(eq(workspaces.id, s.workspaceId)).limit(1);
    const [a] = await tx.select({ u: igAccounts.username }).from(igAccounts).limit(1);
    return { email: s.email, plan: (w?.plan === "pro" && w.st === "active" ? "pro" : "free") as "free" | "pro", handle: a?.u ?? null };
  });
  return <Shell email={email} plan={plan} handle={handle}>{children}</Shell>;
}
