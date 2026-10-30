---
title: Модель данных CS Registry
version: 0.9.0
status: draft
updated: 2026-10-30
owners:
  - Ярослав
---

# Модель данных 0.9.0

## 1. Формат ID системы

- Новые системы: `SYS-<ДОМЕН>-NNNN`, например `SYS-QC-0023`.
- Нумерация **сквозная**: один счётчик для всех доменов и для старых `SYS-NNNN` (после `SYS-0022` следующая новая — `SYS-<домен>-0023`).
- ID присваивается при создании и **не меняется**, даже если сменить домен.
- Старые `SYS-NNNN` не перенумеровываются (решение владельца — прослеживаемость); домен им проставлен миграцией 0006 по типу системы.

## 2. Справочник доменов

| Код | Подпись |
|---|---|
| QC | Контроль качества |
| QA | Обеспечение качества |
| PROD | Производство |
| RnD | Исследования и разработки |
| LOG | Логистика |
| ADM | Административные процессы |
| IT | ИТ |

Миграция 0006: LIMS/LES/ELN/LMS → QC; QMS → QA; MES/EBR/SCADA/EMS/BMS/CMMS/APS → PROD; EDC/CTMS/RIM → RnD; WMS/TMS/SRM → LOG; ERP/CRM/HRIS/EHS/PLM/ACC/EPM/LEGAL/CONTRACT/PAYROLL → ADM; остальное → IT.

## 3. Справочник компаний группы

Одна или несколько на систему (`system_companies`).

| Код в БД | Подпись |
|---|---|
| BE | Бе |
| BI | Би |
| PRO | Про |
| PROR | ПроР |
| PROD_CO | ПроД |
| AR | Ар |

## 4. Восемь блоков карточки

| № | Блок | Поля (подпись → колонка/таблица) |
|---|---|---|
| 1 | Идентификация | № строки (только в списке, не хранится); ID → `code`; Название → `name`; Домен → `domain` (обяз.); Назначение → `purpose`; Версия → `product_version`; Релиз → `release`; Подрядчик → `vendor`; РПП → `release_manager_user_id` / `release_manager_name`; описание, бизнес-процесс |
| 2 | Владельцы и ответственные | Владелец системы → `system_owner_id` / `system_owner_name_text` (+ `system_people` роль `system_owner`); Владельцы процесса → `system_people.process_owner` (список); Ключевые пользователи → `key_user` (список); Владелец по качеству → `quality_owner_id` |
| 3 | Компания | `system_companies` |
| 4 | GxP и валидация | GxP-статус → `is_gxp_relevant` (первым); GxP-критичность → `gxp_criticality` (низкая/средняя/высокая); GAMP 5 → `gamp_category` (1, 3, 4, 5); Статус валидации → `validation_status`; Дата последней валидации → `validated_at`; Плановая ревалидация → `next_review_at`; общая критичность, классификация данных |
| 5 | ИТ | `system_people`: `support`, `project_manager`, `analyst`, `developer`, `tester` (несколько, учётка или текст); модель аутентификации |
| 6 | Инфраструктура | Сервер → `server`; Тип сервера → `server_type` (физический/виртуальный/облачный/контейнер/другое); Тип системы → `system_type`; Размещение → `hosting_type`, `hosting_provider`; площадка → `site`; Периодичность бэкапа → `backup_frequency` (+ `backup_rpo_hours`, `backup_rto_hours`); Интеграции → `integrations[]` |
| 7 | Документация | `system_documents` kind `internal` / `vendor`: название + URL |
| 8 | Примечания | `notes`, DevOps → `devops` |

### Правило GxP ↔ валидация (сервер и форма)

- GxP **не отмечено**: GxP-критичность, GAMP, статус и даты видны, но серые и заблокированы; статус принудительно «Не требуется». Запрос с другим статусом — 400 `VALIDATION_ERROR` по полю `validation_status`.
- GxP **отмечено**: GxP-критичность, GAMP и статус обязательны, «Не требуется» недоступно.

### Люди (`system_people`)

`system_id, role, user_id NULL, full_name NULL, position`. CHECK: заполнено ровно одно из `user_id` / `full_name`. Роли: `process_owner`, `system_owner`, `release_manager`, `key_user`, `support`, `project_manager`, `analyst`, `developer`, `tester`. Старые `systems.process_owner_id` / `system_owner_id` (теперь NULLABLE) хранят «основную» денормализованную ссылку для совместимости.

### Ссылки документации

Разрешены только `http://`, `https://` и сетевые пути `\\сервер\ресурс` (проверка в браузере, в Zod и CHECK в БД). `javascript:`, `data:`, `file:` и всё прочее отклоняется. http(s) открываются в новой вкладке с `rel="noopener noreferrer"`, сетевой путь показывается текстом с кнопкой «Скопировать». Изменения ссылок попадают в аудит (`internal_documents`, `vendor_documents` в `changed_fields`, `before/after`).

## 5. Список систем

9 колонок по умолчанию: ID, Название, Домен, Владелец системы, GxP, Статус валидации, Жизненный цикл, Компания, Плановая ревалидация. Кнопка «Колонки» включает остальные по блокам; выбор — в `localStorage` браузера. Фильтры (сервер): домен, компания, GxP, GxP-критичность, GAMP, статус валидации, ЖЦ, тип, общая критичность, площадка, владелец (`owner=<uuid>`), архив, поиск по ID/названию/подрядчику. Экспорт XLSX/PDF — все поля, множественные значения через «; ».
