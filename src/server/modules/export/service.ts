import { z } from "zod";

import {
  CRITICALITY_LABELS,
  LIFECYCLE_LABELS,
  SYSTEM_TYPE_LABELS,
} from "@/lib/labels";
import { appVersion } from "@/server/config/env";
import { getSql } from "@/server/db/client";
import type { SystemListQuery, SystemRow } from "@/server/db/systems-repository";
import { ApiError } from "@/server/http/errors";
import type { JsonValue } from "@/server/modules/audit/hash-chain";
import { listObjectHistoryAll } from "@/server/modules/audit/read";
import { appendAuditEvent, type AuditActorContext } from "@/server/modules/audit/write";
import { exportFilename } from "@/server/modules/export/filename";
import type { ExportMeta } from "@/server/modules/export/params";
import { humanFilterKey } from "@/server/modules/export/params";
import { buildCardPdf, buildRegistryPdf } from "@/server/modules/export/pdf";
import { buildCardXlsx, buildRegistryXlsx } from "@/server/modules/export/xlsx";
import {
  type ExportFormat,
  type ExportQueryInput,
  parseExportFormat,
  parseExportQuery,
} from "@/server/modules/systems/fields";
import { getSystemRow, listSystemsForExport } from "@/server/modules/systems/service";

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PDF_CONTENT_TYPE = "application/pdf";

export type ExportFile = {
  body: Buffer;
  filename: string;
  contentType: string;
};

function contentTypeOf(format: ExportFormat): string {
  return format === "xlsx" ? XLSX_CONTENT_TYPE : PDF_CONTENT_TYPE;
}

function toListQuery(input: ExportQueryInput): Omit<SystemListQuery, "page" | "pageSize"> {
  const archivedRaw = input.archived;
  const gxpRaw = input.gxp;
  const isGxp =
    gxpRaw === undefined ? null : gxpRaw === "1" || gxpRaw === "true";
  return {
    q: input.q ?? null,
    type: input.type ?? null,
    domain: input.domain ?? null,
    criticality: input.criticality ?? null,
    gxpCriticality: input.gxp_criticality ?? null,
    gampCategory: input.gamp_category ?? null,
    status: input.status ?? null,
    validationStatus: input.validation_status ?? null,
    isGxp,
    company: input.company ?? null,
    ownerId: input.owner ?? null,
    processOwnerId: input.process_owner ?? null,
    site: input.site ?? null,
    includeArchived: archivedRaw === "1" || archivedRaw === "true",
    sort: input.sort ?? "code",
    order: input.order ?? "asc",
  };
}

function humanListFilters(input: ExportQueryInput): Record<string, string> {
  const filters: Record<string, string> = {};
  if (input.q !== undefined && input.q.length > 0) {
    filters[humanFilterKey("q")] = input.q;
  }
  if (input.type !== undefined) {
    filters[humanFilterKey("type")] = SYSTEM_TYPE_LABELS[input.type];
  }
  if (input.criticality !== undefined) {
    filters[humanFilterKey("criticality")] = CRITICALITY_LABELS[input.criticality];
  }
  if (input.status !== undefined) {
    filters[humanFilterKey("status")] = LIFECYCLE_LABELS[input.status];
  }
  if (input.site !== undefined && input.site.length > 0) {
    filters[humanFilterKey("site")] = input.site;
  }
  if (input.archived === "1" || input.archived === "true") {
    filters[humanFilterKey("archived")] = "включая архивные";
  }
  return filters;
}

function auditFilters(input: ExportQueryInput): { [key: string]: JsonValue } {
  const filters: { [key: string]: JsonValue } = {};
  if (input.q !== undefined && input.q.length > 0) filters.q = input.q;
  if (input.type !== undefined) filters.type = input.type;
  if (input.criticality !== undefined) filters.criticality = input.criticality;
  if (input.status !== undefined) filters.status = input.status;
  if (input.site !== undefined && input.site.length > 0) filters.site = input.site;
  if (input.archived !== undefined) filters.archived = input.archived;
  return filters;
}

