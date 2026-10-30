import { describe, expect, it } from "vitest";

import {
  TestDatabaseGuardError,
  applyTestDatabaseEnv,
  assertIsolatedTestDatabase,
  databaseIdentity,
  sameDatabase,
} from "./database-isolation";

describe("URS-102 изоляция тестовой БД", () => {
  it("различает демо-базу и тестовую по имени", () => {
    expect(
      sameDatabase(
        "postgres://app:x@127.0.0.1:5432/cs_registry",
        "postgres://app:x@127.0.0.1:5432/cs_registry_test",
      ),
    ).toBe(false);
    expect(
      sameDatabase(
        "postgres://app:x@127.0.0.1:5432/cs_registry",
        "postgres://app:y@127.0.0.1:5432/cs_registry",
      ),
    ).toBe(true);
    expect(databaseIdentity("postgres://u:p@db.example:5433/foo").name).toBe("foo");
  });

  it("падает по-русски, если TEST_DATABASE_URL не задан", () => {
    expect(() =>
      assertIsolatedTestDatabase({
        DATABASE_URL: "postgres://app:x@127.0.0.1:5432/cs_registry",
      }),
    ).toThrow(TestDatabaseGuardError);
    try {
      assertIsolatedTestDatabase({});
    } catch (error) {
      expect(error).toBeInstanceOf(TestDatabaseGuardError);
      expect((error as Error).message).toContain("TEST_DATABASE_URL");
      expect((error as Error).message).toMatch(/рус|тестов|рабочей/i);
    }
  });

  it("падает по-русски, если тестовая база совпадает с рабочей", () => {
    try {
      assertIsolatedTestDatabase({
        DATABASE_URL: "postgres://app:x@127.0.0.1:5432/cs_registry",
        TEST_DATABASE_URL: "postgres://app:x@127.0.0.1:5432/cs_registry",
        TEST_DATABASE_ADMIN_URL: "postgres://postgres:x@127.0.0.1:5432/cs_registry",
      });
      throw new Error("expected guard to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TestDatabaseGuardError);
      expect((error as Error).message).toContain("ту же базу");
    }
  });

  it("пропускает отдельную тестовую базу", () => {
    const urls = assertIsolatedTestDatabase({
      DATABASE_URL: "postgres://app:x@127.0.0.1:5432/cs_registry",
      TEST_DATABASE_URL: "postgres://app:x@127.0.0.1:5432/cs_registry_test",
      TEST_DATABASE_ADMIN_URL: "postgres://postgres:x@127.0.0.1:5432/cs_registry_test",
    });
    expect(urls.testUrl).toContain("cs_registry_test");
  });

  it.each([
    [
      "127.0.0.1 ↔ localhost",
      "postgres://app:x@127.0.0.1:55432/cs_registry",
      "postgres://app:x@localhost:55432/cs_registry",
    ],
    [
      "127.0.0.1 ↔ ::1",
      "postgres://app:x@127.0.0.1:55432/cs_registry",
      "postgres://app:x@[::1]:55432/cs_registry",
    ],
    [
      "localhost ↔ ::1",
      "postgres://app:x@localhost:55432/cs_registry",
      "postgres://app:x@[::1]:55432/cs_registry",
    ],
    [
      "127.0.0.1 ↔ 0.0.0.0",
      "postgres://app:x@127.0.0.1:55432/cs_registry",
      "postgres://app:x@0.0.0.0:55432/cs_registry",
    ],
    [
      "порт 5432 ↔ без порта",
      "postgres://app:x@127.0.0.1:5432/cs_registry",
      "postgres://app:x@127.0.0.1/cs_registry",
    ],
    [
      "регистр имени базы Cs_Registry ↔ cs_registry",
      "postgres://app:x@127.0.0.1:5432/Cs_Registry",
      "postgres://app:x@127.0.0.1:5432/cs_registry",
    ],
  ] as const)("%s — sameDatabase true и отказ предохранителя", (_label, demoUrl, testUrl) => {
    expect(sameDatabase(demoUrl, testUrl)).toBe(true);
    expect(databaseIdentity(demoUrl)).toEqual(databaseIdentity(testUrl));
    try {
      assertIsolatedTestDatabase({
        DATABASE_URL: demoUrl,
        TEST_DATABASE_URL: testUrl,
        TEST_DATABASE_ADMIN_URL: testUrl,
      });
      throw new Error("expected guard to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TestDatabaseGuardError);
      expect((error as Error).message).toContain("ту же базу");
    }
  });

  it("не путает псевдонимы хоста с другой базой", () => {
    expect(
      sameDatabase(
        "postgres://app:x@127.0.0.1:5432/cs_registry",
        "postgres://app:x@localhost:5432/cs_registry_test",
      ),
    ).toBe(false);
    expect(() =>
      assertIsolatedTestDatabase({
        DATABASE_URL: "postgres://app:x@127.0.0.1:5432/cs_registry",
        TEST_DATABASE_URL: "postgres://app:x@localhost:5432/cs_registry_test",
        TEST_DATABASE_ADMIN_URL: "postgres://postgres:x@localhost:5432/cs_registry_test",
      }),
    ).not.toThrow();
  });

  it("повторный вызов после подмены не считает тестовую базу рабочей", () => {
    const env: NodeJS.Dict<string> = {
      DATABASE_URL: "postgres://app:x@127.0.0.1:5432/cs_registry",
      TEST_DATABASE_URL: "postgres://app:x@127.0.0.1:5432/cs_registry_test",
      TEST_DATABASE_ADMIN_URL: "postgres://postgres:x@127.0.0.1:5432/cs_registry_test",
    };
    applyTestDatabaseEnv(env);
    expect(env["DATABASE_URL"]).toContain("cs_registry_test");
    expect(() => applyTestDatabaseEnv(env)).not.toThrow();
    expect(env["DATABASE_URL"]).toContain("cs_registry_test");
  });
});
