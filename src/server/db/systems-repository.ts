import type { DbSql } from "@/server/db/audit-repository";
import type {
  BackupFrequency,
  CompanyCode,
  Criticality,
  DataClassification,
  DocumentKind,
  GampCategory,
  HostingType,
  LifecycleStatus,
  PersonRole,
  ServerType,
  SystemDomain,
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

export type PersonEntry = {
  role: PersonRole;
  user_id: string | null;
  full_name: string;
  position: number;
};

export type DocumentEntry = {
  id: string;
  kind: DocumentKind;
  title: string;
  url: string;
  position: number;
};

export type SystemRow = {
  id: string;
  code: string;
  name: string;
  domain: SystemDomain;
  purpose: string | null;
  release: string | null;
  vendor: string | null;
  product_version: string | null;
  description: string | null;
  system_type: SystemType;
  business_process: string | null;
  process_owner_id: string | null;
  system_owner_id: string | null;
  system_owner_name_text: string | null;
  release_manager_user_id: string | null;
  release_manager_name: string | null;
  quality_owner_id: string | null;
  process_owner_name: string | null;
  system_owner_name: string | null;
  release_manager_display_name: string | null;
  quality_owner_name: string | null;
  site: string | null;
  server: string | null;
  server_type: ServerType | null;
  hosting_type: HostingType;
  hosting_provider: string | null;
  data_classification: DataClassification;
  is_gxp_relevant: boolean;
  criticality: Criticality;
  gxp_criticality: Criticality | null;
  gamp_category: GampCategory | null;
  lifecycle_status: LifecycleStatus;
  validation_status: ValidationStatus;
  validated_at: string | null;
  next_review_at: string | null;
  auth_model: string | null;
  backup_frequency: BackupFrequency | null;
  backup_rpo_hours: number | null;
  backup_rto_hours: number | null;
  integrations: string[];
  notes: string | null;
  devops: string | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: number;
  people: PersonEntry[];
  companies: CompanyCode[];
  documents: DocumentEntry[];
};

const SYSTEM_COLUMNS = `
  s.id, s.code, s.name, s.domain, s.purpose, s.release, s.vendor, s.product_version, s.description,
  s.system_type, s.business_process, s.process_owner_id, s.system_owner_id,
  s.system_owner_name_text, s.release_manager_user_id, s.release_manager_name,
  s.quality_owner_id,
  po.full_name AS process_owner_name,
  COALESCE(so.full_name, s.system_owner_name_text) AS system_owner_name,
  COALESCE(rm.full_name, s.release_manager_name) AS release_manager_display_name,
  qo.full_name AS quality_owner_name,
  s.site, s.server, s.server_type, s.hosting_type, s.hosting_provider,
  s.data_classification, s.is_gxp_relevant, s.criticality, s.gxp_criticality, s.gamp_category,
  s.lifecycle_status, s.validation_status, s.validated_at::text AS validated_at,
  s.next_review_at::text AS next_review_at, s.auth_model, s.backup_frequency,
  s.backup_rpo_hours, s.backup_rto_hours, s.integrations,
  s.notes, s.devops, s.archived_at, s.created_at, s.updated_at, s.version
`;

const SYSTEM_JOINS = `
  LEFT JOIN users po ON po.id = s.process_owner_id
  LEFT JOIN users so ON so.id = s.system_owner_id
  LEFT JOIN users rm ON rm.id = s.release_manager_user_id
  LEFT JOIN users qo ON qo.id = s.quality_owner_id
`;

export type SystemInsert = {
  name: string;
  domain: SystemDomain;
  purpose: string | null;
  release: string | null;
  vendor: string | null;
  productVersion: string | null;
  description: string | null;
  systemType: SystemType;
  businessProcess: string | null;
  processOwnerId: string | null;
  systemOwnerId: string | null;
  systemOwnerNameText: string | null;
  releaseManagerUserId: string | null;
  releaseManagerName: string | null;
  qualityOwnerId: string | null;
  site: string | null;
  server: string | null;
  serverType: ServerType | null;
  hostingType: HostingType;
  hostingProvider: string | null;
  dataClassification: DataClassification;
  isGxpRelevant: boolean;
  criticality: Criticality;
  gxpCriticality: Criticality | null;
  gampCategory: GampCategory | null;
  lifecycleStatus: LifecycleStatus;
  validationStatus: ValidationStatus;
  validatedAt: string | null;
  nextReviewAt: string | null;
  authModel: string | null;
  backupFrequency: BackupFrequency | null;
  backupRpoHours: number | null;
  backupRtoHours: number | null;
  integrations: string[];
  notes: string | null;
  devops: string | null;
};

export async function lockSystemCode(tx: DbSql): Promise<void> {
  await tx`SELECT pg_advisory_xact_lock(${SYSTEMS_CODE_LOCK_CLASS}, ${SYSTEMS_CODE_LOCK_KEY})`;
}

/**
 * Сквозная нумерация. Единый счётчик по старым SYS-NNNN и новым SYS-<ДОМЕН>-NNNN.
 * Это требование владельца: прослеживаемость и неизменность ID при смене домена.
 */
export async function nextSystemCode(tx: DbSql, domain: SystemDomain): Promise<string> {
  const rows = await tx<Array<{ n: string }>>`
    SELECT COALESCE(MAX(
      CASE
        WHEN code ~ '^SYS-[0-9]+$' THEN substring(code from 5)::int
        WHEN code ~ '^SYS-[A-Za-z]+-[0-9]+$'
          THEN substring(code from length(split_part(code, '-', 2)) + 6)::int
        ELSE 0
      END
    ), 0)::text AS n
    FROM systems
  `;
  const next = Number(rows[0]?.n ?? 0) + 1;
  return `SYS-${domain}-${String(next).padStart(4, "0")}`;
}

export async function insertSystemRow(
  tx: DbSql,
  code: string,
  input: SystemInsert,
): Promise<string> {
  const rows = await tx<Array<{ id: string }>>`
    INSERT INTO systems (
      code, name, domain, purpose, release, vendor, product_version, description,
      system_type, business_process,
      process_owner_id, system_owner_id, system_owner_name_text,
      release_manager_user_id, release_manager_name, quality_owner_id,
      site, server, server_type, hosting_type, hosting_provider,
      data_classification, is_gxp_relevant, criticality, gxp_criticality, gamp_category,
      lifecycle_status, validation_status,
      validated_at, next_review_at, auth_model, backup_frequency, backup_rpo_hours, backup_rto_hours,
      integrations, notes, devops
    ) VALUES (
      ${code}, ${input.name}, ${input.domain}::system_domain_enum, ${input.purpose}, ${input.release},
      ${input.vendor}, ${input.productVersion}, ${input.description},
      ${input.systemType}::system_type_enum, ${input.businessProcess},
      ${input.processOwnerId}, ${input.systemOwnerId}, ${input.systemOwnerNameText},
      ${input.releaseManagerUserId}, ${input.releaseManagerName}, ${input.qualityOwnerId},
      ${input.site}, ${input.server}, ${input.serverType}::server_type_enum,
      ${input.hostingType}::hosting_type_enum, ${input.hostingProvider},
      ${input.dataClassification}::data_class_enum, ${input.isGxpRelevant},
      ${input.criticality}::criticality_enum,
      ${input.gxpCriticality}::criticality_enum,
      ${input.gampCategory}::gamp_category_enum,
      ${input.lifecycleStatus}::lifecycle_enum,
      ${input.validationStatus}::validation_enum,
      ${input.validatedAt}, ${input.nextReviewAt}, ${input.authModel},
      ${input.backupFrequency}::backup_frequency_enum,
      ${input.backupRpoHours}, ${input.backupRtoHours},
      ${input.integrations}::text[],
      ${input.notes}, ${input.devops}
    ) RETURNING id
  `;
  const row = rows[0];
  if (row === undefined) throw new Error("failed to insert system");
  return row.id;
}

export async function selectSystemById(sql: DbSql, id: string): Promise<SystemRow | null> {
  const rows = await sql<Array<Omit<SystemRow, "people" | "companies" | "documents">>>`
    SELECT ${sql.unsafe(SYSTEM_COLUMNS)}
    FROM systems s
    ${sql.unsafe(SYSTEM_JOINS)}
    WHERE s.id = ${id}
    LIMIT 1
  `;
  const row = rows[0];
  if (row === undefined) return null;
  const [people, companies, documents] = await Promise.all([
    loadPeople(sql, [row.id]),
    loadCompanies(sql, [row.id]),
    loadDocuments(sql, [row.id]),
  ]);
  return {
    ...row,
    people: people.get(row.id) ?? [],
    companies: companies.get(row.id) ?? [],
    documents: documents.get(row.id) ?? [],
  };
}

export async function loadPeople(
  sql: DbSql,
  systemIds: string[],
): Promise<Map<string, PersonEntry[]>> {
  if (systemIds.length === 0) return new Map();
  const rows = await sql<
    Array<{
      system_id: string;
      role: PersonRole;
      user_id: string | null;
      full_name: string;
      position: number;
    }>
  >`
    SELECT sp.system_id, sp.role, sp.user_id,
           COALESCE(u.full_name, sp.full_name) AS full_name,
           sp.position
    FROM system_people sp
    LEFT JOIN users u ON u.id = sp.user_id
    WHERE sp.system_id IN ${sql(systemIds)}
    ORDER BY sp.system_id, sp.role, sp.position, sp.id
  `;
  const out = new Map<string, PersonEntry[]>();
  for (const r of rows) {
    const arr = out.get(r.system_id) ?? [];
    arr.push({ role: r.role, user_id: r.user_id, full_name: r.full_name, position: r.position });
    out.set(r.system_id, arr);
  }
  return out;
}

export async function loadCompanies(
  sql: DbSql,
  systemIds: string[],
): Promise<Map<string, CompanyCode[]>> {
  if (systemIds.length === 0) return new Map();
  const rows = await sql<Array<{ system_id: string; company: CompanyCode }>>`
    SELECT system_id, company FROM system_companies
    WHERE system_id IN ${sql(systemIds)}
    ORDER BY system_id, company
  `;
  const out = new Map<string, CompanyCode[]>();
  for (const r of rows) {
    const arr = out.get(r.system_id) ?? [];
    arr.push(r.company);
    out.set(r.system_id, arr);
  }
  return out;
}

export async function loadDocuments(
  sql: DbSql,
  systemIds: string[],
): Promise<Map<string, DocumentEntry[]>> {
  if (systemIds.length === 0) return new Map();
  const rows = await sql<
    Array<{
      id: string;
      system_id: string;
      kind: DocumentKind;
      title: string;
      url: string;
      position: number;
    }>
  >`
    SELECT id::text AS id, system_id, kind, title, url, position
    FROM system_documents
    WHERE system_id IN ${sql(systemIds)}
    ORDER BY system_id, kind, position, id
  `;
  const out = new Map<string, DocumentEntry[]>();
  for (const r of rows) {
    const arr = out.get(r.system_id) ?? [];
    arr.push({
      id: r.id,
      kind: r.kind,
      title: r.title,
      url: r.url,
      position: r.position,
    });
    out.set(r.system_id, arr);
  }
  return out;
}

/** Полная замена людей по роли: сначала DELETE, затем INSERT в порядке списка. */
export async function replacePeopleForRole(
  tx: DbSql,
  systemId: string,
  role: PersonRole,
  entries: Array<{ user_id: string | null; full_name: string | null }>,
): Promise<void> {
  await tx`DELETE FROM system_people WHERE system_id = ${systemId} AND role = ${role}::person_role_enum`;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    await tx`
      INSERT INTO system_people (system_id, role, user_id, full_name, position)
      VALUES (${systemId}, ${role}::person_role_enum, ${entry.user_id}, ${entry.full_name}, ${i})
    `;
  }
}

