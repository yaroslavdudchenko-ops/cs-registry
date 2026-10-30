import type { UserRole } from "@/server/db/enums";
import type { ErrorCode } from "@/server/http/errors";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  BACKUP_FREQUENCIES,
  COMPANY_CODES,
  CRITICALITIES,
  DATA_CLASSIFICATIONS,
  GAMP_CATEGORIES,
  HOSTING_TYPES,
  LIFECYCLE_STATUSES,
  PERSON_ROLES,
  SERVER_TYPES,
  SYSTEM_DOMAINS,
  SYSTEM_TYPE_GROUPS,
  SYSTEM_TYPES,
  USER_ROLES,
  VALIDATION_STATUSES,
  type AuditAction,
  type AuditEntityType,
  type BackupFrequency,
  type CompanyCode,
  type Criticality,
  type DataClassification,
  type DocumentKind,
  type GampCategory,
  type HostingType,
  type LifecycleStatus,
  type PersonRole,
  type ServerType,
  type SystemDomain,
  type SystemType,
  type ValidationStatus,
} from "@/server/db/enums";
import { isAllowed } from "@/server/modules/auth/rbac";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Администратор",
  editor: "Редактор",
  viewer: "Наблюдатель",
  auditor: "Аудитор",
};

export const SYSTEM_TYPE_LABELS: Record<SystemType, string> = {
  LIMS: "LIMS",
  LES: "LES",
  ELN: "ELN",
  QMS: "QMS",
  LMS: "LMS",
  DMS: "DMS",
  MES: "MES",
  EBR: "EBR",
  SCADA: "SCADA",
  EMS: "EMS",
  BMS: "BMS",
  CMMS: "CMMS",
  APS: "APS",
  EDC: "EDC",
  CTMS: "CTMS",
  RIM: "RIM",
  WMS: "WMS",
  TMS: "TMS",
  SRM: "SRM",
  ERP: "ERP",
  CRM: "CRM",
  HRIS: "HRIS",
  EHS: "EHS",
  PLM: "PLM",
  ACC: "ACC",
  EPM: "EPM",
  LEGAL: "LEGAL",
  CONTRACT: "CONTRACT",
  PAYROLL: "PAYROLL",
  ITSM: "ITSM",
  IAM: "IAM",
  SIEM: "SIEM",
  MDM: "MDM",
  BI: "BI",
  other: "Прочее",
};

export const SYSTEM_TYPE_NAMES: Record<SystemType, string> = {
  LIMS: "Лабораторная информационная система",
  LES: "Система исполнения лабораторных операций",
  ELN: "Электронный лабораторный журнал",
  QMS: "Система управления качеством",
  LMS: "Система управления обучением",
  DMS: "Система управления документами",
  MES: "Система управления производством",
  EBR: "Электронная производственная запись",
  SCADA: "Диспетчерское управление и сбор данных",
  EMS: "Мониторинг параметров производственной среды",
  BMS: "Управление инженерными системами здания",
  CMMS: "Управление техническим обслуживанием и ремонтами",
  APS: "Планирование и диспетчеризация производства",
  EDC: "Электронный сбор клинических данных",
  CTMS: "Управление клиническими исследованиями",
  RIM: "Управление регистрационными досье",
  WMS: "Управление складом",
  TMS: "Управление транспортом и доставкой",
  SRM: "Управление поставщиками",
  ERP: "Планирование ресурсов предприятия",
  CRM: "Управление взаимоотношениями с клиентами",
  HRIS: "Управление персоналом",
  EHS: "Охрана труда, промышленная безопасность и экология",
  PLM: "Управление жизненным циклом продукта",
  ACC: "Бухгалтерский и налоговый учёт",
  EPM: "Бюджетирование и финансовое планирование",
  LEGAL: "Юридический документооборот и претензионная работа",
  CONTRACT: "Управление договорами",
  PAYROLL: "Расчёт заработной платы",
  ITSM: "Управление ИТ-услугами",
  IAM: "Управление учётными записями и доступом",
  SIEM: "Мониторинг событий информационной безопасности",
  MDM: "Управление мастер-данными",
  BI: "Бизнес-аналитика и отчётность",
  other: "Прочее",
};

