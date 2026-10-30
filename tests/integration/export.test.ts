import ExcelJS from "exceljs";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as exportCard } from "@/app/api/v1/systems/[id]/export/route";
import { GET as exportRegistry } from "@/app/api/v1/systems/export/route";
import { POST as createSystem } from "@/app/api/v1/systems/route";
import { POST as loginPost } from "@/app/api/v1/auth/login/route";
import { hashPassword } from "@/server/modules/auth/password";
import { resetLoginThrottleForTests } from "@/server/modules/auth/throttle";

import { cookieFrom, jsonRequest, readJson, routeParams } from "./http";

function requiredEnv(name: "DATABASE_URL"): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

const PASSWORD = "correct-horse-battery";

type SeedUser = { id: string; username: string; role: string };

async function insertUser(
  sql: Sql,
  username: string,
  role: string,
  passwordHash: string,
): Promise<SeedUser> {
  const rows = await sql<SeedUser[]>`
    INSERT INTO users (username, full_name, email, password_hash, role, is_active)
    VALUES (
      ${username},
      ${username},
      ${`${username}@example.test`},
      ${passwordHash},
      ${role}::user_role_enum,
      true
    )
    RETURNING id, username, role
  `;
  const row = rows[0];
  if (row === undefined) {
    throw new Error("failed to seed user");
  }
  return row;
}

function requestIdOf(response: Response): string {
  const header = response.headers.get("x-request-id");
  if (header === null || header.length === 0) {
    throw new Error("missing x-request-id");
  }
  return header;
}

async function loadWorkbook(data: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data as never);
  return workbook;
}

function headerCells(sheet: ExcelJS.Worksheet): string[] {
  const values = sheet.getRow(1).values;
  if (!Array.isArray(values)) {
    return [];
  }
  return values.slice(1).map((value) => String(value ?? ""));
}

function filenameOf(response: Response): string {
  const header = response.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(header);
  return match?.[1] ?? "";
}

