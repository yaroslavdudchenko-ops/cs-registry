import { describe, expect, it } from "vitest";

import {
  ARGON2_MEMORY_KIB,
  ARGON2_PARALLELISM,
  ARGON2_TIME_COST,
  dummyPasswordHash,
  hashPassword,
  isArgon2idHash,
  isPasswordLongEnough,
  verifyPassword,
} from "./password";

describe("password policy and Argon2id", () => {
  it("отклоняет пароль короче 12 символов", () => {
    expect(isPasswordLongEnough("12345678901")).toBe(false);
    expect(isPasswordLongEnough("123456789012")).toBe(true);
  });

  it("хеширует Argon2id с зафиксированными параметрами, не открытый текст", async () => {
    const password = "correct-horse-battery";
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    expect(isArgon2idHash(hash)).toBe(true);
    expect(hash).toContain(`m=${String(ARGON2_MEMORY_KIB)}`);
    expect(hash).toContain(`t=${String(ARGON2_TIME_COST)}`);
    expect(hash).toContain(`p=${String(ARGON2_PARALLELISM)}`);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword("wrong-password-xx", hash)).toBe(false);
  });

  it("dummy-хеш тоже Argon2id — для выравнивания времени на неизвестном логине", async () => {
    const hash = await dummyPasswordHash();
    expect(isArgon2idHash(hash)).toBe(true);
  });
});
