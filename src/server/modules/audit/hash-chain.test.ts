import { describe, expect, it } from "vitest";

import {
  type AuditHashPayload,
  type ChainedAuditEvent,
  canonicalJson,
  computeEventHash,
  GENESIS_PREV_HASH,
  resolvePrevHash,
  sha256Utf8,
  verifyChain,
} from "./hash-chain";

function basePayload(overrides: Partial<AuditHashPayload> = {}): AuditHashPayload {
  return {
    id: 1,
    occurred_at: "2026-10-29T09:00:00.000Z",
    actor_id: "11111111-1111-1111-1111-111111111111",
    actor_username: "admin",
    actor_role: "admin",
    action: "create",
    entity_type: "systems",
    entity_id: "22222222-2222-2222-2222-222222222222",
    entity_label: "SYS-0001 Тест",
    changed_fields: ["name"],
    before: null,
    after: { name: "Тест" },
    reason: null,
    request_id: "req-1",
    ip: "127.0.0.1",
    user_agent: "vitest",
    prev_hash: null,
    ...overrides,
  };
}

describe("canonicalJson", () => {
  it("детерминирован при разном порядке ключей", () => {
    const left = canonicalJson({ b: 1, a: { d: 2, c: 3 } });
    const right = canonicalJson({ a: { c: 3, d: 2 }, b: 1 });
    expect(left).toBe(right);
    expect(left).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("не вставляет пробелы и сохраняет UTF-8", () => {
    expect(canonicalJson({ label: "Система" })).toBe('{"label":"Система"}');
  });
});

describe("computeEventHash", () => {
  it("не зависит от порядка ключей полезной нагрузки", () => {
    const payload = basePayload();
    const scrambled = {
      request_id: payload.request_id,
      action: payload.action,
      prev_hash: payload.prev_hash,
      after: payload.after,
      actor_username: payload.actor_username,
      id: payload.id,
      occurred_at: payload.occurred_at,
      actor_id: payload.actor_id,
      actor_role: payload.actor_role,
      entity_type: payload.entity_type,
      entity_id: payload.entity_id,
      entity_label: payload.entity_label,
      changed_fields: payload.changed_fields,
      before: payload.before,
      reason: payload.reason,
      ip: payload.ip,
      user_agent: payload.user_agent,
    } satisfies AuditHashPayload;

    expect(computeEventHash(scrambled)).toBe(computeEventHash(payload));
  });

  it("для первой записи подставляет genesis вместо null prev_hash", () => {
    const payload = basePayload({ prev_hash: null });
    expect(resolvePrevHash(payload.prev_hash)).toBe(GENESIS_PREV_HASH);
    const expected = sha256Utf8(canonicalJson(payload) + GENESIS_PREV_HASH);
    expect(computeEventHash(payload)).toBe(expected);
  });

  it("меняется при изменении любого поля", () => {
    const original = computeEventHash(basePayload());
    const fields: Array<Partial<AuditHashPayload>> = [
      { id: 2 },
      { occurred_at: "2026-10-29T09:00:01.000Z" },
      { actor_id: null },
      { actor_username: "editor" },
      { actor_role: "editor" },
      { action: "update" },
      { entity_type: "users" },
      { entity_id: null },
      { entity_label: "другое" },
      { changed_fields: ["code"] },
      { before: { name: "было" } },
      { after: { name: "стало" } },
      { reason: "причина" },
      { request_id: "req-2" },
      { ip: "10.0.0.1" },
      { user_agent: "other" },
      { prev_hash: "abc" },
    ];

    for (const override of fields) {
      expect(computeEventHash(basePayload(override)), JSON.stringify(override)).not.toBe(original);
    }
  });
});

describe("verifyChain", () => {
  function chainOf(length: number): ChainedAuditEvent[] {
    const events: ChainedAuditEvent[] = [];
    for (let index = 0; index < length; index += 1) {
      const prev_hash = index === 0 ? null : (events[index - 1]?.hash ?? null);
      const payload = basePayload({
        id: index + 1,
        request_id: `req-${index + 1}`,
        prev_hash,
      });
      events.push({ ...payload, hash: computeEventHash(payload) });
    }
    return events;
  }

  it("принимает корректную цепочку из нескольких записей", () => {
    expect(verifyChain(chainOf(5))).toEqual({ ok: true });
  });

  it("принимает цепочку независимо от порядка элементов во входе", () => {
    const events = chainOf(3);
    expect(verifyChain([events[2]!, events[0]!, events[1]!])).toEqual({ ok: true });
  });

  it("обнаруживает разрыв при подмене hash в середине", () => {
    const events = chainOf(4);
    const middle = events[1];
    if (middle === undefined) {
      throw new Error("expected middle event");
    }
    middle.hash = "0".repeat(64);
    const result = verifyChain(events);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("hash_mismatch");
      expect(result.index).toBe(1);
      expect(result.eventId).toBe(2);
    }
  });

  it("обнаруживает разрыв prev_hash", () => {
    const events = chainOf(3);
    const third = events[2];
    if (third === undefined) {
      throw new Error("expected third event");
    }
    third.prev_hash = "deadbeef";
    third.hash = computeEventHash(third);
    const result = verifyChain(events);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("prev_hash_mismatch");
      expect(result.eventId).toBe(3);
    }
  });
});
