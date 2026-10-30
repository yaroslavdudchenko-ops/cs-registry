import type { DbSql } from "@/server/db/audit-repository";
import { getSql } from "@/server/db/client";
import type {
  CompanyCode,
  DocumentKind,
  PersonRole,
  SystemDomain,
} from "@/server/db/enums";
import {
  archiveSystem,
  insertSystemRow,
  listSystems,
  lockSystemCode,
  nextSystemCode,
  replaceCompanies,
  replaceDocuments,
  replacePeopleForRole,
  restoreSystem,
  selectSystemById,
  toListItem,
  toPublicSystem,
  updateSystemRow,
  type DocumentEntry,
  type PersonEntry,
  type SystemListQuery,
  type SystemRow,
  type SystemPatch as RepoSystemPatch,
} from "@/server/db/systems-repository";
import { selectActiveUsersByIds } from "@/server/db/users-repository";
import { ApiError, validationError } from "@/server/http/errors";
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
  type CreateSystemInput,
  type DocumentInput,
  type PatchSystemInput,
  type PersonRef,
} from "@/server/modules/systems/fields";

function nullishText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

type ResolvedPerson = { user_id: string | null; full_name: string | null };

function resolvePerson(entry: PersonRef): ResolvedPerson {
  if (entry.user_id !== undefined && entry.user_id !== null) {
    return { user_id: entry.user_id, full_name: null };
  }
  const name = nullishText(entry.full_name ?? null);
  return { user_id: null, full_name: name };
}

function resolvePersonList(entries?: PersonRef[]): ResolvedPerson[] {
  if (entries === undefined) return [];
  return entries.map(resolvePerson);
}

async function assertActiveUsers(sql: DbSql, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const unique = [...new Set(ids)];
  const found = await selectActiveUsersByIds(sql, unique);
  if (found.length !== unique.length) {
    throw validationError([
      { field: "", message: "Указанная учётная запись не найдена или деактивирована." },
    ]);
  }
}

function collectUserIds(input: CreateSystemInput | PatchSystemInput): string[] {
  const ids: string[] = [];
  const push = (person?: PersonRef | null): void => {
    if (person === undefined || person === null) return;
    if (person.user_id !== undefined && person.user_id !== null) ids.push(person.user_id);
  };
  const pushList = (list?: PersonRef[]): void => {
    if (list === undefined) return;
    for (const p of list) push(p);
  };
  push((input as CreateSystemInput).system_owner);
  push((input as CreateSystemInput).release_manager ?? undefined);
  pushList((input as CreateSystemInput).process_owners);
  pushList((input as CreateSystemInput).key_users);
  pushList((input as CreateSystemInput).support_people);
  pushList((input as CreateSystemInput).project_managers);
  pushList((input as CreateSystemInput).analysts);
  pushList((input as CreateSystemInput).developers);
  pushList((input as CreateSystemInput).testers);
  if ((input as CreateSystemInput).quality_owner_id !== undefined && (input as CreateSystemInput).quality_owner_id !== null) {
    ids.push((input as CreateSystemInput).quality_owner_id as string);
  }
  return ids;
}

