/** Pure rule matching. Kept free of I/O so it can be tested exhaustively. */

export interface MatchableRule {
  id: string;
  isActive: boolean;
  mediaScope: "specific" | "any";
  targetMediaId: string | null;
  matchType: "keywords" | "any";
  keywords: string[];
  priority: number;
  createdAt: Date | string;
}

export function normalizeComment(s: string): string {
  return s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Word-boundary match that works for any script (\b is ASCII-only in JS). Keywords with no
 * letters or digits (pure emoji / symbols) cannot have word boundaries, so they use substring match.
 */
export function keywordMatches(normalizedText: string, keyword: string): boolean {
  const k = normalizeComment(keyword);
  if (!k) return false;
  if (!/[\p{L}\p{N}]/u.test(k)) return normalizedText.includes(k);
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(k)}(?![\\p{L}\\p{N}_])`, "u");
  return re.test(normalizedText);
}

export function ruleMatches(rule: MatchableRule, mediaId: string | null, text: string): boolean {
  if (!rule.isActive) return false;
  if (rule.mediaScope === "specific" && (!mediaId || rule.targetMediaId !== mediaId)) return false;
  if (rule.matchType === "any") return true;
  const t = normalizeComment(text);
  return rule.keywords.some((k) => keywordMatches(t, k));
}

/** Highest priority wins; ties go to the oldest rule. Only one private reply per comment is allowed by Meta. */
export function pickRule<R extends MatchableRule>(rules: R[], mediaId: string | null, text: string): R | null {
  const hits = rules.filter((r) => ruleMatches(r, mediaId, text));
  hits.sort((a, b) => b.priority - a.priority || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return hits[0] ?? null;
}
