import type { Sql } from "postgres";

import {
  type AuditListFilters,
  countAuditEvents,
  countAuditEventsFiltered,
  selectAuditEventsAfter,
  selectAuditEventsPage,
} from "@/server/db/audit-repository";

import { type ChainVerifyResult, type ChainedAuditEvent, verifyChain } from "./hash-chain";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const VERIFY_WINDOW = 500;

/**
 * Чтение журнала, истории и выгрузки — доступ к данным, не изменение записи.
 * В ленте карточки их быть не должно (URS-093): иначе каждый просмотр/выгрузка
 * растит `total`. События остаются в общем журнале.
 */
export const OBJECT_HISTORY_EXCLUDED_ACTIONS = ["read_system_history", "export"] as const;

export type AuditPage = {
  items: ChainedAuditEvent[];
  page: number;
  pageSize: number;
  total: number;
};

export function clampPageSize(pageSize: number | undefined): number {
  if (pageSize === undefined || Number.isNaN(pageSize) || pageSize < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.trunc(pageSize), MAX_PAGE_SIZE);
}

export async function listAuditEvents(
  sql: Sql,
  query?: { page?: number; pageSize?: number; newestFirst?: boolean } & AuditListFilters,
): Promise<AuditPage> {
  const page = query?.page !== undefined && query.page > 0 ? Math.trunc(query.page) : 1;
  const pageSize = clampPageSize(query?.pageSize);
  const offset = (page - 1) * pageSize;
  const filters: AuditListFilters = {};
  if (query?.from !== undefined) filters.from = query.from;
  if (query?.to !== undefined) filters.to = query.to;
  if (query?.actor !== undefined) filters.actor = query.actor;
  if (query?.entityType !== undefined) filters.entityType = query.entityType;
  if (query?.entityId !== undefined) filters.entityId = query.entityId;
  if (query?.entityLabel !== undefined) filters.entityLabel = query.entityLabel;
  if (query?.action !== undefined) filters.action = query.action;
  if (query?.reason !== undefined) filters.reason = query.reason;
  if (query?.excludeActions !== undefined) filters.excludeActions = query.excludeActions;
  const hasFilter = Object.values(filters).some((value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return value !== null && value !== "";
  });
  const newestFirst = query?.newestFirst === true;
  const [total, items] = await Promise.all([
    hasFilter ? countAuditEventsFiltered(sql, filters) : countAuditEvents(sql),
    selectAuditEventsPage(sql, { offset, limit: pageSize, newestFirst, ...filters }),
  ]);
  return { items, page, pageSize, total };
}

/**
 * История объекта — та же выборка и тот же сериализатор, что общий журнал.
 * `entityId` обязателен: без него это уже не история объекта.
 */
export async function listObjectHistory(
  sql: Sql,
  query: { entityType: string; entityId: string; page?: number; pageSize?: number },
): Promise<AuditPage> {
  if (query.entityId.length === 0) {
    throw new Error("listObjectHistory requires entity_id");
  }
  const params: {
    page?: number;
    pageSize?: number;
    newestFirst: true;
  } & AuditListFilters = {
    entityType: query.entityType,
    entityId: query.entityId,
    newestFirst: true,
    excludeActions: OBJECT_HISTORY_EXCLUDED_ACTIONS,
  };
  if (query.page !== undefined) params.page = query.page;
  if (query.pageSize !== undefined) params.pageSize = query.pageSize;
  return listAuditEvents(sql, params);
}

/** Полная история объекта страницами по лимиту журнала, без отдельного SQL. */
export async function listObjectHistoryAll(
  sql: Sql,
  query: { entityType: string; entityId: string },
): Promise<ChainedAuditEvent[]> {
  const items: ChainedAuditEvent[] = [];
  let page = 1;
  for (;;) {
    const result = await listObjectHistory(sql, {
      entityType: query.entityType,
      entityId: query.entityId,
      page,
      pageSize: MAX_PAGE_SIZE,
    });
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= result.total) {
      return items;
    }
    page += 1;
  }
}

export const AUDIT_ORDER_VALUES = ["newest", "oldest"] as const;
export type AuditOrder = (typeof AUDIT_ORDER_VALUES)[number];

/** `null` — параметр задан и не из белого списка (400). Пустое и отсутствие — newest. */
export function parseAuditOrder(raw: string | null): AuditOrder | null {
  if (raw === null || raw.length === 0) {
    return "newest";
  }
  if (raw === "newest" || raw === "oldest") {
    return raw;
  }
  return null;
}

export function parsePageParams(
  searchParams: URLSearchParams,
): { page: number; pageSize: number } | null {
  const pageRaw = searchParams.get("page");
  const sizeRaw = searchParams.get("pageSize");
  const page =
    pageRaw === null || pageRaw.length === 0 ? 1 : Number.parseInt(pageRaw, 10);
  const pageSize =
    sizeRaw === null || sizeRaw.length === 0 ? DEFAULT_PAGE_SIZE : Number.parseInt(sizeRaw, 10);
  if (
    (pageRaw !== null && pageRaw.length > 0 && (!Number.isInteger(page) || page < 1)) ||
    (sizeRaw !== null && sizeRaw.length > 0 && (!Number.isInteger(pageSize) || pageSize < 1))
  ) {
    return null;
  }
  return { page, pageSize: clampPageSize(pageSize) };
}

/**
 * Полная проверка цепочки окнами, без SELECT * всей таблицы в память.
 */
export async function verifyStoredChain(
  sql: Sql,
  options?: { windowSize?: number },
): Promise<ChainVerifyResult> {
  const windowSize =
    options?.windowSize !== undefined && options.windowSize > 0
      ? Math.min(options.windowSize, 1000)
      : VERIFY_WINDOW;

  let afterId = 0;
  let previous: ChainedAuditEvent | null = null;
  let scanned = 0;

  for (;;) {
    const batch = await selectAuditEventsAfter(sql, afterId, windowSize);
    if (batch.length === 0) {
      return { ok: true };
    }

    const expectedFirstPrevHash = previous === null ? null : previous.hash;
    const result = verifyChain(batch, { expectedFirstPrevHash });
    if (!result.ok) {
      return {
        ...result,
        index: scanned + result.index,
      };
    }

    const last = batch[batch.length - 1];
    if (last === undefined) {
      return { ok: true };
    }
    previous = last;
    afterId = last.id;
    scanned += batch.length;
  }
}
