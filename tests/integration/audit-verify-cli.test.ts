import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { computeEventHash } from "@/server/modules/audit/hash-chain";
import { appendAuditEvent, systemActor } from "@/server/modules/audit/write";

const execFileAsync = promisify(execFile);

function requiredEnv(name: "DATABASE_URL" | "DATABASE_ADMIN_URL"): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

async function runVerify(env: NodeJS.ProcessEnv): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  try {
    const result = await execFileAsync("pnpm", ["audit:verify"], {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}

describe("URS-099 CLI audit:verify", () => {
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

  it("подмена hash даёт код возврата 1 и номер записи", async () => {
    const prefix = `cli-${Date.now()}`;
    const written = [];
    for (let index = 0; index < 3; index += 1) {
      written.push(
        await appendAuditEvent(appSql, { ...systemActor(`${prefix}-${String(index)}`) }, {
          action: "create",
          entityType: "auth",
          entityId: null,
          entityLabel: null,
          changedFields: null,
          before: null,
          after: { n: index },
          reason: null,
        }),
      );
    }
    const middle = written[1];
    if (middle === undefined) {
      throw new Error("missing middle event");
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: requiredEnv("DATABASE_URL"),
    };
    delete env["AUDIT_CHECKPOINT_FILE"];

    const healthy = await runVerify(env);
    expect(healthy.code).toBe(0);
    expect(healthy.stdout).toContain("Цепочка цела");

    await adminSql`SET session_replication_role = replica`;
    await adminSql`UPDATE audit_events SET hash = ${"0".repeat(64)} WHERE id = ${middle.id}`;
    await adminSql`SET session_replication_role = origin`;

    const broken = await runVerify(env);
    expect(broken.code).toBe(1);
    expect(`${broken.stdout}${broken.stderr}`).toContain(`id=${String(middle.id)}`);
    expect(`${broken.stdout}${broken.stderr}`).toContain("несовпадение hash");

    await adminSql`SET session_replication_role = replica`;
    await adminSql`UPDATE audit_events SET hash = ${middle.hash} WHERE id = ${middle.id}`;
    await adminSql`SET session_replication_role = origin`;

    const restored = await runVerify(env);
    expect(restored.code).toBe(0);

    const dir = mkdtempSync(path.join(tmpdir(), "audit-cli-"));
    const checkpoint = path.join(dir, "checkpoint.json");
    const withCheckpoint = await runVerify({ ...env, AUDIT_CHECKPOINT_FILE: checkpoint });
    expect(withCheckpoint.code).toBe(0);
    expect(computeEventHash(middle)).toBe(middle.hash);
  });
});
