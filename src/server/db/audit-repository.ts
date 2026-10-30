import type postgres from "postgres";

import type { ChainedAuditEvent, JsonValue } from "@/server/modules/audit/hash-chain";

export type DbSql = postgres.Sql | postgres.TransactionSql;

/**
 * Транзакционный advisory lock на цепочку `audit_events`.
 *
 * Два параллельных INSERT без него прочитают один и тот же последний hash,
 * запишут одинаковый prev_hash и молча порвут цепочку — разрыв всплывёт
 * только на верификации. Session-lock не подходит: его нужно снимать
 * вручную и он переживает rollback. Xact-lock освобождается с транзакцией.
 * Не убирать «для скорости»: запись в реестр редкая, корректность GxP обязательна.
 */
export const AUDIT_CHAIN_LOCK_CLASS = 1;
export const AUDIT_CHAIN_LOCK_KEY = 1;


export type AuditEventInsert = {
  id: number;
  occurredAt: string;
  actorId: string | null;
  actorUsername: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  changedFields: string[] | null;
  before: JsonValue;
  after: JsonValue;
  reason: string | null;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  prevHash: string | null;
  hash: string;
};

export function mapAuditRow(row: Record<string, unknown>): ChainedAuditEvent {
  const idRaw = row["id"];
  const id = typeof idRaw === "bigint" ? Number(idRaw) : Number(idRaw);
  const occurred = row["occurred_at"];
  const occurredAt = occurred instanceof Date ? occurred.toISOString() : String(occurred);

  return {
    id,
    occurred_at: occurredAt,
    actor_id: (row["actor_id"] as string | null) ?? null,
    actor_username: String(row["actor_username"]),
    actor_role: String(row["actor_role"]),
    action: String(row["action"]),
    entity_type: String(row["entity_type"]),
    entity_id: (row["entity_id"] as string | null) ?? null,
    entity_label: (row["entity_label"] as string | null) ?? null,
    changed_fields: (row["changed_fields"] as string[] | null) ?? null,
    before: (row["before"] as JsonValue) ?? null,
    after: (row["after"] as JsonValue) ?? null,
    reason: (row["reason"] as string | null) ?? null,
    request_id: String(row["request_id"]),
    ip: row["ip"] === null || row["ip"] === undefined ? null : String(row["ip"]),
    user_agent: (row["user_agent"] as string | null) ?? null,
    prev_hash: (row["prev_hash"] as string | null) ?? null,
    hash: String(row["hash"]),
  };
}

export async function lockAuditChain(tx: DbSql): Promise<void> {
  await tx`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_CLASS}, ${AUDIT_CHAIN_LOCK_KEY})`;
}

export async function nextAuditIdentity(tx: DbSql): Promise<{ id: number; occurredAt: string }> {
  const rows = await tx<[{ id: string; occurred_at: Date }]>`
    SELECT nextval('audit_events_id_seq')::text AS id,
           date_trunc('milliseconds', clock_timestamp()) AS occurred_at
  `;
  const row = rows[0];
  if (row === undefined) {
    throw new Error("failed to allocate audit_events identity");
  }
  return { id: Number(row.id), occurredAt: row.occurred_at.toISOString() };
}

export async function selectLastAuditHash(tx: DbSql): Promise<string | null> {
  const rows = await tx<[{ hash: string }]>`
    SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1
  `;
  const last = rows[0];
  return last === undefined ? null : last.hash;
}

export async function insertAuditEventRow(tx: DbSql, event: AuditEventInsert): Promise<void> {
  await tx`
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
      ${event.occurredAt}::timestamptz,
      ${event.actorId},
      ${event.actorUsername},
      ${event.actorRole},
      ${event.action},
      ${event.entityType},
      ${event.entityId},
      ${event.entityLabel},
      ${event.changedFields},
      ${tx.json(event.before)},
      ${tx.json(event.after)},
      ${event.reason},
      ${event.requestId},
      ${event.ip},
      ${event.userAgent},
      ${event.prevHash},
      ${event.hash}
    )
  `;
}

export async function countAuditEvents(sql: DbSql): Promise<number> {
  const rows = await sql<[{ count: string }]>`SELECT count(*)::text AS count FROM audit_events`;
  const row = rows[0];
  return row === undefined ? 0 : Number(row.count);
}

export type AuditListFilters = {
  from?: string | null;
  to?: string | null;
  actor?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  action?: string | null;
  reason?: string | null;
  /** Исключить действия (история объекта не показывает чтение журнала/истории). */
  excludeActions?: readonly string[] | null;
};

