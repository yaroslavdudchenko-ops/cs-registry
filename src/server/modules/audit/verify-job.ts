import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Sql } from "postgres";

import { verifyStoredChain } from "@/server/modules/audit/read";

export type AuditCheckpoint = {
  id: number;
  hash: string;
  count: number;
  checkedAt: string;
};

export type VerifyJobOk = {
  ok: true;
  count: number;
  last: { id: number; hash: string } | null;
  message: string;
};

export type VerifyJobBreak = {
  ok: false;
  count: number;
  eventId: number;
  reason: "hash_mismatch" | "prev_hash_mismatch" | "checkpoint_mismatch";
  message: string;
};

export type VerifyJobResult = VerifyJobOk | VerifyJobBreak;

function reasonText(reason: "hash_mismatch" | "prev_hash_mismatch" | "checkpoint_mismatch"): string {
  if (reason === "hash_mismatch") {
    return "несовпадение hash";
  }
  if (reason === "prev_hash_mismatch") {
    return "несовпадение prev_hash";
  }
  return "расхождение контрольной точки";
}

export function formatChainOk(count: number): string {
  return `Проверено записей: ${String(count)}\nЦепочка цела.`;
}

export function formatChainBreak(
  count: number,
  eventId: number,
  reason: "hash_mismatch" | "prev_hash_mismatch" | "checkpoint_mismatch",
): string {
  return `Проверено записей: ${String(count)}\nРазрыв цепочки: запись id=${String(eventId)}, причина: ${reasonText(reason)}.`;
}

export function readCheckpoint(filePath: string): AuditCheckpoint | null {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("id" in parsed) ||
      !("hash" in parsed) ||
      !("count" in parsed)
    ) {
      return null;
    }
    const id = Number((parsed as AuditCheckpoint).id);
    const hash = String((parsed as AuditCheckpoint).hash);
    const count = Number((parsed as AuditCheckpoint).count);
    const checkedAt = String((parsed as AuditCheckpoint).checkedAt ?? "");
    if (!Number.isInteger(id) || (hash.length === 0 && id !== 0)) {
      return null;
    }
    return { id, hash, count, checkedAt };
  } catch {
    return null;
  }
}

export function writeCheckpointAtomic(filePath: string, checkpoint: AuditCheckpoint): void {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.${String(process.pid)}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  renameSync(tempPath, filePath);
}

export function compareCheckpoint(
  previous: AuditCheckpoint | null,
  storedAtPreviousId: { id: number; hash: string } | null,
  currentLast: { id: number; hash: string } | null,
): { ok: true } | { ok: false; message: string } {
  if (previous === null) {
    return { ok: true };
  }
  if (previous.id === 0) {
    return { ok: true };
  }
  if (storedAtPreviousId === null) {
    return {
      ok: false,
      message: `Контрольная точка ссылается на отсутствующую запись id=${String(previous.id)}.`,
    };
  }
  if (storedAtPreviousId.hash !== previous.hash) {
    return {
      ok: false,
      message: `Контрольная точка расходится: ожидался id=${String(previous.id)} hash=${previous.hash}, в базе hash=${storedAtPreviousId.hash}.`,
    };
  }
  if (currentLast !== null && currentLast.id < previous.id) {
    return {
      ok: false,
      message: `В журнале меньше записей, чем в контрольной точке (было id=${String(previous.id)}, стало id=${String(currentLast.id)}).`,
    };
  }
  if (currentLast === null) {
    return {
      ok: false,
      message: `В журнале меньше записей, чем в контрольной точке (было id=${String(previous.id)}, стало пусто).`,
    };
  }
  return { ok: true };
}

function mapAuditIdRow(row: { id: bigint | number; hash: string }): { id: number; hash: string } {
  return { id: Number(row.id), hash: row.hash };
}

/**
 * Последняя запись по числовому id. Нельзя `ORDER BY id` при `id::text AS id`:
 * PostgreSQL сортирует по выходному алиасу, и «9» оказывается больше «48».
 */
export async function loadLast(sql: Sql): Promise<{ id: number; hash: string } | null> {
  const rows = await sql<[{ id: bigint | number; hash: string }]>`
    SELECT id, hash FROM audit_events ORDER BY audit_events.id DESC LIMIT 1
  `;
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return mapAuditIdRow(row);
}

export async function loadById(sql: Sql, id: number): Promise<{ id: number; hash: string } | null> {
  const rows = await sql<[{ id: bigint | number; hash: string }]>`
    SELECT id, hash FROM audit_events WHERE audit_events.id = ${id} LIMIT 1
  `;
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return mapAuditIdRow(row);
}

async function countRows(sql: Sql): Promise<number> {
  const rows = await sql<[{ n: string }]>`SELECT count(*)::text AS n FROM audit_events`;
  return Number(rows[0]?.n ?? 0);
}

export async function runAuditVerifyJob(
  sql: Sql,
  options?: { checkpointFile?: string },
): Promise<VerifyJobResult> {
  const count = await countRows(sql);
  const chain = await verifyStoredChain(sql);
  if (!chain.ok) {
    return {
      ok: false,
      count,
      eventId: chain.eventId,
      reason: chain.reason,
      message: formatChainBreak(count, chain.eventId, chain.reason),
    };
  }
  const last = await loadLast(sql);
  const checkpointFile = options?.checkpointFile;
  if (checkpointFile !== undefined && checkpointFile.length > 0) {
    const previous = readCheckpoint(checkpointFile);
    const stored =
      previous !== null && previous.id > 0 ? await loadById(sql, previous.id) : null;
    const compared = compareCheckpoint(previous, stored, last);
    if (!compared.ok) {
      return {
        ok: false,
        count,
        eventId: previous?.id ?? 0,
        reason: "checkpoint_mismatch",
        message: compared.message,
      };
    }
    writeCheckpointAtomic(checkpointFile, {
      id: last?.id ?? 0,
      hash: last?.hash ?? "",
      count,
      checkedAt: new Date().toISOString(),
    });
  }
  return {
    ok: true,
    count,
    last,
    message: formatChainOk(count),
  };
}

export function resolveVerifyDatabaseUrl(env: NodeJS.Dict<string>): string | undefined {
  const primary = env["DATABASE_URL"];
  if (primary !== undefined && primary.length > 0) {
    return primary;
  }
  const admin = env["DATABASE_ADMIN_URL"];
  if (admin !== undefined && admin.length > 0) {
    return admin;
  }
  return undefined;
}
