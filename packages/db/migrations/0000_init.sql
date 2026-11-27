CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "ai_knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ig_account_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_persona_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ig_account_id" uuid NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"persona_name" text NOT NULL,
	"tone" text NOT NULL,
	"emoji_level" text DEFAULT 'light' NOT NULL,
	"response_length" text DEFAULT 'short' NOT NULL,
	"signature_phrases" text[] DEFAULT '{}'::text[] NOT NULL,
	"handoff_topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"allowed_domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"active_hours_json" jsonb,
	"human_takeover_pause_hours" integer DEFAULT 24 NOT NULL,
	CONSTRAINT "ai_persona_configs_ig_account_id_unique" UNIQUE("ig_account_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ig_account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"media_scope" text NOT NULL,
	"target_media_id" text,
	"match_type" text NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"public_reply_enabled" boolean DEFAULT false NOT NULL,
	"public_reply_templates" text[] DEFAULT '{}'::text[] NOT NULL,
	"dm_template" text NOT NULL,
	"cta_label" text,
	"cta_url" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dm_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ig_account_id" uuid NOT NULL,
	"sender_ig_id" text NOT NULL,
	"direction" text NOT NULL,
	"source" text NOT NULL,
	"meta_message_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dm_messages_meta_message_id_unique" UNIQUE("meta_message_id")
);
--> statement-breakpoint
CREATE TABLE "ig_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ig_user_id" text NOT NULL,
	"username" text NOT NULL,
	"encrypted_access_token" "bytea" NOT NULL,
	"encrypted_dek" "bytea" NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"webhook_subscribed" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "ig_accounts_ig_user_id_unique" UNIQUE("ig_user_id")
);
--> statement-breakpoint
CREATE TABLE "ig_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ig_account_id" uuid NOT NULL,
	"sender_ig_id" text NOT NULL,
	"sender_username" text,
	"first_dm_at" timestamp with time zone DEFAULT now() NOT NULL,
	"welcome_sent_at" timestamp with time zone,
	"ai_paused_until" timestamp with time zone,
	"handoff_flagged" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events_dedup" (
	"event_key" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welcome_bot_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ig_account_id" uuid NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"delay_seconds" integer DEFAULT 5 NOT NULL,
	"message_template" text NOT NULL,
	"icebreakers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "welcome_bot_configs_ig_account_id_unique" UNIQUE("ig_account_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" text DEFAULT 'none' NOT NULL,
	"monthly_dm_quota" integer DEFAULT 100 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunks" ADD CONSTRAINT "ai_knowledge_chunks_ig_account_id_ig_accounts_id_fk" FOREIGN KEY ("ig_account_id") REFERENCES "public"."ig_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_persona_configs" ADD CONSTRAINT "ai_persona_configs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_persona_configs" ADD CONSTRAINT "ai_persona_configs_ig_account_id_ig_accounts_id_fk" FOREIGN KEY ("ig_account_id") REFERENCES "public"."ig_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_rules" ADD CONSTRAINT "comment_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_rules" ADD CONSTRAINT "comment_rules_ig_account_id_ig_accounts_id_fk" FOREIGN KEY ("ig_account_id") REFERENCES "public"."ig_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD CONSTRAINT "dm_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_messages" ADD CONSTRAINT "dm_messages_ig_account_id_ig_accounts_id_fk" FOREIGN KEY ("ig_account_id") REFERENCES "public"."ig_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ig_accounts" ADD CONSTRAINT "ig_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ig_contacts" ADD CONSTRAINT "ig_contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ig_contacts" ADD CONSTRAINT "ig_contacts_ig_account_id_ig_accounts_id_fk" FOREIGN KEY ("ig_account_id") REFERENCES "public"."ig_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welcome_bot_configs" ADD CONSTRAINT "welcome_bot_configs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welcome_bot_configs" ADD CONSTRAINT "welcome_bot_configs_ig_account_id_ig_accounts_id_fk" FOREIGN KEY ("ig_account_id") REFERENCES "public"."ig_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_chunks_embedding_hnsw" ON "ai_knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "ai_chunks_account_idx" ON "ai_knowledge_chunks" USING btree ("workspace_id","ig_account_id");--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_created_idx" ON "audit_logs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "comment_rules_account_active_idx" ON "comment_rules" USING btree ("ig_account_id","is_active");--> statement-breakpoint
CREATE INDEX "dm_messages_thread_idx" ON "dm_messages" USING btree ("ig_account_id","sender_ig_id","created_at");--> statement-breakpoint
CREATE INDEX "ig_accounts_workspace_idx" ON "ig_accounts" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ig_contacts_account_sender_uq" ON "ig_contacts" USING btree ("ig_account_id","sender_ig_id");--> statement-breakpoint
CREATE INDEX "webhook_dedup_received_idx" ON "webhook_events_dedup" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_owner_idx" ON "workspaces" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_stripe_customer_idx" ON "workspaces" USING btree ("stripe_customer_id");