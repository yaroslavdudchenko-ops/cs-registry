import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCheckpoint, runAuditVerifyJob } from "@/server/modules/audit/verify-job";
import { appendAuditEvent, systemActor } from "@/server/modules/audit/write";

function requiredEnv(name: "DATABASE_URL" | "DATABASE_ADMIN_URL"): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

async function appendProbeEvents(sql: Sql, prefix: string, count: number): Promise<number[]> {
  const ids: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const event = await appendAuditEvent(sql, systemActor(`${prefix}-${String(index)}`), {
      action: "create",
      entityType: "auth",
      entityId: null,
      entityLabel: null,
      changedFields: null,
      before: null,
      after: { n: index },
      reason: null,
    });
    ids.push(event.id);
  }
  return ids;
}

describe("URS-100 контрольная точка пишет числовой max(id)", () => {
  let appSql: Sql;
  let adminSql: Sql;

  beforeAll(() => {
    appSql = postgres(requiredEnv("DATABASE_URL"), { max: 1 });
    adminSql = postgres(requiredEnv("DATABASE_ADMIN_URL"), { max: 1 });
  });

  afterAll(async () => {
    await appSql.end({ timeout: 5 });
    await adminSql.end({ timeout: 5 });
  });

  it("после 12 событий в файл попадает последний id по числу, не по строке", async () => {
    await adminSql`TRUNCATE TABLE audit_events RESTART IDENTITY`;
    const ids = await appendProbeEvents(appSql, `cp-lex-${String(Date.now())}`, 12);
    expect(ids.length).toBe(12);

    const numericLast = Math.max(...ids);
    const lexLast = [...ids].sort((left, right) => String(right).localeCompare(String(left), "en"))[0];
    expect(numericLast).toBe(12);
    expect(lexLast).toBe(9);

    const dir = mkdtempSync(path.join(tmpdir(), "audit-cp-lex-"));
    const checkpointFile = path.join(dir, "checkpoint.json");
    const result = await runAuditVerifyJob(appSql, { checkpointFile });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.last?.id).toBe(numericLast);
      expect(result.last?.id).not.toBe(lexLast);
      expect(result.count).toBe(12);
    }

    const stored = readCheckpoint(checkpointFile);
    expect(stored?.id).toBe(numericLast);
    expect(JSON.parse(readFileSync(checkpointFile, "utf8")).id).toBe(numericLast);
  });

  it("удаление хвоста после точки даёт checkpoint_mismatch", async () => {
    await adminSql`TRUNCATE TABLE audit_events RESTART IDENTITY`;
    await appendProbeEvents(appSql, `cp-tail-${String(Date.now())}`, 12);

    const dir = mkdtempSync(path.join(tmpdir(), "audit-cp-tail-"));
    const checkpointFile = path.join(dir, "checkpoint.json");
    const first = await runAuditVerifyJob(appSql, { checkpointFile });
    expect(first.ok).toBe(true);
    const stored = readCheckpoint(checkpointFile);
    expect(stored?.id).toBe(12);

    await adminSql`SET session_replication_role = replica`;
    await adminSql`DELETE FROM audit_events WHERE id > 9`;
    await adminSql`SET session_replication_role = origin`;

    const second = await runAuditVerifyJob(appSql, { checkpointFile });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("checkpoint_mismatch");
      expect(second.eventId).toBe(12);
      expect(second.message).toContain("отсутствующую запись");
      expect(second.message).toContain("id=12");
    }
  });
});
