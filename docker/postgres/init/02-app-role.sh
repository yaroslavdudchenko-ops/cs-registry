#!/bin/bash
set -euo pipefail

# Пароль не зашит в SQL-репозиторий: берётся из окружения контейнера.
: "${CS_REGISTRY_APP_PASSWORD:?CS_REGISTRY_APP_PASSWORD must be set}"
: "${POSTGRES_USER:?}"
: "${POSTGRES_DB:?}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$CS_REGISTRY_APP_PASSWORD" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cs_registry_app') THEN
    CREATE ROLE cs_registry_app NOLOGIN;
  END IF;
END
$$;

ALTER ROLE cs_registry_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE cs_registry TO cs_registry_app;
GRANT USAGE ON SCHEMA public TO cs_registry_app;
SQL
