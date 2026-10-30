import {
  CRITICALITY_LABELS,
  DATA_CLASS_LABELS,
  FIELD_LABELS,
  HOSTING_LABELS,
  LIFECYCLE_LABELS,
  REJECTION_LABELS,
  ROLE_LABELS,
  SYSTEM_TYPE_LABELS,
  VALIDATION_LABELS,
  actionLabel,
  entityTypeLabel,
  fieldLabel,
} from "@/lib/labels";
import { ERROR_CODES, type ErrorCode } from "@/server/http/errors";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SERVICE_TIMESTAMP_KEYS = new Set(["created_at", "updated_at", "archived_at"]);

const HIDDEN_KEYS = new Set([
  "id",
  "version",
  "created_at",
  "updated_at",
  "archived_at",
  "actor_id",
  "entity_id",
  "entityId",
  "prev_hash",
  "hash",
  "password_hash",
  "mfa_secret",
  "password",
  "process_owner_id",
  "system_owner_id",
  "quality_owner_id",
]);

const OWNER_ID_TO_NAME: Record<string, string> = {
  process_owner_id: "process_owner_name",
  system_owner_id: "system_owner_name",
  quality_owner_id: "quality_owner_name",
};

export type SnapshotLine = { label: string; value: string };

export function displayText(value: string | null | undefined): string {
  if (value === undefined || value === null || value.trim().length === 0) {
    return "—";
  }
  return value;
}

export function formatDate(value: string | null | undefined): string {
  if (value === undefined || value === null || value.length === 0) {
    return "—";
  }
  if (DATE_ONLY.test(value)) {
    const [year, month, day] = value.split("-");
    if (year === undefined || month === undefined || day === undefined) {
      return "—";
    }
    return `${day}.${month}.${year}`;
  }
  return formatDateTimeUtc(value);
}