function toRepoInsertCore(input: CreateSystemInput, domain: SystemDomain): Parameters<typeof insertSystemRow>[2] {
  const systemOwner = input.system_owner === undefined ? null : resolvePerson(input.system_owner);
  const releaseManager = input.release_manager
    ? resolvePerson(input.release_manager)
    : null;
  const processOwners = resolvePersonList(input.process_owners);
  const primaryProcess = processOwners.find((p) => p.user_id !== null) ?? processOwners[0] ?? null;

  return {
    name: input.name,
    domain,
    purpose: nullishText(input.purpose),
    release: nullishText(input.release),
    vendor: nullishText(input.vendor),
    productVersion: nullishText(input.product_version),
    description: nullishText(input.description),
    systemType: input.system_type,
    businessProcess: nullishText(input.business_process),
    processOwnerId: primaryProcess?.user_id ?? null,
    systemOwnerId: systemOwner?.user_id ?? null,
    systemOwnerNameText: systemOwner?.full_name ?? null,
    releaseManagerUserId: releaseManager?.user_id ?? null,
    releaseManagerName: releaseManager?.full_name ?? null,
    qualityOwnerId: input.quality_owner_id ?? null,
    site: nullishText(input.site),
    server: nullishText(input.server),
    serverType: input.server_type ?? null,
    hostingType: input.hosting_type,
    hostingProvider: nullishText(input.hosting_provider),
    dataClassification: input.data_classification,
    isGxpRelevant: input.is_gxp_relevant,
    criticality: input.criticality,
    gxpCriticality: input.gxp_criticality ?? null,
    gampCategory: input.gamp_category ?? null,
    lifecycleStatus: input.lifecycle_status,
    validationStatus: input.validation_status,
    validatedAt: input.validated_at ?? null,
    nextReviewAt: input.next_review_at ?? null,
    authModel: nullishText(input.auth_model),
    backupFrequency: input.backup_frequency ?? null,
    backupRpoHours: input.backup_rpo_hours ?? null,
    backupRtoHours: input.backup_rto_hours ?? null,
    integrations: (input.integrations ?? []).filter((v) => v.trim().length > 0),
    notes: nullishText(input.notes),
    devops: nullishText(input.devops),
  };
}

type PeopleUpdateMap = Partial<Record<PersonRole, ResolvedPerson[]>>;

function peopleFromInput(input: CreateSystemInput | PatchSystemInput, forUpdate: boolean): PeopleUpdateMap {
  const map: PeopleUpdateMap = {};
  const setList = (role: PersonRole, list?: PersonRef[]): void => {
    if (list === undefined) {
      if (!forUpdate) map[role] = [];
      return;
    }
    map[role] = resolvePersonList(list);
  };
  setList("process_owner", input.process_owners);
  setList("key_user", input.key_users);
  setList("support", input.support_people);
  setList("project_manager", input.project_managers);
  setList("analyst", input.analysts);
  setList("developer", input.developers);
  setList("tester", input.testers);
  if (input.system_owner !== undefined) {
    map.system_owner = [resolvePerson(input.system_owner)];
  } else if (!forUpdate) {
    map.system_owner = [];
  }
  if (input.release_manager !== undefined) {
    map.release_manager = input.release_manager === null ? [] : [resolvePerson(input.release_manager)];
  } else if (!forUpdate) {
    map.release_manager = [];
  }
  return map;
}

async function writePeople(tx: DbSql, systemId: string, people: PeopleUpdateMap): Promise<void> {
  for (const [role, entries] of Object.entries(people)) {
    await replacePeopleForRole(tx, systemId, role as PersonRole, entries ?? []);
  }
}

function documentsByKind(
  input: CreateSystemInput | PatchSystemInput,
): Partial<Record<DocumentKind, DocumentInput[]>> {
  const out: Partial<Record<DocumentKind, DocumentInput[]>> = {};
  if (input.internal_documents !== undefined) {
    out.internal = input.internal_documents;
  }
  if (input.vendor_documents !== undefined) {
    out.vendor = input.vendor_documents;
  }
  return out;
}

async function writeDocuments(
  tx: DbSql,
  systemId: string,
  docs: Partial<Record<DocumentKind, DocumentInput[]>>,
): Promise<void> {
  for (const [kind, list] of Object.entries(docs)) {
    await replaceDocuments(tx, systemId, kind as DocumentKind, list ?? []);
  }
}

function companiesFromInput(input: CreateSystemInput | PatchSystemInput): CompanyCode[] | undefined {
  return input.companies;
}

