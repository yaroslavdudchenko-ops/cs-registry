import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as getAudit } from "@/app/api/v1/audit/route";
import { POST as loginPost } from "@/app/api/v1/auth/login/route";
import { hashPassword } from "@/server/modules/auth/password";
import { appendAuditEvent, systemActor } from "@/server/modules/audit/write";

import { cookieFrom, jsonRequest, readJson } from "./http";

function requiredEnv(name: "DATABASE_URL"): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

const PASSWORD = "correct-horse-battery";

describe("URS-104 направление журнала аудита", () => {
  let sql: Sql;
  let cookie: string;

  beforeAll(async () => {
    sql = postgres(requiredEnv("DATABASE_URL"), { max: 2 });
    const passwordHash = await hashPassword(PASSWORD);
    const username = `ord-${Date.now().toString(36)}`;
    await sql`
      INSERT INTO users (username, full_name, email, password_hash, role, is_active)
      VALUES (
        ${username},
        ${username},
        ${`${username}@example.test`},
        ${passwordHash},
        ${"admin"}::user_role_enum,
        true
      )
    `;
    const login = await loginPost(
      jsonRequest("http://127.0.0.1/api/v1/auth/login", {
        method: "POST",
        body: { username, password: PASSWORD },
      }),
    );
    expect(login.status).toBe(200);
    const token = cookieFrom(login);
    expect(token).toBeTruthy();
    cookie = token as string;
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("без order и с newest — наибольшие id, с oldest — наименьшие", async () => {
    const prefix = `ord-ev-${String(Date.now())}`;
    for (let index = 0; index < 12; index += 1) {
      await appendAuditEvent(sql, systemActor(`${prefix}-${String(index)}`), {
        action: "create",
        entityType: "auth",
        entityId: null,
        entityLabel: null,
        changedFields: null,
        before: null,
        after: { n: index },
        reason: null,
      });
    }

    const newest = await getAudit(
      jsonRequest("http://127.0.0.1/api/v1/audit", { method: "GET", cookie }),
    );
    expect(newest.status).toBe(200);
    const newestBody = await readJson(newest);
    const newestItems = newestBody["items"] as Array<{ id: number }>;
    expect(newestItems.length).toBeGreaterThan(0);
    const boundsAfterNewest = await sql<[{ min: number; max: number }]>`
      SELECT min(id)::int AS min, max(id)::int AS max FROM audit_events
    `;
    expect(newestItems[0]?.id).toBe(boundsAfterNewest[0]?.max);

    const explicitNewest = await getAudit(
      jsonRequest("http://127.0.0.1/api/v1/audit?order=newest", { method: "GET", cookie }),
    );
    expect(explicitNewest.status).toBe(200);
    const explicitItems = (await readJson(explicitNewest))["items"] as Array<{ id: number }>;
    const maxAfterExplicit = await sql<[{ max: number }]>`SELECT max(id)::int AS max FROM audit_events`;
    expect(explicitItems[0]?.id).toBe(maxAfterExplicit[0]?.max);

    const oldest = await getAudit(
      jsonRequest("http://127.0.0.1/api/v1/audit?order=oldest", { method: "GET", cookie }),
    );
    expect(oldest.status).toBe(200);
    const oldestItems = (await readJson(oldest))["items"] as Array<{ id: number }>;
    expect(oldestItems.length).toBeGreaterThan(0);
    const boundsAfterOldest = await sql<[{ min: number; max: number }]>`
      SELECT min(id)::int AS min, max(id)::int AS max FROM audit_events
    `;
    expect(oldestItems[0]?.id).toBe(boundsAfterOldest[0]?.min);
    expect(oldestItems[0]?.id).not.toBe(boundsAfterOldest[0]?.max);
  });

  it("невалидный order даёт 400 VALIDATION_ERROR", async () => {
    const response = await getAudit(
      jsonRequest("http://127.0.0.1/api/v1/audit?order=asc", { method: "GET", cookie }),
    );
    expect(response.status).toBe(400);
    const body = await readJson(response);
    expect(body["code"]).toBe("VALIDATION_ERROR");
  });
});
