import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cookieFrom, jsonRequest, readJson, routeParams } from "./http";
import { POST as loginPost } from "@/app/api/v1/auth/login/route";
import { POST as createSystem } from "@/app/api/v1/systems/route";
import { PATCH as patchSystem } from "@/app/api/v1/systems/[id]/route";
import { hashPassword } from "@/server/modules/auth/password";

const PASSWORD = "integration-password-12345";

function requiredEnv(name: "DATABASE_URL"): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is not set`);
  return value;
}

type SeedUser = { id: string; username: string };

async function insertUser(sql: Sql, username: string, hash: string): Promise<SeedUser> {
  const rows = await sql<Array<SeedUser>>`
    INSERT INTO users (username, full_name, email, password_hash, role, is_active)
    VALUES (${username}, ${username}, ${`${username}@example.test`}, ${hash}, 'editor'::user_role_enum, true)
    RETURNING id, username
  `;
  const row = rows[0];
  if (row === undefined) throw new Error("failed to seed user");
  return row;
}

describe("CS Registry 0.9.0 — задачи task-0.9.0.md", () => {
  let sql: Sql;
  let editor: SeedUser;
  const prefix = `v${Date.now().toString(36)}`;

  async function loginEditor(): Promise<string> {
    const response = await loginPost(
      jsonRequest("http://127.0.0.1/api/v1/auth/login", {
        method: "POST",
        body: { username: editor.username, password: PASSWORD },
      }),
    );
    expect(response.status).toBe(200);
    const token = cookieFrom(response);
    if (token === null) throw new Error("no cookie");
    return token;
  }

  function baseBody(domain: "QC" | "QA" | "PROD" | "RnD" | "LOG" | "ADM" | "IT", name: string): Record<string, unknown> {
    return {
      name,
      domain,
      system_type: "LIMS",
      hosting_type: "on_prem",
      data_classification: "internal",
      is_gxp_relevant: false,
      criticality: "low",
      lifecycle_status: "planned",
      validation_status: "not_required",
      system_owner: { user_id: editor.id },
      process_owners: [{ user_id: editor.id }],
    };
  }

  beforeAll(async () => {
    sql = postgres(requiredEnv("DATABASE_URL"), { max: 4 });
    editor = await insertUser(sql, `${prefix}-editor`, await hashPassword(PASSWORD));
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("SYS-<ДОМЕН>-NNNN: нумерация сквозная поверх всех доменов (п.3)", async () => {
    const cookie = await loginEditor();
    const responses: Array<{ code: string; order: number }> = [];
    const domains: Array<"QC" | "QA" | "PROD" | "IT"> = ["QC", "IT", "PROD", "QA"];
    for (let i = 0; i < domains.length; i += 1) {
      const d = domains[i]!;
      const res = await createSystem(
        jsonRequest("http://127.0.0.1/api/v1/systems", {
          method: "POST",
          cookie,
          body: baseBody(d, `${prefix}-numbering-${i}`),
        }),
      );
      expect(res.status).toBe(201);
      const body = await readJson(res);
      const code = String(body["code"]);
      const match = code.match(/^SYS-([A-Za-z]+)-(\d+)$/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe(d);
      responses.push({ code, order: Number(match![2]) });
    }
    for (let i = 1; i < responses.length; i += 1) {
      expect(responses[i]!.order).toBeGreaterThan(responses[i - 1]!.order);
    }
  });

  it("домены старым SYS-NNNN проставлены миграцией 0006 (п.3)", async () => {
    const rows = await sql<Array<{ system_type: string; domain: string }>>`
      INSERT INTO systems (
        code, name, domain, system_type, hosting_type, data_classification,
        is_gxp_relevant, criticality, lifecycle_status, validation_status
      ) VALUES (
        ${`${prefix}-legacy`}, 'Старый', 'IT'::system_domain_enum,
        'LIMS'::system_type_enum, 'on_prem'::hosting_type_enum,
        'internal'::data_class_enum, false, 'low'::criticality_enum,
        'planned'::lifecycle_enum, 'not_required'::validation_enum
      ) RETURNING system_type, domain
    `;
    expect(rows[0]?.domain).toBe("IT");
    const migrated = await sql<Array<{ exists: boolean }>>`SELECT TRUE AS exists FROM pg_type WHERE typname = 'system_domain_enum'`;
    expect(migrated[0]?.exists).toBe(true);
  });

  it("правило GxP: не-GxP с validation=validated → 400 VALIDATION_ERROR на поле validation_status (п.2 блок 4)", async () => {
    const cookie = await loginEditor();
    const res = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: { ...baseBody("QC", `${prefix}-gxp-bad`), validation_status: "validated" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body["code"]).toBe("VALIDATION_ERROR");
    const fields = body["fields"] as Array<{ field: string; message: string }>;
    expect(fields.some((f) => f.field === "validation_status")).toBe(true);
    expect(String(fields.find((f) => f.field === "validation_status")?.message)).toContain("вне GxP");
  });

  it("правило GxP: GxP без gxp_criticality и gamp_category → поле → поле ошибок (п.2 блок 4)", async () => {
    const cookie = await loginEditor();
    const res = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: {
          ...baseBody("QC", `${prefix}-gxp-missing`),
          is_gxp_relevant: true,
          validation_status: "in_validation",
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    const names = (body["fields"] as Array<{ field: string }>).map((f) => f.field);
    expect(names).toContain("gxp_criticality");
    expect(names).toContain("gamp_category");
  });

  it("ссылка javascript: отклоняется, http(s) и UNC принимаются; изменения в аудите (п.2 блок 7, п.5)", async () => {
    const cookie = await loginEditor();
    const bad = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: {
          ...baseBody("IT", `${prefix}-doc-bad`),
          internal_documents: [{ kind: "internal", title: "Фишинг", url: "javascript:alert(1)" }],
        },
      }),
    );
    expect(bad.status).toBe(400);
    const badBody = await readJson(bad);
    expect((badBody["fields"] as Array<{ field: string }>).some((f) => f.field === "internal_documents")).toBe(true);

    const okRes = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: {
          ...baseBody("IT", `${prefix}-doc-ok`),
          internal_documents: [{ kind: "internal", title: "URS", url: "https://wiki.example/urs" }],
          vendor_documents: [{ kind: "vendor", title: "Схема", url: "\\\\fileserver\\docs\\sys.pdf" }],
        },
      }),
    );
    expect(okRes.status).toBe(201);
    const okBody = await readJson(okRes);

    // изменение ссылки должно оказаться в аудите с полем internal_documents
    const patched = await patchSystem(
      jsonRequest(`http://127.0.0.1/api/v1/systems/${String(okBody["id"])}`, {
        method: "PATCH",
        cookie,
        body: {
          version: Number(okBody["version"]),
          internal_documents: [
            { kind: "internal", title: "URS v2", url: "https://wiki.example/urs?v=2" },
          ],
          reason: "актуализация ссылки",
        },
      }),
      routeParams(String(okBody["id"])),
    );
    expect(patched.status).toBe(200);

    const events = await sql<Array<{ changed_fields: string[]; before: unknown; after: unknown }>>`
      SELECT changed_fields, before, after FROM audit_events
      WHERE entity_type = 'systems' AND entity_id = ${String(okBody["id"])}
        AND action = 'update'
      ORDER BY id DESC LIMIT 1
    `;
    expect(events[0]?.changed_fields).toContain("internal_documents");
    const before = events[0]?.before as Record<string, Array<{ url: string }>>;
    const after = events[0]?.after as Record<string, Array<{ url: string }>>;
    expect(before["internal_documents"]?.[0]?.url).toBe("https://wiki.example/urs");
    expect(after["internal_documents"]?.[0]?.url).toBe("https://wiki.example/urs?v=2");
  });

  it("rejection лог: requestId из ответа читается в stdout (п.1)", async () => {
    const cookie = await loginEditor();
    const originalLog = console.log;
    const captured: string[] = [];
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
    try {
      const res = await createSystem(
        jsonRequest("http://127.0.0.1/api/v1/systems", {
          method: "POST",
          cookie,
          body: baseBody("QC", `${prefix}-log`),
          // intentionally omit `domain` after spread override
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(201);

      const bad = await createSystem(
        jsonRequest("http://127.0.0.1/api/v1/systems", {
          method: "POST",
          cookie,
          body: {
            name: `${prefix}-log-bad`,
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
      expect(bad.status).toBe(400);
      const body = await readJson(bad);
      const requestId = String(body["requestId"]);
      expect(requestId).not.toBe("");
      const matching = captured.find((line) => line.includes(requestId) && line.includes("VALIDATION_ERROR"));
      expect(matching).toBeDefined();
      expect(matching).toContain("\"route\":\"/api/v1/systems\"");
      expect(matching).toContain("\"fields\":[\"domain\"]");
      // значения полей и секреты не логируем
      expect(matching).not.toContain("Фамилия");
    } finally {
      console.log = originalLog;
    }
  });

  it("фильтр списка по домену, компании, GxP, GAMP и владельцу работает на сервере (п.4)", async () => {
    const cookie = await loginEditor();
    const createRes = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: {
          ...baseBody("PROD", `${prefix}-filter-sys`),
          is_gxp_relevant: true,
          validation_status: "in_validation",
          gxp_criticality: "high",
          gamp_category: "5",
          companies: ["BE", "AR"],
        },
      }),
    );
    expect(createRes.status).toBe(201);
    const createdBody = await readJson(createRes);

    const { GET: listSystems } = await import("@/app/api/v1/systems/route");

    const byDomain = await listSystems(
      jsonRequest(`http://127.0.0.1/api/v1/systems?domain=PROD&q=${prefix}-filter-sys`, {
        method: "GET",
        cookie,
      }),
    );
    expect(byDomain.status).toBe(200);
    const bodyDomain = await readJson(byDomain);
    expect((bodyDomain["items"] as Array<{ id: string }>).some((it) => it.id === String(createdBody["id"]))).toBe(true);

    const byCompany = await listSystems(
      jsonRequest(`http://127.0.0.1/api/v1/systems?company=AR&q=${prefix}-filter-sys`, {
        method: "GET",
        cookie,
      }),
    );
    const bodyCompany = await readJson(byCompany);
    expect((bodyCompany["items"] as Array<{ id: string }>).some((it) => it.id === String(createdBody["id"]))).toBe(true);

    const byGxpCrit = await listSystems(
      jsonRequest(`http://127.0.0.1/api/v1/systems?gxp_criticality=high&q=${prefix}-filter-sys`, {
        method: "GET",
        cookie,
      }),
    );
    const bodyCrit = await readJson(byGxpCrit);
    expect((bodyCrit["items"] as Array<{ id: string }>).some((it) => it.id === String(createdBody["id"]))).toBe(true);

    const byOwner = await listSystems(
      jsonRequest(`http://127.0.0.1/api/v1/systems?owner=${editor.id}&q=${prefix}-filter-sys`, {
        method: "GET",
        cookie,
      }),
    );
    const bodyOwner = await readJson(byOwner);
    expect((bodyOwner["items"] as Array<{ id: string }>).some((it) => it.id === String(createdBody["id"]))).toBe(true);
  });

  it("человек ФИО-текстом без учётки допускается и попадает в карточку (п.2 блок 2)", async () => {
    const cookie = await loginEditor();
    const res = await createSystem(
      jsonRequest("http://127.0.0.1/api/v1/systems", {
        method: "POST",
        cookie,
        body: {
          ...baseBody("IT", `${prefix}-text-person`),
          system_owner: { full_name: "Петрова Пелагея" },
          process_owners: [{ full_name: "Иванов Иван" }],
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = await readJson(res);
    const people = body["people"] as Array<{ role: string; user_id: string | null; full_name: string }>;
    const po = people.find((p) => p.role === "process_owner");
    const so = people.find((p) => p.role === "system_owner");
    expect(po?.user_id).toBeNull();
    expect(po?.full_name).toBe("Иванов Иван");
    expect(so?.user_id).toBeNull();
    expect(so?.full_name).toBe("Петрова Пелагея");
  });
});
