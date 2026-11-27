DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowgram_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, email_tokens TO flowgram_app;
  END IF;
END $$;
