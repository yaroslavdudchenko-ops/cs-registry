---
title: Контекст для ИИ-агента
version: 0.9.0
status: draft
updated: 2026-10-30
owners:
  - Ярослав
---

# LLM-CONTEXT: что знать агенту до первой правки

Короткий вход для ИИ-агента (Cursor, облачный агент). Правила работы — [../AGENTS.md](../AGENTS.md); этот файл — **факты о проекте**.

## Что это

CS Registry — реестр компьютеризированных систем фармкомпании (GxP, GAMP 5, 21 CFR Part 11 / Приложение 11). Версия 0.9.0. Пользователь — владелец продукта, **не разработчик**: отвечать по-русски, просто, без жаргона; решения по требованиям принимает он.

## Стек и запуск

Next.js 16 + React 19, Zod 4, PostgreSQL 16, postgres.js, Drizzle (только описание схемы), argon2id, ExcelJS, PDFKit. Node 22, pnpm 10.

- `pnpm install` → `pnpm db:migrate` → `pnpm build` → `pnpm start` (порт из `PORT`, на ПК владельца 127.0.0.1:43123).
- Прод: `Dockerfile` + `docker-compose.prod.yml`, инструкция [DEPLOY-PROD.md](DEPLOY-PROD.md).

## Неизменяемые правила

1. **Журнал аудита append-only + hash chain.** Никогда не `UPDATE`/`DELETE` в `audit_events`, не менять формат хеша без новой версии алгоритма. Каждое изменение данных — событие в той же транзакции. После любой работы с БД — `pnpm audit:verify`.
2. **Миграции** — только новые файлы `drizzle/NNNN_*.sql` + запись в `drizzle/meta/_journal.json`. Применённые не трогать (сверка sha256). Миграция должна работать на живых данных 0.8.4/0.9.0 и не переписывать старые события.
3. **ID систем** не меняются никогда (`SYS-NNNN` старые, `SYS-<ДОМЕН>-NNNN` новые, сквозная нумерация).
4. **GxP-правило**: без GxP — статус валидации «Не требуется», поля GxP заблокированы; проверка и в форме, и на сервере.
5. **Ссылки документов**: только `http(s)://` и `\\сервер\ресурс`.
6. **Ошибки**: каждая ошибка проверки — понятное русское сообщение под полем + `requestId` в ответе; в лог — requestId, маршрут, имена полей, **без значений и паролей**.
7. **Гейт**: `pnpm ci:local` с кодом 0 перед сдачей ([TESTING.md](TESTING.md)). Порт 43123 должен быть свободен.
8. Документы в `docs/**` обязаны иметь front matter (`title`, `version` semver, `status`, `updated`) — проверяет unit-тест.
9. Не мержить PR без явного слова владельца.

## Карта

- Архитектура — [ARCHITECTURE.md](ARCHITECTURE.md); поля, справочники, 8 блоков — [DATA-MODEL.md](DATA-MODEL.md).
- Требования — [specification/urs.md](specification/urs.md), функциональная спецификация и трассировка — [specification/functional-specification.md](specification/functional-specification.md).
- История — [../CHANGELOG.md](../CHANGELOG.md).
- Бэкап/восстановление — [operations/backup-restore.md](operations/backup-restore.md); проверка аудита — [operations/audit-verify.md](operations/audit-verify.md).

## Где менять типовые вещи

| Задача | Файлы |
|---|---|
| Новое поле системы | миграция `drizzle/`, `src/server/db/schema.ts`, `systems-repository.ts`, `src/server/modules/systems/fields.ts` (Zod), `src/lib/labels.ts`, `components/system-form*.tsx`, `system-card.tsx`, колонки `systems-list.tsx` и `export/columns.ts`, тесты |
| Новое значение справочника | новая миграция (тип/CHECK в БД) + Zod-схема + подписи `src/lib/labels.ts` |
| Сообщение об ошибке | `fields.ts` модуля (подписи полей) и `src/server/http` |

## Открытые вопросы (0.9.0)

- Списки GxP-критичности (низкая/средняя/высокая), GAMP (1/3/4/5), типа сервера и периодичности бэкапа, привязка доменов к старым системам в 0006 — **допущения агента, ждут подтверждения владельца**.
- В списке нет UI-фильтра по владельцу (API принимает только `owner=<uuid>`) и фильтра «по любому полю».
- `scripts/create-admin.ts` создаёт первого админа без события аудита (база пустая, актора нет).
