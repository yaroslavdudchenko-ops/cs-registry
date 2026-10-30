import type { Sql } from "postgres";

import {
  type DbSql,
  insertAuditEventRow,
  lockAuditChain,
  nextAuditIdentity,
  selectLastAuditHash,
} from "@/server/db/audit-repository";

import {
  type AuditHashPayload,
  type ChainedAuditEvent,
  type JsonValue,
  computeEventHash,
} from "./hash-chain";
import { REASON_REQUIRED_CODE } from "./reason";

export type AuditActorContext = {
  actorId: string | null;
  actorUsername: string;
  actorRole: string;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
};

export function systemActor(
  requestId: string,
  extras?: { ip?: string | null; userAgent?: string | null },
): AuditActorContext {
  return {
    actorId: null,
    actorUsername: "system",
    actorRole: "system",
    requestId,
    ip: extras?.ip ?? null,
    userAgent: extras?.userAgent ?? null,
  };
}

export type AppendAuditEventInput = {
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  changedFields: string[] | null;
  before: JsonValue;
  after: JsonValue;
  reason: string | null;
};

/**
 * Запись события внутри уже открытой транзакции вызывающего.
 * Не начинать новую транзакцию здесь: иначе аудит отцепится от UPDATE реестра.
 */
export async function appendAuditEventInTx(
  tx: DbSql,
  actor: AuditActorContext,
  input: AppendAuditEventInput,
): Promise<ChainedAuditEvent> {
  await lockAuditChain(tx);
  const prevHash = await selectLastAuditHash(tx);
  const identity = await nextAuditIdentity(tx);

  const payload: AuditHashPayload = {
    id: identity.id,
    occurred_at: identity.occurredAt,
    actor_id: actor.actorId,
    actor_username: actor.actorUsername,
    actor_role: actor.actorRole,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    entity_label: input.entityLabel,
    changed_fields: input.changedFields,
    before: input.before,
    after: input.after,
    reason: input.reason,
    request_id: actor.requestId,
    ip: actor.ip,
    user_agent: actor.userAgent,
    prev_hash: prevHash,
  };

  const hash = computeEventHash(payload);

  await insertAuditEventRow(tx, {
    id: payload.id,
    occurredAt: payload.occurred_at,
    actorId: payload.actor_id,
    actorUsername: payload.actor_username,
    actorRole: payload.actor_role,
    action: payload.action,
    entityType: payload.entity_type,
    entityId: payload.entity_id,
    entityLabel: payload.entity_label,
    changedFields: payload.changed_fields,
    before: payload.before,
    after: payload.after,
    reason: payload.reason,
    requestId: payload.request_id,
    ip: payload.ip,
    userAgent: payload.user_agent,
    prevHash: payload.prev_hash,
    hash,
  });

  return { ...payload, hash };
}

/**
 * Атомарная запись события: lock → last hash → id/now() из БД → hash → INSERT.
 * Хеш снаружи не принимается — иначе вызывающий мог бы записать произвольную цепочку.
 */
export async function appendAuditEvent(
  sql: Sql,
  actor: AuditActorContext,
  input: AppendAuditEventInput,
): Promise<ChainedAuditEvent> {
  return sql.begin(async (tx) => appendAuditEventInTx(tx, actor, input));
}

export type RejectionCode = typeof REASON_REQUIRED_CODE | "FORBIDDEN" | "OWNERS_REQUIRED";

export type AppendRejectionInput = {
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  changedFields?: string[] | null;
  code: RejectionCode;
};

export async function appendRejectionEventInTx(
  tx: DbSql,
  actor: AuditActorContext,
  input: AppendRejectionInput,
): Promise<ChainedAuditEvent> {
  return appendAuditEventInTx(tx, actor, {
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    changedFields: input.changedFields ?? null,
    before: null,
    after: { code: input.code },
    reason: null,
  });
}

/** Отказ (нет reason, нет прав, нет владельцев) — отдельный вызов, не побочный эффект валидатора. */
export async function appendRejectionEvent(
  sql: Sql,
  actor: AuditActorContext,
  input: AppendRejectionInput,
): Promise<ChainedAuditEvent> {
  return sql.begin(async (tx) => appendRejectionEventInTx(tx, actor, input));
}
