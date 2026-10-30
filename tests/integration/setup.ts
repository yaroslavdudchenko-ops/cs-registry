import { loadEnvFile } from "node:process";

import { resetLoginThrottleForTests } from "@/server/modules/auth/throttle";
import { applyTestDatabaseEnv } from "@/server/test/database-isolation";
import { truncateApplicationTables } from "@/server/test/truncate";

try {
  loadEnvFile(".env");
} catch {
  // CI передаёт переменные явно
}

const urls = applyTestDatabaseEnv(process.env);
resetLoginThrottleForTests();
await truncateApplicationTables(urls.adminUrl);
