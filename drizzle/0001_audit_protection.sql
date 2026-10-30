-- Идемпотентная защита журнала аудита и прикладной роли.
-- Пароль роли сюда не входит: секреты не хранятся в git. Роль создаётся
-- NOLOGIN; LOGIN и пароль выставляет провижининг (init-скрипт / psql).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cs_registry_app') THEN
    CREATE ROLE cs_registry_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO cs_registry_app', current_database());
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO cs_registry_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO cs_registry_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE systems TO cs_registry_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE audit_events TO cs_registry_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON TABLE audit_events FROM cs_registry_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE audit_events_id_seq TO cs_registry_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forbid_audit_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: UPDATE and DELETE are forbidden';
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_events_forbid_update_delete ON audit_events;
--> statement-breakpoint
CREATE TRIGGER audit_events_forbid_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION forbid_audit_events_mutation();
