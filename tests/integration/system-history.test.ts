import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as getAudit } from "@/app/api/v1/audit/route";
import { POST as loginPost } from "@/app/api/v1/auth/login/route";
import { POST as archivePost } from "@/app/api/v1/systems/[id]/archive/route";
import { GET as exportCard } from "@/app/api/v1/systems/[id]/export/route";
import { GET as getHistory } from "@/app/api/v1/systems/[id]/history/route";
import { POST as restorePost } from "@/app/api/v1/systems/[id]/restore/route";
import { PATCH as patchSystem } from "@/app/api/v1/systems/[id]/route";
import { POST as createSystem } from "@/app/api/v1/systems/route";
import {
  listAuditEvents,
  listObjectHistory,
  OBJECT_HISTORY_EXCLUDED_ACTIONS,
} from "@/server/modules/audit/read";
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

type HistoryItem = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

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

function systemBody(owners: { process: string; system: string }, name: string) {
  return {
    name,
    domain: "QC",
    system_type: "LIMS",
    hosting_type: "on_prem",
    data_classification: "internal",
    is_gxp_relevant: true,
    criticality: "medium",
    gxp_criticality: "medium",
    gamp_category: "5",
    lifecycle_status: "active",
    validation_status: "in_validation",
    system_owner: { user_id: owners.system },
    process_owners: [{ user_id: owners.process }],
  };
}

