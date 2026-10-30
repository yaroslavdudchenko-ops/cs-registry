#!/usr/bin/env bash
# Локальная предполётная проверка (lint, typecheck, unit, integration, build, e2e).
# GitHub Actions в Origin не запускается — этот скрипт заменяет зелёный CI.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

replace_db() {
  local url="$1"
  local db="$2"
  echo "$url" | sed -E 's#/[^/?]+([?].*)?$#'"/${db}\1#"
}

fail() {
  echo "$1" >&2
  exit 1
}

: "${DATABASE_ADMIN_URL:?Задайте DATABASE_ADMIN_URL в .env}"
: "${DATABASE_URL:?Задайте DATABASE_URL в .env}"
: "${CS_REGISTRY_APP_PASSWORD:?Задайте CS_REGISTRY_APP_PASSWORD в .env}"

TEST_DB_NAME="${TEST_DB_NAME:-cs_registry_test}"
if [[ -z "${TEST_DATABASE_ADMIN_URL:-}" ]]; then
  TEST_DATABASE_ADMIN_URL="$(replace_db "$DATABASE_ADMIN_URL" "$TEST_DB_NAME")"
fi
if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  TEST_DATABASE_URL="$(replace_db "$DATABASE_URL" "$TEST_DB_NAME")"
fi
export TEST_DATABASE_URL TEST_DATABASE_ADMIN_URL DATABASE_URL DATABASE_ADMIN_URL SESSION_SECURE="${SESSION_SECURE:-false}"

ADMIN_POSTGRES_URL="$(replace_db "$TEST_DATABASE_ADMIN_URL" postgres)"

echo "Проверка тестовой базы ${TEST_DB_NAME}…"
if ! psql "$ADMIN_POSTGRES_URL" -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM pg_database WHERE datname='${TEST_DB_NAME}'" | grep -q 1; then
  echo "Создаю базу ${TEST_DB_NAME}"
  psql "$ADMIN_POSTGRES_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${TEST_DB_NAME}"
fi

echo "Миграции тестовой базы…"
DATABASE_ADMIN_URL="$TEST_DATABASE_ADMIN_URL" pnpm db:migrate

psql "$TEST_DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -v app_password="$CS_REGISTRY_APP_PASSWORD" <<'SQL'
ALTER ROLE cs_registry_app LOGIN PASSWORD :'app_password';
SQL
psql "$TEST_DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -c "GRANT CONNECT ON DATABASE ${TEST_DB_NAME} TO cs_registry_app;"

declare -a RESULTS=()
OVERALL=0

run_step() {
  local name="$1"
  shift
  echo
  echo "=== ${name} ==="
  if "$@"; then
    RESULTS+=("${name}: OK")
  else
    RESULTS+=("${name}: FAIL")
    OVERALL=1
  fi
}

run_step "lint" pnpm lint
run_step "typecheck" pnpm typecheck
run_step "unit" pnpm test
run_step "integration" pnpm test:integration
run_step "build" env SESSION_SECURE=false pnpm build
run_step "e2e" pnpm e2e

echo
echo "Итог pnpm ci:local"
for line in "${RESULTS[@]}"; do
  echo "  ${line}"
done
if [[ "$OVERALL" -eq 0 ]]; then
  echo "Код возврата: 0"
else
  echo "Код возврата: 1"
fi
exit "$OVERALL"
