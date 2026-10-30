import { describe, expect, it } from "vitest";
import { z } from "zod";

import { userFieldErrors, userValidationError } from "@/server/modules/users/fields";

describe("users/fields: ошибки проверки по полям", () => {
  it("email без точки в домене даёт русскую причину по полю email", () => {
    const r = z.object({ email: z.string().email() }).safeParse({ email: "loli@com" });
    expect(r.success).toBe(false);
    if (r.success) return;
    const fields = userFieldErrors(r.error);
    expect(fields).toEqual([{ field: "email", message: expect.stringContaining("Электронная почта") as unknown as string }]);
    expect(userValidationError(fields).message).toContain("неверный формат");
  });

  it("несколько полей перечисляются подписями", () => {
    const err = userValidationError([
      { field: "username", message: "x" },
      { field: "email", message: "y" },
    ]);
    expect(err.message).toBe("Проверьте поля: Логин, Электронная почта.");
    expect(err.fields).toHaveLength(2);
  });
});