function buildMeta(input: {
  actor: AuditActorContext;
  generatedAt: string;
  filters: Record<string, string>;
  rowCount: number;
  filename: string;
  title: string;
}): ExportMeta {
  return {
    actorUsername: input.actor.actorUsername,
    actorRole: input.actor.actorRole,
    generatedAt: input.generatedAt,
    filters: input.filters,
    rowCount: input.rowCount,
    appVersion: appVersion(),
    filename: input.filename,
    requestId: input.actor.requestId,
    title: input.title,
  };
}

async function writeExportEvent(
  actor: AuditActorContext,
  input: {
    format: ExportFormat;
    filters: { [key: string]: JsonValue };
    rowCount: number;
    entityId: string | null;
    entityLabel: string | null;
  },
): Promise<void> {
  await appendAuditEvent(getSql(), actor, {
    action: "export",
    entityType: "systems",
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    changedFields: null,
    before: null,
    after: {
      format: input.format,
      filters: input.filters,
      rowCount: input.rowCount,
    },
    reason: null,
  });
}

async function renderRegistry(format: ExportFormat, rows: SystemRow[], meta: ExportMeta): Promise<Buffer> {
  if (format === "xlsx") {
    return buildRegistryXlsx(rows, meta);
  }
  return buildRegistryPdf(rows, meta);
}

async function renderCard(
  format: ExportFormat,
  row: SystemRow,
  history: Parameters<typeof buildCardXlsx>[1],
  meta: ExportMeta,
): Promise<Buffer> {
  if (format === "xlsx") {
    return buildCardXlsx(row, history, meta);
  }
  return buildCardPdf(row, history, meta);
}

export async function exportRegistry(
  rawQuery: Record<string, string>,
  actor: AuditActorContext,
): Promise<ExportFile> {
  const input = parseExportQuery(rawQuery);
  const rows = await listSystemsForExport(toListQuery(input));
  const generatedAt = new Date().toISOString();
  const filename = exportFilename(actor.requestId, input.format, new Date(generatedAt));
  const meta = buildMeta({
    actor,
    generatedAt,
    filters: humanListFilters(input),
    rowCount: rows.length,
    filename,
    title: "Реестр компьютеризированных систем",
  });
  await writeExportEvent(actor, {
    format: input.format,
    filters: auditFilters(input),
    rowCount: rows.length,
    entityId: null,
    entityLabel: "Реестр",
  });
  const body = await renderRegistry(input.format, rows, meta);
  return { body, filename, contentType: contentTypeOf(input.format) };
}

export async function exportSystemCard(
  id: string,
  formatRaw: string | null,
  actor: AuditActorContext,
): Promise<ExportFile> {
  if (!z.uuid().safeParse(id).success) {
    throw new ApiError("NOT_FOUND");
  }
  const format = parseExportFormat(formatRaw);
  const row = await getSystemRow(id);
  const history = await listObjectHistoryAll(getSql(), { entityType: "systems", entityId: id });
  const generatedAt = new Date().toISOString();
  const filename = exportFilename(actor.requestId, format, new Date(generatedAt));
  const meta = buildMeta({
    actor,
    generatedAt,
    filters: { Код: row.code },
    rowCount: 1,
    filename,
    title: `Карточка системы ${row.code} ${row.name}`,
  });
  await writeExportEvent(actor, {
    format,
    filters: { code: row.code },
    rowCount: 1,
    entityId: row.id,
    entityLabel: `${row.code} ${row.name}`,
  });
  const body = await renderCard(format, row, history, meta);
  return { body, filename, contentType: contentTypeOf(format) };
}

export function searchParamsRecord(url: URL): Record<string, string> {
  const raw: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    raw[key] = value;
  });
  return raw;
}
