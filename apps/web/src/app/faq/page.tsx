import { FaqAccordion, type FaqGroup } from "@/components/FaqAccordion";
import { InfoShell } from "@/components/InfoShell";
import { FREE_MAX_COMMENT_RULES } from "@flowgram/shared";

export const metadata = { title: "FAQ", description: "Answers about comment-to-DM, the welcome bot, the AI persona, plans and billing." };

const GROUPS: FaqGroup[] = [
  { title: "Comment to DM", items: [
    { q: "How does comment-to-DM work?", a: "You write a rule: which posts or Reels it covers, which words in a comment trigger it, and the message to send. When a follower comments a matching word, FlowGram sends that message to them as a private reply and can also answer under the comment. Matching is by whole word and ignores capitals, so “link” does not match “linkedin”." },
    { q: "Can I use {username} in my messages?", a: "Yes. {username} becomes the commenter's Instagram handle and {post_title} becomes the post's caption start. The preview next to the rule editor shows the filled-in result as you type." },
    { q: "Will the same person get the same message twice?", a: "No. Instagram can deliver the same comment more than once, and FlowGram recognizes repeats and sends one message." },
  ] },
  { title: "First-time welcome bot", items: [
    { q: "What does the welcome message do?", a: "The first time someone messages your account, FlowGram sends your welcome message after the delay you choose and can attach up to four quick-reply buttons. People who have already talked to you are not greeted again." },
    { q: "What happens when I reply to someone myself?", a: "Your reply is detected and the automation steps aside for that conversation, so you never talk over the bot." },
  ] },
  { title: "AI persona (Pro)", items: [
    { q: "How do I train the AI persona?", a: "On the AI persona page you set a name, tone, emoji level, reply length and signature phrases, then add short knowledge-base entries such as prices, shipping and hours. Answers come from those entries and your settings." },
    { q: "What stops the AI from saying something wrong or risky?", a: "It only answers from your knowledge base, treats follower messages as untrusted text, and never follows instructions hidden in them. Replies are filtered so links, emails and phone numbers appear only if you allowed them. Topics you list, such as refunds or complaints, are handed to you and the AI pauses on that conversation." },
    { q: "Does the AI reply to everyone all the time?", a: "No. You can set active hours, and each follower is capped at 15 AI replies per hour." },
  ] },
  { title: "Free and Pro", items: [
    { q: "What are the limits on the Free plan?", a: `Free includes 100 automated DMs a month, one Instagram account and up to ${FREE_MAX_COMMENT_RULES} comment rules (active and paused together). Pro has unlimited comment rules and DMs and unlocks the AI persona.` },
    { q: "What happens if I go over the rule limit?", a: `You can keep editing your existing rules, but a new rule is blocked once you have ${FREE_MAX_COMMENT_RULES}. Delete one or upgrade to Pro to add more.` },
  ] },
  { title: "Instagram safety", items: [
    { q: "Is this allowed by Instagram?", a: "FlowGram uses Meta's official Instagram Platform API with permissions you approve when you connect. It never asks for your Instagram password and only sends messages in response to a comment or a message from the person, within Meta's messaging rules." },
    { q: "Can I disconnect FlowGram?", a: "Yes. Remove FlowGram under Apps and Websites in your Instagram settings at any time, and automations stop right away." },
  ] },
  { title: "Billing", items: [
    { q: "How do I cancel?", a: "Open Plan and billing and choose Manage billing. You can cancel there; Pro stays active until the end of the period you paid for, then the workspace returns to Free." },
    { q: "Where do I get an invoice?", a: "Invoices and payment methods are in the same billing portal." },
  ] },
];

export default function Faq() {
  return <InfoShell title="Frequently asked questions" intro="How FlowGram works, what each plan includes and how your account stays safe."><FaqAccordion groups={GROUPS} /></InfoShell>;
}
