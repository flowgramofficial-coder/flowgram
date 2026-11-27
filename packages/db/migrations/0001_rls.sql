-- Row-Level Security, grants, append-only audit log, and the one pre-tenant lookup.
-- Design: the table owner (flowgram_owner) runs migrations and owns SECURITY DEFINER
-- functions, so it is deliberately NOT forced through RLS. The application role
-- (flowgram_app) is not an owner and is always subject to the policies below.

CREATE OR REPLACE FUNCTION app_workspace_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.current_workspace_id', true), '')::uuid
$$;
--> statement-breakpoint

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON workspaces
  USING (id = app_workspace_id()) WITH CHECK (id = app_workspace_id());
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ig_accounts','comment_rules','welcome_bot_configs','ai_persona_configs',
    'ai_knowledge_chunks','ig_contacts','dm_messages'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id())',
      t);
  END LOOP;
END $$;
--> statement-breakpoint

-- audit_logs: tenant-scoped read + insert only, immutable afterwards.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_select ON audit_logs FOR SELECT USING (workspace_id = app_workspace_id());
--> statement-breakpoint
CREATE POLICY audit_insert ON audit_logs FOR INSERT WITH CHECK (workspace_id = app_workspace_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();
--> statement-breakpoint

-- Keep comment_rules.updated_at honest.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER comment_rules_touch BEFORE UPDATE ON comment_rules
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint

-- Pre-tenant lookup for webhook routing. Returns ids only, never tokens.
CREATE OR REPLACE FUNCTION resolve_ig_account(p_ig_user_id text)
RETURNS TABLE (ig_account_id uuid, workspace_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id, a.workspace_id FROM ig_accounts a WHERE a.ig_user_id = p_ig_user_id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_ig_account(text) FROM PUBLIC;
--> statement-breakpoint

-- Grants for the application role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowgram_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      workspaces, ig_accounts, comment_rules, welcome_bot_configs, ai_persona_configs,
      ai_knowledge_chunks, ig_contacts, dm_messages TO flowgram_app;
    GRANT SELECT, INSERT ON audit_logs TO flowgram_app;
    GRANT SELECT, INSERT, DELETE ON webhook_events_dedup TO flowgram_app;
    GRANT EXECUTE ON FUNCTION resolve_ig_account(text) TO flowgram_app;
    GRANT EXECUTE ON FUNCTION app_workspace_id() TO flowgram_app;
  END IF;
END $$;
