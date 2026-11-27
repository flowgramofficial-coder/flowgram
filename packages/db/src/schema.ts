import { sql } from "drizzle-orm";
import {
  bigint, boolean, customType, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, vector,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "bytea"; },
});

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Identity tables are pre-tenant (a user exists before a workspace) so they are not RLS-scoped; only the app role reaches them. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: tstz("email_verified_at"),
  totpSecretEnc: bytea("totp_secret_enc"),
  totpDekEnc: bytea("totp_dek_enc"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  createdAt: tstz("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const sessions = pgTable("sessions", {
  /** sha256 of the cookie token; a DB leak does not yield usable sessions. */
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull(),
  createdAt: tstz("created_at").notNull().defaultNow(),
  rotatedAt: tstz("rotated_at").notNull().defaultNow(),
  expiresAt: tstz("expires_at").notNull(),
  /** false between password check and TOTP check */
  mfaPassed: boolean("mfa_passed").notNull().default(true),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const emailTokens = pgTable("email_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose", { enum: ["verify_email", "reset_password"] }).notNull(),
  expiresAt: tstz("expires_at").notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id").notNull(),
  plan: text("plan", { enum: ["free", "pro"] }).notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status").notNull().default("none"),
  monthlyDmQuota: integer("monthly_dm_quota").notNull().default(100),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: tstz("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("workspaces_owner_idx").on(t.ownerUserId),
  uniqueIndex("workspaces_stripe_customer_idx").on(t.stripeCustomerId),
]);

export const igAccounts = pgTable("ig_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  igUserId: text("ig_user_id").notNull().unique(),
  username: text("username").notNull(),
  encryptedAccessToken: bytea("encrypted_access_token").notNull(),
  encryptedDek: bytea("encrypted_dek").notNull(),
  tokenExpiresAt: tstz("token_expires_at").notNull(),
  webhookSubscribed: boolean("webhook_subscribed").notNull().default(false),
  status: text("status", { enum: ["active", "needs_reauth"] }).notNull().default("active"),
}, (t) => [index("ig_accounts_workspace_idx").on(t.workspaceId)]);

export const commentRules = pgTable("comment_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  igAccountId: uuid("ig_account_id").notNull().references(() => igAccounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  mediaScope: text("media_scope", { enum: ["specific", "any"] }).notNull(),
  targetMediaId: text("target_media_id"),
  matchType: text("match_type", { enum: ["keywords", "any"] }).notNull(),
  keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
  publicReplyEnabled: boolean("public_reply_enabled").notNull().default(false),
  publicReplyTemplates: text("public_reply_templates").array().notNull().default(sql`'{}'::text[]`),
  dmTemplate: text("dm_template").notNull(),
  ctaLabel: text("cta_label"),
  ctaUrl: text("cta_url"),
  priority: integer("priority").notNull().default(0),
  createdAt: tstz("created_at").notNull().defaultNow(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
}, (t) => [index("comment_rules_account_active_idx").on(t.igAccountId, t.isActive)]);

export const welcomeBotConfigs = pgTable("welcome_bot_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  igAccountId: uuid("ig_account_id").notNull().unique().references(() => igAccounts.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").notNull().default(false),
  delaySeconds: integer("delay_seconds").notNull().default(5),
  messageTemplate: text("message_template").notNull(),
  icebreakers: jsonb("icebreakers").$type<Array<{ id: string; title: string; reply: string }>>().notNull().default(sql`'[]'::jsonb`),
});

export const aiPersonaConfigs = pgTable("ai_persona_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  igAccountId: uuid("ig_account_id").notNull().unique().references(() => igAccounts.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").notNull().default(false),
  personaName: text("persona_name").notNull(),
  tone: text("tone").notNull(),
  emojiLevel: text("emoji_level", { enum: ["none", "light", "heavy"] }).notNull().default("light"),
  responseLength: text("response_length", { enum: ["short", "medium", "long"] }).notNull().default("short"),
  signaturePhrases: text("signature_phrases").array().notNull().default(sql`'{}'::text[]`),
  handoffTopics: text("handoff_topics").array().notNull().default(sql`'{}'::text[]`),
  allowedDomains: text("allowed_domains").array().notNull().default(sql`'{}'::text[]`),
  activeHoursJson: jsonb("active_hours_json").$type<{ days: number[]; start: string; end: string } | null>(),
  humanTakeoverPauseHours: integer("human_takeover_pause_hours").notNull().default(24),
});

export const aiKnowledgeChunks = pgTable("ai_knowledge_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  igAccountId: uuid("ig_account_id").notNull().references(() => igAccounts.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
}, (t) => [
  index("ai_chunks_embedding_hnsw").using("hnsw", t.embedding.op("vector_cosine_ops")),
  index("ai_chunks_account_idx").on(t.workspaceId, t.igAccountId),
]);

export const igContacts = pgTable("ig_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  igAccountId: uuid("ig_account_id").notNull().references(() => igAccounts.id, { onDelete: "cascade" }),
  senderIgId: text("sender_ig_id").notNull(),
  senderUsername: text("sender_username"),
  firstDmAt: tstz("first_dm_at").notNull().defaultNow(),
  welcomeSentAt: tstz("welcome_sent_at"),
  aiPausedUntil: tstz("ai_paused_until"),
  handoffFlagged: boolean("handoff_flagged").notNull().default(false),
}, (t) => [uniqueIndex("ig_contacts_account_sender_uq").on(t.igAccountId, t.senderIgId)]);

export const dmMessages = pgTable("dm_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  igAccountId: uuid("ig_account_id").notNull().references(() => igAccounts.id, { onDelete: "cascade" }),
  senderIgId: text("sender_ig_id").notNull(),
  direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
  source: text("source", { enum: ["user", "comment_rule", "welcome_bot", "ai_persona", "human_creator"] }).notNull(),
  metaMessageId: text("meta_message_id").notNull().unique(),
  body: text("body").notNull(),
  createdAt: tstz("created_at").notNull().defaultNow(),
}, (t) => [index("dm_messages_thread_idx").on(t.igAccountId, t.senderIgId, t.createdAt)]);

/** Not tenant-scoped: keys are opaque Meta/Stripe event ids. Cleaned by TTL job. */
export const webhookEventsDedup = pgTable("webhook_events_dedup", {
  eventKey: text("event_key").primaryKey(),
  receivedAt: tstz("received_at").notNull().defaultNow(),
}, (t) => [index("webhook_dedup_received_idx").on(t.receivedAt)]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: tstz("created_at").notNull().defaultNow(),
}, (t) => [index("audit_logs_workspace_created_idx").on(t.workspaceId, t.createdAt)]);

/**
 * Batched analytics + quota usage. Hot counters live in Valkey (HINCRBY) and are
 * flushed here every 10s; `bucket` is a month ("2026-11") for quota or a day for charts.
 */
export const usageCounters = pgTable("usage_counters", {
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  igAccountId: uuid("ig_account_id").notNull().references(() => igAccounts.id, { onDelete: "cascade" }),
  scope: text("scope", { enum: ["account", "rule"] }).notNull(),
  scopeId: text("scope_id").notNull(),
  bucket: text("bucket").notNull(),
  metric: text("metric").notNull(),
  value: bigint("value", { mode: "number" }).notNull().default(0),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.scope, t.scopeId, t.bucket, t.metric] })]);

/** Tables carrying workspace_id that must have RLS. */
export const TENANT_TABLES = [
  "ig_accounts", "comment_rules", "welcome_bot_configs", "ai_persona_configs",
  "ai_knowledge_chunks", "ig_contacts", "dm_messages", "audit_logs", "usage_counters",
] as const;