export function systemTypeOptionLabel(value: SystemType): string {
  return `${value} — ${SYSTEM_TYPE_NAMES[value]}`;
}

export { SYSTEM_TYPE_GROUPS };

export function systemTypeGroup(value: SystemType): string {
  for (const entry of SYSTEM_TYPE_GROUPS) {
    if ((entry.values as readonly SystemType[]).includes(value)) {
      return entry.group;
    }
  }
  return "";
}

export const CRITICALITY_LABELS: Record<Criticality, string> = {
  low: "Низкая",
  medium: "Средняя",
  high: "Высокая",
};

export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  planned: "Планируется",
  active: "В работе",
  maintenance: "Обслуживание",
  retired: "Выведена",
};

export const VALIDATION_LABELS: Record<ValidationStatus, string> = {
  not_validated: "Не валидирована",
  in_validation: "В валидации",
  validated: "Валидирована",
  not_required: "Не требуется",
};

export const HOSTING_LABELS: Record<HostingType, string> = {
  on_prem: "На площадке",
  cloud: "Облако",
  hybrid: "Гибрид",
};

export const DATA_CLASS_LABELS: Record<DataClassification, string> = {
  public: "Открытые",
  internal: "Внутренние",
  confidential: "Конфиденциальные",
  personal: "Персональные",
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: "Создание",
  update: "Изменение",
  archive: "Архивация",
  restore: "Восстановление",
  activate: "Активация",
  deactivate: "Деактивация",
  login: "Вход",
  login_failed: "Неудачный вход",
  logout: "Выход",
  role_change: "Смена роли",
  password_reset: "Сброс пароля",
  export: "Выгрузка",
  read_audit: "Просмотр журнала",
  read_system_history: "Просмотр истории",
};

export const ENTITY_TYPE_LABELS: Record<AuditEntityType, string> = {
  systems: "Система",
  users: "Учётная запись",
  auth: "Вход в систему",
};

export const REJECTION_LABELS: Record<ErrorCode, string> = {
  UNAUTHORIZED: "Неверный логин или пароль",
  FORBIDDEN: "Недостаточно прав",
  VALIDATION_ERROR: "Некорректные данные",
  REASON_REQUIRED: "Нет причины изменения",
  OWNERS_REQUIRED: "Нет обязательных владельцев",
  NOT_FOUND: "Объект не найден",
  CONFLICT: "Конфликт данных",
  VERSION_CONFLICT: "Запись изменена другим пользователем",
  LAST_ADMIN: "Нельзя оставить систему без администратора",
  RATE_LIMITED: "Слишком много попыток, повторите позже",
  AUTH_LOCKED: "Вход заблокирован после неудачных попыток",
  INTERNAL_ERROR: "Внутренняя ошибка",
};