describe("выгрузки XLSX и PDF", () => {
  let sql: Sql;
  let passwordHash: string;
  const prefix = `e${Date.now().toString(36)}`;
  let admin: SeedUser;
  let editor: SeedUser;
  let viewer: SeedUser;
  let auditor: SeedUser;

  beforeAll(async () => {
    sql = postgres(requiredEnv("DATABASE_URL"), { max: 4 });
    passwordHash = await hashPassword(PASSWORD);
    admin = await insertUser(sql, `${prefix}-admin`, "admin", passwordHash);
    editor = await insertUser(sql, `${prefix}-editor`, "editor", passwordHash);
    viewer = await insertUser(sql, `${prefix}-viewer`, "viewer", passwordHash);
    auditor = await insertUser(sql, `${prefix}-auditor`, "auditor", passwordHash);
  });

  beforeEach(() => {
    resetLoginThrottleForTests();
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  async function loginAs(username: string): Promise<string> {
    const response = await loginPost(
      jsonRequest("http://127.0.0.1/api/v1/auth/login", {
        method: "POST",
        body: { username, password: PASSWORD },
      }),
    );
    expect(response.status).toBe(200);
    const token = cookieFrom(response);
    expect(token).toBeTruthy();
    return token as string;
  }

  async function makeSystem(cookie: string): Promise<{ id: string; code: string }> {
    const response = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: {
          name: `${prefix}-lims`,
          domain: "QC",
          system_type: "LIMS",
          hosting_type: "on_prem",
          data_classification: "internal",
          is_gxp_relevant: true,
          criticality: "high",
          gxp_criticality: "high",
          gamp_category: "5",
          lifecycle_status: "active",
          validation_status: "validated",
          validated_at: "2026-03-01",
          next_review_at: "2027-03-01",
          system_owner: { user_id: admin.id },
          process_owners: [{ user_id: editor.id }],
          site: "Москва",
        },
      }),
    );
    expect(response.status).toBe(201);
    const body = await readJson(response);
    return { id: String(body["id"]), code: String(body["code"]) };
  }

  it("список XLSX содержит три листа, даты ДД.ММ.ГГГГ и пишет export", async () => {
    const cookie = await loginAs(editor.username);
    const created = await makeSystem(cookie);
    const response = await exportRegistry(
      jsonRequest(`http://127.0.0.1/api/v1/systems/export?format=xlsx&q=${created.code}`, {
        method: "GET",
        cookie,
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(filenameOf(response)).toMatch(/^cs-registry_\d{4}-\d{2}-\d{2}_\d{4}_[a-z0-9]+\.xlsx$/);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");
    const workbook = await loadWorkbook(Uint8Array.from(buffer));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Реестр",
      "Параметры выгрузки",
      "Справочники",
    ]);
    const registry = workbook.getWorksheet("Реестр");
    expect(registry).toBeDefined();
    if (registry === undefined) {
      throw new Error("missing registry sheet");
    }
    const headers = headerCells(registry);
    expect(headers[0]).toBe("ID системы");
    expect(headers.at(-1)).toBe("Служебный ключ");
    expect(headers).not.toContain("email");
    const dateIndex = headers.indexOf("Дата последней валидации") + 1;
    let foundRuDate = false;
    registry?.eachRow((row, number) => {
      if (number === 1) {
        return;
      }
      if (String(row.getCell(1).value) === created.code) {
        expect(row.getCell(dateIndex).value).toBe("01.03.2026");
        foundRuDate = true;
      }
    });
    expect(foundRuDate).toBe(true);
    const audit = await sql<[{ action: string; after: { format?: string; rowCount?: number } }]>`
      SELECT action, after FROM audit_events WHERE request_id = ${requestIdOf(response)}
    `;
    expect(audit[0]?.action).toBe("export");
    expect(audit[0]?.after.format).toBe("xlsx");
    expect(audit[0]?.after.rowCount).toBeGreaterThanOrEqual(1);
  });

  it("список PDF отдаёт файл с кириллическим шрифтом", async () => {
    const cookie = await loginAs(viewer.username);
    const response = await exportRegistry(
      jsonRequest("http://127.0.0.1/api/v1/systems/export?format=pdf", {
        method: "GET",
        cookie,
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(filenameOf(response)).toMatch(/\.pdf$/);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buffer.toString("latin1")).toContain("DejaVu");
    const audit = await sql`SELECT action FROM audit_events WHERE request_id = ${requestIdOf(response)}`;
    expect(audit[0]?.action).toBe("export");
  });

  it("карточка XLSX содержит историю и доступна аудитору", async () => {
    const editorCookie = await loginAs(editor.username);
    const created = await makeSystem(editorCookie);
    const cookie = await loginAs(auditor.username);
    const response = await exportCard(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${created.id}/export?format=xlsx`, {
        method: "GET",
        cookie,
      }),
      routeParams(created.id),
    );
    expect(response.status).toBe(200);
    const workbook = await loadWorkbook(new Uint8Array(await response.arrayBuffer()));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Карточка",
      "История",
      "Параметры выгрузки",
      "Справочники",
    ]);
    const card = workbook.getWorksheet("Карточка");
    const dumped = JSON.stringify(card?.getSheetValues() ?? []);
    expect(dumped).toContain(created.code);
    expect(dumped).toContain("01.03.2026");
    expect(dumped).not.toContain("password_hash");
  });

  it("неизвестный format — 400, без сессии — 401", async () => {
    const cookie = await loginAs(admin.username);
    const bad = await exportRegistry(
      jsonRequest("http://127.0.0.1/api/v1/systems/export?format=csv", {
        method: "GET",
        cookie,
      }),
    );
    expect(bad.status).toBe(400);
    const anon = await exportRegistry(
      jsonRequest("http://127.0.0.1/api/v1/systems/export?format=xlsx", { method: "GET" }),
    );
    expect(anon.status).toBe(401);
  });
});
