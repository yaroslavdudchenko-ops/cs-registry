import type { DbSql } from "@/server/db/audit-repository";
import type {
  Criticality,
  DataClassification,
  HostingType,
  LifecycleStatus,
  SystemType,
  ValidationStatus,
} from "@/server/db/enums";

export const SYSTEMS_CODE_LOCK_CLASS = 1;
export const SYSTEMS_CODE_LOCK_KEY = 2;

export const SYSTEM_SORT_FIELDS = [
  "code",
  "name",
  "criticality",
  "lifecycle_status",
  "next_review_at",
  "updated_at",
] as const;

export type SystemSortField = (typeof SYSTEM_SORT_FIELDS)[number];

export type SystemRow = {
  id: string;
  code: string;
  name: string;
  vendor: string | null;
  product_version: string | null;
  description: string | null;
  system_type: SystemType;
  business_process: string | null;
  process_owner_id: string;
  system_owner_id: string;
  quality_owner_id: string | null;
  process_owner_name: string;
  system_owner_name: string;
  quality_owner_name: string | null;
  site: string | null;
  hosting_type: HostingType;
  hosting_provider: string | null;
  data_classification: DataClassification;
  is_gxp_relevant: boolean;
  criticality: Criticality;
  lifecycle_status: LifecycleStatus;
  validation_status: ValidationStatus;
  validated_at: string | null;
  next_review_at: string | null;
  auth_model: string | null;
  backup_rpo_hours: number | null;
  backup_rto_hours: number | null;
  notes: string | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: number;
};

export type SystemInsert = {
  name: string;
  vendor: string | null;
  productVersion: string | null;
  description: string | null;
  systemType: SystemType;
  businessProcess: string | null;
  processOwnerId: string;
  systemOwnerId: string;
  qualityOwnerId: string | null;
  site: string | null;
  hostingType: HostingType;
  hostingProvider: string | null;
  dataClassification: DataClassification;
  isGxpRelevant: boolean;
  criticality: Criticality;
  lifecycleStatus: LifecycleStatus;
  validationStatus: ValidationStatus;
  validatedAt: string | null;
  nextReviewAt: string | null;
  authModel: string | null;
  backupRpoHours: number | null;
  backupRtoHours: number | null;
  notes: string | null;
};

export async function lockSystemCode(tx: DbSql): Promise<void> {
  await tx`SELECT pg_advisory_xact_lock(${SYSTEMS_CODE_LOCK_CLASS}, ${SYSTEMS_CODE_LOCK_KEY})`;
}

export async function nextSystemCode(tx: DbSql): Promise<string> {
  const rows = await tx<[{ n: string }]>`
    SELECT COALESCE(MAX(substring(code from 5)::int), 0)::text AS n
    FROM systems
    WHERE code ~ '^SYS-[0-9]+$'
  `;
  const next = Number(rows[0]?.n ?? 0) + 1;
  return `SYS-${String(next).padStart(4, "0")}`;
}

export async function insertSystem(tx: DbSql, code: string, input: SystemInsert): Promise<SystemRow> {
  const rows = await tx<SystemRow[]>`
    INSERT INTO systems (
      code, name, vendor, product_version, description, system_type, business_process,
      process_owner_id, system_owner_id, quality_owner_id, site, hosting_type, hosting_provider,
      data_classification, is_gxp_relevant, criticality, lifecycle_status, validation_status,
      validated_at, next_review_at, auth_model, backup_rpo_hours, backup_rto_hours, notes
    ) VALUES (
      ${code}, ${input.name}, ${input.vendor}, ${input.productVersion}, ${input.description},
      ${input.systemType}::system_type_enum, ${input.businessProcess},
      ${input.processOwnerId}, ${input.systemOwnerId}, ${input.qualityOwnerId},
      ${input.site}, ${input.hostingType}::hosting_type_enum, ${input.hostingProvider},
      ${input.dataClassification}::data_class_enum, ${input.isGxpRelevant},
      ${input.criticality}::criticality_enum, ${input.lifecycleStatus}::lifecycle_enum,
      ${input.validationStatus}::validation_enum,
      ${input.validatedAt}, ${input.nextReviewAt}, ${input.authModel},
      ${input.backupRpoHours}, ${input.backupRtoHours}, ${input.notes}
    )
    RETURNING
      id, code, name, vendor, product_version, description, system_type, business_process,
      process_owner_id, system_owner_id, quality_owner_id,
      '' AS process_owner_name, '' AS system_owner_name, NULL AS quality_owner_name,
      site, hosting_type, hosting_provider, data_classification, is_gxp_relevant,
      criticality, lifecycle_status, validation_status, validated_at::text AS validated_at,
      next_review_at::text AS next_review_at, auth_model, backup_rpo_hours, backup_rto_hours,
      notes, archived_at, created_at, updated_at, version
  `;
  const row = rows[0];
  if (row === undefined) {
    throw new Error("failed to insert system");
  }
  return row;
}

