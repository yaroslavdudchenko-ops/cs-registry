import { loadEnvFile } from "node:process";

import { closeSql } from "@/server/db/client";
import { applyTestDatabaseEnv } from "@/server/test/database-isolation";
import { countApplicationRows, truncateApplicationTables } from "@/server/test/truncate";

try {
  loadEnvFile(".env");
} catch {
  // CI передаёт переменные явно
}

export async function setup(): Promise<void> {
  // очистка — в setupFiles; здесь только финальный teardown
}

export async function teardown(): Promise<void> {
  await closeSql();
  const urls = applyTestDatabaseEnv(process.env);
  await truncateApplicationTables(urls.adminUrl);
  const counts = await countApplicationRows(urls.adminUrl);
  const leftover = Object.entries(counts).filter(([, value]) => value > 0);
  if (leftover.length > 0) {
    throw new Error(
      `После прогона тестовая база не пуста: ${leftover
        .map(([table, value]) => `${table}=${String(value)}`)
        .join(", ")}`,
    );
  }
}
