import { createHash } from "node:crypto";

/**
 * Соль для первой записи цепочки. В колонке `prev_hash` первой строки
 * хранится NULL (er.md / FS §6); в хеш подставляется этот префикс, чтобы не
 * хешировать пустую строку (FS §6, задача каркаса).
 */
export const GENESIS_PREV_HASH = "genesis";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type AuditHashPayload = {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  actor_username: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  changed_fields: string[] | null;
  before: JsonValue;
  after: JsonValue;
  reason: string | null;
  request_id: string;
  ip: string | null;
  user_agent: string | null;
  prev_hash: string | null;
};

export type ChainedAuditEvent = AuditHashPayload & { hash: string };

export type ChainBreak = {
  ok: false;
  index: number;
  eventId: number;
  reason: "hash_mismatch" | "prev_hash_mismatch";
};

export type ChainOk = { ok: true };
export type ChainVerifyResult = ChainOk | ChainBreak;

function isPlainObject(value: unknown): value is { [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortJson(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }
  if (isPlainObject(value)) {
    const sorted: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(value).sort()) {
      const nested = value[key];
      if (nested === undefined) {
        continue;
      }
      sorted[key] = sortJson(nested);
    }
    return sorted;
  }
  throw new Error("canonicalJson: unsupported value");
}

/** Стабильный JSON: ключи отсортированы, UTF-8, без пробелов. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function sha256Utf8(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function resolvePrevHash(prevHash: string | null): string {
  return prevHash ?? GENESIS_PREV_HASH;
}

/**
 * Хеш записи: SHA-256 канонического JSON полей без `hash` плюс
 * `prev_hash` (для первой записи — `genesis`).
 */
export function computeEventHash(payload: AuditHashPayload): string {
  const fields: AuditHashPayload & { hash?: string } = { ...payload };
  delete fields.hash;
  const body = canonicalJson(fields);
  return sha256Utf8(body + resolvePrevHash(fields.prev_hash));
}

export function verifyChain(
  events: readonly ChainedAuditEvent[],
  options?: { expectedFirstPrevHash?: string | null },
): ChainVerifyResult {
  const sorted = [...events].sort((left, right) => left.id - right.id);

  for (let index = 0; index < sorted.length; index += 1) {
    const event = sorted[index];
    if (event === undefined) {
      continue;
    }

    const expectedPrev =
      index === 0
        ? (options?.expectedFirstPrevHash ?? null)
        : (sorted[index - 1]?.hash ?? null);
    if (event.prev_hash !== expectedPrev) {
      return {
        ok: false,
        index,
        eventId: event.id,
        reason: "prev_hash_mismatch",
      };
    }

    if (event.hash !== computeEventHash(event)) {
      return {
        ok: false,
        index,
        eventId: event.id,
        reason: "hash_mismatch",
      };
    }
  }

  return { ok: true };
}
