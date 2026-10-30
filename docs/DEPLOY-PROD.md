---
title: Установка CS Registry на сервер (VPS)
version: 0.9.0
status: draft
updated: 2026-10-30
owners:
  - Ярослав
---

# Установка CS Registry на VPS (Ubuntu 22.04 / 24.04)

Инструкция для человека, который не разработчик. Команды копируйте целиком. Всё, что в `<угловых скобках>`, замените своим.

Схема: **nginx (HTTPS, порты 80/443) → приложение (только 127.0.0.1:3000) → PostgreSQL 16 (только внутри Docker, наружу не открыт)**. Приложение и база работают в Docker.

## 1. Какой сервер нужен

- Ubuntu 22.04 или 24.04, 2 vCPU, 4 ГБ RAM (минимум 2 ГБ + swap), 20 ГБ диска (SSD).
- Доменное имя, например `registry.company.ru`, у которого A-запись указывает на IP сервера.
- Вход по SSH под пользователем с `sudo`.

## 2. Обновить систему и поставить Docker

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Выйдите из SSH и зайдите снова (чтобы заработала группа docker). Проверка:

```bash
docker version
docker compose version
```

## 3. Брандмауэр: открыть только 22, 80, 443

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

База данных наружу **не публикуется**: в `docker-compose.prod.yml` у сервиса `db` нет `ports`. Приложение слушает только `127.0.0.1`, снаружи его видно только через nginx. Внимание: Docker умеет обходить ufw для опубликованных портов — поэтому никогда не добавляйте `ports:` сервису `db` и не меняйте `127.0.0.1:` у приложения.

## 4. Скачать код

```bash
sudo mkdir -p /opt/cs-registry && sudo chown $USER /opt/cs-registry
cd /opt/cs-registry
git clone https://origin.cursor.com/my2/cs-registry.git app
cd app
git checkout <тег или ветка версии, например v0.9.0>
```

Если git-доступа к Origin на сервере нет — скопируйте архив с кодом (`scp cs-registry-0.9.0.zip …`) и распакуйте в `/opt/cs-registry/app`.

## 5. Файл с секретами `.env.prod`

```bash
cd /opt/cs-registry/app
cp .env.prod.example .env.prod
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env.prod
sed -i "s/^CS_REGISTRY_APP_PASSWORD=.*/CS_REGISTRY_APP_PASSWORD=$(openssl rand -hex 24)/" .env.prod
chmod 600 .env.prod
cat .env.prod
```

Пароли — hex (только 0-9a-f), их не нужно экранировать в адресах БД. Сохраните `.env.prod` в надёжном месте (менеджер паролей): без него не открыть бэкап. `SESSION_SECURE=true` — cookie только по HTTPS (обязательно для прода).

## 6. Собрать и запустить

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Что происходит: поднимается `db` (PostgreSQL 16, данные в томе `cs-registry-prod_pgdata`), затем одноразовый сервис `migrate` применяет миграции и завершается с `Exited (0)`, затем стартует `app`. Через ~30 секунд у `app` статус `healthy`.

Проверка:

```bash
curl -s http://127.0.0.1:3000/api/health
# {"status":"ok","version":"0.9.0","database":"up"}
docker compose -f docker-compose.prod.yml --env-file .env.prod logs migrate
```

## 7. Первый администратор

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_EMAIL=<admin@company.ru> \
  -e ADMIN_FULL_NAME="<Фамилия Имя>" \
  -e ADMIN_PASSWORD='<пароль не короче 12 символов>' \
  migrate tsx --tsconfig tsconfig.json scripts/create-admin.ts
