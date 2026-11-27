import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { igAccounts, usageCounters, workspaces } from "@flowgram/db";
import type { CreatorAlert } from "@flowgram/queue";
import { read } from "@/lib/tenant";
import { services } from "@/lib/server";

export const metadata = { title: "Overview" };

const ALERT_TEXT: Record<CreatorAlert["type"], string> = {
  handoff: "A follower asked about a topic you handle yourself. The AI paused on that chat.",
  human_takeover: "You replied in Instagram, so the AI paused on that chat.",
  token_expiring: "We couldn't renew your Instagram connection. Reconnect it in Settings.",
  token_invalid: "Instagram rejected the connection. Reconnect it in Settings.",
};

export default async function Overview() {
  const month = new Date().toISOString().slice(0, 7);
  const data = await read(async (tx, s) => {
    const [w] = await tx.select().from(workspaces).where(eq(workspaces.id, s.workspaceId)).limit(1);
    const accts = await tx.select({ id: igAccounts.id, u: igAccounts.username, st: igAccounts.status }).from(igAccounts);
    const rows = await tx.select({ metric: usageCounters.metric, v: sql<number>`sum(${usageCounters.value})::int` }).from(usageCounters)
      .where(and(eq(usageCounters.bucket, month), eq(usageCounters.scope, "account"))).groupBy(usageCounters.metric);
    const raw = await services().redis.lrange(`fg:alerts:log:${s.workspaceId}`, 0, 7);
    return { w, accts, m: Object.fromEntries(rows.map((r) => [r.metric, r.v])) as Record<string, number>, alerts: raw.map((r) => JSON.parse(r) as CreatorAlert) };
  });
  const used = data.m.dm_sent ?? 0;
  const pro = data.w?.plan === "pro" && data.w.subscriptionStatus === "active";
  const quota = data.w?.monthlyDmQuota ?? 100;
  const pct = pro ? 0 : Math.min(100, Math.round((used / quota) * 100));
  const stats: Array<[string, number]> = [["DMs sent", used], ["Rule triggers", data.m.triggered ?? 0], ["Public replies", data.m.public_replies ?? 0], ["Quick-reply taps", data.m.icebreaker_taps ?? 0], ["AI replies", data.m.ai_replies ?? 0], ["Handed to you", data.m.ai_handoffs ?? 0]];

  return (
    <div className="space-y-6">
      <h1 className="text-[26px]">Overview</h1>
      {data.accts.length === 0 && (
        <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
          <div><h2 className="text-[16px]">Connect your Instagram account</h2><p className="hint mt-1 max-w-md">FlowGram needs access to your comments and messages before any automation can run.</p></div>
          <a href="/api/instagram/connect" className="btn btn-primary">Connect Instagram</a>
        </div>
      )}
      {data.accts.some((a) => a.st === "needs_reauth") && (
        <div className="panel flex items-center justify-between gap-4 border-[var(--warn)] p-4" role="alert">
          <p>Your Instagram connection needs to be renewed. Automations are paused until you reconnect.</p>
          <a href="/api/instagram/connect" className="btn">Reconnect</a>
        </div>
      )}

      <section className="panel p-5" aria-labelledby="usage">
        <div className="flex items-baseline justify-between"><h2 id="usage" className="text-[16px]">This month</h2><span className="hint">{month}</span></div>
        {!pro && (
          <div className="mt-4">
            <div className="flex justify-between text-[13px]"><span className="text-[var(--ink-2)]">Automated DMs on the Free plan</span><span className="num">{used} / {quota}</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--recess)]" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={quota}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? "var(--warn)" : "var(--ink)" }} />
            </div>
            {pct >= 90 && <p className="hint mt-2">You're close to the limit. <Link className="underline" href="/app/billing">Upgrade to Pro</Link> so new comments keep getting a reply.</p>}
          </div>
        )}
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {stats.map(([k, v]) => <div key={k}><dt className="label">{k}</dt><dd className="num mt-0.5 text-[22px] font-medium">{v.toLocaleString("en-US")}</dd></div>)}
        </dl>
      </section>

      <section className="panel p-5" aria-labelledby="alerts">
        <h2 id="alerts" className="text-[16px]">Needs your attention</h2>
        {data.alerts.length === 0 ? <p className="hint mt-2">Nothing right now. Chats the AI hands to you will show up here.</p> : (
          <ul className="mt-3 divide-y divide-[var(--hair)]">
            {data.alerts.map((a, i) => <li key={i} className="flex items-baseline justify-between gap-4 py-2.5"><span>{ALERT_TEXT[a.type]}{a.detail ? <span className="mono ml-2 text-[12px] text-[var(--ink-3)]">{a.detail}</span> : null}</span><time className="hint shrink-0" dateTime={new Date(a.at).toISOString()}>{new Date(a.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
