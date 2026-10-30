import { formatDate, formatHours } from "@/lib/format";
import {
  BACKUP_FREQUENCY_LABELS,
  COMPANY_LABELS,
  CRITICALITY_LABELS,
  DATA_CLASS_LABELS,
  DOCUMENT_KIND_LABELS,
  DOMAIN_LABELS,
  GAMP_LABELS,
  HOSTING_LABELS,
  LIFECYCLE_LABELS,
  PERSON_ROLE_LABELS,
  SERVER_TYPE_LABELS,
  SYSTEM_TYPE_LABELS,
  VALIDATION_LABELS,
} from "@/lib/labels";
import type { PersonRole } from "@/server/db/enums";
import type { SystemRow } from "@/server/db/systems-repository";

function peopleOf(row: SystemRow, role: PersonRole): string {
  const names = row.people.filter((p) => p.role === role).map((p) => p.full_name);
  if (names.length === 0) return "—";
  return names.join("; ");
}

function documentsOf(row: SystemRow, kind: "internal" | "vendor"): string {
  const docs = row.documents.filter((d) => d.kind === kind);
  if (docs.length === 0) return "—";
  return docs.map((d) => `${d.title} (${d.url})`).join("; ");
}

void DOCUMENT_KIND_LABELS;

export type ExportColumn = {
  key: string;
  header: string;
  hidden?: boolean;
  value: (row: SystemRow) => string;
};

function text(value: string | null | undefined): string {
  if (value === undefined || value === null || value.length === 0) {
    return "—";
  }
  return value;
}

export const REGISTRY_COLUMNS: ExportColumn[] = [
  { key: "code", header: "ID системы", value: (row) => row.code },
  { key: "name", header: "Наименование", value: (row) => row.name },
  { key: "domain", header: "Домен", value: (row) => `${row.domain} — ${DOMAIN_LABELS[row.domain]}` },
  { key: "purpose", header: "Назначение", value: (row) => text(row.purpose) },
  { key: "description", header: "Описание", value: (row) => text(row.description) },
  { key: "system_type", header: "Тип", value: (row) => SYSTEM_TYPE_LABELS[row.system_type] },
  { key: "vendor", header: "Подрядчик", value: (row) => text(row.vendor) },
  { key: "product_version", header: "Версия", value: (row) => text(row.product_version) },
  { key: "release", header: "Релиз", value: (row) => text(row.release) },
  { key: "criticality", header: "Общая критичность", value: (row) => CRITICALITY_LABELS[row.criticality] },
  {
    key: "gxp_criticality",
    header: "GxP-критичность",
    value: (row) => (row.gxp_criticality === null ? "—" : CRITICALITY_LABELS[row.gxp_criticality]),
  },
  {
    key: "gamp_category",
    header: "GAMP 5",
    value: (row) => (row.gamp_category === null ? "—" : GAMP_LABELS[row.gamp_category]),
  },
  {
    key: "lifecycle_status",
    header: "Жизненный цикл",
    value: (row) => LIFECYCLE_LABELS[row.lifecycle_status],
  },
  {
    key: "validation_status",
    header: "Статус валидации",
    value: (row) => VALIDATION_LABELS[row.validation_status],
  },
  {
    key: "process_owners",
    header: "Владельцы процесса",
    value: (row) => peopleOf(row, "process_owner"),
  },
  { key: "system_owner", header: "Владелец системы", value: (row) => peopleOf(row, "system_owner") },
  { key: "release_manager", header: "РПП", value: (row) => peopleOf(row, "release_manager") },
  { key: "key_users", header: "Ключевые пользователи", value: (row) => peopleOf(row, "key_user") },
  {
    key: "quality_owner_name",
    header: "Владелец качества",
    value: (row) => text(row.quality_owner_name),
  },
  { key: "support", header: "Поддержка", value: (row) => peopleOf(row, "support") },
  {
    key: "project_managers",
    header: "Проектный менеджер",
    value: (row) => peopleOf(row, "project_manager"),
  },
  { key: "analysts", header: "Аналитик", value: (row) => peopleOf(row, "analyst") },
  { key: "developers", header: "Разработчик", value: (row) => peopleOf(row, "developer") },
  { key: "testers", header: "Тестировщик", value: (row) => peopleOf(row, "tester") },
  {
    key: "companies",
    header: "Компании группы",
    value: (row) => (row.companies.length === 0 ? "—" : row.companies.map((c) => COMPANY_LABELS[c]).join("; ")),
  },
  { key: "site", header: "Площадка", value: (row) => text(row.site) },
  { key: "server", header: "Сервер", value: (row) => text(row.server) },
  {
    key: "server_type",
    header: "Тип сервера",
    value: (row) => (row.server_type === null ? "—" : SERVER_TYPE_LABELS[row.server_type]),
  },
  { key: "hosting_type", header: "Размещение", value: (row) => HOSTING_LABELS[row.hosting_type] },
  { key: "hosting_provider", header: "Провайдер", value: (row) => text(row.hosting_provider) },
  {
    key: "data_classification",
    header: "Классификация данных",
    value: (row) => DATA_CLASS_LABELS[row.data_classification],
  },
  { key: "is_gxp_relevant", header: "GxP", value: (row) => (row.is_gxp_relevant ? "Да" : "Нет") },
  { key: "validated_at", header: "Дата последней валидации", value: (row) => formatDate(row.validated_at) },
  {
    key: "next_review_at",
    header: "Плановая ревалидация",
    value: (row) => formatDate(row.next_review_at),
  },
  { key: "business_process", header: "Бизнес-процесс", value: (row) => text(row.business_process) },
  { key: "auth_model", header: "Модель аутентификации", value: (row) => text(row.auth_model) },
  {
    key: "backup_frequency",
    header: "Периодичность бэкапа",
    value: (row) => (row.backup_frequency === null ? "—" : BACKUP_FREQUENCY_LABELS[row.backup_frequency]),
  },
  {
    key: "backup_rpo_hours",
    header: "RPO, ч",
    value: (row) => formatHours(row.backup_rpo_hours),
  },
  {
    key: "backup_rto_hours",
    header: "RTO, ч",
    value: (row) => formatHours(row.backup_rto_hours),
  },
  {
    key: "integrations",
    header: "Интеграции",
    value: (row) => (row.integrations.length === 0 ? "—" : row.integrations.join("; ")),
  },
  { key: "internal_documents", header: "Внутренняя документация", value: (row) => documentsOf(row, "internal") },
  { key: "vendor_documents", header: "Документация вендора", value: (row) => documentsOf(row, "vendor") },
  { key: "notes", header: "Примечания", value: (row) => text(row.notes) },
  { key: "devops", header: "DevOps", value: (row) => text(row.devops) },
  {
    key: "archived",
    header: "В архиве",
    value: (row) => (row.archived_at === null ? "Нет" : "Да"),
  },
  { key: "id", header: "Служебный ключ", hidden: true, value: (row) => row.id },
];

void PERSON_ROLE_LABELS;

export const VISIBLE_REGISTRY_COLUMNS = REGISTRY_COLUMNS.filter((column) => column.hidden !== true);
