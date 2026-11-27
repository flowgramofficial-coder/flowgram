-- audit_logs stays append-only for every actor, with one exception: rows whose workspace no longer
-- exists may be removed, so deleting a tenant (account closure / data-erasure request) can cascade.
-- UPDATE and TRUNCATE remain blocked unconditionally, and flowgram_app has no DELETE grant at all.
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = OLD.workspace_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only';
END $$;