export const FIELD_LABELS: Record<string, string> = {
  name: "Наименование",
  code: "ID системы",
  domain: "Домен",
  purpose: "Назначение системы",
  release: "Релиз",
  vendor: "Подрядчик",
  product_version: "Версия",
  description: "Описание",
  system_type: "Тип",
  business_process: "Бизнес-процесс",
  process_owner_id: "Владелец процесса",
  process_owner_name: "Владелец процесса",
  process_owners: "Владельцы процесса",
  key_users: "Ключевые пользователи",
  system_owner: "Владелец системы",
  system_owner_id: "Владелец системы",
  system_owner_name: "Владелец системы",
  system_owner_name_text: "Владелец системы (ФИО)",
  release_manager: "РПП",
  release_manager_user_id: "РПП",
  release_manager_name: "РПП",
  quality_owner_id: "Владелец качества",
  quality_owner_name: "Владелец качества",
  support_people: "Поддержка",
  project_managers: "Проектный менеджер",
  analysts: "Бизнес-/системный аналитик",
  developers: "Разработчик",
  testers: "Тестировщик",
  companies: "Компании группы",
  server: "Сервер",
  server_type: "Тип сервера",
  site: "Площадка",
  hosting_type: "Размещение",
  hosting_provider: "Провайдер",
  data_classification: "Классификация данных",
  is_gxp_relevant: "Система относится к GxP",
  criticality: "Общая критичность",
  gxp_criticality: "GxP-критичность",
  gamp_category: "Категория GAMP 5",
  lifecycle_status: "Жизненный цикл",
  validation_status: "Статус валидации",
  validated_at: "Дата последней валидации",
  next_review_at: "Плановая ревалидация",
  auth_model: "Модель аутентификации",
  backup_frequency: "Периодичность бэкапа",
  backup_rpo_hours: "RPO, ч",
  backup_rto_hours: "RTO, ч",
  integrations: "Интеграции",
  internal_documents: "Внутренняя документация",
  vendor_documents: "Документация вендора",
  notes: "Примечания",
  devops: "DevOps",
  archived_at: "Дата архивации",
  created_at: "Создана",
  updated_at: "Изменена",
  username: "Логин",
  full_name: "ФИО",
  email: "Электронная почта",
  role: "Роль",
  is_active: "Статус",
  password: "Пароль",
  last_login_at: "Последний вход",
  filters: "Фильтры",
  page: "Страница",
  pageSize: "Размер страницы",
  from: "С",
  to: "По",
  actor: "Актор",
  entityType: "Тип объекта",
  entityId: "Идентификатор объекта",
  entityLabel: "Объект",
  action: "Действие",
  order: "Порядок",
  newest: "Сначала новые",
  oldest: "Сначала старые",
  q: "Поиск",
  type: "Тип",
  status: "Статус",
  archived: "Архив",
  format: "Формат",
  rowCount: "Число записей",
  filename: "Имя файла",
  xlsx: "Excel",
  pdf: "PDF",
};

export const DOMAIN_LABELS: Record<SystemDomain, string> = {
  QC: "Контроль качества",
  QA: "Обеспечение качества",
  PROD: "Производство",
  RnD: "Исследования и разработки",
  LOG: "Логистика",
  ADM: "Административные процессы",
  IT: "ИТ",
};

export function domainOptionLabel(value: SystemDomain): string {
  return `${value} — ${DOMAIN_LABELS[value]}`;
}

export const GAMP_LABELS: Record<GampCategory, string> = {
  "1": "1 — Инфраструктурное ПО",
  "3": "3 — Коммерческое неконфигурируемое",
  "4": "4 — Конфигурируемое",
  "5": "5 — Заказная разработка",
};

export const PERSON_ROLE_LABELS: Record<PersonRole, string> = {
  process_owner: "Владелец процесса",
  system_owner: "Владелец системы",
  release_manager: "РПП",
  key_user: "Ключевой пользователь",
  support: "Поддержка",
  project_manager: "Проектный менеджер",
  analyst: "Бизнес-/системный аналитик",
  developer: "Разработчик",
  tester: "Тестировщик",
};

export const COMPANY_LABELS: Record<CompanyCode, string> = {
  BE: "Бе",
  BI: "Би",
  PRO: "Про",
  PROR: "ПроР",
  PROD_CO: "ПроД",
  AR: "Ар",
};

export const SERVER_TYPE_LABELS: Record<ServerType, string> = {
  physical: "Физический",
  virtual: "Виртуальный",
  cloud: "Облачный",
  container: "Контейнер",
  other: "Другое",
};

export const BACKUP_FREQUENCY_LABELS: Record<BackupFrequency, string> = {
  hourly: "Ежечасно",
  daily: "Ежедневно",
  weekly: "Еженедельно",
  monthly: "Ежемесячно",
  other: "Другое",
};

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  internal: "Внутренняя документация",
  vendor: "Документация вендора",
};

export const DOMAIN_OPTIONS = SYSTEM_DOMAINS.map((value) => ({
  value,
  label: domainOptionLabel(value),
}));

export const GAMP_OPTIONS = GAMP_CATEGORIES.map((value) => ({
  value,
  label: GAMP_LABELS[value],
}));