export function formatDateTimeUtc(value: string | null | undefined): string {
  if (value === undefined || value === null || value.length === 0) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const formatted = date.toLocaleString("ru-RU", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${formatted} UTC`;
}

export function formatHours(value: number | null | undefined): string {
  if (value === undefined || value === null) {
    return "—";
  }
  return `${String(value)} ч`;
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isHiddenAuditKey(key: string): boolean {
  return HIDDEN_KEYS.has(key);
}

export function formatKnownScalar(value: string): string {
  if (isUuid(value)) {
    return "—";
  }
  if (value in ROLE_LABELS) {
    return ROLE_LABELS[value as keyof typeof ROLE_LABELS];
  }
  if (value in SYSTEM_TYPE_LABELS) {
    return SYSTEM_TYPE_LABELS[value as keyof typeof SYSTEM_TYPE_LABELS];
  }
  if (value in CRITICALITY_LABELS) {
    return CRITICALITY_LABELS[value as keyof typeof CRITICALITY_LABELS];
  }
  if (value in LIFECYCLE_LABELS) {
    return LIFECYCLE_LABELS[value as keyof typeof LIFECYCLE_LABELS];
  }
  if (value in VALIDATION_LABELS) {
    return VALIDATION_LABELS[value as keyof typeof VALIDATION_LABELS];
  }
  if (value in HOSTING_LABELS) {
    return HOSTING_LABELS[value as keyof typeof HOSTING_LABELS];
  }
  if (value in DATA_CLASS_LABELS) {
    return DATA_CLASS_LABELS[value as keyof typeof DATA_CLASS_LABELS];
  }
  if (value === "xlsx") {
    return "Excel";
  }
  if (value === "pdf") {
    return "PDF";
  }
  if (value === "newest" || value === "oldest") {
    return FIELD_LABELS[value] ?? value;
  }
  if (value in REJECTION_LABELS) {
    return REJECTION_LABELS[value as keyof typeof REJECTION_LABELS] ?? "Отказ";
  }
  const action = actionLabel(value);
  if (action !== value) {
    return action;
  }
  const entity = entityTypeLabel(value);
  if (entity !== value) {
    return entity;
  }
  if ((ERROR_CODES as readonly string[]).includes(value) || /^[A-Z]+(_[A-Z0-9]+)+$/.test(value)) {
    return "Отказ";
  }
  return value;
}

export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "Да" : "Нет";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "—";
  }
  if (typeof value === "string") {
    if (value.length === 0 || isUuid(value)) {
      return "—";
    }
    if (DATE_ONLY.test(value) || value.includes("T")) {
      const formatted = formatDate(value);
      if (formatted !== "—") {
        return formatted;
      }
    }
    return formatKnownScalar(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "—";
    }
    return value.map((item) => formatAuditValue(item)).join(", ");
  }
  if (typeof value === "object") {
    const lines = snapshotLines(value, null);
    if (lines.length === 0) {
      return "—";
    }
    return lines.map((line) => `${line.label}: ${line.value}`).join("; ");
  }
  return "—";
}

function resolveDisplayKey(key: string, record: Record<string, unknown>): string | null {
  const mapped = OWNER_ID_TO_NAME[key];
  if (mapped !== undefined) {
    return mapped;
  }
  if (isHiddenAuditKey(key)) {
    return null;
  }
  if (!(key in FIELD_LABELS) && key !== "code" && key !== "name") {
    return null;
  }
  if (mapped === undefined && isUuid(String(record[key] ?? ""))) {
    return null;
  }
  return key;
}

export function visibleChangedFields(fields: readonly string[] | null): string[] {
  if (fields === null || fields.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const visible: string[] = [];
  for (const field of fields) {
    const mapped = OWNER_ID_TO_NAME[field] ?? field;
    if (isHiddenAuditKey(mapped) || SERVICE_TIMESTAMP_KEYS.has(mapped)) {
      continue;
    }
    if (!(mapped in FIELD_LABELS) && mapped !== "code" && mapped !== "name") {
      continue;
    }
    if (seen.has(mapped)) {
      continue;
    }
    seen.add(mapped);
    visible.push(mapped);
  }
  return visible;
}

export function snapshotLines(
  payload: unknown,
  changedFields: readonly string[] | null,
): SnapshotLine[] {
  if (payload === null || payload === undefined) {
    return [];
  }
  if (typeof payload !== "object" || Array.isArray(payload)) {
    const text = formatAuditValue(payload);
    return text === "—" ? [] : [{ label: "Значение", value: text }];
  }
  const record = payload as Record<string, unknown>;
  const keys =
    changedFields !== null && changedFields.length > 0
      ? [...changedFields]
      : Object.keys(record);
  const lines: SnapshotLine[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const displayKey = resolveDisplayKey(key, record);
    if (displayKey === null || seen.has(displayKey)) {
      continue;
    }
    seen.add(displayKey);
    const raw = record[displayKey] ?? record[key];
    if (typeof raw === "string" && isUuid(raw)) {
      continue;
    }
    const label = fieldLabel(displayKey);
    if (label === displayKey && isHiddenAuditKey(displayKey)) {
      continue;
    }
    lines.push({ label, value: formatAuditValue(raw ?? null) });
  }
  return lines;
}

export function formatAuditSnapshot(
  payload: unknown,
  changedFields: readonly string[] | null,
): string {
  if (isRejectionPayload(payload)) {
    return rejectionLabel(payload);
  }
  const lines = snapshotLines(payload, changedFields);
  if (lines.length === 0) {
    return "—";
  }
  return lines.map((line) => `${line.label}: ${line.value}`).join("; ");
}

export type ChangedFieldsContext = {
  before?: unknown;
  after?: unknown;
};

export const CREATED_RECORD_LABEL = "Создана новая запись";

export function formatChangedFieldsLabel(
  fields: readonly string[] | null,
  context?: ChangedFieldsContext,
): string {
  if (context !== undefined && isRejectionPayload(context.after)) {
    return "—";
  }
  if (context !== undefined && context.before === null) {
    const visible = visibleChangedFields(fields);
    if (visible.length === 0) {
      return "—";
    }
    return CREATED_RECORD_LABEL;
  }
  const visible = visibleChangedFields(fields);
  if (visible.length === 0) {
    return "—";
  }
  return visible.map((field) => fieldLabel(field)).join(", ");
}

function isErrorCode(value: string): value is ErrorCode {
  return Object.prototype.hasOwnProperty.call(REJECTION_LABELS, value);
}

export function isRejectionPayload(value: unknown): value is { code: ErrorCode } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== "code") {
    return false;
  }
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" && isErrorCode(code);
}

export function rejectionLabel(value: unknown): string {
  if (!isRejectionPayload(value)) {
    return "Отказ";
  }
  return REJECTION_LABELS[value.code];
}
