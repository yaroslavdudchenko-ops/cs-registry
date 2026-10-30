import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cookieFrom, jsonRequest, readJson } from "./http";
import { POST as loginPost } from "@/app/api/v1/auth/login/route";
import { POST as createUser } from "@/app/api/v1/users/route";
import { hashPassword } from "@/server/modules/auth/password";

const PASSWORD = "integration-password-12345";

describe("0.9.0 п.1: ошибка создания пользователя с понятной причиной и записью в лог", () => {
  let sql: Sql;
  const prefix = `uv${Date.now().toString(36)}`;
  let cookie = "";

  beforeAll(async () => {
    const url = process.env["DATABASE_URL"];
    if (url === undefined || url.length === 0) throw new Error("DATABASE_URL is not set");
    sql = postgres(url, { max: 2 });
    const hash = await hashPassword(PASSWORD);
    await sql`
      INSERT INTO users (username, full_name, email, password_hash, role, is_active)
      VALUES (${`${prefix}-admin`}, 'Админ', ${`${prefix}@example.test`}, ${hash}, 'admin'::user_role_enum, true)
    `;
    const res = await loginPost(
      jsonRequest("http://127.0.0.1/api/v1/auth/login", {
        method: "POST",
        body: { username: `${prefix}-admin`, password: PASSWORD },
      }),
    );
    expect(res.status).toBe(200);
    cookie = cookieFrom(res) ?? "";
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("email loli@com → 400 с полем email, русской причиной; в логе requestId и имя поля без значения", async () => {
    const originalLog = console.log;
    const captured: string[] = [];
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
    try {
      const res = await createUser(
        jsonRequest("http://127.0.0.1/api/v1/users", {
          method: "POST",
          cookie,
          body: {
            username: `${prefix}-loli`,
            full_name: "Лоли Тест",
            email: "loli@com",
            password: "Very-Secret-Pass-2026",
            role: "viewer",
          },
        }),
      );
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body["code"]).toBe("VALIDATION_ERROR");
      expect(String(body["message"])).toContain("Электронная почта");
      expect(body["fields"]).toEqual([
        { field: "email", message: expect.stringContaining("неверный формат") as unknown as string },
      ]);
      const requestId = String(body["requestId"]);
      const line = captured.find((l) => l.includes(requestId));
      expect(line).toBeDefined();
      expect(line).toContain('"fields":["email"]');
      expect(line).not.toContain("loli@com");
      expect(line).not.toContain("Very-Secret-Pass-2026");
    } finally {
      console.log = originalLog;
    }
  });

  it("короткий пароль → поле password с причиной", async () => {
    const res = await createUser(
      jsonRequest("http://127.0.0.1/api/v1/users", {
        method: "POST",
        cookie,
        body: {
          username: `${prefix}-short`,
          full_name: "Коротко",
          email: `${prefix}-short@example.test`,
          password: "short",
          role: "viewer",
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body["fields"]).toEqual([{ field: "password", message: "Пароль: не короче 12 символов." }]);
  });
});
