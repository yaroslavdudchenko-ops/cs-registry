import {
  CRITICALITY_LABELS,
  DATA_CLASS_LABELS,
  HOSTING_LABELS,
  LIFECYCLE_LABELS,
  ROLE_LABELS,
  SYSTEM_TYPE_NAMES,
  VALIDATION_LABELS,
  systemTypeGroup,
} from "@/lib/labels";
import {
  CRITICALITIES,
  DATA_CLASSIFICATIONS,
  HOSTING_TYPES,
  LIFECYCLE_STATUSES,
  SYSTEM_TYPES,
  USER_ROLES,
  VALIDATION_STATUSES,
} from "@/server/db/enums";

export type DictionaryRow = { field: string; value: string; label: string; group: string };

export function dictionaryRows(): DictionaryRow[] {
  const rows: DictionaryRow[] = [];
  for (const value of SYSTEM_TYPES) {
    rows.push({
      field: "Тип системы",
      value,
      label: SYSTEM_TYPE_NAMES[value],
      group: systemTypeGroup(value),
    });
  }
  for (const value of HOSTING_TYPES) {
    rows.push({ field: "Размещение", value, label: HOSTING_LABELS[value], group: "" });
  }
  for (const value of DATA_CLASSIFICATIONS) {
    rows.push({
      field: "Классификация данных",
      value,
      label: DATA_CLASS_LABELS[value],
      group: "",
    });
  }
  for (const value of CRITICALITIES) {
    rows.push({ field: "Критичность", value, label: CRITICALITY_LABELS[value], group: "" });
  }
  for (const value of LIFECYCLE_STATUSES) {
    rows.push({ field: "Жизненный цикл", value, label: LIFECYCLE_LABELS[value], group: "" });
  }
  for (const value of VALIDATION_STATUSES) {
    rows.push({ field: "Валидация", value, label: VALIDATION_LABELS[value], group: "" });
  }
  for (const value of USER_ROLES) {
    rows.push({ field: "Роль", value, label: ROLE_LABELS[value], group: "" });
  }
  return rows;
}
