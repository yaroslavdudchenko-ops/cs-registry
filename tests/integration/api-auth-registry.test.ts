import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as getAudit } from "@/app/api/v1/audit/route";
import { POST as loginPost } from "@/app/api/v1/auth/login/route";
import { POST as logoutPost } from "@/app/api/v1/auth/logout/route";
import { POST as archivePost } from "@/app/api/v1/systems/[id]/archive/route";
import { GET as getSystem, PATCH as patchSystem } from "@/app/api/v1/systems/[id]/route";
import { GET as listSystems, POST as createSystem } from "@/app/api/v1/systems/route";
import { PATCH as patchUser } from "@/app/api/v1/users/[id]/route";
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

async function loginAs(username: string, password: string = PASSWORD): Promise<string> {
  const response = await loginPost(
    jsonRequest("http://127.0.0.1/api/v1/auth/login", {
      method: "POST",
      body: { username, password },
    }),
  );
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie") ?? "";
  expect(setCookie).toMatch(/^sid=/);
  expect(setCookie).toMatch(/HttpOnly/i);
  expect(setCookie).toMatch(/SameSite=Lax/i);
  expect(setCookie).not.toMatch(/cs-registry|cs_registry/i);
  const token = cookieFrom(response);
  expect(token).toBeTruthy();
  return token as string;
}

function systemBody(owners: { process: string; system: string; quality?: string | null }) {
  return {
    name: "Лабораторная система",
    system_type: "LIMS",
    hosting_type: "on_prem",
    data_classification: "internal",
    is_gxp_relevant: true,
    criticality: "medium",
    lifecycle_status: "active",
    validation_status: "not_validated",
    process_owner_id: owners.process,
    system_owner_id: owners.system,
    quality_owner_id: owners.quality,
    vendor: "Citroën",
  };
}

