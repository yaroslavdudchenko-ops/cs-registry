#!/usr/bin/env tsx
/**
 * Первый администратор на пустой базе (прод-установка, docs/DEPLOY-PROD.md).
 * Переменные: ADMIN_USERNAME, ADMIN_PASSWORD (>= 12 символов), ADMIN_EMAIL,
 * ADMIN_FULL_NAME (необязательно), DATABASE_ADMIN_URL.
 * Отказывается работать, если в базе уже есть активный администратор:
 * дальше пользователей заводят через интерфейс (с записью в журнал аудита).
 */
import { loadEnvFile } from "node:process";

import postgres from "postgres";

import { hashPassword, isPasswordLongEnough } from "../src/server/modules/auth/password";

try {
  loadEnvFile(".env");
} catch {
  // переменные могут прийти из окружения
}

function need(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.trim().length === 0) {
    process.stderr.write(`Не задана переменная ${name}.\n`);
    process.exit(1);
  }
  return v.trim();
}

async function main(): Promise<void> {
  const url = need("DATABASE_ADMIN_URL");
  const username = need("ADMIN_USERNAME").toLowerCase();
  const password = process.env["ADMIN_PASSWORD"] ?? "";
  const email = need("ADMIN_EMAIL").toLowerCase();
  const fullName = process.env["ADMIN_FULL_NAME"]?.trim() || "Администратор";
  if (!isPasswordLongEnough(password)) {
    process.stderr.write("ADMIN_PASSWORD должен быть не короче 12 символов.\n");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const existing = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND is_active
    `;
    if ((existing[0]?.n ?? 0) > 0) {
      process.stderr.write("Активный администратор уже есть — новый не создаю. Заводите учётки через интерфейс.\n");
      process.exitCode = 1;
      return;
    }
    const hash = await hashPassword(password);
    await sql`
      INSERT INTO users (username, full_name, email, password_hash, role, is_active)
      VALUES (${username}, ${fullName}, ${email}, ${hash}, 'admin'::user_role_enum, true)
    `;
    process.stdout.write(`Администратор ${username} создан.\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