function diffPeople(
  before: PersonEntry[],
  afterInput: PeopleUpdateMap,
): { changed: boolean; before: PersonEntry[]; after: ResolvedPerson[]; roles: PersonRole[] } {
  const changedRoles: PersonRole[] = [];
  for (const [role, afterList] of Object.entries(afterInput)) {
    const prev = before.filter((p) => p.role === role);
    const prevKey = prev.map((p) => `${p.user_id ?? ""}|${p.full_name}`).join(",");
    const nextKey = (afterList ?? []).map((p) => `${p.user_id ?? ""}|${p.full_name ?? ""}`).join(",");
    if (prevKey !== nextKey) changedRoles.push(role as PersonRole);
  }
  const flatAfter: ResolvedPerson[] = [];
  for (const list of Object.values(afterInput)) flatAfter.push(...(list ?? []));
  return { changed: changedRoles.length > 0, before, after: flatAfter, roles: changedRoles };
}

function diffDocs(
  beforeDocs: DocumentEntry[],
  docsByKind: Partial<Record<DocumentKind, DocumentInput[]>>,
): { changed: boolean; before: DocumentEntry[]; after: DocumentInput[] } {
  const changedKinds: DocumentKind[] = [];
  for (const [kind, list] of Object.entries(docsByKind)) {
    const prev = beforeDocs.filter((d) => d.kind === kind);
    const prevKey = prev.map((d) => `${d.title}|${d.url}`).join(",");
    const nextKey = (list ?? []).map((d) => `${d.title}|${d.url}`).join(",");
    if (prevKey !== nextKey) changedKinds.push(kind as DocumentKind);
  }
  const flat: DocumentInput[] = [];
  for (const list of Object.values(docsByKind)) flat.push(...(list ?? []));
  return { changed: changedKinds.length > 0, before: beforeDocs, after: flat };
}

