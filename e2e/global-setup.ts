import { loadEnvFile } from "node:process";

import postgres from "postgres";

import { hashPassword } from "../src/server/modules/auth/password";
import { applyTestDatabaseEnv } from "../src/server/test/database-isolation";
import { truncateApplicationTables } from "../src/server/test/truncate";

import { E2E_FULL_NAME, E2E_PASSWORD, E2E_USERNAME } from "./credentials";

try {
  loadEnvFile(".env");
} catch {
  // CI / явные переменные
}

export default async function globalSetup(): Promise<void> {
  const urls = applyTestDatabaseEnv(process.env);
  await truncateApplicationTables(urls.adminUrl);
  const passwordHash = await hashPassword(E2E_PASSWORD);
  const sql = postgres(urls.testUrl, { max: 1 });
  try {
    await sql`
      INSERT INTO users (username, full_name, email, password_hash, role, is_active)
      VALUES (
        ${E2E_USERNAME},
        ${E2E_FULL_NAME},
        ${"e2e.admin@example.test"},
        ${passwordHash},
        ${"admin"}::user_role_enum,
        true
      )
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
