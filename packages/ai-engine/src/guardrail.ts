/** Deterministic pre-LLM checks. Cheap, auditable, and impossible to prompt-inject. */

/** Always-on safety topics, in addition to the creator's own list. */
export const DEFAULT_HANDOFF_TOPICS = ["suicide", "self harm", "kill myself", "chargeback", "lawsuit"];

export function normalizeText(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function matchHandoffTopic(text: string, creatorTopics: string[]): string | null {
  const hay = ` ${normalizeText(text)} `;
  for (const topic of [...creatorTopics, ...DEFAULT_HANDOFF_TOPICS]) {
    const t = normalizeText(topic);
    if (t && hay.includes(` ${t} `)) return topic;
  }
  return null;
}

export interface ActiveHours { days: number[]; start: string; end: string }

/** `days` are 0=Sunday..6. Supports overnight windows (e.g. 22:00-06:00). */
export function isWithinActiveHours(cfg: ActiveHours | null | undefined, now: Date, timeZone: string): boolean {
  if (!cfg) return true;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const mins = Number(get("hour")) * 60 + Number(get("minute"));
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const s = toMin(cfg.start), e = toMin(cfg.end);
  if (s <= e) return cfg.days.includes(day) && mins >= s && mins < e;
  // overnight: the early-morning part belongs to the previous day's window
  const prev = (day + 6) % 7;
  return (cfg.days.includes(day) && mins >= s) || (cfg.days.includes(prev) && mins < e);
}
