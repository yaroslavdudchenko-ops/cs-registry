import type { DbSql } from "@/server/db/audit-repository";
import { getSql } from "@/server/db/client";
import {
  archiveSystem,
  insertSystem,
  listSystems,
  lockSystemCode,
  nextSystemCode,
  restoreSystem,
  selectSystemById,
  toListItem,
  toPublicSystem,
  updateSystem,
  type SystemListQuery,
  type SystemPatch,
  type SystemRow,
} from "@/server/db/systems-repository";
import { selectActiveUsersByIds } from "@/server/db/users-repository";
import { ApiError } from "@/server/http/errors";
import {
  appendAuditEventInTx,
  appendRejectionEvent,
  type AuditActorContext,
} from "@/server/modules/audit/write";
import { assertReason, ReasonRequiredError } from "@/server/modules/audit/reason";
import { isAllowed } from "@/server/modules/auth/rbac";
import {
  parseCreateSystem,
  parsePatchSystem,
  requireOwners,
  type CreateSystemInput,
  type PatchSystemInput,
} from "@/server/modules/systems/fields";

function nullishText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

async function assertActiveOwners(
  sql: DbSql,
  processOwnerId: string,
  systemOwnerId: string,
  qualityOwnerId: string | null,
): Promise<void> {
  const ids = [processOwnerId, systemOwnerId];
  if (qualityOwnerId !== null) {
    ids.push(qualityOwnerId);
  }
  const unique = [...new Set(ids)];
  const found = await selectActiveUsersByIds(sql, unique);
  if (found.length !== unique.length) {
    throw new ApiError("VALIDATION_ERROR");
  }
}

function insertFromCreate(input: CreateSystemInput, owners: { processOwnerId: string; systemOwnerId: string }) {
  return {
    name: input.name,
    vendor: nullishText(input.vendor),
    productVersion: nullishText(input.product_version),
    description: nullishText(input.description),
    systemType: input.system_type,
    businessProcess: nullishText(input.business_process),
    processOwnerId: owners.processOwnerId,
    systemOwnerId: owners.systemOwnerId,
    qualityOwnerId: input.quality_owner_id === undefined ? null : input.quality_owner_id,
    site: nullishText(input.site),
    hostingType: input.hosting_type,
    hostingProvider: nullishText(input.hosting_provider),
    dataClassification: input.data_classification,
    isGxpRelevant: input.is_gxp_relevant,
    criticality: input.criticality,
    lifecycleStatus: input.lifecycle_status,
    validationStatus: input.validation_status,
    validatedAt: input.validated_at ?? null,
    nextReviewAt: input.next_review_at ?? null,
    authModel: nullishText(input.auth_model),
    backupRpoHours: input.backup_rpo_hours ?? null,
    backupRtoHours: input.backup_rto_hours ?? null,
    notes: nullishText(input.notes),
  };
}

export async function createSystemRecord(
  body: unknown,
  actor: AuditActorContext,
): Promise<Record<string, unknown>> {
  const sql = getSql();
  const input = parseCreateSystem(body);

  let owners: { processOwnerId: string; systemOwnerId: string };
  try {
    owners = requireOwners(input.process_owner_id, input.system_owner_id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "OWNERS_REQUIRED") {
      await appendRejectionEvent(sql, actor, {
        action: "create",
        entityType: "systems",
        entityId: null,
        entityLabel: input.name,
        code: "OWNERS_REQUIRED",
      });
    }
    throw error;
  }

  const qualityOwnerId = input.quality_owner_id === undefined ? null : input.quality_owner_id;
  await assertActiveOwners(sql, owners.processOwnerId, owners.systemOwnerId, qualityOwnerId);

  const created = await sql.begin(async (tx) => {
    await lockSystemCode(tx);
    const code = await nextSystemCode(tx);
    const inserted = await insertSystem(tx, code, insertFromCreate(input, owners));
    const row = await selectSystemById(tx, inserted.id);
    if (row === null) {
      throw new ApiError("INTERNAL_ERROR");
    }
    const publicRow = toPublicSystem(row);
    await appendAuditEventInTx(tx, actor, {
      action: "create",
      entityType: "systems",
      entityId: row.id,
      entityLabel: `${row.code} ${row.name}`,
      changedFields: Object.keys(publicRow),
      before: null,
      after: publicRow as { [key: string]: import("@/server/modules/audit/hash-chain").JsonValue },
      reason: nullishText(input.reason),
    });
    return row;
  });

  return toPublicSystem(created);
}

