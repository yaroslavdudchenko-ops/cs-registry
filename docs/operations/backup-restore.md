---
title: Резервное копирование и восстановление CS Registry
version: 0.8.4
status: draft
updated: 2026-10-29
---

# Резервное копирование и восстановление

Политика хранения **7/4/6**: 7 ежедневных, 4 недельных, 6 месячных копий. RPO 24 ч, RTO 4 ч (URS-070, URS-071). Дамп логический, шифруется до отправки во внешнее хранилище. Прикладная роль `cs_registry_app` дамп не снимает — только владелец схемы (`DATABASE_ADMIN_URL`).

## Совместимость клиента и сервера

Мажорная версия `pg_dump` / `pg_restore` / `psql` **должна совпадать** с мажорной версией PostgreSQL сервера.

Грабля: клиент 17 против сервера 16 дописывает в custom-дамп `SET transaction_timeout = 0`. PostgreSQL 16 этой настройки не знает, и `pg_restore --exit-on-error` падает на первой строке.

Проверка версий:

```bash
psql "$DATABASE_ADMIN_URL" -c 'SHOW server_version;'
pg_dump --version
```

Если мажор не совпадает — снимайте **plain-дамп** и вырезайте строку:

```bash
pg_dump --format=plain --no-owner --no-acl "$DATABASE_ADMIN_URL" \
  | grep -v -E '^SET transaction_timeout'
```

Так дамп восстанавливается на 16: счётчики таблиц и контрольная сумма кодов систем совпадают с источником.

## Ежедневный дамп (custom, сервер = клиент 16)

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT=/var/backups/cs-registry/daily/cs_registry_${STAMP}.dump
pg_dump --format=custom --file "$OUT" "$DATABASE_ADMIN_URL"
# шифрование до отправки — вне репозитория (age/gpg + S3)
```

Недельные — копия воскресного daily в `weekly/`. Месячные — копия первого daily месяца в `monthly/`. Ротация: удалить daily старше 7 суток, weekly старше 4 недель, monthly старше 6 месяцев.

## Восстановление в отдельную базу

Не восстанавливайте поверх живой демо-базы. Создайте `cs_registry_restore`:

```bash
psql "$DATABASE_ADMIN_URL" -c 'CREATE DATABASE cs_registry_restore'
RESTORE_URL=postgres://postgres:...@127.0.0.1:5432/cs_registry_restore

# custom-дамп при совпадении мажора:
pg_restore --exit-on-error --dbname "$RESTORE_URL" "$OUT"

# plain-дамп (в том числе после вырезания transaction_timeout):
psql "$RESTORE_URL" -v ON_ERROR_STOP=1 -f restored.sql
```

## Как проверить, что бэкап живой

1. Восстановить в отдельную базу, как выше.
2. Сверить счётчики с источником:

```bash
psql "$SOURCE_URL" -c "SELECT 'users' AS t, count(*) FROM users UNION ALL SELECT 'systems', count(*) FROM systems UNION ALL SELECT 'sessions', count(*) FROM sessions UNION ALL SELECT 'audit_events', count(*) FROM audit_events;"
psql "$RESTORE_URL" -c "SELECT 'users' AS t, count(*) FROM users UNION ALL SELECT 'systems', count(*) FROM systems UNION ALL SELECT 'sessions', count(*) FROM sessions UNION ALL SELECT 'audit_events', count(*) FROM audit_events;"
```

3. Сверить контрольную сумму кодов систем:

```bash
psql "$SOURCE_URL"  -tAc "SELECT md5(string_agg(code, ',' ORDER BY code)) FROM systems;"
psql "$RESTORE_URL" -tAc "SELECT md5(string_agg(code, ',' ORDER BY code)) FROM systems;"
```

4. Прогнать `AUDIT_CHECKPOINT_FILE=... DATABASE_URL=$RESTORE_URL pnpm audit:verify` — цепочка должна быть цела.

## Чек-лист

- [ ] Мажор `pg_dump` совпадает с сервером (или plain-дамп без `transaction_timeout`)
- [ ] Дамп снят от владельца схемы, не от `cs_registry_app`
- [ ] Файл зашифрован до отправки
- [ ] Ротация 7/4/6 применена
- [ ] Восстановление в отдельную базу прошло с `--exit-on-error` / `ON_ERROR_STOP`
- [ ] Счётчики users/systems/sessions/audit_events совпали
- [ ] md5 агрегата `systems.code` совпал
- [ ] `pnpm audit:verify` на восстановленной базе вернул 0
