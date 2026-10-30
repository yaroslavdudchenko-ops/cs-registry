import { loadEnvFile } from "node:process";

import postgres from "postgres";

import { resolveVerifyDatabaseUrl, runAuditVerifyJob } from "../src/server/modules/audit/verify-job";

try {
  loadEnvFile(".env");
} catch {
  // переменные могут прийти из окружения
}

async function main(): Promise<number> {
  const url = resolveVerifyDatabaseUrl(process.env);
  if (url === undefined) {
    process.stderr.write("Не задан DATABASE_URL (или DATABASE_ADMIN_URL) для проверки цепочки аудита.\n");
    return 1;
  }
  const checkpointFile = process.env["AUDIT_CHECKPOINT_FILE"];
  const sql = postgres(url, { max: 1 });
  try {
    const options = checkpointFile !== undefined && checkpointFile.length > 0 ? { checkpointFile } : {};
    const result = await runAuditVerifyJob(sql, options);
    process.stdout.write(`${result.message}\n`);
    return result.ok ? 0 : 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    const text = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${text}\n`);
    process.exit(1);
  });
