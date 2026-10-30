# syntax=docker/dockerfile:1
# Production-образ CS Registry: multi-stage, non-root, Next.js standalone.
# Цели: runner (приложение, по умолчанию) и migrate (миграции и первый админ).
# Сборка: docker build -t cs-registry:0.9.0 .
#         docker build --target migrate -t cs-registry-migrate:0.9.0 .

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
WORKDIR /app

# 1. Зависимости (кешируется, пока не меняется lockfile)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# 2. Сборка Next.js в режиме standalone
FROM deps AS build
COPY . .
RUN BUILD_STANDALONE=1 pnpm build

# 3. Миграции / первый администратор: полный набор зависимостей + tsx
FROM deps AS migrate
COPY tsconfig.json package.json ./
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src ./src
RUN chown -R node:node /app
USER node
ENV PATH=/app/node_modules/.bin:$PATH
# Без pnpm/corepack в рантайме (corepack лезет в сеть за pnpm). Первый админ:
#   docker compose -f docker-compose.prod.yml run --rm -e ADMIN_USERNAME=... migrate \
#     tsx --tsconfig tsconfig.json scripts/create-admin.ts
CMD ["tsx", "--tsconfig", "tsconfig.json", "scripts/apply-migrations.ts"]

# 4. Приложение
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/src/server/modules/export/fonts ./src/server/modules/export/fonts
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