function changedFieldsOf(current: SystemRow, patch: PatchSystemInput): string[] {
  const mapping: Array<[string, unknown, unknown]> = [
    ["name", patch.name, current.name],
    ["vendor", patch.vendor, current.vendor],
    ["product_version", patch.product_version, current.product_version],
    ["description", patch.description, current.description],
    ["system_type", patch.system_type, current.system_type],
    ["business_process", patch.business_process, current.business_process],
    ["process_owner_id", patch.process_owner_id, current.process_owner_id],
    ["system_owner_id", patch.system_owner_id, current.system_owner_id],
    ["quality_owner_id", patch.quality_owner_id, current.quality_owner_id],
    ["site", patch.site, current.site],
    ["hosting_type", patch.hosting_type, current.hosting_type],
    ["hosting_provider", patch.hosting_provider, current.hosting_provider],
    ["data_classification", patch.data_classification, current.data_classification],
    ["is_gxp_relevant", patch.is_gxp_relevant, current.is_gxp_relevant],
    ["criticality", patch.criticality, current.criticality],
    ["lifecycle_status", patch.lifecycle_status, current.lifecycle_status],
    ["validation_status", patch.validation_status, current.validation_status],
    ["validated_at", patch.validated_at, current.validated_at],
    ["next_review_at", patch.next_review_at, current.next_review_at],
    ["auth_model", patch.auth_model, current.auth_model],
    ["backup_rpo_hours", patch.backup_rpo_hours, current.backup_rpo_hours],
    ["backup_rto_hours", patch.backup_rto_hours, current.backup_rto_hours],
    ["notes", patch.notes, current.notes],
  ];
  const changed: string[] = [];
  for (const [field, next, prev] of mapping) {
    if (next === undefined) {
      continue;
    }
    if (next !== prev) {
      changed.push(field);
    }
  }
  return changed;
}

function patchToRepo(patch: PatchSystemInput): SystemPatch {
  const result: SystemPatch = {};
  if (patch.name !== undefined) result.name = patch.name;
  if (patch.vendor !== undefined) result.vendor = nullishText(patch.vendor);
  if (patch.product_version !== undefined) result.productVersion = nullishText(patch.product_version);
  if (patch.description !== undefined) result.description = nullishText(patch.description);
  if (patch.system_type !== undefined) result.systemType = patch.system_type;
  if (patch.business_process !== undefined) result.businessProcess = nullishText(patch.business_process);
  if (patch.process_owner_id !== undefined && patch.process_owner_id !== null) {
    result.processOwnerId = patch.process_owner_id;
  }
  if (patch.system_owner_id !== undefined && patch.system_owner_id !== null) {
    result.systemOwnerId = patch.system_owner_id;
  }
  if (patch.quality_owner_id !== undefined) result.qualityOwnerId = patch.quality_owner_id;
  if (patch.site !== undefined) result.site = nullishText(patch.site);
  if (patch.hosting_type !== undefined) result.hostingType = patch.hosting_type;
  if (patch.hosting_provider !== undefined) result.hostingProvider = nullishText(patch.hosting_provider);
  if (patch.data_classification !== undefined) result.dataClassification = patch.data_classification;
  if (patch.is_gxp_relevant !== undefined) result.isGxpRelevant = patch.is_gxp_relevant;
  if (patch.criticality !== undefined) result.criticality = patch.criticality;
  if (patch.lifecycle_status !== undefined) result.lifecycleStatus = patch.lifecycle_status;
  if (patch.validation_status !== undefined) result.validationStatus = patch.validation_status;
  if (patch.validated_at !== undefined) result.validatedAt = patch.validated_at;
  if (patch.next_review_at !== undefined) result.nextReviewAt = patch.next_review_at;
  if (patch.auth_model !== undefined) result.authModel = nullishText(patch.auth_model);
  if (patch.backup_rpo_hours !== undefined) result.backupRpoHours = patch.backup_rpo_hours;
  if (patch.backup_rto_hours !== undefined) result.backupRtoHours = patch.backup_rto_hours;
  if (patch.notes !== undefined) result.notes = nullishText(patch.notes);
  return result;
}

