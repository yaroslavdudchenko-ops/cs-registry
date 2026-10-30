import { loadEnvFile } from "node:process";

import { applyTestDatabaseEnv } from "../src/server/test/database-isolation";
import { countApplicationRows, truncateApplicationTables } from "../src/server/test/truncate";

try {
  loadEnvFile(".env");
} catch {
  // CI / явные переменные
}

export default async function globalTeardown(): Promise<void> {
  const urls = applyTestDatabaseEnv(process.env);
  await truncateApplicationTables(urls.adminUrl);
  const counts = await countApplicationRows(urls.adminUrl);
  const leftover = Object.entries(counts).filter(([, value]) => value > 0);
  if (leftover.length > 0) {
    throw new Error(
      `После e2e тестовая база не пуста: ${leftover
        .map(([table, value]) => `${table}=${String(value)}`)
        .join(", ")}`,
    );
  }
}
