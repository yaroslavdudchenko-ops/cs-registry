/**
 * Изоляция интеграционных тестов от демо-базы (URS-102).
 * Тесты читают только TEST_DATABASE_URL / TEST_DATABASE_ADMIN_URL.
 */

export class TestDatabaseGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestDatabaseGuardError";
  }
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function normalizeHost(host: string): string {
  let normalized = host.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  if (LOOPBACK_HOSTS.has(normalized)) {
    return "localhost";
  }
  return normalized;
}

export function databaseIdentity(url: string): { host: string; port: string; name: string } {
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, "")).toLowerCase();
  return {
    host: normalizeHost(parsed.hostname),
    port: parsed.port.length > 0 ? parsed.port : "5432",
    name,
  };
}

export function sameDatabase(leftUrl: string, rightUrl: string): boolean {
  const left = databaseIdentity(leftUrl);
  const right = databaseIdentity(rightUrl);
  return left.host === right.host && left.port === right.port && left.name === right.name;
}

export function assertIsolatedTestDatabase(env: NodeJS.Dict<string>): {
  testUrl: string;
  adminUrl: string;
} {
  const testUrl = env["TEST_DATABASE_URL"];
  if (testUrl === undefined || testUrl.length === 0) {
    throw new TestDatabaseGuardError(
      "Не задан TEST_DATABASE_URL. Интеграционные тесты нельзя гонять на рабочей базе. Задайте отдельную тестовую базу в .env (см. .env.example) и повторите.",
    );
  }
  const adminUrl = env["TEST_DATABASE_ADMIN_URL"];
  if (adminUrl === undefined || adminUrl.length === 0) {
    throw new TestDatabaseGuardError(
      "Не задан TEST_DATABASE_ADMIN_URL. Для очистки тестовой базы нужна роль владельца схемы, не прикладная.",
    );
  }
  const demoUrl = env["DATABASE_URL"];
  if (demoUrl !== undefined && demoUrl.length > 0 && sameDatabase(demoUrl, testUrl)) {
    throw new TestDatabaseGuardError(
      "TEST_DATABASE_URL указывает на ту же базу, что и DATABASE_URL. Тесты отказались запускаться, чтобы не испортить демо-данные. Создайте отдельную базу (например cs_registry_test).",
    );
  }
  if (sameDatabase(adminUrl, testUrl) === false) {
    const test = databaseIdentity(testUrl);
    const admin = databaseIdentity(adminUrl);
    if (test.name !== admin.name) {
      throw new TestDatabaseGuardError(
        `TEST_DATABASE_ADMIN_URL смотрит в базу «${admin.name}», а TEST_DATABASE_URL — в «${test.name}». Укажите одну и ту же тестовую базу.`,
      );
    }
  }
  return { testUrl, adminUrl };
}

const APPLIED_FLAG = "CS_REGISTRY_TEST_ENV_APPLIED";

export function applyTestDatabaseEnv(env: NodeJS.Dict<string>): {
  testUrl: string;
  adminUrl: string;
} {
  if (env[APPLIED_FLAG] === "1") {
    const testUrl = env["TEST_DATABASE_URL"];
    const adminUrl = env["TEST_DATABASE_ADMIN_URL"];
    if (testUrl === undefined || testUrl.length === 0 || adminUrl === undefined || adminUrl.length === 0) {
      throw new TestDatabaseGuardError(
        "Тестовое окружение уже переключено, но TEST_DATABASE_URL или TEST_DATABASE_ADMIN_URL пропали.",
      );
    }
    env["DATABASE_URL"] = testUrl;
    env["DATABASE_ADMIN_URL"] = adminUrl;
    return { testUrl, adminUrl };
  }
  const originalDatabaseUrl = env["DATABASE_URL"];
  const urls = assertIsolatedTestDatabase(env);
  env["CS_REGISTRY_ORIGINAL_DATABASE_URL"] = originalDatabaseUrl ?? "";
  env["DATABASE_URL"] = urls.testUrl;
  env["DATABASE_ADMIN_URL"] = urls.adminUrl;
  env[APPLIED_FLAG] = "1";
  return urls;
}
