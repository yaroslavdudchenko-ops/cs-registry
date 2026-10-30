---
title: Архитектура CS Registry
version: 0.9.0
status: draft
updated: 2026-10-30
owners:
  - Ярослав
---

# Архитектура CS Registry 0.9.0

Подробные диаграммы: [architecture/c4.md](architecture/c4.md), [architecture/context.md](architecture/context.md), [architecture/er.md](architecture/er.md) (ER на 0.8.4; изменения 0.9.0 — в [DATA-MODEL.md](DATA-MODEL.md)).

## 1. Стек

| Слой | Технология |
|---|---|
| Веб и API | Next.js 16 (App Router, route handlers `src/app/api/v1/**`), React 19, Tailwind |
| Валидация | Zod 4 — одна схема на сервере и (частично) в браузере |
| БД | PostgreSQL 16, расширения `pg_trgm`, `unaccent` |
| Доступ к БД | `postgres` (postgres.js), схема описана в Drizzle (`src/server/db/schema.ts`) |
| Миграции | SQL-файлы `drizzle/NNNN_*.sql`, журнал `drizzle/meta/_journal.json`, применяет `scripts/apply-migrations.ts` (каждая миграция — одна транзакция) |
| Пароли | argon2id (19 MiB, t=2, p=1) |
| Выгрузки | ExcelJS (XLSX), PDFKit + DejaVu (PDF) |
| Тесты | Vitest (unit, integration на отдельной БД), Playwright (e2e) |
| Пакеты | pnpm 10, Node 22 |
| Поставка | `pnpm start` (локально) или Docker-образ `Dockerfile` + `docker-compose.prod.yml` |

## 2. Модули (`src/`)

| Путь | Назначение |
|---|---|
| `app/(registry)/systems`, `users`, `audit` | экраны: список, карточка, создание/правка, пользователи, журнал |
| `app/api/v1/**` | REST API: `auth/login|logout`, `systems`, `systems/[id]`, `systems/export`, `users`, `audit`; `app/api/health` |
| `components/system-form*.tsx`, `system-card.tsx`, `systems-list.tsx` | 8 блоков карточки, форма, таблица с выбором колонок |
| `lib/` | общий клиент/сервер код: подписи (`labels.ts`), проверка ссылок (`documents.ts`), API-клиент |
| `server/db/` | клиент БД, схема, репозитории (`systems-repository.ts`, `users-repository.ts`, `audit-repository.ts`) |
| `server/http/` | `withApi` (requestId, единый формат ошибок, лог отказов `log.ts`), ответы |
| `server/modules/auth` | сессии (cookie, срок по ролям), RBAC, блокировка после неудачных входов |
| `server/modules/systems` | Zod-схемы (`fields.ts`), правило GxP↔валидация, сервис с аудитом |
| `server/modules/users` | учётки, последний админ, ошибки проверки по полям (`fields.ts`) |
| `server/modules/audit` | запись события, хеш-цепочка, чтение, проверка (`verify-job.ts`) |
| `server/modules/export` | колонки, XLSX, PDF |

Формат ошибки API: `{ code, message, requestId, fields?: [{ field, message }] }`. Каждый отказ (4xx/5xx) пишется в stdout одной JSON-строкой `kind: "rejection"` с `requestId`, маршрутом, кодом и **именами** полей — без значений и паролей.

## 3. Схема БД (кратко)

- `users`, `sessions` — учётки и серверные сессии (в БД хеш токена).
- `systems` — запись реестра; с 0.9.0 + `domain`, `purpose`, `release`, РПП, `gxp_criticality`, `gamp_category`, `server`, `server_type`, `backup_frequency`, `integrations[]`, `devops`.
- `system_people` — люди системы по ролям (учётка **или** ФИО текстом, CHECK).
- `system_companies` — компании группы (мультивыбор).
- `system_documents` — ссылки документации (CHECK: только `http(s)://` или `\\сервер\ресурс`).
- `audit_events` — журнал, append-only.

Роли PostgreSQL: `postgres` — владелец схемы, миграции, бэкапы; `cs_registry_app` — прикладная роль приложения, на `audit_events` только `SELECT, INSERT`.

## 4. Журнал аудита

- Каждое изменение (создание, правка, архив, вход, отказ в доступе, выгрузка, чтение журнала) пишется в той же транзакции, что и изменение данных.
- Событие хранит актора (снимок логина/ФИО/роли), `before`/`after`, `changed_fields`, причину, `request_id`, IP, user-agent.
- **Hash chain:** `hash = sha256(канонический JSON события + prev_hash)` (для первой записи prev = `genesis`); запись под `pg_advisory_xact_lock`, `id` и время берутся из БД. Подмена любой записи ломает цепочку.
- Защита в БД (миграция 0001): триггер запрещает `UPDATE`/`DELETE` на `audit_events` (append-only), прикладная роль имеет только `SELECT, INSERT`. `TRUNCATE` триггером не закрыт — его может выполнить только владелец схемы.
- Проверка: `pnpm audit:verify` («Цепочка цела», код 0; иначе номер записи, код 1), опционально контрольная точка `AUDIT_CHECKPOINT_FILE`. См. [operations/audit-verify.md](operations/audit-verify.md).
- Миграции не переписывают старые события: 0.9.0 только добавляет поля, старые снимки читаются как есть.