const OWNER_ID_TO_NAME: Record<string, string> = {
  process_owner_id: "process_owner_name",
  system_owner_id: "system_owner_name",
  quality_owner_id: "quality_owner_name",
};

function sliceChanged(
  before: SystemRow,
  after: SystemRow,
  fields: string[],
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const publicBefore = toPublicSystem(before);
  const publicAfter = toPublicSystem(after);
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const field of fields) {
    b[field] = publicBefore[field];
    a[field] = publicAfter[field];
    const nameField = OWNER_ID_TO_NAME[field];
    if (nameField !== undefined) {
      b[nameField] = publicBefore[nameField];
      a[nameField] = publicAfter[nameField];
    }
  }
  return { before: b, after: a };
}

export async function updateSystemRecord(
  id: string,
  body: unknown,
  actor: AuditActorContext,
  role: string,
): Promise<Record<string, unknown>> {
  const sql = getSql();
  const input = parsePatchSystem(body);
  const current = await selectSystemById(sql, id);
  if (current === null) {
    throw new ApiError("NOT_FOUND");
  }

  if (input.process_owner_id === null || input.system_owner_id === null) {
    await appendRejectionEvent(sql, actor, {
      action: "update",
      entityType: "systems",
      entityId: id,
      entityLabel: `${current.code} ${current.name}`,
      code: "OWNERS_REQUIRED",
    });
    throw new ApiError("OWNERS_REQUIRED");
  }

  const changed = changedFieldsOf(current, input);
  if (changed.includes("validation_status") && !isAllowed(role, "systems.change_validation_status")) {
    await appendRejectionEvent(sql, actor, {
      action: "update",
      entityType: "systems",
      entityId: id,
      entityLabel: `${current.code} ${current.name}`,
      changedFields: ["validation_status"],
      code: "FORBIDDEN",
    });
    throw new ApiError("FORBIDDEN");
  }

  try {
    assertReason(input.reason ?? null, {
      changedFields: changed,
      currentValidationStatus: current.validation_status,
    });
  } catch (error) {
    if (error instanceof ReasonRequiredError) {
      await appendRejectionEvent(sql, actor, {
        action: "update",
        entityType: "systems",
        entityId: id,
        entityLabel: `${current.code} ${current.name}`,
        changedFields: changed,
        code: "REASON_REQUIRED",
      });
      throw new ApiError("REASON_REQUIRED");
    }
    throw error;
  }

  if (input.process_owner_id !== undefined || input.system_owner_id !== undefined || input.quality_owner_id !== undefined) {
    const processOwnerId = input.process_owner_id ?? current.process_owner_id;
    const systemOwnerId = input.system_owner_id ?? current.system_owner_id;
    const qualityOwnerId =
      input.quality_owner_id === undefined ? current.quality_owner_id : input.quality_owner_id;
    await assertActiveOwners(sql, processOwnerId, systemOwnerId, qualityOwnerId);
  }

  const updated = await sql.begin(async (tx) => {
    const row = await updateSystem(tx, id, input.version, patchToRepo(input));
    if (row === null) {
      throw new ApiError("VERSION_CONFLICT");
    }
    const afterRow = await selectSystemById(tx, id);
    if (afterRow === null) {
      throw new ApiError("INTERNAL_ERROR");
    }
    const slice = sliceChanged(current, afterRow, changed);
    await appendAuditEventInTx(tx, actor, {
      action: "update",
      entityType: "systems",
      entityId: id,
      entityLabel: `${afterRow.code} ${afterRow.name}`,
      changedFields: changed,
      before: slice.before as { [key: string]: import("@/server/modules/audit/hash-chain").JsonValue },
      after: slice.after as { [key: string]: import("@/server/modules/audit/hash-chain").JsonValue },
      reason: nullishText(input.reason),
    });
    return afterRow;
  });

  return toPublicSystem(updated);
}

