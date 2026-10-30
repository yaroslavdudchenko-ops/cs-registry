---
title: Реестр компьютеризированных систем (CS Registry)
version: 0.8.4
status: draft
updated: 2026-10-29
owners:
  - Ярослав
---

# Реестр компьютеризированных систем (CS Registry)

Единый источник правды о компьютеризированных системах организации. Регуляторный контекст: GxP, ALCOA+, 21 CFR Part 11, валидация КС по GAMP 5.

Совокупная версия комплекта документации — 0.8 (MAJOR.MINOR, максимальные по всем документам). Категория GAMP 5 — **5** (заказная разработка). ЭП не требуется (решение заказчика 29.10.2026).

Сейчас в репозитории — документация, **API** и **UI блоков 1–3**: вход, каркас, список и карточка системы (правка, архив, история), журнал аудита, пользователи, выгрузки XLSX и PDF; задание проверки хеш-цепочки, изоляция тестовой БД, локальный CI-гейт, e2e критического пути, runbook бэкапа.

## Стек

- Node 22, pnpm, Next.js (App Router), TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- PostgreSQL 16 (`pg_trgm`, `unaccent`)
- Drizzle ORM + Drizzle Kit
- Vitest (unit), интеграционные тесты к отдельной тестовой Postgres
- Playwright (критический путь e2e и регрессия вёрстки списка 1280×800). Браузер не ставится при `pnpm install`: по умолчанию системный Google Chrome (`E2E_BROWSER_CHANNEL`, пусто → `chrome`). Нет Chrome — `pnpm exec playwright install chromium` (e2e возьмёт встроенный Chromium сам) либо задайте `E2E_BROWSER_CHANNEL`. `pnpm ci:local` без браузера падает на шаге e2e.

## Команды

```bash
pnpm install
pnpm verify            # typecheck + lint + unit-тесты
pnpm test:integration  # требует TEST_DATABASE_URL, не демо-базу
pnpm ci:local          # lint + typecheck + unit + integration + build + e2e (без браузера упадёт на e2e)
pnpm audit:verify      # проверка хеш-цепочки журнала
pnpm e2e               # Playwright; нужен pnpm build и браузер (см. ниже)
pnpm dev               # http://127.0.0.1:43123
```

Предварительные условия e2e. `pnpm install` браузеры Playwright не скачивает. По умолчанию — Google Chrome (`E2E_BROWSER_CHANNEL` пуст или не задан → канал `chrome`; значение → этот канал, `chromium` — встроенный). Если канала нет, а `pnpm exec playwright install chromium` уже выполнен, e2e берёт встроенный Chromium. Иначе шаг e2e (и `pnpm ci:local`) завершается кодом 1: «Не найден Google Chrome. Установите его или задайте E2E_BROWSER_CHANNEL / выполните pnpm exec playwright install chromium».

Спек вёрстки списка (`e2e/list-layout.spec.ts`) проверяет не нулевую посадку, а запас ≥ 8 px между таблицей и контейнером, плюс отсутствие переполнения ячеек и код в одну строку. Два рендеринга шрифта: хинтинг по умолчанию и `--font-render-hinting=none`. При смене шрифта или горизонтальных отступов ячеек прогоните спек под обоими рендерингами и под Google Chrome, и под встроенным Chromium.

Выгрузки (право `systems.export`, все четыре роли): кнопки «Выгрузить в Excel» и «Выгрузить в PDF» на списке и на карточке. Файлы собираются на сервере, пишут событие `export`, даты в файле — `ДД.ММ.ГГГГ`.

```bash
# примеры API
GET /api/v1/systems/export?format=xlsx
GET /api/v1/systems/export?format=pdf
GET /api/v1/systems/:id/export?format=xlsx
GET /api/v1/systems/:id/export?format=pdf
```

## Как поднять базу

1. Скопировать `.env.example` в `.env` и **задать пароли** (`POSTGRES_PASSWORD`, `CS_REGISTRY_APP_PASSWORD`, те же значения в URL). `.env` в git не входит.
2. Поднять Postgres 16:

```bash
docker compose up -d db
```

