import { z } from "zod";

/* ---------- queue names ---------- */
export const QUEUES = {
  comments: "ig-comments",
  /** Raw inbound DM events. The ingestor never touches the DB, so first-contact routing happens in the worker. */
  dmInbound: "ig-dm-inbound",
  dmWelcome: "ig-dm-welcome",
  aiPersona: "ig-ai-persona",
  stripe: "stripe-events",
  dlq: "ig-dlq",
  maintenance: "maintenance",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/* ---------- error codes ---------- */
export const ERROR_CODES = {
  INVALID_SIGNATURE: "invalid_signature",
  PAYLOAD_TOO_LARGE: "payload_too_large",
  INVALID_PAYLOAD: "invalid_payload",
  RATE_LIMITED: "rate_limited",
  QUOTA_EXCEEDED: "quota_exceeded",
  PRO_REQUIRED: "pro_required",
  NOT_FOUND: "not_found",
  UNAUTHENTICATED: "unauthenticated",
} as const;

/* ---------- limits ---------- */
export const LIMITS = {
  webhookBodyBytes: 256 * 1024,
  igDmMaxChars: 1000,
  aiRepliesPerFollowerPerHour: 15,
  handoffPauseHours: 48,
} as const;

/* ---------- Meta webhook payload (tolerant: Meta adds fields without notice) ---------- */
const commentValue = z.object({
  id: z.string(),
  text: z.string().default(""),
  from: z.object({ id: z.string(), username: z.string().optional() }),
  media: z.object({ id: z.string() }).optional(),
  parent_id: z.string().optional(),
});

const messagingEvent = z.object({
  sender: z.object({ id: z.string() }),
  recipient: z.object({ id: z.string() }),
  timestamp: z.number().optional(),
  message: z.object({
    mid: z.string(),
    text: z.string().optional(),
    is_echo: z.boolean().optional(),
    is_deleted: z.boolean().optional(),
    quick_reply: z.object({ payload: z.string() }).optional(),
  }).optional(),
  // read receipts, reactions, postbacks etc. are accepted and then discarded by the router
  read: z.unknown().optional(),
  reaction: z.unknown().optional(),
  postback: z.unknown().optional(),
});

export const metaWebhookSchema = z.object({
  object: z.literal("instagram"),
  entry: z.array(z.object({
    id: z.string(),
    time: z.number().optional(),
    changes: z.array(z.object({ field: z.string(), value: z.unknown() })).optional(),
    messaging: z.array(messagingEvent).optional(),
  })).max(100),
});
export type MetaWebhook = z.infer<typeof metaWebhookSchema>;
export const metaCommentValueSchema = commentValue;

/* ---------- job payloads ---------- */
export const commentJobSchema = z.object({
  igUserId: z.string(), // the creator's IG user id (webhook entry.id)
  commentId: z.string(),
  mediaId: z.string().nullable(),
  fromId: z.string(),
  fromUsername: z.string().nullable(),
  text: z.string().max(4000),
  receivedAt: z.number(),
}).strict();
export type CommentJob = z.infer<typeof commentJobSchema>;

export const dmInboundJobSchema = z.object({
  igUserId: z.string(),
  senderId: z.string(),
  recipientId: z.string(),
  messageId: z.string(),
  text: z.string().max(4000).nullable(),
  isEcho: z.boolean(),
  quickReplyPayload: z.string().max(200).nullable(),
  timestamp: z.number(),
}).strict();
export type DmInboundJob = z.infer<typeof dmInboundJobSchema>;

export const dmWelcomeJobSchema = z.object({
  workspaceId: z.string().uuid(),
  igAccountId: z.string().uuid(),
  senderId: z.string(),
}).strict();
export type DmWelcomeJob = z.infer<typeof dmWelcomeJobSchema>;

export const aiPersonaJobSchema = z.object({
  workspaceId: z.string().uuid(),
  igAccountId: z.string().uuid(),
  senderId: z.string(),
  messageId: z.string(),
  text: z.string().max(4000),
}).strict();
export type AiPersonaJob = z.infer<typeof aiPersonaJobSchema>;

export const stripeEventJobSchema = z.object({ eventId: z.string(), type: z.string(), payload: z.string() }).strict();
export type StripeEventJob = z.infer<typeof stripeEventJobSchema>;

export const dlqJobSchema = z.object({
  originQueue: z.string(),
  originJobId: z.string().nullable(),
  failedReason: z.string().max(2000),
  attemptsMade: z.number(),
  data: z.unknown(),
  failedAt: z.number(),
}).strict();
export type DlqJob = z.infer<typeof dlqJobSchema>;

/* ---------- rule & config input schemas (API boundary: strict, unknown keys rejected) ---------- */
export const commentRuleInputSchema = z.object({
  name: z.string().min(1).max(80),
  isActive: z.boolean(),
  igAccountId: z.string().uuid(),
  mediaScope: z.enum(["specific", "any"]),
  targetMediaId: z.string().max(64).nullable(),
  matchType: z.enum(["keywords", "any"]),
  keywords: z.array(z.string().min(1).max(40)).max(30),
  publicReplyEnabled: z.boolean(),
  publicReplyTemplates: z.array(z.string().min(1).max(300)).max(10),
  dmTemplate: z.string().min(1).max(1000),
  ctaLabel: z.string().max(20).nullable(),
  ctaUrl: z.string().url().startsWith("https://").max(500).nullable(),
  priority: z.number().int().min(0).max(1000),
}).strict().superRefine((v, ctx) => {
  if (v.mediaScope === "specific" && !v.targetMediaId) ctx.addIssue({ code: "custom", path: ["targetMediaId"], message: "required for specific media" });
  if (v.matchType === "keywords" && v.keywords.length === 0) ctx.addIssue({ code: "custom", path: ["keywords"], message: "at least one keyword" });
  if (v.publicReplyEnabled && v.publicReplyTemplates.length === 0) ctx.addIssue({ code: "custom", path: ["publicReplyTemplates"], message: "at least one reply" });
  if ((v.ctaLabel === null) !== (v.ctaUrl === null)) ctx.addIssue({ code: "custom", path: ["ctaUrl"], message: "label and url go together" });
});
export type CommentRuleInput = z.infer<typeof commentRuleInputSchema>;

/** Free plan ceiling for comment rules (active plus paused). Pro is unlimited. Enforced server-side. */
export const FREE_MAX_COMMENT_RULES = 5;
export const FREE_RULE_LIMIT_MESSAGE = `Free plan allows up to ${FREE_MAX_COMMENT_RULES} comment rules. Upgrade to Pro for unlimited rules.`;
export const MAX_RULES_PER_BATCH = 100;

/** One row of a bulk save: no id creates a rule, an id edits that rule. */
export const commentRuleBatchItemSchema = z.object({ id: z.string().uuid().optional(), rule: commentRuleInputSchema }).strict();
export const commentRuleBatchSchema = z.array(commentRuleBatchItemSchema).min(1, "Add at least one rule").max(MAX_RULES_PER_BATCH);
export type CommentRuleBatchItem = z.infer<typeof commentRuleBatchItemSchema>;

export const welcomeConfigInputSchema = z.object({
  igAccountId: z.string().uuid(),
  isActive: z.boolean(),
  delaySeconds: z.number().int().min(0).max(300),
  messageTemplate: z.string().min(1).max(1000),
  icebreakers: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_-]{1,32}$/),
    title: z.string().min(1).max(20),
    reply: z.string().min(1).max(1000),
  }).strict()).max(4),
}).strict();
export type WelcomeConfigInput = z.infer<typeof welcomeConfigInputSchema>;

export const personaConfigInputSchema = z.object({
  igAccountId: z.string().uuid(),
  isActive: z.boolean(),
  personaName: z.string().min(1).max(60),
  tone: z.string().min(1).max(300),
  emojiLevel: z.enum(["none", "light", "heavy"]),
  responseLength: z.enum(["short", "medium", "long"]),
  signaturePhrases: z.array(z.string().min(1).max(80)).max(10),
  handoffTopics: z.array(z.string().min(1).max(60)).max(30),
  allowedDomains: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).max(20),
  activeHoursJson: z.object({
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }).strict().nullable(),
  humanTakeoverPauseHours: z.number().int().min(1).max(168),
}).strict();
export type PersonaConfigInput = z.infer<typeof personaConfigInputSchema>;

/** Plain-text template interpolation. No HTML, unknown placeholders left untouched. */
export function interpolate(template: string, vars: Record<string, string>): string {
  // Tolerates {Username}, { username } and similar spellings people type by hand.
  return template.replace(/\{\s*(username|post_title)\s*\}/gi, (_m, k: string) => stripControl(vars[k.toLowerCase()] ?? ""));
}
function stripControl(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[<>]/g, "");
}
