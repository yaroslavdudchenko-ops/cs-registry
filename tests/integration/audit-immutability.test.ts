import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mapAuditRow, selectLastAuditHash } from "@/server/db/audit-repository";
import {
  type AuditHashPayload,
  type ChainedAuditEvent,
  type JsonValue,
  computeEventHash,
} from "@/server/modules/audit/hash-chain";
import { listAuditEvents, verifyStoredChain } from "@/server/modules/audit/read";
import { assertReason, ReasonRequiredError } from "@/server/modules/audit/reason";
import { appendAuditEvent, appendRejectionEvent, systemActor } from "@/server/modules/audit/write";

function requiredEnv(name: "DATABASE_URL" | "DATABASE_ADMIN_URL"): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(
      `${name} is not set. Provision Postgres, copy .env.example to .env, run migrations and ALTER ROLE.`,
    );
  }
  return value;
}

function payload(
  partial: Partial<AuditHashPayload> & Pick<AuditHashPayload, "id" | "prev_hash">,
): AuditHashPayload {
  return {
    occurred_at: "2026-10-29T09:00:00.000Z",
    actor_id: null,
    actor_username: "system",
    actor_role: "system",
    action: "create",
    entity_type: "auth",
    entity_id: null,
    entity_label: null,
    changed_fields: null,
    before: null,
    after: { probe: true },
    reason: null,
    request_id: `itest-${partial.id}`,
    ip: "127.0.0.1",
    user_agent: "vitest-integration",
    ...partial,
  };
}

async function insertEvent(sql: Sql, event: ChainedAuditEvent): Promise<void> {
  const before: JsonValue = event.before;
  const after: JsonValue = event.after;
  await sql`
    INSERT INTO audit_events (
      id,
      occurred_at,
      actor_id,
      actor_username,
      actor_role,
      action,
      entity_type,
      entity_id,
      entity_label,
      changed_fields,
      before,
      after,
      reason,
      request_id,
      ip,
      user_agent,
      prev_hash,
      hash
    ) VALUES (
      ${event.id},
      ${event.occurred_at}::timestamptz,
      ${event.actor_id},
      ${event.actor_username},
      ${event.actor_role},
      ${event.action},
      ${event.entity_type},
      ${event.entity_id},
      ${event.entity_label},
      ${event.changed_fields},
      ${sql.json(before)},
      ${sql.json(after)},
      ${event.reason},
      ${event.request_id},
      ${event.ip},
      ${event.user_agent},
      ${event.prev_hash},
      ${event.hash}
    )
  `;
}