export const COMPANY_OPTIONS = COMPANY_CODES.map((value) => ({
  value,
  label: COMPANY_LABELS[value],
}));

export const SERVER_TYPE_OPTIONS = SERVER_TYPES.map((value) => ({
  value,
  label: SERVER_TYPE_LABELS[value],
}));

export const BACKUP_FREQUENCY_OPTIONS = BACKUP_FREQUENCIES.map((value) => ({
  value,
  label: BACKUP_FREQUENCY_LABELS[value],
}));

export const PERSON_ROLE_OPTIONS = PERSON_ROLES.map((value) => ({
  value,
  label: PERSON_ROLE_LABELS[value],
}));

export const SYSTEM_TYPE_OPTIONS = SYSTEM_TYPES.map((value) => ({
  value,
  label: systemTypeOptionLabel(value),
}));

export const SYSTEM_TYPE_OPTIONS_GROUPED = SYSTEM_TYPE_GROUPS.map((entry) => ({
  group: entry.group,
  options: entry.values.map((value) => ({
    value,
    label: systemTypeOptionLabel(value),
  })),
}));

export const CRITICALITY_OPTIONS = CRITICALITIES.map((value) => ({
  value,
  label: CRITICALITY_LABELS[value],
}));

export const LIFECYCLE_OPTIONS = LIFECYCLE_STATUSES.map((value) => ({
  value,
  label: LIFECYCLE_LABELS[value],
}));

export const VALIDATION_OPTIONS = VALIDATION_STATUSES.map((value) => ({
  value,
  label: VALIDATION_LABELS[value],
}));

export const HOSTING_OPTIONS = HOSTING_TYPES.map((value) => ({
  value,
  label: HOSTING_LABELS[value],
}));

export const DATA_CLASS_OPTIONS = DATA_CLASSIFICATIONS.map((value) => ({
  value,
  label: DATA_CLASS_LABELS[value],
}));

export const ROLE_OPTIONS = USER_ROLES.map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));

export const AUDIT_ACTION_OPTIONS = AUDIT_ACTIONS.map((value) => ({
  value,
  label: AUDIT_ACTION_LABELS[value],
}));

export const ENTITY_TYPE_OPTIONS = AUDIT_ENTITY_TYPES.map((value) => ({
  value,
  label: ENTITY_TYPE_LABELS[value],
}));

export function roleLabel(role: string): string {
  if (role === "admin" || role === "editor" || role === "viewer" || role === "auditor") {
    return ROLE_LABELS[role];
  }
  return "Пользователь";
}

export function actionLabel(action: string): string {
  if ((AUDIT_ACTIONS as readonly string[]).includes(action)) {
    return AUDIT_ACTION_LABELS[action as AuditAction];
  }
  return action;
}

export function entityTypeLabel(entityType: string): string {
  if ((AUDIT_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    return ENTITY_TYPE_LABELS[entityType as AuditEntityType];
  }
  return entityType;
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function canReadAudit(role: string): boolean {
  return isAllowed(role, "audit.read");
}

export function canReadUsers(role: string): boolean {
  return isAllowed(role, "users.read");
}

export function canCreateUser(role: string): boolean {
  return isAllowed(role, "users.create");
}

export function canUpdateUser(role: string): boolean {
  return isAllowed(role, "users.update");
}

export function canCreateSystem(role: string): boolean {
  return isAllowed(role, "systems.create");
}

export function canUpdateSystem(role: string): boolean {
  return isAllowed(role, "systems.update");
}

export function canArchiveSystem(role: string): boolean {
  return isAllowed(role, "systems.archive");
}

export function canRestoreSystem(role: string): boolean {
  return isAllowed(role, "systems.restore");
}

export function canChangeValidationStatus(role: string): boolean {
  return isAllowed(role, "systems.change_validation_status");
}

export function canReadSystemHistory(role: string): boolean {
  return isAllowed(role, "systems.read_history");
}

export function canExportSystems(role: string): boolean {
  return isAllowed(role, "systems.export");
}
