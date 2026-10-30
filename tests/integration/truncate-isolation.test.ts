import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appendAuditEvent, systemActor } from "@/server/modules/audit/write";
import { countApplicationRows, truncateApplicationTables } from "@/server/test/truncate";

function requiredEnv(name: "DATABASE_URL" | "DATABASE_ADMIN_URL"): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

describe("URS-102 TRUNCATE не блокируется триггером журнала", () => {
  let appSql: ReturnType<typeof postgres>;
  let adminSql: ReturnType<typeof postgres>;
  const adminUrl = requiredEnv("DATABASE_ADMIN_URL");

  beforeAll(() => {
    appSql = postgres(requiredEnv("DATABASE_URL"), { max: 1 });
    adminSql = postgres(adminUrl, { max: 1 });
  });

  afterAll(async () => {
    await appSql.end({ timeout: 5 });
    await adminSql.end({ timeout: 5 });
  });

  it("UPDATE/DELETE по audit_events запрещены, TRUNCATE очищает таблицы", async () => {
    await appendAuditEvent(appSql, systemActor("truncate-proof"), {
      action: "create",
      entityType: "auth",
      entityId: null,
      entityLabel: null,
      changedFields: null,
      before: null,
      after: { proof: true },
      reason: null,
    });

    await expect(adminSql`UPDATE audit_events SET reason = 'tamper'`).rejects.toThrow(
      /append-only|audit_events/i,
    );
    await expect(adminSql`DELETE FROM audit_events`).rejects.toThrow(/append-only|audit_events/i);

    await truncateApplicationTables(adminUrl);
    const counts = await countApplicationRows(adminUrl);
    expect(counts.audit_events).toBe(0);
    expect(counts.users).toBe(0);
    expect(counts.systems).toBe(0);
    expect(counts.sessions).toBe(0);
  });
});
