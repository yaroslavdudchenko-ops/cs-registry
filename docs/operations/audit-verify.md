---
title: Проверка хеш-цепочки аудита
version: 0.8.4
status: draft
updated: 2026-10-29
---

# Проверка хеш-цепочки аудита

Задание `pnpm audit:verify` читает `DATABASE_URL` (если пуст — `DATABASE_ADMIN_URL`), прогоняет `verifyStoredChain` и печатает по-русски число проверенных записей и либо «цепочка цела», либо номер записи и причину разрыва. Код возврата: 0 — цела, 1 — разрыв или ошибка конфигурации.

Контрольная точка (URS-044, URS-100): если задан `AUDIT_CHECKPOINT_FILE`, после успешной проверки в файл атомарно пишется JSON `{ id, hash, count, checkedAt }` последней записи. Следующий прогон сверяет, что запись с этим `id` всё ещё имеет тот же `hash`. Расхождение — код 1.

Файл должен лежать **вне** доступа прикладной роли БД (отдельный том, права только у учётки задания).

## Cron

```cron
# Ежедневно в 02:15 UTC, журнал задания — /var/log/cs-registry-audit-verify.log
15 2 * * * AUDIT_CHECKPOINT_FILE=/var/lib/cs-registry/audit-checkpoint.json DATABASE_URL=postgres://cs_registry_app:...@127.0.0.1:5432/cs_registry /opt/cs-registry/scripts/audit-verify.sh >> /var/log/cs-registry-audit-verify.log 2>&1
```

`scripts/audit-verify.sh` — обёртка `cd /opt/cs-registry && pnpm audit:verify`.

## systemd

`/etc/systemd/system/cs-registry-audit-verify.service`:

```ini
[Unit]
Description=CS Registry audit hash-chain verify
After=postgresql.service

[Service]
Type=oneshot
User=cs-registry
WorkingDirectory=/opt/cs-registry
Environment=DATABASE_URL=postgres://cs_registry_app:...@127.0.0.1:5432/cs_registry
Environment=AUDIT_CHECKPOINT_FILE=/var/lib/cs-registry/audit-checkpoint.json
ExecStart=/usr/bin/pnpm audit:verify
```

`/etc/systemd/system/cs-registry-audit-verify.timer`:

```ini
[Unit]
Description=Daily CS Registry audit hash-chain verify

[Timer]
OnCalendar=*-*-* 02:15:00
Persistent=true

[Install]
WantedBy=timers.target
```

Включение: `systemctl enable --now cs-registry-audit-verify.timer`.