export async function createSystemRecord(
  body: unknown,
  actor: AuditActorContext,
): Promise<Record<string, unknown>> {
  const sql = getSql();
  const input = parseCreateSystem(body);
  await assertActiveUsers(sql, collectUserIds(input));

  const created = await sql.begin(async (tx) => {
    await lockSystemCode(tx);
    const code = await nextSystemCode(tx, input.domain);
    const insert = toRepoInsertCore(input, input.domain);
    const id = await insertSystemRow(tx, code, insert);
    await writePeople(tx, id, peopleFromInput(input, false));
    const companies = companiesFromInput(input) ?? [];
    await replaceCompanies(tx, id, companies);
    await writeDocuments(tx, id, documentsByKind(input));
    const row = await selectSystemByIdLocked(tx, id);
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

async function selectSystemByIdLocked(tx: DbSql, id: string): Promise<SystemRow> {
  const row = await selectSystemById(tx, id);
  if (row === null) throw new ApiError("INTERNAL_ERROR");
  return row;
}

const SCALAR_PATCH_FIELDS: Array<[keyof PatchSystemInput, keyof RepoSystemPatch, string]> = [
  ["name", "name", "name"],
  ["domain", "domain", "domain"],
  ["purpose", "purpose", "purpose"],
  ["release", "release", "release"],
  ["vendor", "vendor", "vendor"],
  ["product_version", "productVersion", "product_version"],
  ["description", "description", "description"],
  ["system_type", "systemType", "system_type"],
  ["business_process", "businessProcess", "business_process"],
  ["quality_owner_id", "qualityOwnerId", "quality_owner_id"],
  ["site", "site", "site"],
  ["server", "server", "server"],
  ["server_type", "serverType", "server_type"],
  ["hosting_type", "hostingType", "hosting_type"],
  ["hosting_provider", "hostingProvider", "hosting_provider"],
  ["data_classification", "dataClassification", "data_classification"],
  ["is_gxp_relevant", "isGxpRelevant", "is_gxp_relevant"],
  ["criticality", "criticality", "criticality"],
  ["gxp_criticality", "gxpCriticality", "gxp_criticality"],
  ["gamp_category", "gampCategory", "gamp_category"],
  ["lifecycle_status", "lifecycleStatus", "lifecycle_status"],
  ["validation_status", "validationStatus", "validation_status"],
  ["validated_at", "validatedAt", "validated_at"],
  ["next_review_at", "nextReviewAt", "next_review_at"],
  ["auth_model", "authModel", "auth_model"],
  ["backup_frequency", "backupFrequency", "backup_frequency"],
  ["backup_rpo_hours", "backupRpoHours", "backup_rpo_hours"],
  ["backup_rto_hours", "backupRtoHours", "backup_rto_hours"],
  ["integrations", "integrations", "integrations"],
  ["notes", "notes", "notes"],
  ["devops", "devops", "devops"],
];

function buildScalarPatch(current: SystemRow, patch: PatchSystemInput): {
  repoPatch: RepoSystemPatch;
  changed: string[];
} {
  const repoPatch: RepoSystemPatch = {};
  const changed: string[] = [];
  const publicCurrent = toPublicSystem(current);
  for (const [inKey, repoKey, publicKey] of SCALAR_PATCH_FIELDS) {
    const value = patch[inKey];
    if (value === undefined) continue;
    const prev = publicCurrent[publicKey];
    const next = value === null ? null : typeof value === "string" ? nullishText(value) : value;
    if (JSON.stringify(prev ?? null) !== JSON.stringify(next ?? null)) {
      changed.push(publicKey);
    }
    (repoPatch as Record<string, unknown>)[repoKey as string] = next ?? null;
  }
  const systemOwner = patch.system_owner;
  if (systemOwner !== undefined) {
    const resolved = resolvePerson(systemOwner);
    repoPatch.systemOwnerId = resolved.user_id;
    repoPatch.systemOwnerNameText = resolved.full_name;
  }
  const releaseManager = patch.release_manager;
  if (releaseManager !== undefined) {
    if (releaseManager === null) {
      repoPatch.releaseManagerUserId = null;
      repoPatch.releaseManagerName = null;
    } else {
      const resolved = resolvePerson(releaseManager);
      repoPatch.releaseManagerUserId = resolved.user_id;
      repoPatch.releaseManagerName = resolved.full_name;
    }
  }
  if (patch.process_owners !== undefined) {
    const list = resolvePersonList(patch.process_owners);
    const primary = list.find((p) => p.user_id !== null) ?? list[0] ?? null;
    repoPatch.processOwnerId = primary?.user_id ?? null;
  }
  return { repoPatch, changed };
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
  if (current === null) throw new ApiError("NOT_FOUND");

  await assertActiveUsers(sql, collectUserIds(input));

  const { repoPatch, changed } = buildScalarPatch(current, input);
  const peopleMap = peopleFromInput(input, true);
  const peopleDiff = diffPeople(current.people, peopleMap);
  const docsMap = documentsByKind(input);
  const docsDiff = diffDocs(current.documents, docsMap);
  const companies = companiesFromInput(input);
  const companiesChanged =
    companies !== undefined &&
    [...companies].sort().join(",") !== [...current.companies].sort().join(",");

  if (peopleDiff.changed) {
    for (const r of peopleDiff.roles) {
      switch (r) {
        case "process_owner":
          changed.push("process_owners");
          break;
        case "system_owner":
          changed.push("system_owner");
          break;
        case "release_manager":
          changed.push("release_manager");
          break;
        case "key_user":
          changed.push("key_users");
          break;
        case "support":
          changed.push("support_people");
          break;
        case "project_manager":
          changed.push("project_managers");
          break;
        case "analyst":
          changed.push("analysts");
          break;
        case "developer":
          changed.push("developers");
          break;
        case "tester":
          changed.push("testers");
          break;
      }
    }
  }
  if (companiesChanged) changed.push("companies");
  if (docsDiff.changed) {
    for (const kind of Object.keys(docsMap)) {
      if (kind === "internal") changed.push("internal_documents");
      else changed.push("vendor_documents");
    }
  }

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

  const updated = await sql.begin(async (tx) => {
    const updatedId = await updateSystemRow(tx, id, input.version, repoPatch);
    if (updatedId === null) throw new ApiError("VERSION_CONFLICT");
    if (Object.keys(peopleMap).length > 0) {
      await writePeople(tx, id, peopleMap);
    }
    if (companies !== undefined) {
      await replaceCompanies(tx, id, companies);
    }
    if (Object.keys(docsMap).length > 0) {
      await writeDocuments(tx, id, docsMap);
    }
    const after = await selectSystemByIdLocked(tx, id);
    const beforePublic = toPublicSystem(current);
    const afterPublic = toPublicSystem(after);
    const PEOPLE_FIELD_TO_ROLE: Record<string, PersonRole> = {
      process_owners: "process_owner",
      key_users: "key_user",
      support_people: "support",
      project_managers: "project_manager",
      analysts: "analyst",
      developers: "developer",
      testers: "tester",
      system_owner: "system_owner",
      release_manager: "release_manager",
    };
    const DOC_FIELD_TO_KIND: Record<string, DocumentKind> = {
      internal_documents: "internal",
      vendor_documents: "vendor",
    };
    const before: Record<string, unknown> = {};
    const afterSlice: Record<string, unknown> = {};
    for (const field of changed) {
      const role = PEOPLE_FIELD_TO_ROLE[field];
      if (role !== undefined) {
        before[field] = current.people.filter((p) => p.role === role);
        afterSlice[field] = after.people.filter((p) => p.role === role);
        continue;
      }
      const kind = DOC_FIELD_TO_KIND[field];
      if (kind !== undefined) {
        before[field] = current.documents.filter((d) => d.kind === kind);
        afterSlice[field] = after.documents.filter((d) => d.kind === kind);
        continue;
      }
      before[field] = beforePublic[field];
      afterSlice[field] = afterPublic[field];
    }
    await appendAuditEventInTx(tx, actor, {
      action: "update",
      entityType: "systems",
      entityId: id,
      entityLabel: `${after.code} ${after.name}`,
      changedFields: changed,
      before: before as { [key: string]: import("@/server/modules/audit/hash-chain").JsonValue },
      after: afterSlice as { [key: string]: import("@/server/modules/audit/hash-chain").JsonValue },
      reason: nullishText(input.reason),
    });
    return after;
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
  if (current === null) throw new ApiError("NOT_FOUND");
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
  const ok = await sql.begin(async (tx) => {
    const archived = await archiveSystem(tx, id, expected);
    if (!archived) throw new ApiError("VERSION_CONFLICT");
    await appendAuditEventInTx(tx, actor, {
      action: "archive",
      entityType: "systems",
      entityId: id,
      entityLabel: `${current.code} ${current.name}`,
      changedFields: ["archived_at"],
      before: { archived_at: null },
      after: { archived_at: new Date().toISOString() },
      reason: reason ?? null,
    });
    return true;
  });
  void ok;
  const after = await selectSystemById(sql, id);
  return toPublicSystem(after ?? current);
}

export async function restoreSystemRecord(
  id: string,
  reason: string | undefined,
  version: number | undefined,
  actor: AuditActorContext,
): Promise<Record<string, unknown>> {
  const sql = getSql();
  const current = await selectSystemById(sql, id);
  if (current === null) throw new ApiError("NOT_FOUND");
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
  const ok = await sql.begin(async (tx) => {
    const restored = await restoreSystem(tx, id, expected);
    if (!restored) throw new ApiError("VERSION_CONFLICT");
    await appendAuditEventInTx(tx, actor, {
      action: "restore",
      entityType: "systems",
      entityId: id,
      entityLabel: `${current.code} ${current.name}`,
      changedFields: ["archived_at"],
      before: {
        archived_at: current.archived_at === null ? null : current.archived_at.toISOString(),
      },
      after: { archived_at: null },
      reason: reason ?? null,
    });
    return true;
  });
  void ok;
  const after = await selectSystemById(sql, id);
  return toPublicSystem(after ?? current);
}

export async function getSystemRecord(id: string): Promise<Record<string, unknown>> {
  const row = await selectSystemById(getSql(), id);
  if (row === null) throw new ApiError("NOT_FOUND");
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
  if (row === null) throw new ApiError("NOT_FOUND");
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