/** Экранирует `\`, `%` и `_` для `ILIKE … ESCAPE '\'`. */
export function escapeIlike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function entityLabelIlike(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return `%${escapeIlike(trimmed)}%`;
}

export async function selectAuditEventsPage(
  sql: DbSql,
  options: { offset: number; limit: number; newestFirst?: boolean } & AuditListFilters,
): Promise<ChainedAuditEvent[]> {
  const newestFirst = options.newestFirst === true;
  const excludeActions = options.excludeActions ?? [];
  const labelIlike = entityLabelIlike(options.entityLabel);
  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      id, occurred_at, actor_id, actor_username, actor_role, action,
      entity_type, entity_id, entity_label, changed_fields, before, after,
      reason, request_id, host(ip)::text AS ip, user_agent, prev_hash, hash
    FROM audit_events
    WHERE
      (${options.from ?? null}::timestamptz IS NULL OR occurred_at >= ${options.from ?? null}::timestamptz)
      AND (${options.to ?? null}::timestamptz IS NULL OR occurred_at <= ${options.to ?? null}::timestamptz)
      AND (
        ${options.actor ?? null}::text IS NULL
        OR actor_id::text = ${options.actor ?? null}
        OR actor_username = ${options.actor ?? null}
      )
      AND (${options.entityType ?? null}::text IS NULL OR entity_type = ${options.entityType ?? null})
      AND (${options.entityId ?? null}::text IS NULL OR entity_id = ${options.entityId ?? null})
      AND (
        ${labelIlike}::text IS NULL
        OR (
          entity_label IS NOT NULL
          AND entity_label ILIKE ${labelIlike} ESCAPE ${"\\"}
        )
      )
      AND (${options.action ?? null}::text IS NULL OR action = ${options.action ?? null})
      AND (
        ${options.reason ?? null}::text IS NULL
        OR (
          reason IS NOT NULL
          AND position(lower(${options.reason ?? null}) in lower(reason)) > 0
        )
      )
      AND (${excludeActions.length === 0} OR action <> ALL(${excludeActions}::text[]))
    ORDER BY
      CASE WHEN ${newestFirst} THEN id END DESC,
      CASE WHEN ${!newestFirst} THEN id END ASC
    OFFSET ${options.offset}
    LIMIT ${options.limit}
  `;
  return rows.map((row) => mapAuditRow(row));
}

export async function countAuditEventsFiltered(
  sql: DbSql,
  options: AuditListFilters,
): Promise<number> {
  const excludeActions = options.excludeActions ?? [];
  const labelIlike = entityLabelIlike(options.entityLabel);
  const rows = await sql<[{ count: string }]>`
    SELECT count(*)::text AS count
    FROM audit_events
    WHERE
      (${options.from ?? null}::timestamptz IS NULL OR occurred_at >= ${options.from ?? null}::timestamptz)
      AND (${options.to ?? null}::timestamptz IS NULL OR occurred_at <= ${options.to ?? null}::timestamptz)
      AND (
        ${options.actor ?? null}::text IS NULL
        OR actor_id::text = ${options.actor ?? null}
        OR actor_username = ${options.actor ?? null}
      )
      AND (${options.entityType ?? null}::text IS NULL OR entity_type = ${options.entityType ?? null})
      AND (${options.entityId ?? null}::text IS NULL OR entity_id = ${options.entityId ?? null})
      AND (
        ${labelIlike}::text IS NULL
        OR (
          entity_label IS NOT NULL
          AND entity_label ILIKE ${labelIlike} ESCAPE ${"\\"}
        )
      )
      AND (${options.action ?? null}::text IS NULL OR action = ${options.action ?? null})
      AND (
        ${options.reason ?? null}::text IS NULL
        OR (
          reason IS NOT NULL
          AND position(lower(${options.reason ?? null}) in lower(reason)) > 0
        )
      )
      AND (${excludeActions.length === 0} OR action <> ALL(${excludeActions}::text[]))
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function selectAuditEventsAfter(
  sql: DbSql,
  afterId: number,
  limit: number,
): Promise<ChainedAuditEvent[]> {
  const rows = await sql<Record<string, unknown>[]>`
    SELECT
      id, occurred_at, actor_id, actor_username, actor_role, action,
      entity_type, entity_id, entity_label, changed_fields, before, after,
      reason, request_id, host(ip)::text AS ip, user_agent, prev_hash, hash
    FROM audit_events
    WHERE id > ${afterId}
    ORDER BY id ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => mapAuditRow(row));
}