export async function archiveSystemRecord(
  id: string,
  reason: string | undefined,
  version: number | undefined,
  actor: AuditActorContext,
): Promise<Record<string, unknown>> {
  const sql = getSql();
  const current = await selectSystemById(sql, id);
  if (current === null) {
    throw new ApiError("NOT_FOUND");
  }
  try {
    assertReason(reason ?? null, { changedFields: ["archived_at"], isArchive: true });
  } catch (error) {
    if (error instanceof ReasonRequiredError) {
      await appendRejectionEvent(sql, actor, {
        action: "archive",
        entityType: "systems",
        entityId: id,
        entityLabel: `${current.code} ${current.name}`,
        code: "REASON_REQUIRED",
      });
      throw new ApiError("REASON_REQUIRED");
    }
    throw error;
  }
  const expected = version ?? current.version;
  const updated = await sql.begin(async (tx) => {
    const row = await archiveSystem(tx, id, expected);
    if (row === null) {
      throw new ApiError("VERSION_CONFLICT");
    }
    await appendAuditEventInTx(tx, actor, {
      action: "archive",
      entityType: "systems",
      entityId: id,
      entityLabel: `${current.code} ${current.name}`,
      changedFields: ["archived_at"],
      before: { archived_at: null },
      after: { archived_at: row.archived_at === null ? null : row.archived_at.toISOString() },
      reason: reason ?? null,
    });
    return row;
  });
  const named = await selectSystemById(sql, updated.id);
  return toPublicSystem(named ?? updated);
}

export async function restoreSystemRecord(
  id: string,
  reason: string | undefined,
  version: number | undefined,
  actor: AuditActorContext,
): Promise<Record<string, unknown>> {
  const sql = getSql();
  const current = await selectSystemById(sql, id);
  if (current === null) {
    throw new ApiError("NOT_FOUND");
  }
  try {
    assertReason(reason ?? null, { changedFields: ["archived_at"], isRestore: true });
  } catch (error) {
    if (error instanceof ReasonRequiredError) {
      await appendRejectionEvent(sql, actor, {
        action: "restore",
        entityType: "systems",
        entityId: id,
        entityLabel: `${current.code} ${current.name}`,
        code: "REASON_REQUIRED",
      });
      throw new ApiError("REASON_REQUIRED");
    }
    throw error;
  }
  const expected = version ?? current.version;
  const updated = await sql.begin(async (tx) => {
    const row = await restoreSystem(tx, id, expected);
    if (row === null) {
      throw new ApiError("VERSION_CONFLICT");
    }
    await appendAuditEventInTx(tx, actor, {
      action: "restore",
      entityType: "systems",
      entityId: id,
      entityLabel: `${current.code} ${current.name}`,
      changedFields: ["archived_at"],
      before: { archived_at: current.archived_at === null ? null : current.archived_at.toISOString() },
      after: { archived_at: null },
      reason: reason ?? null,
    });
    return row;
  });
  const named = await selectSystemById(sql, updated.id);
  return toPublicSystem(named ?? updated);
}

export async function getSystemRecord(id: string): Promise<Record<string, unknown>> {
  const row = await selectSystemById(getSql(), id);
  if (row === null) {
    throw new ApiError("NOT_FOUND");
  }
  return toPublicSystem(row);
}

export async function listSystemRecords(query: SystemListQuery): Promise<{
  items: Record<string, unknown>[];
  page: number;
  pageSize: number;
  total: number;
}> {
  const result = await listSystems(getSql(), query);
  return {
    items: result.items.map(toListItem),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
  };
}

const EXPORT_PAGE_SIZE = 10_000;

export async function getSystemRow(id: string): Promise<SystemRow> {
  const row = await selectSystemById(getSql(), id);
  if (row === null) {
    throw new ApiError("NOT_FOUND");
  }
  return row;
}

export async function listSystemsForExport(
  query: Omit<SystemListQuery, "page" | "pageSize">,
): Promise<SystemRow[]> {
  const result = await listSystems(getSql(), {
    ...query,
    page: 1,
    pageSize: EXPORT_PAGE_SIZE,
  });
  return result.items;
}
