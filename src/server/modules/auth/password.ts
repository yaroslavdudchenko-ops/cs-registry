import argon2 from "argon2";

/**
 * Argon2id, параметры зафиксированы явно — не дефолты библиотеки
 * (они менялись между major node-argon2: 4096 KiB → 65536 KiB).
 *
 * OWASP 2023/2024 минимум для интерактивного входа:
 * - memoryCost 19456 KiB (19 MiB) — запас против GPU без исчерпания RAM малого VPS;
 * - timeCost 2 прохода;
 * - parallelism 1 — один запрос login не занимает несколько ядер.
 *
 * type = argon2id (смесь data-independent / data-dependent), не argon2i/argon2d.
 */
export const ARGON2_MEMORY_KIB = 19456;
export const ARGON2_TIME_COST = 2;
export const ARGON2_PARALLELISM = 1;

const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: ARGON2_MEMORY_KIB,
  timeCost: ARGON2_TIME_COST,
  parallelism: ARGON2_PARALLELISM,
} as const;

const MIN_PASSWORD_LENGTH = 12;

export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error("password too short");
  }
}

export function isPasswordLongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, HASH_OPTIONS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function isArgon2idHash(passwordHash: string): boolean {
  return passwordHash.startsWith("$argon2id$");
}

let dummyHash: Promise<string> | undefined;

/** Хеш несуществующего пароля: verify на неизвестном логине занимает то же время. */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("timing-pad-not-a-real-account-password");
  return dummyHash;
}
