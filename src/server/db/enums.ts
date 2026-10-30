export const USER_ROLES = ["admin", "editor", "viewer", "auditor"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const SYSTEM_TYPE_LAB = ["LIMS", "LES", "ELN", "QMS", "LMS", "DMS"] as const;
const SYSTEM_TYPE_PRODUCTION = ["MES", "EBR", "SCADA", "EMS", "BMS", "CMMS", "APS"] as const;
const SYSTEM_TYPE_CLINICAL = ["EDC", "CTMS", "RIM"] as const;
const SYSTEM_TYPE_LOGISTICS = ["WMS", "TMS", "SRM"] as const;
const SYSTEM_TYPE_CORPORATE = ["ERP", "CRM", "HRIS", "EHS", "PLM"] as const;
const SYSTEM_TYPE_FINANCE = ["ACC", "EPM", "LEGAL", "CONTRACT", "PAYROLL"] as const;
const SYSTEM_TYPE_IT = ["ITSM", "IAM", "SIEM", "MDM", "BI"] as const;

export const SYSTEM_TYPE_GROUPS = [
  { group: "Лаборатория и качество", values: SYSTEM_TYPE_LAB },
  { group: "Производство", values: SYSTEM_TYPE_PRODUCTION },
  { group: "Клинические исследования и регуляторика", values: SYSTEM_TYPE_CLINICAL },
  { group: "Склад и логистика", values: SYSTEM_TYPE_LOGISTICS },
  { group: "Корпоративные", values: SYSTEM_TYPE_CORPORATE },
  { group: "Финансы и право", values: SYSTEM_TYPE_FINANCE },
  { group: "ИТ и данные", values: SYSTEM_TYPE_IT },
] as const;

export const SYSTEM_TYPES = [
  ...SYSTEM_TYPE_LAB,
  ...SYSTEM_TYPE_PRODUCTION,
  ...SYSTEM_TYPE_CLINICAL,
  ...SYSTEM_TYPE_LOGISTICS,
  ...SYSTEM_TYPE_CORPORATE,
  ...SYSTEM_TYPE_FINANCE,
  ...SYSTEM_TYPE_IT,
  "other",
] as const;
export type SystemType = (typeof SYSTEM_TYPES)[number];

export const HOSTING_TYPES = ["on_prem", "cloud", "hybrid"] as const;
export type HostingType = (typeof HOSTING_TYPES)[number];

export const DATA_CLASSIFICATIONS = ["public", "internal", "confidential", "personal"] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

export const CRITICALITIES = ["low", "medium", "high"] as const;
export type Criticality = (typeof CRITICALITIES)[number];

export const LIFECYCLE_STATUSES = ["planned", "active", "maintenance", "retired"] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const VALIDATION_STATUSES = [
  "not_validated",
  "in_validation",
  "validated",
  "not_required",
] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const AUDIT_ACTIONS = [
  "create",
  "update",
  "archive",
  "restore",
  "activate",
  "deactivate",
  "login",
  "login_failed",
  "logout",
  "role_change",
  "password_reset",
  "export",
  "read_audit",
  "read_system_history",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = ["systems", "users", "auth"] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const SYSTEM_DOMAINS = ["QC", "QA", "PROD", "RnD", "LOG", "ADM", "IT"] as const;
export type SystemDomain = (typeof SYSTEM_DOMAINS)[number];

export const GAMP_CATEGORIES = ["1", "3", "4", "5"] as const;
export type GampCategory = (typeof GAMP_CATEGORIES)[number];

export const PERSON_ROLES = [
  "process_owner",
  "system_owner",
  "release_manager",
  "key_user",
  "support",
  "project_manager",
  "analyst",
  "developer",
  "tester",
] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export const COMPANY_CODES = ["BE", "BI", "PRO", "PROR", "PROD_CO", "AR"] as const;
export type CompanyCode = (typeof COMPANY_CODES)[number];

export const SERVER_TYPES = ["physical", "virtual", "cloud", "container", "other"] as const;
export type ServerType = (typeof SERVER_TYPES)[number];

export const BACKUP_FREQUENCIES = ["hourly", "daily", "weekly", "monthly", "other"] as const;
export type BackupFrequency = (typeof BACKUP_FREQUENCIES)[number];

export const DOCUMENT_KINDS = ["internal", "vendor"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Домен по умолчанию для существующих SYS-NNNN, если тип неизвестен. */
export function defaultDomainForSystemType(systemType: SystemType): SystemDomain {
  switch (systemType) {
    case "LIMS":
    case "LES":
    case "ELN":
    case "LMS":
      return "QC";
    case "QMS":
      return "QA";
    case "MES":
    case "EBR":
    case "SCADA":
    case "EMS":
    case "BMS":
    case "CMMS":
    case "APS":
      return "PROD";
    case "EDC":
    case "CTMS":
    case "RIM":
      return "RnD";
    case "WMS":
    case "TMS":
    case "SRM":
      return "LOG";
    case "ERP":
    case "CRM":
    case "HRIS":
    case "EHS":
    case "PLM":
    case "ACC":
    case "EPM":
    case "LEGAL":
    case "CONTRACT":
    case "PAYROLL":
      return "ADM";
    default:
      return "IT";
  }
}