describe("история объекта КС", () => {
  let sql: Sql;
  let passwordHash: string;
  const prefix = `h${Date.now().toString(36)}`;
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

  it("создание + две правки + архив + восстановление → два GET history с total=5 и тем же набором id", async () => {
    const cookie = await loginAs(editor.username);
    const created = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: systemBody({ process: editor.id, system: admin.id }, "История А"),
      }),
    );
    expect(created.status).toBe(201);
    const row = await readJson(created);
    const id = String(row["id"]);
    let version = Number(row["version"]);

    const other = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: systemBody({ process: editor.id, system: admin.id }, "История Б"),
      }),
    );
    expect(other.status).toBe(201);
    const otherId = String((await readJson(other))["id"]);

    const patch1 = await patchSystem(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}`, {
        method: "PATCH",
        cookie,
        body: { version, name: "История А · правка 1" },
      }),
      routeParams(id),
    );
    expect(patch1.status).toBe(200);
    version = Number((await readJson(patch1))["version"]);

    const patch2 = await patchSystem(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}`, {
        method: "PATCH",
        cookie,
        body: { version, vendor: "Vendor-2" },
      }),
      routeParams(id),
    );
    expect(patch2.status).toBe(200);
    version = Number((await readJson(patch2))["version"]);

    const archived = await archivePost(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/archive`, {
        method: "POST",
        cookie,
        body: { reason: "архив для истории", version },
      }),
      routeParams(id),
    );
    expect(archived.status).toBe(200);
    version = Number((await readJson(archived))["version"]);

    const restored = await restorePost(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/restore`, {
        method: "POST",
        cookie,
        body: { reason: "возврат из архива", version },
      }),
      routeParams(id),
    );
    expect(restored.status).toBe(200);

    const historyRes = await getHistory(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/history`, { method: "GET", cookie }),
      routeParams(id),
    );
    expect(historyRes.status).toBe(200);
    const history = await readJson(historyRes);
    const items = history["items"] as HistoryItem[];
    expect(history["page"]).toBe(1);
    expect(history["pageSize"]).toBe(50);
    expect(history["total"]).toBe(5);
    expect(items).toHaveLength(5);
    expect(items.map((item) => item.action)).toEqual([
      "restore",
      "archive",
      "update",
      "update",
      "create",
    ]);
    for (let i = 1; i < items.length; i += 1) {
      const newer = items[i - 1];
      const older = items[i];
      expect(newer).toBeDefined();
      expect(older).toBeDefined();
      expect(newer?.id).toBeGreaterThan(older?.id as number);
    }
    expect(items.every((item) => item.entity_type === "systems" && item.entity_id === id)).toBe(
      true,
    );
    expect(items.some((item) => item.entity_id === otherId)).toBe(false);
    expect(items.some((item) => item.action === "read_system_history")).toBe(false);

    const historyRes2 = await getHistory(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/history`, { method: "GET", cookie }),
      routeParams(id),
    );
    expect(historyRes2.status).toBe(200);
    const history2 = await readJson(historyRes2);
    const items2 = history2["items"] as HistoryItem[];
    expect(history2["total"]).toBe(5);
    expect(history2["total"]).toBe(history["total"]);
    expect(items2.map((item) => item.id).sort((a, b) => a - b)).toEqual(
      items.map((item) => item.id).sort((a, b) => a - b),
    );
    expect(items2.some((item) => item.action === "read_system_history")).toBe(false);

    const requestId = historyRes.headers.get("x-request-id");
    expect(requestId).toBeTruthy();
    const readEvents = await sql<[{ action: string }]>`
      SELECT action FROM audit_events
      WHERE request_id = ${requestId as string} AND action = 'read_system_history'
    `;
    expect(readEvents).toHaveLength(1);
    const storedReads = await sql<[{ n: number }]>`
      SELECT count(*)::int AS n FROM audit_events
      WHERE entity_id = ${id} AND action = 'read_system_history'
    `;
    expect(storedReads[0]?.n).toBeGreaterThanOrEqual(2);

    const adminCookie = await loginAs(admin.username);
    const auditRes = await getAudit(
      jsonRequest(`http://127.0.0.1/api/v1/audit?entityType=systems&entityId=${id}&pageSize=100`, {
        method: "GET",
        cookie: adminCookie,
      }),
    );
    expect(auditRes.status).toBe(200);
    const auditBody = await readJson(auditRes);
    const auditItems = (auditBody["items"] as HistoryItem[]).filter(
      (item) =>
        !(OBJECT_HISTORY_EXCLUDED_ACTIONS as readonly string[]).includes(item.action),
    );
    const historyIds = items.map((item) => item.id).sort((a, b) => a - b);
    const auditIds = auditItems.map((item) => item.id).sort((a, b) => a - b);
    expect(historyIds).toEqual(auditIds);
  });

  it("снимок create и смена владельца содержат ФИО, а не прочерк", async () => {
    const cookie = await loginAs(editor.username);
    const created = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: systemBody({ process: editor.id, system: admin.id }, "Владельцы в истории"),
      }),
    );
    expect(created.status).toBe(201);
    const row = await readJson(created);
    const id = String(row["id"]);
    const version = Number(row["version"]);

    const historyRes = await getHistory(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/history`, { method: "GET", cookie }),
      routeParams(id),
    );
    expect(historyRes.status).toBe(200);
    const createdEvent = ((await readJson(historyRes))["items"] as HistoryItem[]).find(
      (item) => item.action === "create",
    );
    expect(createdEvent).toBeDefined();
    expect(createdEvent?.after?.["process_owner_name"]).toBe(editor.username);
    expect(createdEvent?.after?.["system_owner_name"]).toBe(admin.username);
    expect(createdEvent?.after?.["process_owner_name"]).not.toBe("");
    expect(createdEvent?.after?.["system_owner_name"]).not.toBe("");
    expect(createdEvent?.after?.["process_owner_name"]).not.toBe("—");
    expect(createdEvent?.after?.["system_owner_name"]).not.toBe("—");

    const patched = await patchSystem(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}`, {
        method: "PATCH",
        cookie,
        body: { version, process_owners: [{ user_id: viewer.id }], reason: "Передача владельца" },
      }),
      routeParams(id),
    );
    expect(patched.status).toBe(200);

    const afterPatch = await getHistory(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/history`, { method: "GET", cookie }),
      routeParams(id),
    );
    expect(afterPatch.status).toBe(200);
    const updateEvent = ((await readJson(afterPatch))["items"] as HistoryItem[]).find(
      (item) => item.action === "update",
    );
    expect(updateEvent).toBeDefined();
    const before = updateEvent?.before?.["process_owners"] as Array<{ full_name: string }> | undefined;
    const after = updateEvent?.after?.["process_owners"] as Array<{ full_name: string }> | undefined;
    expect(before?.[0]?.full_name).toBe(editor.username);
    expect(after?.[0]?.full_name).toBe(viewer.username);
  });

  it("выгрузка карточки не растит ленту; export остаётся в общем журнале у admin и auditor", async () => {
    const cookie = await loginAs(editor.username);
    const created = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: systemBody({ process: editor.id, system: admin.id }, "Выгрузка истории"),
      }),
    );
    expect(created.status).toBe(201);
    const id = String((await readJson(created))["id"]);

    const beforeRes = await getHistory(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/history`, { method: "GET", cookie }),
      routeParams(id),
    );
    expect(beforeRes.status).toBe(200);
    const before = await readJson(beforeRes);
    const beforeItems = before["items"] as HistoryItem[];
    expect(before["total"]).toBe(1);
    expect(beforeItems.map((item) => item.action)).toEqual(["create"]);

    const xlsx = await exportCard(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/export?format=xlsx`, {
        method: "GET",
        cookie,
      }),
      routeParams(id),
    );
    expect(xlsx.status).toBe(200);
    const pdf = await exportCard(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/export?format=pdf`, {
        method: "GET",
        cookie,
      }),
      routeParams(id),
    );
    expect(pdf.status).toBe(200);

    const historyRes1 = await getHistory(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/history`, { method: "GET", cookie }),
      routeParams(id),
    );
    const historyRes2 = await getHistory(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/history`, { method: "GET", cookie }),
      routeParams(id),
    );
    expect(historyRes1.status).toBe(200);
    expect(historyRes2.status).toBe(200);
    const history1 = await readJson(historyRes1);
    const history2 = await readJson(historyRes2);
    const items1 = history1["items"] as HistoryItem[];
    const items2 = history2["items"] as HistoryItem[];
    expect(history1["total"]).toBe(1);
    expect(history2["total"]).toBe(history1["total"]);
    expect(history1["total"]).toBe(before["total"]);
    expect(items1.map((item) => item.id).sort((a, b) => a - b)).toEqual(
      items2.map((item) => item.id).sort((a, b) => a - b),
    );
    expect(items1.map((item) => item.id).sort((a, b) => a - b)).toEqual(
      beforeItems.map((item) => item.id).sort((a, b) => a - b),
    );
    expect(items1.some((item) => item.action === "export")).toBe(false);
    expect(items1.some((item) => item.action === "read_system_history")).toBe(false);

    const storedExports = await sql<[{ n: number }]>`
      SELECT count(*)::int AS n FROM audit_events
      WHERE entity_id = ${id} AND action = 'export'
    `;
    expect(storedExports[0]?.n).toBe(2);

    async function auditExports(asUsername: string): Promise<HistoryItem[]> {
      const auditCookie = await loginAs(asUsername);
      const response = await getAudit(
        jsonRequest(
          `http://127.0.0.1/api/v1/audit?entityType=systems&entityId=${id}&action=export&pageSize=100`,
          { method: "GET", cookie: auditCookie },
        ),
      );
      expect(response.status).toBe(200);
      const body = await readJson(response);
      return (body["items"] as HistoryItem[]).filter((item) => item.action === "export");
    }

    const asAdmin = await auditExports(admin.username);
    const asAuditor = await auditExports(auditor.username);
    expect(asAdmin.length).toBeGreaterThanOrEqual(2);
    expect(asAuditor.length).toBeGreaterThanOrEqual(2);
    expect(asAdmin.every((item) => item.entity_id === id)).toBe(true);
    expect(asAuditor.every((item) => item.entity_id === id)).toBe(true);
  });

  it("без фильтра entity_id выборка смешивает объекты — иначе негатив бессмыслен", async () => {
    const cookie = await loginAs(editor.username);
    const first = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: systemBody({ process: editor.id, system: admin.id }, "Изоляция А"),
      }),
    );
    const second = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: systemBody({ process: editor.id, system: admin.id }, "Изоляция Б"),
      }),
    );
    const aId = String((await readJson(first))["id"]);
    const bId = String((await readJson(second))["id"]);

    const mixed = await listAuditEvents(sql, {
      entityType: "systems",
      newestFirst: true,
      pageSize: 100,
    });
    const mixedIds = new Set(mixed.items.map((item) => item.entity_id));
    expect(mixedIds.has(aId)).toBe(true);
    expect(mixedIds.has(bId)).toBe(true);

    const history = await listObjectHistory(sql, {
      entityType: "systems",
      entityId: aId,
      pageSize: 100,
    });
    expect(history.items.length).toBeGreaterThan(0);
    expect(history.items.every((item) => item.entity_id === aId)).toBe(true);
    expect(history.items.some((item) => item.entity_id === bId)).toBe(false);
    expect(history.total).toBeLessThan(mixed.total);

    await expect(
      listObjectHistory(sql, { entityType: "systems", entityId: "", pageSize: 10 }),
    ).rejects.toThrow(/entity_id/);
  });

  it("отклонённый PATCH по существующему объекту виден в ленте как отказ", async () => {
    const cookie = await loginAs(editor.username);
    const created = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: systemBody({ process: editor.id, system: admin.id }, "Отказ в ленте"),
      }),
    );
    const row = await readJson(created);
    const id = String(row["id"]);
    const denied = await patchSystem(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}`, {
        method: "PATCH",
        cookie,
        body: { version: row["version"], criticality: "high" },
      }),
      routeParams(id),
    );
    expect(denied.status).toBe(422);

    const historyRes = await getHistory(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/history`, { method: "GET", cookie }),
      routeParams(id),
    );
    const history = await readJson(historyRes);
    const items = history["items"] as HistoryItem[];
    expect(items.some((item) => item.after !== null && item.after["code"] === "REASON_REQUIRED")).toBe(
      true,
    );
  });

  it("архивная карточка отдаёт историю; неизвестный id — 404; без сессии — 401; viewer читает", async () => {
    const editorCookie = await loginAs(editor.username);
    const created = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie: editorCookie,
        body: systemBody({ process: editor.id, system: admin.id }, "Архив истории"),
      }),
    );
    const row = await readJson(created);
    const id = String(row["id"]);
    const archived = await archivePost(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/archive`, {
        method: "POST",
        cookie: editorCookie,
        body: { reason: "архив", version: row["version"] },
      }),
      routeParams(id),
    );
    expect(archived.status).toBe(200);

    const asEditor = await getHistory(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/history`, {
        method: "GET",
        cookie: editorCookie,
      }),
      routeParams(id),
    );
    expect(asEditor.status).toBe(200);
    expect(((await readJson(asEditor))["items"] as unknown[]).length).toBeGreaterThanOrEqual(2);

    const viewerCookie = await loginAs(viewer.username);
    const asViewer = await getHistory(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/history`, {
        method: "GET",
        cookie: viewerCookie,
      }),
      routeParams(id),
    );
    expect(asViewer.status).toBe(200);

    const missing = await getHistory(
      jsonRequest(
        "http://127.0.0.1/api/v1/systems/00000000-0000-4000-8000-000000000000/history",
        { method: "GET", cookie: editorCookie },
      ),
      routeParams("00000000-0000-4000-8000-000000000000"),
    );
    expect(missing.status).toBe(404);

    const invalid = await getHistory(
      jsonRequest("http://127.0.0.1/api/v1/systems/not-a-uuid/history?page=abc", {
        method: "GET",
        cookie: editorCookie,
      }),
      routeParams("not-a-uuid"),
    );
    expect(invalid.status).toBe(404);

    const badPage = await getHistory(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/history?page=abc`, {
        method: "GET",
        cookie: editorCookie,
      }),
      routeParams(id),
    );
    expect(badPage.status).toBe(400);

    const anon = await getHistory(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${id}/history`, { method: "GET" }),
      routeParams(id),
    );
    expect(anon.status).toBe(401);
  });
});
