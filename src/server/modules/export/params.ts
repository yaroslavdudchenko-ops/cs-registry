import { formatDateTimeUtc } from "@/lib/format";
import { fieldLabel, roleLabel } from "@/lib/labels";

export type ExportMeta = {
  actorUsername: string;
  actorRole: string;
  generatedAt: string;
  filters: Record<string, string>;
  rowCount: number;
  appVersion: string;
  filename: string;
  requestId: string;
  title: string;
};

export function filterPairs(filters: Record<string, string>): Array<{ key: string; value: string }> {
  return Object.entries(filters)
    .filter(([, value]) => value.length > 0)
    .map(([key, value]) => ({ key, value }));
}

export function actorLine(meta: ExportMeta): string {
  return `${meta.actorUsername} · ${roleLabel(meta.actorRole)}`;
}

export function paramRows(meta: ExportMeta): Array<{ key: string; value: string }> {
  const rows: Array<{ key: string; value: string }> = [
    { key: "Актор", value: actorLine(meta) },
    { key: "Время формирования", value: formatDateTimeUtc(meta.generatedAt) },
    { key: "Число записей", value: String(meta.rowCount) },
    { key: "Версия приложения", value: meta.appVersion },
    { key: "Имя файла", value: meta.filename },
    { key: "Идентификатор отчёта", value: meta.requestId },
  ];
  for (const pair of filterPairs(meta.filters)) {
    rows.push({ key: `Фильтр: ${pair.key}`, value: pair.value });
  }
  return rows;
}

export function humanFilterKey(key: string): string {
  if (key === "process_owner") {
    return fieldLabel("process_owner_name");
  }
  return fieldLabel(key);
}
