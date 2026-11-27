CREATE TABLE "usage_counters" (
	"workspace_id" uuid NOT NULL,
	"ig_account_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"scope_id" text NOT NULL,
	"bucket" text NOT NULL,
	"metric" text NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_workspace_id_scope_scope_id_bucket_metric_pk" PRIMARY KEY("workspace_id","scope","scope_id","bucket","metric")
);
--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_ig_account_id_ig_accounts_id_fk" FOREIGN KEY ("ig_account_id") REFERENCES "public"."ig_accounts"("id") ON DELETE cascade ON UPDATE no action;