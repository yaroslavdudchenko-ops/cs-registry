import { formatDate, formatHours } from "@/lib/format";
import {
  CRITICALITY_LABELS,
  DATA_CLASS_LABELS,
  HOSTING_LABELS,
  LIFECYCLE_LABELS,
  SYSTEM_TYPE_LABELS,
  VALIDATION_LABELS,
} from "@/lib/labels";
import type { SystemRow } from "@/server/db/systems-repository";

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
  { key: "code", header: "Код", value: (row) => row.code },
  { key: "name", header: "Наименование", value: (row) => row.name },
  { key: "description", header: "Описание", value: (row) => text(row.description) },
  { key: "system_type", header: "Тип", value: (row) => SYSTEM_TYPE_LABELS[row.system_type] },
  { key: "vendor", header: "Вендор", value: (row) => text(row.vendor) },
  { key: "product_version", header: "Версия продукта", value: (row) => text(row.product_version) },
  { key: "criticality", header: "Критичность", value: (row) => CRITICALITY_LABELS[row.criticality] },
  {
    key: "lifecycle_status",
    header: "Жизненный цикл",
    value: (row) => LIFECYCLE_LABELS[row.lifecycle_status],
  },
  {
    key: "validation_status",
    header: "Валидация",
    value: (row) => VALIDATION_LABELS[row.validation_status],
  },
  { key: "process_owner_name", header: "Владелец процесса", value: (row) => row.process_owner_name },
  { key: "system_owner_name", header: "Владелец системы", value: (row) => row.system_owner_name },
  {
    key: "quality_owner_name",
    header: "Владелец качества",
    value: (row) => text(row.quality_owner_name),
  },
  { key: "site", header: "Площадка", value: (row) => text(row.site) },
  { key: "hosting_type", header: "Размещение", value: (row) => HOSTING_LABELS[row.hosting_type] },
  { key: "hosting_provider", header: "Провайдер", value: (row) => text(row.hosting_provider) },
  {
    key: "data_classification",
    header: "Классификация данных",
    value: (row) => DATA_CLASS_LABELS[row.data_classification],
  },
  { key: "is_gxp_relevant", header: "GxP", value: (row) => (row.is_gxp_relevant ? "Да" : "Нет") },
  { key: "validated_at", header: "Дата валидации", value: (row) => formatDate(row.validated_at) },
  {
    key: "next_review_at",
    header: "Следующая переоценка",
    value: (row) => formatDate(row.next_review_at),
  },
  { key: "business_process", header: "Бизнес-процесс", value: (row) => text(row.business_process) },
  { key: "auth_model", header: "Модель аутентификации", value: (row) => text(row.auth_model) },
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
  { key: "notes", header: "Примечания", value: (row) => text(row.notes) },
  {
    key: "archived",
    header: "В архиве",
    value: (row) => (row.archived_at === null ? "Нет" : "Да"),
  },
  { key: "id", header: "Служебный ключ", hidden: true, value: (row) => row.id },
];

export const VISIBLE_REGISTRY_COLUMNS = REGISTRY_COLUMNS.filter((column) => column.hidden !== true);
