ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON usage_counters
  USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id());
--> statement-breakpoint

-- Cross-tenant listing for the daily token-refresh job. Ids only; the caller then
-- enters each tenant's context before touching tokens.
CREATE OR REPLACE FUNCTION list_expiring_accounts(p_days int)
RETURNS TABLE (ig_account_id uuid, workspace_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a.id, a.workspace_id FROM ig_accounts a
  WHERE a.status = 'active' AND a.token_expires_at < now() + make_interval(days => p_days)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION list_expiring_accounts(int) FROM PUBLIC;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowgram_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON usage_counters TO flowgram_app;
    GRANT EXECUTE ON FUNCTION list_expiring_accounts(int) TO flowgram_app;
  END IF;
END $$;
