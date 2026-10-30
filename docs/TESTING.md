---
title: Тестирование CS Registry
version: 0.9.0
status: draft
updated: 2026-10-30
owners:
  - Ярослав
---

# Тестирование и гейт `pnpm ci:local`

GitHub Actions в Origin не запускается. Зелёный гейт = `pnpm ci:local` с кодом 0. Без него PR не сдаётся.

## Что делает `scripts/ci-local.sh`

1. Читает `.env` (нужны `DATABASE_URL`, `DATABASE_ADMIN_URL`, `CS_REGISTRY_APP_PASSWORD`, опционально `TEST_DATABASE_URL`/`TEST_DATABASE_ADMIN_URL`).
2. Создаёт тестовую базу `cs_registry_test` (если нет) и применяет миграции `pnpm db:migrate`. Нужен `psql` в `PATH`.
3. Шаги: lint → typecheck → unit (Vitest) → integration (Vitest на тестовой БД) → build → e2e (Playwright против `pnpm start` на 127.0.0.1:43123).
4. Печатает итог по шагам и «Код возврата».

Числа на 0.9.0 (после ревью 30.10.2026): unit 137, integration 50, e2e 7.

## Подготовка машины

- Node 22, pnpm 10 (`corepack enable`), PostgreSQL 16 (docker `docker compose up -d db` или любой локальный), `psql`.
- Тестовая база **не должна** совпадать с рабочей: тесты откажутся запускаться (URS-102), глобальный setup делает `TRUNCATE`.
- Порт **43123 должен быть свободен** — e2e поднимает своё приложение. Запущенный стенд (`pnpm start`) остановите, иначе Playwright падает «is already used».

## Грабли e2e

- **Браузер.** По умолчанию системный Google Chrome (`E2E_BROWSER_CHANNEL=chrome`). Без Chrome: `pnpm exec playwright install chromium` и `E2E_BROWSER_CHANNEL=chromium`.
- **Шрифты и вёрстка.** Тест вёрстки списка (`e2e/list-layout.spec.ts`) проверяет, что таблица с колонками по умолчанию не вылезает по ширине, с запасом ≥ 8 px. Метрики шрифта разные в Chrome и Chromium и зависят от установленных шрифтов (на голом Linux нет DejaVu/Liberation — ширины другие). В 0.8.2 это давало ложные падения. Решение владельца: прогон на «голой» машине и два режима рендеринга шрифта — ручная проверка перед релизом, в URS не вписывается.
- Шрифты для PDF (DejaVu) лежат в `src/server/modules/export/fonts` и попадают в сборку через `outputFileTracingIncludes`.
- Скриншот вёрстки пишется в `E2E_SCREENSHOT_DIR` (по умолчанию `test-results/`); ошибка записи тест не валит.

## Миграции

- Применённые миграции не редактируются: `scripts/apply-migrations.ts` сверяет sha256 файла, изменённый файл применится повторно и упадёт.
- Каждая миграция идёт в транзакции; при ошибке печатается SQL и причина, база остаётся как до миграции.
- Проверка на копии рабочих данных: `CREATE DATABASE copy TEMPLATE cs_registry` → `DATABASE_ADMIN_URL=…/copy pnpm db:migrate` → `pnpm audit:verify` до и после.

## Где тесты

- `src/**/*.test.ts` — unit (схемы, правило GxP, ссылки, подписи, экспорт, front-matter документов).
- `tests/integration/*.test.ts` — API на реальной БД: аудит, история, экспорт, 0.9.0 (`v090.test.ts`), ошибки формы пользователя (`user-validation.test.ts`).
- `e2e/*.spec.ts` — критический путь, вёрстка списка, блоки 0.9.0.
