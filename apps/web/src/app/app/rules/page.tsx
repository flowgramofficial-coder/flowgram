import { desc, eq } from "drizzle-orm";
import { commentRules, igAccounts, workspaces } from "@flowgram/db";
import { RulesStudio, type RuleRow } from "@/components/RulesStudio";
import { read } from "@/lib/tenant";

export const metadata = { title: "Comment rules" };

export default async function RulesPage() {
  const { accounts, rules, plan } = await read(async (tx, s) => ({
    plan: await tx.select({ p: workspaces.plan, st: workspaces.subscriptionStatus }).from(workspaces).where(eq(workspaces.id, s.workspaceId)).limit(1).then(([w]) => (w?.p === "pro" && w.st === "active" ? "pro" : "free") as "free" | "pro"),
    accounts: await tx.select({ id: igAccounts.id, username: igAccounts.username }).from(igAccounts),
    rules: await tx.select().from(commentRules).orderBy(desc(commentRules.createdAt)),
  }));
  const initial: RuleRow[] = rules.map((r) => ({
    id: r.id, igAccountId: r.igAccountId, name: r.name, isActive: r.isActive, mediaScope: r.mediaScope, targetMediaId: r.targetMediaId,
    matchType: r.matchType, keywords: r.keywords, publicReplyEnabled: r.publicReplyEnabled, publicReplyTemplates: r.publicReplyTemplates,
    dmTemplate: r.dmTemplate, ctaLabel: r.ctaLabel, ctaUrl: r.ctaUrl, priority: r.priority,
  }));
  return (
    <div className="space-y-4">
      <h1 className="text-[26px]">Comment rules</h1>
      <RulesStudio accounts={accounts} initial={initial} plan={plan} />
    </div>
  );
}
