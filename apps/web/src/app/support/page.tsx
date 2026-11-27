import { InfoShell } from "@/components/InfoShell";
import { SupportForm } from "@/components/SupportForm";
import { LINKS } from "@/lib/links";

export const metadata = { title: "Support", description: "Get help with FlowGram." };

const CHANNELS = [
  { name: "Discord", note: "Fastest for questions; the community and team are both there.", href: LINKS.discord, label: "Join the Discord server" },
  { name: "Telegram", note: "Announcements and quick help.", href: LINKS.telegram, label: "Open the Telegram channel" },
  { name: "Email", note: "Best for billing and account problems. We reply within two business days.", href: `mailto:${LINKS.supportEmail}`, label: LINKS.supportEmail },
];
const CHECKS = [
  { t: "Use an Instagram Business or Creator account.", d: "Personal accounts cannot use the messaging API. Switch in Instagram under Settings, then Account type and tools." },
  { t: "Check that Instagram shows as connected.", d: "Settings should say “Connected and receiving comments and messages”. If it says it is waiting for webhooks or needs reconnecting, press Reconnect and approve every permission." },
  { t: "Check the rule itself.", d: "The rule must be on, the keyword must appear as a whole word, and the post must match if you chose one specific post. Comments that are replies to other comments don't trigger rules." },
  { t: "Check your plan limits.", d: "Free includes 100 automated DMs a month and 5 comment rules. Plan and billing shows how many you have used." },
  { t: "Lost your authenticator app?", d: "Email support from the address on your account and say you need 2FA reset. We verify you before turning it off." },
];

export default function Support() {
  return (
    <InfoShell wide title="Support" intro="Pick a channel, run through the checklist, or send us the details.">
      <div className="grid gap-4 md:grid-cols-3">
        {CHANNELS.map((c) => (
          <div key={c.name} className="panel flex flex-col p-5"><h2 className="text-[17px]">{c.name}</h2><p className="mt-1 flex-1 text-[var(--ink-2)]">{c.note}</p>
            <a className="btn mt-4" href={c.href} {...(c.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{c.label}</a></div>
        ))}
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="ts"><h2 id="ts" className="mb-3 text-[20px]">If something isn&apos;t working</h2>
          <ol className="panel divide-y divide-[var(--hair)]">{CHECKS.map((c, i) => <li key={c.t} className="flex gap-4 p-4"><span className="num mt-0.5 text-[var(--ink-3)]">{i + 1}</span><div><p className="font-medium">{c.t}</p><p className="mt-1 text-[var(--ink-2)]">{c.d}</p></div></li>)}</ol></section>
        <section aria-labelledby="rq"><h2 id="rq" className="mb-3 text-[20px]">Send a request</h2><SupportForm to={LINKS.supportEmail} /></section>
      </div>
    </InfoShell>
  );
}
