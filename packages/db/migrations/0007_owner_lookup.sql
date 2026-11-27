-- Pre-tenant lookup used only at login, before a workspace context exists. Returns an id, nothing else.
CREATE OR REPLACE FUNCTION resolve_workspace_for_owner(p_owner text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT w.id FROM workspaces w WHERE w.owner_user_id = p_owner LIMIT 1
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_workspace_for_owner(text) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowgram_app') THEN
    GRANT EXECUTE ON FUNCTION resolve_workspace_for_owner(text) TO flowgram_app;
  END IF;
END $$;