Compose берёт пароли из окружения / `.env`, в YAML их нет. Init-скрипт контейнера выставляет `LOGIN` и пароль прикладной роли через `psql -v app_password=...` (`ALTER ROLE ... PASSWORD :'app_password'`).

3. Применить миграции от владельца схемы (`DATABASE_ADMIN_URL`):

```bash
pnpm db:migrate
```

Миграции включают расширения `pg_trgm` и `unaccent`, таблицы, роль `cs_registry_app` **без пароля и без LOGIN**, права (`audit_events`: только `SELECT, INSERT`) и триггер `BEFORE UPDATE OR DELETE`.

Если база поднята не через compose (роль после миграции `NOLOGIN`), выдать вход отдельно — пароль не из репозитория:

```bash
psql "$DATABASE_ADMIN_URL" -v app_password="$CS_REGISTRY_APP_PASSWORD" <<'SQL'
ALTER ROLE cs_registry_app LOGIN PASSWORD :'app_password';
SQL
```

(`psql -c` не подставляет `:'переменную'` — нужен скрипт или stdin.)

В продуктиве тот же `ALTER ROLE` делает человек при провижининге. Пароль не хранится в SQL-миграциях, чтобы секрет не жил в git.

Приложение использует `DATABASE_URL` прикладной роли. Интеграционные и e2e-тесты — только `TEST_DATABASE_URL` / `TEST_DATABASE_ADMIN_URL`.

## Тесты и изоляция базы

Интеграционные тесты и Playwright **не** пишут в демо-базу.

- `TEST_DATABASE_URL` — прикладная роль, тестовая база (например `cs_registry_test`).
- `TEST_DATABASE_ADMIN_URL` — владелец схемы той же тестовой базы: `TRUNCATE` перед и после прогона.
- Если `TEST_DATABASE_URL` не задан или указывает на ту же базу, что `DATABASE_URL`, тесты падают на старте с русским сообщением и ничего не выполняют. Псевдонимы localhost / 127.0.0.1 / ::1 считаются одной базой.
- Глобальный setup очищает `sessions`, `systems`, `users`, `audit_events`. Row-триггер запрета UPDATE/DELETE на журнале `TRUNCATE` не блокирует (это другой класс команды PostgreSQL).
- Тесты, которые намеренно ломают хеш-цепочку, восстанавливают `hash` до конца сценария.
- Счётчик неудачных входов живёт in-memory процесса, отдельной таблицы попыток нет.

`pnpm ci:local` сам создаёт `cs_registry_test`, если её нет, применяет миграции и выдаёт логин прикладной роли.

## Непрерывная интеграция

Репозиторий живёт в **Cursor Origin** (`origin.cursor.com/my2/cs-registry`), не на GitHub. Файл [`.github/workflows/ci.yml`](.github/workflows/ci.yml) описывает jobs `check` (Node 22, pnpm 10 через corepack, `pnpm install --frozen-lockfile`, lint, typecheck, unit, build) и `integration` (сервис `postgres:16`, миграции, `pnpm test:integration` с `TEST_DATABASE_URL`). YAML провалидирован парсером.

GitHub Actions этот workflow **не запускает**: внешних проверок нет. Нельзя считать CI «зелёным» по GitHub. Предполётная проверка — `pnpm ci:local`.

## Сессии и лимиты входа

- `APP_VERSION` — необязательное переопределение версии приложения для отладки. Базовая версия — поле `version` в `package.json`; `/api/health` отдаёт его, если переменная не задана.
- `SESSION_MINUTES_ADMIN` — срок жизни сессии администратора, по умолчанию 30 минут (cookie `Max-Age=1800`).
- `SESSION_MINUTES_DEFAULT` — срок жизни сессии `editor` / `viewer` / `auditor`, по умолчанию 10 минут (cookie `Max-Age=600`).
- Cookie сессии: `sid` (без имени проекта), HttpOnly, SameSite=Lax, Secure в production.
- Блокировка входа: 5 неудач за 15 минут → HTTP 423 `AUTH_LOCKED`.
- Rate limit входа: 20 запросов в минуту на ключ IP+username → HTTP 429 `RATE_LIMITED`. Счётчик **in-memory процесса**. При нескольких инстансах лимит не общий — для MVP допустимо; Caddy может дублировать ограничение на edge.

