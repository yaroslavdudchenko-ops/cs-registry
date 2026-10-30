import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as getAudit } from "@/app/api/v1/audit/route";
import { POST as loginPost } from "@/app/api/v1/auth/login/route";
import { POST as logoutPost } from "@/app/api/v1/auth/logout/route";
import { POST as archivePost } from "@/app/api/v1/systems/[id]/archive/route";
import { GET as getHistory } from "@/app/api/v1/systems/[id]/history/route";
import { POST as restorePost } from "@/app/api/v1/systems/[id]/restore/route";
import { GET as getSystem, PATCH as patchSystem } from "@/app/api/v1/systems/[id]/route";
import { GET as exportRegistry } from "@/app/api/v1/systems/export/route";
import { GET as listSystems, POST as createSystem } from "@/app/api/v1/systems/route";
import { PATCH as patchUser } from "@/app/api/v1/users/[id]/route";
import { GET as listUsers, POST as createUser } from "@/app/api/v1/users/route";
import { AUDIT_ACTIONS } from "@/server/db/enums";
import { hashPassword } from "@/server/modules/auth/password";
import {
  PERMISSIONS,
  PERMISSION_AUDIT_ACTIONS,
  type Permission,
} from "@/server/modules/auth/rbac";
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

describe("URS-095 покрытие аудита", () => {
  let sql: Sql;
  let passwordHash: string;
  const prefix = `c${Date.now().toString(36)}`;
  let admin: SeedUser;
  let editor: SeedUser;
  let seq = 0;

  beforeAll(async () => {
    sql = postgres(requiredEnv("DATABASE_URL"), { max: 4 });
    passwordHash = await hashPassword(PASSWORD);
    admin = await insertUser(sql, `${prefix}-admin`, "admin", passwordHash);
    editor = await insertUser(sql, `${prefix}-editor`, "editor", passwordHash);
  });

  beforeEach(() => {
    resetLoginThrottleForTests();
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  async function loginAs(username: string, password: string = PASSWORD): Promise<string> {
    const response = await loginPost(
      jsonRequest("http://127.0.0.1/api/v1/auth/login", {
        method: "POST",
        body: { username, password },
      }),
    );
    expect(response.status).toBe(200);
    const token = cookieFrom(response);
    expect(token).toBeTruthy();
    return token as string;
  }

  function nextName(label: string): string {
    seq += 1;
    return `${prefix}-${label}-${seq}`;
  }

  async function makeSystem(cookie: string): Promise<{ id: string; version: number }> {
    const response = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: {
          name: nextName("sys"),
          domain: "QC",
          system_type: "LIMS",
          hosting_type: "on_prem",
          data_classification: "internal",
          is_gxp_relevant: false,
          criticality: "low",
          lifecycle_status: "planned",
          validation_status: "not_required",
          system_owner: { user_id: admin.id },
          process_owners: [{ user_id: editor.id }],
        },
      }),
    );
    expect(response.status).toBe(201);
    const body = await readJson(response);
    return { id: String(body["id"]), version: Number(body["version"]) };
  }

  it("константа RBAC и карта аудита совпадают по ключам", () => {
    expect(Object.keys(PERMISSION_AUDIT_ACTIONS).sort()).toEqual([...PERMISSIONS].sort());
  });

  it("каждый защищённый эндпоинт из матрицы пишет событие с тем же request_id", async () => {
    const runners: Record<Permission, () => Promise<{ status: number; requestId: string }>> = {
      "systems.read": async () => {
        const cookie = await loginAs(editor.username);
        const system = await makeSystem(cookie);
        const listed = await listSystems(
          jsonRequest("http://127.0.0.1/api/v1/systems", { method: "GET", cookie }),
        );
        expect(listed.status).toBe(200);
        const response = await getSystem(
          jsonRequest(`http://127.0.0.1/api/v1/systems/${system.id}`, { method: "GET", cookie }),
          routeParams(system.id),
        );
        return { status: response.status, requestId: requestIdOf(response) };
      },
      "systems.read_history": async () => {
        const cookie = await loginAs(editor.username);
        const system = await makeSystem(cookie);
        const response = await getHistory(
          jsonRequest(`http://127.0.0.1/api/v1/systems/${system.id}/history`, {
            method: "GET",
            cookie,
          }),
          routeParams(system.id),
        );
        return { status: response.status, requestId: requestIdOf(response) };
      },
      "systems.create": async () => {
        const cookie = await loginAs(editor.username);
        const response = await createSystem(
          jsonRequest("http://127.0.0.1/api/v1/systems", {
            method: "POST",
            cookie,
            body: {
              name: nextName("create"),
              domain: "ADM",
              system_type: "ERP",
              hosting_type: "cloud",
              data_classification: "internal",
              is_gxp_relevant: false,
              criticality: "low",
              lifecycle_status: "planned",
              validation_status: "not_required",
              system_owner: { user_id: admin.id },
              process_owners: [{ user_id: editor.id }],
            },
          }),
        );
        return { status: response.status, requestId: requestIdOf(response) };
      },
      "systems.update": async () => {
        const cookie = await loginAs(editor.username);
        const system = await makeSystem(cookie);
        const response = await patchSystem(
          jsonRequest(`http://127.0.0.1/api/v1/systems/${system.id}`, {
            method: "PATCH",
            cookie,
            body: { version: system.version, name: nextName("upd") },
          }),
          routeParams(system.id),
        );
        return { status: response.status, requestId: requestIdOf(response) };
      },
      "systems.change_validation_status": async () => {
        const cookie = await loginAs(admin.username);
        const editorCookie = await loginAs(editor.username);
        const system = await makeSystem(editorCookie);
        const response = await patchSystem(
          jsonRequest(`http://127.0.0.1/api/v1/systems/${system.id}`, {
            method: "PATCH",
            cookie,
            body: {
              version: system.version,
              validation_status: "in_validation",
              reason: "старт валидации",
            },
          }),
          routeParams(system.id),
        );
        return { status: response.status, requestId: requestIdOf(response) };
      },
      "systems.archive": async () => {
        const cookie = await loginAs(editor.username);
        const system = await makeSystem(cookie);
        const response = await archivePost(
          jsonRequest(`http://127.0.0.1/api/v1/systems/${system.id}/archive`, {
            method: "POST",
            cookie,
            body: { reason: "архив покрытия", version: system.version },
          }),
          routeParams(system.id),
        );
        return { status: response.status, requestId: requestIdOf(response) };
      },
      "systems.export": async () => {
        const cookie = await loginAs(editor.username);
        const response = await exportRegistry(
          jsonRequest("http://127.0.0.1/api/v1/systems/export?format=xlsx", {
            method: "GET",
            cookie,
          }),
        );
        return { status: response.status, requestId: requestIdOf(response) };
      },
      "systems.restore": async () => {
        const cookie = await loginAs(editor.username);
        const system = await makeSystem(cookie);
        const archived = await archivePost(
          jsonRequest(`http://127.0.0.1/api/v1/systems/${system.id}/archive`, {
            method: "POST",
            cookie,
            body: { reason: "архив перед restore", version: system.version },
          }),
          routeParams(system.id),
        );
        const archivedBody = await readJson(archived);
        const response = await restorePost(
          jsonRequest(`http://127.0.0.1/api/v1/systems/${system.id}/restore`, {
            method: "POST",
            cookie,
            body: { reason: "возврат покрытия", version: archivedBody["version"] },
          }),
          routeParams(system.id),
        );
        return { status: response.status, requestId: requestIdOf(response) };
      },
      "audit.read": async () => {
        const cookie = await loginAs(admin.username);
        const response = await getAudit(
          jsonRequest("http://127.0.0.1/api/v1/audit?pageSize=10", { method: "GET", cookie }),
        );
        return { status: response.status, requestId: requestIdOf(response) };
      },
      "users.read": async () => {
        const cookie = await loginAs(admin.username);
        const response = await listUsers(
          jsonRequest("http://127.0.0.1/api/v1/users", { method: "GET", cookie }),
        );
        return { status: response.status, requestId: requestIdOf(response) };
      },
      "users.create": async () => {
        const cookie = await loginAs(admin.username);
        const username = nextName("user");
        const response = await createUser(
          jsonRequest("http://127.0.0.1/api/v1/users", {
            method: "POST",
            cookie,
            body: {
              username,
              full_name: username,
              email: `${username}@example.test`,
              password: PASSWORD,
              role: "viewer",
            },
          }),
        );
        return { status: response.status, requestId: requestIdOf(response) };
      },
      "users.update": async () => {
        const cookie = await loginAs(admin.username);
        const username = nextName("patch");
        const created = await createUser(
          jsonRequest("http://127.0.0.1/api/v1/users", {
            method: "POST",
            cookie,
            body: {
              username,
              full_name: username,
              email: `${username}@example.test`,
              password: PASSWORD,
              role: "viewer",
            },
          }),
        );
        const user = await readJson(created);
        const response = await patchUser(
          jsonRequest(`http://127.0.0.1/api/v1/users/${String(user["id"])}`, {
            method: "PATCH",
            cookie,
            body: { version: user["version"], full_name: `${username} Jr` },
          }),
          routeParams(String(user["id"])),
        );
        return { status: response.status, requestId: requestIdOf(response) };
      },
      "auth.logout": async () => {
        const cookie = await loginAs(editor.username);
        const response = await logoutPost(
          jsonRequest("http://127.0.0.1/api/v1/auth/logout", { method: "POST", cookie }),
        );
        return { status: response.status, requestId: requestIdOf(response) };
      },
    };

    expect(Object.keys(runners).sort()).toEqual([...PERMISSIONS].sort());

    for (const permission of PERMISSIONS) {
      const expected = PERMISSION_AUDIT_ACTIONS[permission];
      const result = await runners[permission]();
      expect(result.status, permission).toBeGreaterThanOrEqual(200);
      expect(result.status, permission).toBeLessThan(300);
      if (expected === null) {
        continue;
      }
      const rows = await sql<[{ action: string }]>`
        SELECT action FROM audit_events
        WHERE request_id = ${result.requestId} AND action = ${expected}
      `;
      expect(rows, `${permission} → ${expected} @ ${result.requestId}`).toHaveLength(1);
    }
  });

  it("создание, деактивация, активация, смена роли и сброс пароля пишут разные action", async () => {
    const cookie = await loginAs(admin.username);
    const username = nextName("acct");
    const created = await createUser(
      jsonRequest("http://127.0.0.1/api/v1/users", {
        method: "POST",
        cookie,
        body: {
          username,
          full_name: username,
          email: `${username}@example.test`,
          password: PASSWORD,
          role: "viewer",
        },
      }),
    );
    expect(created.status).toBe(201);
    let user = await readJson(created);
    const id = String(user["id"]);
    expect((await sql`SELECT action FROM audit_events WHERE request_id = ${requestIdOf(created)}`)[0]?.action).toBe(
      "create",
    );

    const deactivated = await patchUser(
      jsonRequest(`http://127.0.0.1/api/v1/users/${id}`, {
        method: "PATCH",
        cookie,
        body: { version: user["version"], is_active: false, reason: "деактивация покрытия" },
      }),
      routeParams(id),
    );
    expect(deactivated.status).toBe(200);
    user = await readJson(deactivated);
    expect(
      (await sql`SELECT action FROM audit_events WHERE request_id = ${requestIdOf(deactivated)}`)[0]
        ?.action,
    ).toBe("deactivate");

    const activated = await patchUser(
      jsonRequest(`http://127.0.0.1/api/v1/users/${id}`, {
        method: "PATCH",
        cookie,
        body: { version: user["version"], is_active: true },
      }),
      routeParams(id),
    );
    expect(activated.status).toBe(200);
    user = await readJson(activated);
    expect(
      (await sql`SELECT action FROM audit_events WHERE request_id = ${requestIdOf(activated)}`)[0]
        ?.action,
    ).toBe("activate");

    const roleChanged = await patchUser(
      jsonRequest(`http://127.0.0.1/api/v1/users/${id}`, {
        method: "PATCH",
        cookie,
        body: { version: user["version"], role: "editor", reason: "смена роли покрытия" },
      }),
      routeParams(id),
    );
    expect(roleChanged.status).toBe(200);
    user = await readJson(roleChanged);
    expect(
      (await sql`SELECT action FROM audit_events WHERE request_id = ${requestIdOf(roleChanged)}`)[0]
        ?.action,
    ).toBe("role_change");

    const reset = await patchUser(
      jsonRequest(`http://127.0.0.1/api/v1/users/${id}`, {
        method: "PATCH",
        cookie,
        body: { version: user["version"], password: "new-horse-battery-staple" },
      }),
      routeParams(id),
    );
    expect(reset.status).toBe(200);
    const resetRow = await sql<[{ action: string; before: unknown; after: unknown }]>`
      SELECT action, before, after FROM audit_events WHERE request_id = ${requestIdOf(reset)}
    `;
    expect(resetRow[0]?.action).toBe("password_reset");
    expect(JSON.stringify(resetRow[0]?.before)).not.toMatch(/argon2/i);
    expect(JSON.stringify(resetRow[0]?.after)).not.toMatch(/argon2/i);
  });

  it("вход и неудачный вход пишут login / login_failed с request_id ответа", async () => {
    const ok = await loginPost(
      jsonRequest("http://127.0.0.1/api/v1/auth/login", {
        method: "POST",
        body: { username: editor.username, password: PASSWORD },
      }),
    );
    expect(ok.status).toBe(200);
    const okRows = await sql`SELECT action FROM audit_events WHERE request_id = ${requestIdOf(ok)} AND action = 'login'`;
    expect(okRows).toHaveLength(1);

    const failed = await loginPost(
      jsonRequest("http://127.0.0.1/api/v1/auth/login", {
        method: "POST",
        body: { username: editor.username, password: "wrong-password-xx" },
      }),
    );
    expect(failed.status).toBe(401);
    const failedRows = await sql`
      SELECT action FROM audit_events
      WHERE request_id = ${requestIdOf(failed)} AND action = 'login_failed'
    `;
    expect(failedRows).toHaveLength(1);
  });

  it("перечень action в коде совпадает с FS, включая export", () => {
    expect(AUDIT_ACTIONS).toContain("export");
    expect(AUDIT_ACTIONS).toContain("read_system_history");
    expect((PERMISSIONS as readonly string[]).includes("systems.export")).toBe(true);
  });
});