export async function selectSystemById(sql: DbSql, id: string): Promise<SystemRow | null> {
  const rows = await sql<SystemRow[]>`
    SELECT
      s.id, s.code, s.name, s.vendor, s.product_version, s.description, s.system_type,
      s.business_process, s.process_owner_id, s.system_owner_id, s.quality_owner_id,
      po.full_name AS process_owner_name,
      so.full_name AS system_owner_name,
      qo.full_name AS quality_owner_name,
      s.site, s.hosting_type, s.hosting_provider, s.data_classification, s.is_gxp_relevant,
      s.criticality, s.lifecycle_status, s.validation_status, s.validated_at::text AS validated_at,
      s.next_review_at::text AS next_review_at, s.auth_model, s.backup_rpo_hours, s.backup_rto_hours,
      s.notes, s.archived_at, s.created_at, s.updated_at, s.version
    FROM systems s
    INNER JOIN users po ON po.id = s.process_owner_id
    INNER JOIN users so ON so.id = s.system_owner_id
    LEFT JOIN users qo ON qo.id = s.quality_owner_id
    WHERE s.id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export type SystemListQuery = {
  q: string | null;
  type: SystemType | null;
  criticality: Criticality | null;
  status: LifecycleStatus | null;
  processOwnerId: string | null;
  site: string | null;
  includeArchived: boolean;
  page: number;
  pageSize: number;
  sort: SystemSortField;
  order: "asc" | "desc";
};

export type SystemListResult = {
  items: SystemRow[];
  page: number;
  pageSize: number;
  total: number;
};

export async function listSystems(sql: DbSql, query: SystemListQuery): Promise<SystemListResult> {
  const offset = (query.page - 1) * query.pageSize;
  const search = query.q !== null && query.q.length >= 2 ? query.q : null;

  const rows = await sql<Array<SystemRow & { total_count: string }>>`
    SELECT
      s.id, s.code, s.name, s.vendor, s.product_version, s.description, s.system_type,
      s.business_process, s.process_owner_id, s.system_owner_id, s.quality_owner_id,
      po.full_name AS process_owner_name,
      so.full_name AS system_owner_name,
      qo.full_name AS quality_owner_name,
      s.site, s.hosting_type, s.hosting_provider, s.data_classification, s.is_gxp_relevant,
      s.criticality, s.lifecycle_status, s.validation_status, s.validated_at::text AS validated_at,
      s.next_review_at::text AS next_review_at, s.auth_model, s.backup_rpo_hours, s.backup_rto_hours,
      s.notes, s.archived_at, s.created_at, s.updated_at, s.version,
      count(*) OVER()::text AS total_count
    FROM systems s
    INNER JOIN users po ON po.id = s.process_owner_id
    INNER JOIN users so ON so.id = s.system_owner_id
    LEFT JOIN users qo ON qo.id = s.quality_owner_id
    WHERE
      (${query.includeArchived} OR s.archived_at IS NULL)
      AND (${query.type}::text IS NULL OR s.system_type = ${query.type}::system_type_enum)
      AND (${query.criticality}::text IS NULL OR s.criticality = ${query.criticality}::criticality_enum)
      AND (${query.status}::text IS NULL OR s.lifecycle_status = ${query.status}::lifecycle_enum)
      AND (${query.processOwnerId}::uuid IS NULL OR s.process_owner_id = ${query.processOwnerId}::uuid)
      AND (${query.site}::text IS NULL OR s.site = ${query.site})
      AND (
        ${search}::text IS NULL
        OR unaccent(lower(s.code)) LIKE '%' || unaccent(lower(${search})) || '%'
        OR unaccent(lower(s.name)) LIKE '%' || unaccent(lower(${search})) || '%'
        OR unaccent(lower(COALESCE(s.vendor, ''))) LIKE '%' || unaccent(lower(${search})) || '%'
      )
    ORDER BY
      CASE
        WHEN ${search}::text IS NULL THEN 2
        WHEN lower(s.code) = lower(${search}) THEN 0
        WHEN unaccent(lower(s.name)) LIKE unaccent(lower(${search})) || '%' THEN 1
        ELSE 2
      END ASC,
      CASE WHEN ${query.sort} = 'code' AND ${query.order} = 'asc' THEN s.code END ASC,
      CASE WHEN ${query.sort} = 'code' AND ${query.order} = 'desc' THEN s.code END DESC,
      CASE WHEN ${query.sort} = 'name' AND ${query.order} = 'asc' THEN s.name END ASC,
      CASE WHEN ${query.sort} = 'name' AND ${query.order} = 'desc' THEN s.name END DESC,
      CASE WHEN ${query.sort} = 'criticality' AND ${query.order} = 'asc' THEN s.criticality END ASC,
      CASE WHEN ${query.sort} = 'criticality' AND ${query.order} = 'desc' THEN s.criticality END DESC,
      CASE WHEN ${query.sort} = 'lifecycle_status' AND ${query.order} = 'asc' THEN s.lifecycle_status END ASC,
      CASE WHEN ${query.sort} = 'lifecycle_status' AND ${query.order} = 'desc' THEN s.lifecycle_status END DESC,
      CASE WHEN ${query.sort} = 'next_review_at' AND ${query.order} = 'asc' THEN s.next_review_at END ASC,
      CASE WHEN ${query.sort} = 'next_review_at' AND ${query.order} = 'desc' THEN s.next_review_at END DESC,
      CASE WHEN ${query.sort} = 'updated_at' AND ${query.order} = 'asc' THEN s.updated_at END ASC,
      CASE WHEN ${query.sort} = 'updated_at' AND ${query.order} = 'desc' THEN s.updated_at END DESC,
      s.code ASC
    OFFSET ${offset}
    LIMIT ${query.pageSize}
  `;

  const total = rows.length === 0 ? 0 : Number(rows[0]?.total_count ?? 0);
  const items = rows.map((row) => {
    const { total_count, ...item } = row;
    void total_count;
    return item;
  });
  return { items, page: query.page, pageSize: query.pageSize, total };
}

export type SystemPatch = {
  name?: string;
  vendor?: string | null;
  productVersion?: string | null;
  description?: string | null;
  systemType?: SystemType;
  businessProcess?: string | null;
  processOwnerId?: string;
  systemOwnerId?: string;
  qualityOwnerId?: string | null;
  site?: string | null;
  hostingType?: HostingType;
  hostingProvider?: string | null;
  dataClassification?: DataClassification;
  isGxpRelevant?: boolean;
  criticality?: Criticality;
  lifecycleStatus?: LifecycleStatus;
  validationStatus?: ValidationStatus;
  validatedAt?: string | null;
  nextReviewAt?: string | null;
  authModel?: string | null;
  backupRpoHours?: number | null;
  backupRtoHours?: number | null;
  notes?: string | null;
};

export async function updateSystem(
  tx: DbSql,
  id: string,
  expectedVersion: number,
  patch: SystemPatch,
): Promise<SystemRow | null> {
  const rows = await tx<SystemRow[]>`
    UPDATE systems SET
      name = COALESCE(${patch.name ?? null}, name),
      vendor = CASE WHEN ${patch.vendor !== undefined} THEN ${patch.vendor ?? null} ELSE vendor END,
      product_version = CASE WHEN ${patch.productVersion !== undefined} THEN ${patch.productVersion ?? null} ELSE product_version END,
      description = CASE WHEN ${patch.description !== undefined} THEN ${patch.description ?? null} ELSE description END,
      system_type = COALESCE(${patch.systemType ?? null}::system_type_enum, system_type),
      business_process = CASE WHEN ${patch.businessProcess !== undefined} THEN ${patch.businessProcess ?? null} ELSE business_process END,
      process_owner_id = COALESCE(${patch.processOwnerId ?? null}::uuid, process_owner_id),
      system_owner_id = COALESCE(${patch.systemOwnerId ?? null}::uuid, system_owner_id),
      quality_owner_id = CASE WHEN ${patch.qualityOwnerId !== undefined} THEN ${patch.qualityOwnerId ?? null} ELSE quality_owner_id END,
      site = CASE WHEN ${patch.site !== undefined} THEN ${patch.site ?? null} ELSE site END,
      hosting_type = COALESCE(${patch.hostingType ?? null}::hosting_type_enum, hosting_type),
      hosting_provider = CASE WHEN ${patch.hostingProvider !== undefined} THEN ${patch.hostingProvider ?? null} ELSE hosting_provider END,
      data_classification = COALESCE(${patch.dataClassification ?? null}::data_class_enum, data_classification),
      is_gxp_relevant = COALESCE(${patch.isGxpRelevant ?? null}, is_gxp_relevant),
      criticality = COALESCE(${patch.criticality ?? null}::criticality_enum, criticality),
      lifecycle_status = COALESCE(${patch.lifecycleStatus ?? null}::lifecycle_enum, lifecycle_status),
      validation_status = COALESCE(${patch.validationStatus ?? null}::validation_enum, validation_status),
      validated_at = CASE WHEN ${patch.validatedAt !== undefined} THEN ${patch.validatedAt ?? null} ELSE validated_at END,
      next_review_at = CASE WHEN ${patch.nextReviewAt !== undefined} THEN ${patch.nextReviewAt ?? null} ELSE next_review_at END,
      auth_model = CASE WHEN ${patch.authModel !== undefined} THEN ${patch.authModel ?? null} ELSE auth_model END,
      backup_rpo_hours = CASE WHEN ${patch.backupRpoHours !== undefined} THEN ${patch.backupRpoHours ?? null} ELSE backup_rpo_hours END,
      backup_rto_hours = CASE WHEN ${patch.backupRtoHours !== undefined} THEN ${patch.backupRtoHours ?? null} ELSE backup_rto_hours END,
      notes = CASE WHEN ${patch.notes !== undefined} THEN ${patch.notes ?? null} ELSE notes END,
      updated_at = now(),
      version = version + 1
    WHERE id = ${id} AND version = ${expectedVersion}
    RETURNING
      id, code, name, vendor, product_version, description, system_type, business_process,
      process_owner_id, system_owner_id, quality_owner_id,
      '' AS process_owner_name, '' AS system_owner_name, NULL AS quality_owner_name,
      site, hosting_type, hosting_provider, data_classification, is_gxp_relevant,
      criticality, lifecycle_status, validation_status, validated_at::text AS validated_at,
      next_review_at::text AS next_review_at, auth_model, backup_rpo_hours, backup_rto_hours,
      notes, archived_at, created_at, updated_at, version
  `;
  return rows[0] ?? null;
}

export async function archiveSystem(
  tx: DbSql,
  id: string,
  expectedVersion: number,
): Promise<SystemRow | null> {
  const rows = await tx<SystemRow[]>`
    UPDATE systems SET
      archived_at = now(),
      updated_at = now(),
      version = version + 1
    WHERE id = ${id} AND version = ${expectedVersion} AND archived_at IS NULL
    RETURNING
      id, code, name, vendor, product_version, description, system_type, business_process,
      process_owner_id, system_owner_id, quality_owner_id,
      '' AS process_owner_name, '' AS system_owner_name, NULL AS quality_owner_name,
      site, hosting_type, hosting_provider, data_classification, is_gxp_relevant,
      criticality, lifecycle_status, validation_status, validated_at::text AS validated_at,
      next_review_at::text AS next_review_at, auth_model, backup_rpo_hours, backup_rto_hours,
      notes, archived_at, created_at, updated_at, version
  `;
  return rows[0] ?? null;
}

export async function restoreSystem(
  tx: DbSql,
  id: string,
  expectedVersion: number,
): Promise<SystemRow | null> {
  const rows = await tx<SystemRow[]>`
    UPDATE systems SET
      archived_at = NULL,
      updated_at = now(),
      version = version + 1
    WHERE id = ${id} AND version = ${expectedVersion} AND archived_at IS NOT NULL
    RETURNING
      id, code, name, vendor, product_version, description, system_type, business_process,
      process_owner_id, system_owner_id, quality_owner_id,
      '' AS process_owner_name, '' AS system_owner_name, NULL AS quality_owner_name,
      site, hosting_type, hosting_provider, data_classification, is_gxp_relevant,
      criticality, lifecycle_status, validation_status, validated_at::text AS validated_at,
      next_review_at::text AS next_review_at, auth_model, backup_rpo_hours, backup_rto_hours,
      notes, archived_at, created_at, updated_at, version
  `;
  return rows[0] ?? null;
}

export function toPublicSystem(row: SystemRow): Record<string, unknown> {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    vendor: row.vendor,
    product_version: row.product_version,
    description: row.description,
    system_type: row.system_type,
    business_process: row.business_process,
    process_owner_id: row.process_owner_id,
    process_owner_name: row.process_owner_name,
    system_owner_id: row.system_owner_id,
    system_owner_name: row.system_owner_name,
    quality_owner_id: row.quality_owner_id,
    quality_owner_name: row.quality_owner_name,
    site: row.site,
    hosting_type: row.hosting_type,
    hosting_provider: row.hosting_provider,
    data_classification: row.data_classification,
    is_gxp_relevant: row.is_gxp_relevant,
    criticality: row.criticality,
    lifecycle_status: row.lifecycle_status,
    validation_status: row.validation_status,
    validated_at: row.validated_at,
    next_review_at: row.next_review_at,
    auth_model: row.auth_model,
    backup_rpo_hours: row.backup_rpo_hours,
    backup_rto_hours: row.backup_rto_hours,
    notes: row.notes,
    archived_at: row.archived_at === null ? null : row.archived_at.toISOString(),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    version: row.version,
  };
}

export function toListItem(row: SystemRow): Record<string, unknown> {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    system_type: row.system_type,
    criticality: row.criticality,
    lifecycle_status: row.lifecycle_status,
    process_owner_id: row.process_owner_id,
    process_owner_name: row.process_owner_name,
    site: row.site,
    validation_status: row.validation_status,
  };
}
