import ExcelJS from "exceljs";

import { REGISTRY_COLUMNS, VISIBLE_REGISTRY_COLUMNS } from "@/server/modules/export/columns";
import { dictionaryRows } from "@/server/modules/export/dictionaries";
import { HISTORY_COLUMNS } from "@/server/modules/export/history-columns";
import { paramRows, type ExportMeta } from "@/server/modules/export/params";
import type { SystemRow } from "@/server/db/systems-repository";
import type { ChainedAuditEvent } from "@/server/modules/audit/hash-chain";

function styleHeader(sheet: ExcelJS.Worksheet, columnCount: number): void {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };
  sheet.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columnCount },
  };
}

function addRegistrySheet(workbook: ExcelJS.Workbook, rows: SystemRow[]): void {
  const sheet = workbook.addWorksheet("Реестр", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = REGISTRY_COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.hidden === true ? 12 : Math.min(36, Math.max(14, column.header.length + 4)),
    hidden: column.hidden === true,
  }));
  for (const row of rows) {
    const values: Record<string, string> = {};
    for (const column of REGISTRY_COLUMNS) {
      values[column.key] = column.value(row);
    }
    sheet.addRow(values);
  }
  const hidden = REGISTRY_COLUMNS.findIndex((column) => column.hidden === true);
  if (hidden >= 0) {
    sheet.getColumn(hidden + 1).hidden = true;
  }
  styleHeader(sheet, REGISTRY_COLUMNS.length);
}

function addCardSheet(workbook: ExcelJS.Workbook, row: SystemRow): void {
  const sheet = workbook.addWorksheet("Карточка");
  sheet.columns = [
    { header: "Поле", key: "field", width: 32 },
    { header: "Значение", key: "value", width: 60 },
  ];
  for (const column of VISIBLE_REGISTRY_COLUMNS) {
    sheet.addRow({ field: column.header, value: column.value(row) });
  }
  styleHeader(sheet, 2);
}

function addHistorySheet(workbook: ExcelJS.Workbook, events: ChainedAuditEvent[]): void {
  const sheet = workbook.addWorksheet("История");
  sheet.columns = HISTORY_COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.key === "before" || column.key === "after" ? 48 : 22,
  }));
  for (const event of events) {
    const values: Record<string, string> = {};
    for (const column of HISTORY_COLUMNS) {
      values[column.key] = column.value(event);
    }
    sheet.addRow(values);
  }
  styleHeader(sheet, HISTORY_COLUMNS.length);
}

function addParamsSheet(workbook: ExcelJS.Workbook, meta: ExportMeta): void {
  const sheet = workbook.addWorksheet("Параметры выгрузки");
  sheet.columns = [
    { header: "Параметр", key: "key", width: 28 },
    { header: "Значение", key: "value", width: 72 },
  ];
  for (const row of paramRows(meta)) {
    sheet.addRow(row);
  }
  styleHeader(sheet, 2);
}

function addDictSheet(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.addWorksheet("Справочники");
  sheet.columns = [
    { header: "Поле", key: "field", width: 28 },
    { header: "Значение", key: "value", width: 22 },
    { header: "Расшифровка", key: "label", width: 48 },
    { header: "Группа", key: "group", width: 40 },
  ];
  for (const row of dictionaryRows()) {
    sheet.addRow(row);
  }
  styleHeader(sheet, 4);
}

async function workbookBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

export async function buildRegistryXlsx(rows: SystemRow[], meta: ExportMeta): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CS Registry";
  workbook.created = new Date(meta.generatedAt);
  addRegistrySheet(workbook, rows);
  addParamsSheet(workbook, meta);
  addDictSheet(workbook);
  return workbookBuffer(workbook);
}

export async function buildCardXlsx(
  row: SystemRow,
  history: ChainedAuditEvent[],
  meta: ExportMeta,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CS Registry";
  workbook.created = new Date(meta.generatedAt);
  addCardSheet(workbook, row);
  addHistorySheet(workbook, history);
  addParamsSheet(workbook, meta);
  addDictSheet(workbook);
  return workbookBuffer(workbook);
}
