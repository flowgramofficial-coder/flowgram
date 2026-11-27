import { InfoShell } from "@/components/InfoShell";
import { LINKS } from "@/lib/links";
import { FREE_MAX_COMMENT_RULES } from "@flowgram/shared";

export const metadata = { title: "Terms & Conditions", description: "The terms for using FlowGram." };

const SECTIONS: Array<{ h: string; p: string[] }> = [
  { h: "1. The service", p: ["FlowGram automates messaging on Instagram accounts you own or manage: replying to comments with a direct message, welcoming first-time senders, and, on Pro, answering messages with an AI persona. By creating an account you agree to these terms."] },
  { h: "2. Meta and Instagram rules", p: ["FlowGram works through Meta's official Instagram Platform. You must follow Meta's Platform Terms, Instagram's Terms of Use and Community Guidelines. Meta may change or limit API access at any time, and we are not responsible for changes Meta makes.", "You need an Instagram Business or Creator account and you must have the right to authorize FlowGram on it."] },
  { h: "3. Acceptable use", p: ["Do not use FlowGram to send spam, unsolicited bulk messages, scams, harassment, hateful or illegal content, or messages that mislead people about who is sending them. Only message people who commented on your content or wrote to you first.", "We may suspend automations or accounts that break these rules or put your Instagram account at risk, with notice where we can give it."] },
  { h: "4. AI persona", p: ["AI replies are generated automatically and can be wrong. You are responsible for the knowledge you provide and the topics you hand off to yourself. Do not rely on the AI persona for medical, legal or financial advice to your followers."] },
  { h: "5. Plans, billing and cancellation", p: [`The Free plan includes 100 automated direct messages a month, one Instagram account and up to ${FREE_MAX_COMMENT_RULES} comment rules. Pro is billed monthly through Stripe, includes unlimited comment rules and messages, and unlocks the AI persona. Prices are shown before you pay.`, "You can cancel any time in the billing portal. Cancellation takes effect at the end of the paid period, after which the workspace returns to Free. If a workspace returns to Free with more than the allowed number of rules, existing rules keep working but new rules cannot be added until it is under the limit. Payments are not refunded for time already used unless the law requires it."] },
  { h: "6. Your data and privacy", p: ["We store what is needed to run your automations: your account details, the Instagram access token (encrypted), your rules and messages, and the conversation data needed to avoid duplicate sends and to power the AI persona. We do not sell your data. Messages you send to the AI persona's model provider are processed to produce replies.", "You can disconnect Instagram at any time and ask us to delete your account and data by emailing " + LINKS.supportEmail + "."] },
  { h: "7. Availability", p: ["We work to keep FlowGram running, but we do not promise uninterrupted service. Messages can be delayed or not delivered because of Meta limits, rate limits or outages."] },
  { h: "8. Liability", p: ["FlowGram is provided as is. To the extent the law allows, we are not liable for indirect or consequential losses, lost profits, or loss of Instagram account access, and our total liability for any claim is limited to what you paid us in the 12 months before it."] },
  { h: "9. Changes and contact", p: ["We may update these terms and will post the new date here. Continuing to use FlowGram after a change means you accept it. Questions: " + LINKS.supportEmail + "."] },
];

export default function Terms() {
  return (
    <InfoShell title="Terms & Conditions" intro="Last updated November 25, 2026.">
      <div className="space-y-8">{SECTIONS.map((s) => <section key={s.h}><h2 className="text-[19px]">{s.h}</h2>{s.p.map((t) => <p key={t} className="mt-2 leading-relaxed text-[var(--ink-2)]">{t}</p>)}</section>)}</div>
    </InfoShell>
  );
}