export async function replaceCompanies(
  tx: DbSql,
  systemId: string,
  companies: CompanyCode[],
): Promise<void> {
  await tx`DELETE FROM system_companies WHERE system_id = ${systemId}`;
  for (const code of companies) {
    await tx`INSERT INTO system_companies (system_id, company) VALUES (${systemId}, ${code}::company_code_enum)`;
  }
}

export async function replaceDocuments(
  tx: DbSql,
  systemId: string,
  kind: DocumentKind,
  entries: Array<{ title: string; url: string }>,
): Promise<void> {
  await tx`DELETE FROM system_documents WHERE system_id = ${systemId} AND kind = ${kind}::document_kind_enum`;
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i]!;
    await tx`
      INSERT INTO system_documents (system_id, kind, title, url, position)
      VALUES (${systemId}, ${kind}::document_kind_enum, ${e.title}, ${e.url}, ${i})
    `;
  }
}

export type SystemListQuery = {
  q: string | null;
  type: SystemType | null;
  domain: SystemDomain | null;
  criticality: Criticality | null;
  gxpCriticality: Criticality | null;
  gampCategory: GampCategory | null;
  status: LifecycleStatus | null;
  validationStatus: ValidationStatus | null;
  isGxp: boolean | null;
  company: CompanyCode | null;
  ownerId: string | null;
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

  const rows = await sql<
    Array<Omit<SystemRow, "people" | "companies" | "documents"> & { total_count: string }>
  >`
    SELECT ${sql.unsafe(SYSTEM_COLUMNS)},
           count(*) OVER()::text AS total_count
    FROM systems s
    ${sql.unsafe(SYSTEM_JOINS)}
    WHERE
      (${query.includeArchived} OR s.archived_at IS NULL)
      AND (${query.type}::text IS NULL OR s.system_type = ${query.type}::system_type_enum)
      AND (${query.domain}::text IS NULL OR s.domain = ${query.domain}::system_domain_enum)
      AND (${query.criticality}::text IS NULL OR s.criticality = ${query.criticality}::criticality_enum)
      AND (${query.gxpCriticality}::text IS NULL OR s.gxp_criticality = ${query.gxpCriticality}::criticality_enum)
      AND (${query.gampCategory}::text IS NULL OR s.gamp_category = ${query.gampCategory}::gamp_category_enum)
      AND (${query.status}::text IS NULL OR s.lifecycle_status = ${query.status}::lifecycle_enum)
      AND (${query.validationStatus}::text IS NULL OR s.validation_status = ${query.validationStatus}::validation_enum)
      AND (${query.isGxp === null ? null : query.isGxp}::boolean IS NULL OR s.is_gxp_relevant = ${query.isGxp}::boolean)
      AND (
        ${query.ownerId}::uuid IS NULL
        OR s.system_owner_id = ${query.ownerId}::uuid
        OR s.process_owner_id = ${query.ownerId}::uuid
        OR EXISTS (
          SELECT 1 FROM system_people sp
          WHERE sp.system_id = s.id AND sp.user_id = ${query.ownerId}::uuid
        )
      )
      AND (${query.processOwnerId}::uuid IS NULL
           OR s.process_owner_id = ${query.processOwnerId}::uuid
           OR EXISTS (
             SELECT 1 FROM system_people sp
             WHERE sp.system_id = s.id
               AND sp.user_id = ${query.processOwnerId}::uuid
               AND sp.role = 'process_owner'::person_role_enum
           ))
      AND (${query.company}::text IS NULL
           OR EXISTS (
             SELECT 1 FROM system_companies sc
             WHERE sc.system_id = s.id AND sc.company = ${query.company}::company_code_enum
           ))
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
  const ids = rows.map((r) => r.id);
  const [people, companies, documents] = await Promise.all([
    loadPeople(sql, ids),
    loadCompanies(sql, ids),
    loadDocuments(sql, ids),
  ]);
  const items: SystemRow[] = rows.map((r) => {
    const { total_count, ...rest } = r;
    void total_count;
    return {
      ...rest,
      people: people.get(r.id) ?? [],
      companies: companies.get(r.id) ?? [],
      documents: documents.get(r.id) ?? [],
    };
  });
  return { items, page: query.page, pageSize: query.pageSize, total };
}

export type SystemPatch = Partial<SystemInsert>;

export async function updateSystemRow(
  tx: DbSql,
  id: string,
  expectedVersion: number,
  patch: SystemPatch,
): Promise<string | null> {
  const rows = await tx<Array<{ id: string }>>`
    UPDATE systems SET
      name = COALESCE(${patch.name ?? null}, name),
      domain = COALESCE(${patch.domain ?? null}::system_domain_enum, domain),
      purpose = CASE WHEN ${patch.purpose !== undefined} THEN ${patch.purpose ?? null} ELSE purpose END,
      release = CASE WHEN ${patch.release !== undefined} THEN ${patch.release ?? null} ELSE release END,
      vendor = CASE WHEN ${patch.vendor !== undefined} THEN ${patch.vendor ?? null} ELSE vendor END,
      product_version = CASE WHEN ${patch.productVersion !== undefined} THEN ${patch.productVersion ?? null} ELSE product_version END,
      description = CASE WHEN ${patch.description !== undefined} THEN ${patch.description ?? null} ELSE description END,
      system_type = COALESCE(${patch.systemType ?? null}::system_type_enum, system_type),
      business_process = CASE WHEN ${patch.businessProcess !== undefined} THEN ${patch.businessProcess ?? null} ELSE business_process END,
      process_owner_id = CASE WHEN ${patch.processOwnerId !== undefined} THEN ${patch.processOwnerId ?? null} ELSE process_owner_id END,
      system_owner_id = CASE WHEN ${patch.systemOwnerId !== undefined} THEN ${patch.systemOwnerId ?? null} ELSE system_owner_id END,
      system_owner_name_text = CASE WHEN ${patch.systemOwnerNameText !== undefined} THEN ${patch.systemOwnerNameText ?? null} ELSE system_owner_name_text END,
      release_manager_user_id = CASE WHEN ${patch.releaseManagerUserId !== undefined} THEN ${patch.releaseManagerUserId ?? null} ELSE release_manager_user_id END,
      release_manager_name = CASE WHEN ${patch.releaseManagerName !== undefined} THEN ${patch.releaseManagerName ?? null} ELSE release_manager_name END,
      quality_owner_id = CASE WHEN ${patch.qualityOwnerId !== undefined} THEN ${patch.qualityOwnerId ?? null} ELSE quality_owner_id END,
      site = CASE WHEN ${patch.site !== undefined} THEN ${patch.site ?? null} ELSE site END,
      server = CASE WHEN ${patch.server !== undefined} THEN ${patch.server ?? null} ELSE server END,
      server_type = CASE WHEN ${patch.serverType !== undefined} THEN ${patch.serverType ?? null}::server_type_enum ELSE server_type END,
      hosting_type = COALESCE(${patch.hostingType ?? null}::hosting_type_enum, hosting_type),
      hosting_provider = CASE WHEN ${patch.hostingProvider !== undefined} THEN ${patch.hostingProvider ?? null} ELSE hosting_provider END,
      data_classification = COALESCE(${patch.dataClassification ?? null}::data_class_enum, data_classification),
      is_gxp_relevant = COALESCE(${patch.isGxpRelevant ?? null}, is_gxp_relevant),
      criticality = COALESCE(${patch.criticality ?? null}::criticality_enum, criticality),
      gxp_criticality = CASE WHEN ${patch.gxpCriticality !== undefined} THEN ${patch.gxpCriticality ?? null}::criticality_enum ELSE gxp_criticality END,
      gamp_category = CASE WHEN ${patch.gampCategory !== undefined} THEN ${patch.gampCategory ?? null}::gamp_category_enum ELSE gamp_category END,
      lifecycle_status = COALESCE(${patch.lifecycleStatus ?? null}::lifecycle_enum, lifecycle_status),
      validation_status = COALESCE(${patch.validationStatus ?? null}::validation_enum, validation_status),
      validated_at = CASE WHEN ${patch.validatedAt !== undefined} THEN ${patch.validatedAt ?? null} ELSE validated_at END,
      next_review_at = CASE WHEN ${patch.nextReviewAt !== undefined} THEN ${patch.nextReviewAt ?? null} ELSE next_review_at END,
      auth_model = CASE WHEN ${patch.authModel !== undefined} THEN ${patch.authModel ?? null} ELSE auth_model END,
      backup_frequency = CASE WHEN ${patch.backupFrequency !== undefined} THEN ${patch.backupFrequency ?? null}::backup_frequency_enum ELSE backup_frequency END,
      backup_rpo_hours = CASE WHEN ${patch.backupRpoHours !== undefined} THEN ${patch.backupRpoHours ?? null} ELSE backup_rpo_hours END,
      backup_rto_hours = CASE WHEN ${patch.backupRtoHours !== undefined} THEN ${patch.backupRtoHours ?? null} ELSE backup_rto_hours END,
      integrations = CASE WHEN ${patch.integrations !== undefined} THEN ${patch.integrations ?? []}::text[] ELSE integrations END,
      notes = CASE WHEN ${patch.notes !== undefined} THEN ${patch.notes ?? null} ELSE notes END,
      devops = CASE WHEN ${patch.devops !== undefined} THEN ${patch.devops ?? null} ELSE devops END,
      updated_at = now(),
      version = version + 1
    WHERE id = ${id} AND version = ${expectedVersion}
    RETURNING id
  `;
  return rows[0]?.id ?? null;
}

export async function archiveSystem(
  tx: DbSql,
  id: string,
  expectedVersion: number,
): Promise<boolean> {
  const rows = await tx<Array<{ id: string }>>`
    UPDATE systems SET
      archived_at = now(), updated_at = now(), version = version + 1
    WHERE id = ${id} AND version = ${expectedVersion} AND archived_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export async function restoreSystem(
  tx: DbSql,
  id: string,
  expectedVersion: number,
): Promise<boolean> {
  const rows = await tx<Array<{ id: string }>>`
    UPDATE systems SET
      archived_at = NULL, updated_at = now(), version = version + 1
    WHERE id = ${id} AND version = ${expectedVersion} AND archived_at IS NOT NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export function toPublicSystem(row: SystemRow): Record<string, unknown> {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    domain: row.domain,
    purpose: row.purpose,
    release: row.release,
    vendor: row.vendor,
    product_version: row.product_version,
    description: row.description,
    system_type: row.system_type,
    business_process: row.business_process,
    process_owner_id: row.process_owner_id,
    process_owner_name: row.process_owner_name,
    system_owner_id: row.system_owner_id,
    system_owner_name: row.system_owner_name,
    system_owner_name_text: row.system_owner_name_text,
    release_manager_user_id: row.release_manager_user_id,
    release_manager_name: row.release_manager_display_name,
    quality_owner_id: row.quality_owner_id,
    quality_owner_name: row.quality_owner_name,
    site: row.site,
    server: row.server,
    server_type: row.server_type,
    hosting_type: row.hosting_type,
    hosting_provider: row.hosting_provider,
    data_classification: row.data_classification,
    is_gxp_relevant: row.is_gxp_relevant,
    criticality: row.criticality,
    gxp_criticality: row.gxp_criticality,
    gamp_category: row.gamp_category,
    lifecycle_status: row.lifecycle_status,
    validation_status: row.validation_status,
    validated_at: row.validated_at,
    next_review_at: row.next_review_at,
    auth_model: row.auth_model,
    backup_frequency: row.backup_frequency,
    backup_rpo_hours: row.backup_rpo_hours,
    backup_rto_hours: row.backup_rto_hours,
    integrations: row.integrations,
    notes: row.notes,
    devops: row.devops,
    archived_at: row.archived_at === null ? null : row.archived_at.toISOString(),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    version: row.version,
    people: row.people.map((p) => ({
      role: p.role,
      user_id: p.user_id,
      full_name: p.full_name,
      position: p.position,
    })),
    companies: row.companies,
    documents: row.documents,
  };
}

export function toListItem(row: SystemRow): Record<string, unknown> {
  return toPublicSystem(row);
}