```

Скрипт работает только на базе без активного администратора. Остальных пользователей заводите в интерфейсе («Пользователи»), это пишется в журнал аудита. Команда с паролем остаётся в истории shell — после выполнения: `history -d $(history 1 | awk '{print $1}')` или поменяйте пароль в интерфейсе.

## 8. nginx и сертификат Let's Encrypt

```bash
sudo apt -y install nginx certbot python3-certbot-nginx
sudo tee /etc/nginx/sites-available/cs-registry >/dev/null <<'NGINX'
server {
    listen 80;
    server_name <registry.company.ru>;
    client_max_body_size 5m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINX
sudo ln -s /etc/nginx/sites-available/cs-registry /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <registry.company.ru> --redirect -m <admin@company.ru> --agree-tos
```

Certbot сам допишет HTTPS и переадресацию с http. Продление автоматическое (`systemctl list-timers | grep certbot`). Откройте `https://<registry.company.ru>` и войдите администратором.

## 9. Резервные копии (pg_dump по cron) и проверка восстановления

Скрипт `/opt/cs-registry/backup.sh`:

```bash
sudo tee /opt/cs-registry/backup.sh >/dev/null <<'SH'
#!/bin/bash
set -euo pipefail
cd /opt/cs-registry/app
mkdir -p /opt/cs-registry/backups
F=/opt/cs-registry/backups/cs_registry-$(date +%Y%m%d-%H%M).dump
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  pg_dump -U postgres -d cs_registry --format=custom > "$F"
# храним 14 дней
find /opt/cs-registry/backups -name '*.dump' -mtime +14 -delete
SH
sudo chmod 700 /opt/cs-registry/backup.sh
( crontab -l 2>/dev/null; echo "30 2 * * * /opt/cs-registry/backup.sh >> /opt/cs-registry/backup.log 2>&1" ) | crontab -
```

`pg_dump` берётся из контейнера `postgres:16` — версия совпадает с сервером (см. грабли в [operations/backup-restore.md](operations/backup-restore.md)). Копируйте `/opt/cs-registry/backups` на другой сервер или в облако (rclone, restic) — копия на том же VPS не спасёт при его потере. Политика хранения проекта 7/4/6 — в том же документе.

**Проверка восстановления (раз в месяц, обязательно):**

```bash
cd /opt/cs-registry/app
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"
LAST=$(ls -t /opt/cs-registry/backups/*.dump | head -1)
$C exec -T db psql -U postgres -c "DROP DATABASE IF EXISTS restore_check" -c "CREATE DATABASE restore_check"
$C exec -T db pg_restore -U postgres -d restore_check --no-owner --exit-on-error < "$LAST"
$C exec -T db psql -U postgres -d restore_check -c "select count(*) as systems from systems" -c "select count(*) as audit from audit_events"
$C run --rm -e DATABASE_ADMIN_URL="postgres://postgres:$(grep ^POSTGRES_PASSWORD .env.prod | cut -d= -f2)@db:5432/restore_check" \
  migrate tsx --tsconfig tsconfig.json scripts/verify-audit-chain.ts
$C exec -T db psql -U postgres -c "DROP DATABASE restore_check"
```

Должно быть «Цепочка цела.» и ожидаемое число систем.

## 10. Обновление версии и откат

Перед обновлением — всегда свежий бэкап.

```bash
/opt/cs-registry/backup.sh
cd /opt/cs-registry/app
git fetch && git checkout <новый тег>
sed -i "s/^APP_VERSION_TAG=.*//" .env.prod; echo "APP_VERSION_TAG=<новая версия, напр. 0.9.1>" >> .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml --env-file .env.prod logs migrate
curl -s http://127.0.0.1:3000/api/health
```

Миграции применяются автоматически (сервис `migrate`), каждая — в транзакции: если упала, база остаётся как была, приложение новой версии не стартует.

**Откат:**
- Если новая версия **не меняла схему БД** — верните старый тег: `git checkout <старый тег>`, `APP_VERSION_TAG=<старая версия>` в `.env.prod`, `up -d`. Старые образы лежат локально (`docker images | grep cs-registry`).
- Если **миграция прошла** (схема уже новая) — старая версия может не работать с новой схемой. Тогда: остановить `app`, восстановить бэкап, снятый перед обновлением, и запустить старую версию:

```bash
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"
$C stop app
$C exec -T db psql -U postgres -c "DROP DATABASE cs_registry WITH (FORCE)" -c "CREATE DATABASE cs_registry"
$C exec -T db pg_restore -U postgres -d cs_registry --exit-on-error < /opt/cs-registry/backups/<файл перед обновлением>.dump
git checkout <старый тег>   # и APP_VERSION_TAG=<старая версия>
$C up -d
```

Данные, внесённые после бэкапа, при таком откате теряются — откатывайтесь сразу.

## 11. Логи

```bash
C="docker compose -f /opt/cs-registry/app/docker-compose.prod.yml --env-file /opt/cs-registry/app/.env.prod"
$C logs --tail=200 app        # приложение; отказы — строки с "kind":"rejection" и requestId
$C logs --tail=100 db
$C logs -f app | grep rejection   # смотреть отказы в реальном времени
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

Пользователь сообщил «ошибка, идентификатор запроса XXXX» → `$C logs app | grep XXXX` покажет маршрут, код и имена полей. Чтобы логи Docker не съели диск, добавьте в `/etc/docker/daemon.json`: `{"log-driver":"json-file","log-opts":{"max-size":"20m","max-file":"5"}}` и `sudo systemctl restart docker`.

## 12. Healthcheck и мониторинг

- `GET /api/health` → 200 `{"status":"ok","version":"…","database":"up"}`; если база недоступна — 503 `degraded`.
- Docker сам проверяет здоровье `app` каждые 30 с (`docker compose ps` → `healthy`), `restart: unless-stopped` перезапускает упавшие контейнеры, в том числе после перезагрузки сервера.
- Внешний мониторинг (UptimeRobot и т. п.) — на `https://<registry.company.ru>/api/health`.
- Проверку цепочки аудита запускайте по расписанию (раз в сутки) — [operations/audit-verify.md](operations/audit-verify.md), в Docker: `$C run --rm migrate tsx --tsconfig tsconfig.json scripts/verify-audit-chain.ts`.
