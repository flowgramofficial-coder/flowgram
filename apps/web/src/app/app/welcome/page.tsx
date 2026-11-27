import { igAccounts, welcomeBotConfigs } from "@flowgram/db";
import { WelcomeEditor } from "@/components/WelcomeEditor";
import { read } from "@/lib/tenant";

export const metadata = { title: "Welcome message" };

export default async function WelcomePage() {
  const { acct, cfg } = await read(async (tx) => {
    const [acct] = await tx.select({ id: igAccounts.id, u: igAccounts.username }).from(igAccounts).limit(1);
    const [cfg] = await tx.select().from(welcomeBotConfigs).limit(1);
    return { acct, cfg };
  });
  return (
    <div className="space-y-4">
      <h1 className="text-[26px]">Welcome message</h1>
      {!acct ? (
        <div className="panel p-6"><h2 className="text-[16px]">Connect Instagram first</h2><a className="btn btn-primary mt-4" href="/api/instagram/connect">Connect Instagram</a></div>
      ) : (
        <WelcomeEditor igAccountId={acct.id} handle={acct.u} initial={cfg ? { isActive: cfg.isActive, delaySeconds: cfg.delaySeconds, messageTemplate: cfg.messageTemplate, icebreakers: cfg.icebreakers } : { isActive: false, delaySeconds: 5, messageTemplate: "Hey! Thanks for messaging. What can I help you with?", icebreakers: [] }} />
      )}
    </div>
  );
}