## Версионирование документации

Semantic versioning, синхронное с версией системы.

- MAJOR — несовместимое изменение: ломается трассировка, меняется смысл требований, схема данных несовместима с прошлой версией.
- MINOR — новое требование, новый раздел, расширение без ломки существующего.
- PATCH — исправление формулировок, опечаток, ошибок в критериях, не меняющее смысл.

Версия документа не может обгонять MAJOR версии системы — документ v1.4.2 живёт в системе 1.x.

## Документация

| Документ | Назначение |
|---|---|
| [docs/LLM-CONTEXT.md](docs/LLM-CONTEXT.md) | Контекст для ИИ-агента — читать первым |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Архитектура, аудит, hash chain |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | Поля, 8 блоков, справочники, формат ID |
| [docs/TESTING.md](docs/TESTING.md) | Гейт ci:local, грабли e2e |
| [docs/DEPLOY-PROD.md](docs/DEPLOY-PROD.md) | Установка на VPS (Docker, nginx, бэкапы) |
| [docs/INITIAL-CONTEXT.md](docs/INITIAL-CONTEXT.md) | Первичный контекст v0.2.0 |
| [docs/architecture/c4.md](docs/architecture/c4.md) | C4-модель |
| [docs/architecture/context.md](docs/architecture/context.md) | Потоки данных |
| [docs/architecture/er.md](docs/architecture/er.md) | ER-модель |
| [docs/specification/urs.md](docs/specification/urs.md) | URS |
| [docs/specification/functional-specification.md](docs/specification/functional-specification.md) | Функциональная спецификация |
| [docs/operations/audit-verify.md](docs/operations/audit-verify.md) | Задание проверки хеш-цепочки, cron/systemd |
| [docs/operations/backup-restore.md](docs/operations/backup-restore.md) | Бэкап и восстановление, политика 7/4/6 |

## Ограничения и вне объёма

- Импорт существующего Excel-реестра в MVP не входит (решение заказчика). Импорт из внешних систем — P1 и позже, см. раздел 3 `docs/INITIAL-CONTEXT.md`.

## Решённые вопросы

Закрыто 29.10.2026, если не указано иное.

- Разделение владельцев по GAMP 5 Second Edition §6.1.2: `process_owner_id` и `system_owner_id` обязательны, `quality_owner_id` необязателен, `technical_owner_id` снят. GAMP требует определённые и доведённые роли, а не конкретное поле реестра; реестр — способ это обеспечить. См. `docs/INITIAL-CONTEXT.md` раздел 5, `docs/architecture/er.md`, URS-090, URS-091, URS-092.
- История объекта — выборка из `audit_events` по `(entity_type, entity_id)`, отдельной таблицы нет. Объектная история доступна всем ролям с доступом к карточке; глобальный журнал — только `admin` и `auditor`.
- Категория GAMP 5 — **5**, заказная разработка (URS-096).
- ЭП не требуется (решение заказчика 29.10.2026) (URS-076, URS-077).
- Роли валидации: заказчик — владелец системы, отвечает за жизненный цикл и валидационный статус, готовит тест-кейсы и документацию. Валидацию исполняют другие люди. Владелец процесса в терминах реестра — заказчик. Площадки и подразделения: заказчик, Качество, ИТ (URS-097).
- Срок хранения аудита — бессрочно (URS-038).
- Восстановление пароля по SMTP в MVP не входит; пароль сбрасывает администратор вручную (URS-065).
- Длительность сессии по ролям: `admin` — 30 минут, остальные роли — 10 минут (`SESSION_MINUTES_ADMIN`, `SESSION_MINUTES_DEFAULT`, URS-062).

## Открытые вопросы

1. Срок хранения резервных копий сверх эксплуатационной ротации 7/4/6 из раздела 9 контекста — **решим позже** (отложено 29.10.2026).
2. Имена исполнителей валидации — пока не назначены (роли зафиксированы в URS-097).
