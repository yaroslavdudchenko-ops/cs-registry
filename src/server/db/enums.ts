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