describe("auth + registry API", () => {
  let sql: Sql;
  let passwordHash: string;
  const prefix = `t${Date.now().toString(36)}`;
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

  it("вход admin даёт cookie Max-Age 1800, вход viewer — 600", async () => {
    delete process.env["SESSION_MINUTES_ADMIN"];
    delete process.env["SESSION_MINUTES_DEFAULT"];
    const adminResponse = await loginPost(
      jsonRequest("http://127.0.0.1/api/v1/auth/login", {
        method: "POST",
        body: { username: admin.username, password: PASSWORD },
      }),
    );
    const viewerResponse = await loginPost(
      jsonRequest("http://127.0.0.1/api/v1/auth/login", {
        method: "POST",
        body: { username: viewer.username, password: PASSWORD },
      }),
    );
    expect(adminResponse.status).toBe(200);
    expect(viewerResponse.status).toBe(200);
    expect(adminResponse.headers.get("set-cookie") ?? "").toMatch(/Max-Age=1800\b/);
    expect(viewerResponse.headers.get("set-cookie") ?? "").toMatch(/Max-Age=600\b/);
  });

  it("неверный логин и неверный пароль отвечают одинаково", async () => {
    const missing = await loginPost(
      jsonRequest("http://127.0.0.1/api/v1/auth/login", {
        method: "POST",
        body: { username: `${prefix}-nobody`, password: PASSWORD },
      }),
    );
    const wrong = await loginPost(
      jsonRequest("http://127.0.0.1/api/v1/auth/login", {
        method: "POST",
        body: { username: editor.username, password: "definitely-wrong-password" },
      }),
    );
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    const missingBody = await readJson(missing);
    const wrongBody = await readJson(wrong);
    expect(missingBody["message"]).toBe(wrongBody["message"]);
    expect(missingBody["code"]).toBe("UNAUTHORIZED");
  });

  it("после 5 неудач шестая попытка с верным паролем — 423 AUTH_LOCKED", async () => {
    const username = `${prefix}-lock`;
    await insertUser(sql, username, "viewer", passwordHash);
    for (let i = 0; i < 5; i += 1) {
      const failed = await loginPost(
        jsonRequest("http://127.0.0.1/api/v1/auth/login", {
          method: "POST",
          body: { username, password: "wrong-password-xx" },
        }),
      );
      expect(failed.status).toBe(401);
    }
    const locked = await loginPost(
      jsonRequest("http://127.0.0.1/api/v1/auth/login", {
        method: "POST",
        body: { username, password: PASSWORD },
      }),
    );
    expect(locked.status).toBe(423);
    const body = await readJson(locked);
    expect(body["code"]).toBe("AUTH_LOCKED");
    expect(cookieFrom(locked)).toBeNull();
    const events = await sql`
      SELECT action FROM audit_events
      WHERE entity_label = ${username} AND action = 'login_failed'
    `;
    expect(events.length).toBeGreaterThanOrEqual(5);
  });

  it("создание без владельцев — 422 OWNERS_REQUIRED и отказ в аудите, строки нет", async () => {
    const cookie = await loginAs(editor.username);
    const before = await sql`SELECT count(*)::int AS n FROM systems`;
    const response = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: {
          name: "Без владельцев",
          system_type: "LIMS",
          hosting_type: "on_prem",
          data_classification: "internal",
          is_gxp_relevant: false,
          criticality: "low",
          lifecycle_status: "planned",
          validation_status: "not_required",
        },
      }),
    );
    expect(response.status).toBe(422);
    const body = await readJson(response);
    expect(body["code"]).toBe("OWNERS_REQUIRED");
    const after = await sql`SELECT count(*)::int AS n FROM systems`;
    expect(after[0]?.n).toBe(before[0]?.n);
    const refusal = await sql`
      SELECT after FROM audit_events
      WHERE request_id = ${String(body["requestId"])} AND after->>'code' = 'OWNERS_REQUIRED'
    `;
    expect(refusal).toHaveLength(1);
  });

  it("параллельное создание не даёт дубль кода", async () => {
    const cookie = await loginAs(editor.username);
    const payload = systemBody({ process: editor.id, system: admin.id });
    const [first, second] = await Promise.all([
      createSystem(
        jsonRequest("http://127.0.0.1/api/v1/systems", {
          method: "POST",
          cookie,
          body: { ...payload, name: "Параллель А" },
        }),
      ),
      createSystem(
        jsonRequest("http://127.0.0.1/api/v1/systems", {
          method: "POST",
          cookie,
          body: { ...payload, name: "Параллель Б" },
        }),
      ),
    ]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const a = await readJson(first);
    const b = await readJson(second);
    expect(a["code"]).not.toBe(b["code"]);
    expect(String(a["code"])).toMatch(/^SYS-\d{4,}$/);
    expect(String(b["code"])).toMatch(/^SYS-\d{4,}$/);
  });

  it("PATCH со старым version — 409 VERSION_CONFLICT", async () => {
    const cookie = await loginAs(editor.username);
    const created = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: { ...systemBody({ process: editor.id, system: admin.id }), name: "Версия" },
      }),
    );
    const row = await readJson(created);
    const id = String(row["id"]);
    const ok = await patchSystem(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}`, {
        method: "PATCH",
        cookie,
        body: { version: row["version"], name: "Версия 2" },
      }),
      routeParams(id),
    );
    expect(ok.status).toBe(200);
    const stale = await patchSystem(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}`, {
        method: "PATCH",
        cookie,
        body: { version: row["version"], name: "Версия 3" },
      }),
      routeParams(id),
    );
    expect(stale.status).toBe(409);
    const body = await readJson(stale);
    expect(body["code"]).toBe("VERSION_CONFLICT");
  });

  it("viewer и auditor не могут писать — 403", async () => {
    const payload = systemBody({ process: editor.id, system: admin.id });
    for (const username of [viewer.username, auditor.username]) {
      const cookie = await loginAs(username);
      const created = await createSystem(
        jsonRequest("http://127.0.0.1/api/v1/systems", {
          method: "POST",
          cookie,
          body: { ...payload, name: "Запрет" },
        }),
      );
      expect(created.status).toBe(403);
      const body = await readJson(created);
      expect(body["code"]).toBe("FORBIDDEN");
    }
  });

  it("auditor читает журнал, viewer нет", async () => {
    const viewerCookie = await loginAs(viewer.username);
    const auditorCookie = await loginAs(auditor.username);
    const denied = await getAudit(
      jsonRequest("http://127.0.0.1/api/v1/audit", { method: "GET", cookie: viewerCookie }),
    );
    expect(denied.status).toBe(403);
    const allowed = await getAudit(
      jsonRequest("http://127.0.0.1/api/v1/audit", { method: "GET", cookie: auditorCookie }),
    );
    expect(allowed.status).toBe(200);
    const body = await readJson(allowed);
    expect(Array.isArray(body["items"])).toBe(true);
  });

  it("журнал фильтрует объект по коду и имени, а не по UUID в UI-параметре", async () => {
    const editorCookie = await loginAs(editor.username);
    const unique = `${prefix}-obj`;
    const created = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie: editorCookie,
        body: {
          ...systemBody({ process: editor.id, system: admin.id }),
          name: unique,
        },
      }),
    );
    expect(created.status).toBe(201);
    const row = await readJson(created);
    const id = String(row["id"]);
    const code = String(row["code"]);

    const other = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie: editorCookie,
        body: {
          ...systemBody({ process: editor.id, system: admin.id }),
          name: `${prefix}-other`,
        },
      }),
    );
    expect(other.status).toBe(201);
    const otherId = String((await readJson(other))["id"]);

    const adminCookie = await loginAs(admin.username);
    type AuditItem = { entity_id: string | null; entity_label: string | null; action: string };

    const byCode = await getAudit(
      jsonRequest(
        `http://127.0.0.1/api/v1/audit?entityLabel=${encodeURIComponent(code.toLowerCase())}&pageSize=100`,
        { method: "GET", cookie: adminCookie },
      ),
    );
    expect(byCode.status).toBe(200);
    const codeItems = (await readJson(byCode))["items"] as AuditItem[];
    expect(codeItems.length).toBeGreaterThan(0);
    expect(codeItems.every((item) => item.entity_id === id)).toBe(true);
    expect(codeItems.some((item) => item.entity_id === otherId)).toBe(false);

    const byName = await getAudit(
      jsonRequest(
        `http://127.0.0.1/api/v1/audit?entityLabel=${encodeURIComponent(unique.toUpperCase())}&pageSize=100`,
        { method: "GET", cookie: adminCookie },
      ),
    );
    expect(byName.status).toBe(200);
    const nameItems = (await readJson(byName))["items"] as AuditItem[];
    expect(nameItems.length).toBeGreaterThan(0);
    expect(nameItems.every((item) => (item.entity_label ?? "").includes(unique))).toBe(true);

    const wildcard = await getAudit(
      jsonRequest(
        `http://127.0.0.1/api/v1/audit?entityLabel=${encodeURIComponent("%")}&pageSize=100`,
        { method: "GET", cookie: adminCookie },
      ),
    );
    expect(wildcard.status).toBe(200);
    const wildItems = (await readJson(wildcard))["items"] as AuditItem[];
    expect(wildItems.every((item) => (item.entity_label ?? "").includes("%"))).toBe(true);

    const byId = await getAudit(
      jsonRequest(
        `http://127.0.0.1/api/v1/audit?entityId=${id}&pageSize=100`,
        { method: "GET", cookie: adminCookie },
      ),
    );
    expect(byId.status).toBe(200);
    const idItems = (await readJson(byId))["items"] as AuditItem[];
    expect(idItems.length).toBeGreaterThan(0);
    expect(idItems.every((item) => item.entity_id === id)).toBe(true);
  });

  it("поиск находит кириллицу и латиницу без диакритики", async () => {
    const cookie = await loginAs(editor.username);
    const created = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: {
          ...systemBody({ process: editor.id, system: admin.id }),
          name: "Альфа-контроль",
          vendor: "Citroën",
        },
      }),
    );
    expect(created.status).toBe(201);
    const cyr = await listSystems(
      jsonRequest("http://127.0.0.1/api/v1/systems?q=альф", { method: "GET", cookie }),
    );
    const lat = await listSystems(
      jsonRequest("http://127.0.0.1/api/v1/systems?q=Citroen", { method: "GET", cookie }),
    );
    expect(cyr.status).toBe(200);
    expect(lat.status).toBe(200);
    const cyrBody = await readJson(cyr);
    const latBody = await readJson(lat);
    const cyrItems = cyrBody["items"] as Array<{ name: string }>;
    const latItems = latBody["items"] as Array<{ vendor?: string; name: string }>;
    expect(cyrItems.some((item) => item.name.includes("Альфа"))).toBe(true);
    expect(latItems.some((item) => item.name.includes("Альфа") || item.vendor === "Citroën")).toBe(
      true,
    );
  });

  it("карточка не содержит password_hash и mfa_secret", async () => {
    const cookie = await loginAs(editor.username);
    const created = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: { ...systemBody({ process: editor.id, system: admin.id }), name: "Карточка" },
      }),
    );
    const row = await readJson(created);
    const id = String(row["id"]);
    const card = await getSystem(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}`, { method: "GET", cookie }),
      routeParams(id),
    );
    const body = await readJson(card);
    expect(card.status).toBe(200);
    expect(body).not.toHaveProperty("password_hash");
    expect(body).not.toHaveProperty("mfa_secret");
    expect(body["process_owner_name"]).toBe(editor.username);
    expect(body["system_owner_name"]).toBe(admin.username);
  });

  it("editor не меняет validation_status — 403, не 422", async () => {
    const cookie = await loginAs(editor.username);
    const created = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: { ...systemBody({ process: editor.id, system: admin.id }), name: "Валидация" },
      }),
    );
    const row = await readJson(created);
    const id = String(row["id"]);
    const patched = await patchSystem(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}`, {
        method: "PATCH",
        cookie,
        body: {
          version: row["version"],
          validation_status: "validated",
          reason: "попытка редактора",
        },
      }),
      routeParams(id),
    );
    expect(patched.status).toBe(403);
  });

  it("архив без причины — 422, logout отзывает cookie", async () => {
    const cookie = await loginAs(editor.username);
    const created = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: { ...systemBody({ process: editor.id, system: admin.id }), name: "Архив" },
      }),
    );
    const row = await readJson(created);
    const id = String(row["id"]);
    const archived = await archivePost(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/archive`, {
        method: "POST",
        cookie,
        body: {},
      }),
      routeParams(id),
    );
    expect(archived.status).toBe(422);
    const logout = await logoutPost(
      jsonRequest("http://127.0.0.1/api/v1/auth/logout", { method: "POST", cookie }),
    );
    expect(logout.status).toBe(204);
    const after = await listSystems(
      jsonRequest("http://127.0.0.1/api/v1/systems", { method: "GET", cookie }),
    );
    expect(after.status).toBe(401);
  });

  it("деактивация отзывает сессии — 401", async () => {
    const username = `${prefix}-gone`;
    const user = await insertUser(sql, username, "viewer", passwordHash);
    const cookie = await loginAs(username);
    const adminCookie = await loginAs(admin.username);
    const current = await sql<{ version: number }[]>`SELECT version FROM users WHERE id = ${user.id}`;
    const deactivated = await patchUser(
      jsonRequest(`http://127.0.0.1/api/v1/users/${user.id}`, {
        method: "PATCH",
        cookie: adminCookie,
        body: {
          version: current[0]?.version,
          is_active: false,
          reason: "увольнение",
        },
      }),
      routeParams(user.id),
    );
    expect(deactivated.status).toBe(200);
    const ping = await listSystems(
      jsonRequest("http://127.0.0.1/api/v1/systems", { method: "GET", cookie }),
    );
    expect(ping.status).toBe(401);
  });
});
