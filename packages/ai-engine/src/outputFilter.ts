import { IG_DM_MAX_BYTES, truncateUtf8 } from "@flowgram/ig-client";

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi;
// bare domains like "evil.com/login" or "evil[.]com"
const BARE_DOMAIN_RE = /\b[a-z0-9-]{2,63}(?:(?:\.|\[\.\]|\(dot\)|\s+dot\s+)[a-z0-9-]{2,63})*(?:\.|\[\.\]|\(dot\)|\s+dot\s+)(?:com|net|org|io|co|me|app|dev|xyz|ly|gl|link|shop|store|info|biz|ru|cn|tk|ml|ga|cf|gq|top|site|online|club|vip|live|page|click|to|gg)\b(?:\/[^\s]*)?/gi;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?<![\d])\+?(?:\d[\s().-]{0,2}){9,15}(?!\d)/g;

function hostOf(token: string): string {
  const t = token.replace(/^(?:https?:\/\/)/i, "").replace(/^www\./i, "").replace(/\[\.\]|\(dot\)|\s+dot\s+/gi, ".");
  return (t.split(/[/?#:]/)[0] ?? "").toLowerCase();
}
function allowed(host: string, allow: string[]): boolean {
  return allow.some((a) => host === a || host.endsWith(`.${a}`));
}

export type FilterVerdict = { ok: true; text: string; changed: boolean } | { ok: false; reason: "empty" | "prompt_leak" };

/**
 * Last line of defence before anything reaches a follower: removes URLs/domains that are not on the
 * creator's allowlist (phishing injection), strips emails/phone numbers, blocks prompt leaks, and
 * trims to Instagram's 1000-byte limit.
 */
export function filterOutput(raw: string, allowedDomains: string[], canary: string): FilterVerdict {
  const allow = allowedDomains.map((d) => d.toLowerCase());
  if (raw.includes(canary) || /SECURITY RULES|untrusted_follower_message|<knowledge_base>/i.test(raw)) return { ok: false, reason: "prompt_leak" };

  let text = raw;
  // markdown links: keep the label only
  text = text.replace(/\[([^\]]{1,200})\]\((?:[^)]{1,500})\)/g, "$1");
  text = text.replace(URL_RE, (m) => (allowed(hostOf(m), allow) ? m : ""));
  text = text.replace(BARE_DOMAIN_RE, (m) => (allowed(hostOf(m), allow) ? m : ""));
  text = text.replace(EMAIL_RE, "").replace(PHONE_RE, "");
  text = text.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return { ok: false, reason: "empty" };
  return { ok: true, text: truncateUtf8(text, IG_DM_MAX_BYTES), changed: text !== raw.trim() };
}