describe("audit_events", () => {
  let appSql: Sql;
  let adminSql: Sql;
  let appSqlB: Sql;
  const prefix = `itest-${Date.now()}`;

  beforeAll(() => {
    appSql = postgres(requiredEnv("DATABASE_URL"), { max: 1 });
    appSqlB = postgres(requiredEnv("DATABASE_URL"), { max: 1 });
    adminSql = postgres(requiredEnv("DATABASE_ADMIN_URL"), { max: 1 });
  });

  afterAll(async () => {
    await appSql.end({ timeout: 5 });
    await appSqlB.end({ timeout: 5 });
    await adminSql.end({ timeout: 5 });
  });

  it("INSERT проходит, UPDATE и DELETE падают (прикладная роль)", async () => {
    const [{ next_id: nextId }] = await appSql<[{ next_id: string }]>`
      SELECT nextval('audit_events_id_seq')::text AS next_id
    `;
    if (nextId === undefined) {
      throw new Error("failed to allocate audit_events id");
    }

    const eventPayload = payload({
      id: Number(nextId),
      prev_hash: await selectLastAuditHash(appSql),
      request_id: `${prefix}-insert`,
    });
    const event: ChainedAuditEvent = {
      ...eventPayload,
      hash: computeEventHash(eventPayload),
    };

    await insertEvent(appSql, event);

    const inserted = await appSql`
      SELECT id FROM audit_events WHERE request_id = ${event.request_id}
    `;
    expect(inserted).toHaveLength(1);

    await expect(
      appSql`UPDATE audit_events SET reason = 'tamper' WHERE request_id = ${event.request_id}`,
    ).rejects.toThrow();

    await expect(
      appSql`DELETE FROM audit_events WHERE request_id = ${event.request_id}`,
    ).rejects.toThrow();

    const stillThere = await appSql`
      SELECT hash FROM audit_events WHERE request_id = ${event.request_id}
    `;
    expect(stillThere).toHaveLength(1);
  });

  it("триггер запрещает UPDATE даже владельцу схемы", async () => {
    const [{ next_id: nextId }] = await adminSql<[{ next_id: string }]>`
      SELECT nextval('audit_events_id_seq')::text AS next_id
    `;
    if (nextId === undefined) {
      throw new Error("failed to allocate audit_events id");
    }

    const eventPayload = payload({
      id: Number(nextId),
      prev_hash: await selectLastAuditHash(adminSql),
      request_id: `${prefix}-trigger`,
    });
    const event: ChainedAuditEvent = {
      ...eventPayload,
      hash: computeEventHash(eventPayload),
    };
    await insertEvent(adminSql, event);

    await expect(
      adminSql`UPDATE audit_events SET hash = '00' WHERE request_id = ${event.request_id}`,
    ).rejects.toThrow(/append-only|audit_events/i);
  });

  it("два параллельных append из разных соединений сохраняют цепочку", async () => {
    const actorA = systemActor(`${prefix}-par-a`);
    const actorB = systemActor(`${prefix}-par-b`);
    const body = {
      action: "create" as const,
      entityType: "auth",
      entityId: null,
      entityLabel: null,
      changedFields: null,
      before: null,
      after: { parallel: true },
      reason: null,
    };

    const [first, second] = await Promise.all([
      appendAuditEvent(appSql, actorA, body),
      appendAuditEvent(appSqlB, actorB, { ...body, after: { parallel: true, n: 2 } }),
    ]);

    const ordered = [first, second].sort((left, right) => left.id - right.id);
    const earlier = ordered[0];
    const later = ordered[1];
    if (earlier === undefined || later === undefined) {
      throw new Error("expected two events");
    }

    expect(later.prev_hash).toBe(earlier.hash);
    expect(earlier.id).not.toBe(later.id);

    const stored = await appSql<Record<string, unknown>[]>`
      SELECT
        id, occurred_at, actor_id, actor_username, actor_role, action,
        entity_type, entity_id, entity_label, changed_fields, before, after,
        reason, request_id, host(ip)::text AS ip, user_agent, prev_hash, hash
      FROM audit_events
      WHERE request_id IN (${actorA.requestId}, ${actorB.requestId})
      ORDER BY id
    `;
    const mapped = stored.map((row) => mapAuditRow(row));
    expect(mapped).toHaveLength(2);
    const storedLater = mapped[1];
    const storedEarlier = mapped[0];
    if (storedLater === undefined || storedEarlier === undefined) {
      throw new Error("expected two stored events");
    }
    expect(storedLater.prev_hash).toBe(storedEarlier.hash);
    expect(await verifyStoredChain(appSql)).toEqual({ ok: true });
  });

  it("отказ без причины пишет rejection, не изменение, цепочка цела", async () => {
    const actor = systemActor(`${prefix}-reject`);
    const change = {
      changedFields: ["criticality"] as const,
      currentValidationStatus: "not_validated" as const,
    };

    expect(() => assertReason(null, change)).toThrow(ReasonRequiredError);

    const beforeCount = (await listAuditEvents(appSql, { page: 1, pageSize: 1 })).total;

    const rejection = await appendRejectionEvent(appSql, actor, {
      action: "update",
      entityType: "systems",
      entityId: "sys-reason-check",
      entityLabel: "SYS-REASON",
      changedFields: ["criticality"],
      code: "REASON_REQUIRED",
    });

    expect(rejection.after).toEqual({ code: "REASON_REQUIRED" });
    expect(rejection.reason).toBeNull();

    const changeEvents = await appSql`
      SELECT id FROM audit_events
      WHERE request_id = ${actor.requestId}
        AND action = 'update'
        AND (after->>'criticality') IS NOT NULL
    `;
    expect(changeEvents).toHaveLength(0);

    const refusal = await appSql`
      SELECT id, after FROM audit_events WHERE request_id = ${actor.requestId}
    `;
    expect(refusal).toHaveLength(1);

    const afterCount = (await listAuditEvents(appSql, { page: 1, pageSize: 1 })).total;
    expect(afterCount).toBe(beforeCount + 1);
    expect(await verifyStoredChain(appSql)).toEqual({ ok: true });
  });

  it("verifyStoredChain проходит и указывает сломанную запись после подмены hash", async () => {
    const actor = systemActor(`${prefix}-verify`);
    const written: ChainedAuditEvent[] = [];
    for (let index = 0; index < 3; index += 1) {
      written.push(
        await appendAuditEvent(appSql, { ...actor, requestId: `${prefix}-verify-${index}` }, {
          action: "create",
          entityType: "auth",
          entityId: null,
          entityLabel: null,
          changedFields: null,
          before: null,
          after: { n: index },
          reason: null,
        }),
      );
    }

    expect(await verifyStoredChain(appSql)).toEqual({ ok: true });

    const middle = written[1];
    if (middle === undefined) {
      throw new Error("missing middle event");
    }

    await adminSql`SET session_replication_role = replica`;
    await adminSql`UPDATE audit_events SET hash = ${"0".repeat(64)} WHERE id = ${middle.id}`;
    await adminSql`SET session_replication_role = origin`;

    const result = await verifyStoredChain(appSql);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("hash_mismatch");
      expect(result.eventId).toBe(middle.id);
    }

    await adminSql`SET session_replication_role = replica`;
    await adminSql`UPDATE audit_events SET hash = ${middle.hash} WHERE id = ${middle.id}`;
    await adminSql`SET session_replication_role = origin`;
    expect(await verifyStoredChain(appSql)).toEqual({ ok: true });

    const page = await listAuditEvents(appSql, { page: 1, pageSize: 2 });
    expect(page.pageSize).toBe(2);
    expect(page.items.length).toBeLessThanOrEqual(2);
    expect(page.total).toBeGreaterThanOrEqual(3);
  });
});
