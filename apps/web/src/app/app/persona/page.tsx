import { desc, eq } from "drizzle-orm";
import { aiKnowledgeChunks, aiPersonaConfigs, igAccounts, workspaces } from "@flowgram/db";
import { PersonaStudio, type PersonaData } from "@/components/PersonaStudio";
import { UpgradeButton } from "@/components/BillingButtons";
import { read } from "@/lib/tenant";

export const metadata = { title: "AI persona" };

const DEFAULTS: PersonaData = { isActive: false, personaName: "", tone: "", emojiLevel: "light", responseLength: "short", signaturePhrases: [], handoffTopics: ["refund", "legal"], allowedDomains: [], activeHoursJson: null, humanTakeoverPauseHours: 24 };

export default async function PersonaPage() {
  const { pro, acct, cfg, kb } = await read(async (tx, s) => {
    const [w] = await tx.select({ plan: workspaces.plan, st: workspaces.subscriptionStatus }).from(workspaces).where(eq(workspaces.id, s.workspaceId)).limit(1);
    const [acct] = await tx.select({ id: igAccounts.id }).from(igAccounts).limit(1);
    const [cfg] = await tx.select().from(aiPersonaConfigs).limit(1);
    const kb = await tx.select({ id: aiKnowledgeChunks.id, topic: aiKnowledgeChunks.topic, content: aiKnowledgeChunks.content }).from(aiKnowledgeChunks).orderBy(desc(aiKnowledgeChunks.id)).limit(100);
    return { pro: w?.plan === "pro" && w.st === "active", acct, cfg, kb };
  });
  return (
    <div className="space-y-4">
      <h1 className="text-[26px]">AI persona</h1>
      {!pro ? (
        <div className="panel max-w-xl p-6">
          <h2 className="text-[18px]">Answer DMs in your voice, around the clock</h2>
          <p className="mt-2 text-[var(--ink-2)]">The AI persona replies to followers in your tone, from notes you write, and hands the chat to you on topics like refunds. It's part of the Pro plan.</p>
          <div className="mt-5"><UpgradeButton /></div>
        </div>
      ) : !acct ? (
        <div className="panel p-6"><h2 className="text-[16px]">Connect Instagram first</h2><a className="btn btn-primary mt-4" href="/api/instagram/connect">Connect Instagram</a></div>
      ) : (
        <PersonaStudio igAccountId={acct.id} knowledge={kb} initial={cfg ? { isActive: cfg.isActive, personaName: cfg.personaName, tone: cfg.tone, emojiLevel: cfg.emojiLevel, responseLength: cfg.responseLength, signaturePhrases: cfg.signaturePhrases, handoffTopics: cfg.handoffTopics, allowedDomains: cfg.allowedDomains, activeHoursJson: cfg.activeHoursJson, humanTakeoverPauseHours: cfg.humanTakeoverPauseHours } : DEFAULTS} />
      )}
    </div>
  );
}
