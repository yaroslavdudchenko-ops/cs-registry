import PDFDocument from "pdfkit";

import { formatDateTimeUtc } from "@/lib/format";
import {
  CRITICALITY_LABELS,
  LIFECYCLE_LABELS,
  SYSTEM_TYPE_LABELS,
  VALIDATION_LABELS,
} from "@/lib/labels";
import { VISIBLE_REGISTRY_COLUMNS } from "@/server/modules/export/columns";
import { FONT_BOLD, FONT_REGULAR } from "@/server/modules/export/fonts";
import { HISTORY_COLUMNS } from "@/server/modules/export/history-columns";
import { actorLine, paramRows, type ExportMeta } from "@/server/modules/export/params";
import type { SystemRow } from "@/server/db/systems-repository";
import type { ChainedAuditEvent } from "@/server/modules/audit/hash-chain";

type PdfDoc = PDFKit.PDFDocument;

type PdfColumn = {
  header: string;
  width: number;
  value: (row: SystemRow) => string;
};

const LIST_PDF_COLUMNS: PdfColumn[] = [
  { header: "Код", width: 72, value: (row) => row.code },
  { header: "Наименование", width: 168, value: (row) => row.name },
  { header: "Тип", width: 52, value: (row) => SYSTEM_TYPE_LABELS[row.system_type] },
  { header: "Критичность", width: 78, value: (row) => CRITICALITY_LABELS[row.criticality] },
  { header: "Жизненный цикл", width: 92, value: (row) => LIFECYCLE_LABELS[row.lifecycle_status] },
  { header: "Валидация", width: 88, value: (row) => VALIDATION_LABELS[row.validation_status] },
  { header: "Владелец процесса", width: 118, value: (row) => row.process_owner_name ?? "—" },
  { header: "Площадка", width: 90, value: (row) => row.site ?? "—" },
];

function collectPdf(doc: PdfDoc): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    doc.on("data", (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.from(chunk));
    });
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function registerFonts(doc: PdfDoc): void {
  doc.registerFont("DejaVu", FONT_REGULAR);
  doc.registerFont("DejaVu-Bold", FONT_BOLD);
  doc.font("DejaVu");
}

function usableWidth(doc: PdfDoc): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function contentBottom(doc: PdfDoc): number {
  return doc.page.height - Math.max(doc.page.margins.bottom, 40) - 8;
}

function stampPages(doc: PdfDoc, meta: ExportMeta): void {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("DejaVu").fontSize(8).fillColor("#444444");
    const y = doc.page.height - 28;
    const width = usableWidth(doc);
    doc.text(
      `Идентификатор отчёта: ${meta.requestId}  ·  ${formatDateTimeUtc(meta.generatedAt)}`,
      doc.page.margins.left,
      y,
      { width: width - 150, lineBreak: false },
    );
    doc.text(`страница ${String(index + 1)} из ${String(range.count)}`, doc.page.margins.left, y, {
      width,
      align: "right",
      lineBreak: false,
    });
    doc.page.margins.bottom = savedBottom;
  }
  doc.fillColor("#111111");
}

function drawTitlePage(doc: PdfDoc, meta: ExportMeta): void {
  doc.font("DejaVu-Bold").fontSize(18).fillColor("#111111");
  doc.text(meta.title, { align: "left" });
  doc.moveDown(0.6);
  doc.font("DejaVu").fontSize(11);
  doc.text(`Актор: ${actorLine(meta)}`);
  for (const row of paramRows(meta)) {
    if (row.key === "Актор") {
      continue;
    }
    doc.text(`${row.key}: ${row.value}`);
  }
}

function ensureSpace(doc: PdfDoc, needed: number): void {
  if (doc.y + needed <= contentBottom(doc)) {
    return;
  }
  doc.addPage();
  doc.font("DejaVu").fontSize(9).fillColor("#111111");
}

function drawTableHeader(
  doc: PdfDoc,
  columns: Array<{ header: string; width: number }>,
): void {
  const startX = doc.page.margins.left;
  let x = startX;
  doc.font("DejaVu-Bold").fontSize(8).fillColor("#111111");
  let headerHeight = 16;
  for (const column of columns) {
    const height = doc.heightOfString(column.header, { width: column.width - 6 });
    if (height + 6 > headerHeight) {
      headerHeight = height + 6;
    }
  }
  ensureSpace(doc, headerHeight + 4);
  const headerY = doc.y;
  doc.save();
  doc.rect(startX, headerY, usableWidth(doc), headerHeight).fill("#e8eef5");
  doc.restore();
  x = startX;
  for (const column of columns) {
    doc.fillColor("#111111").text(column.header, x + 3, headerY + 3, {
      width: column.width - 6,
      lineBreak: true,
    });
    x += column.width;
  }
  doc.y = headerY + headerHeight + 2;
  doc.font("DejaVu").fontSize(8);
}

function drawDataRow(
  doc: PdfDoc,
  columns: Array<{ header: string; width: number }>,
  values: string[],
  redrawHeader: () => void,
): void {
  let rowHeight = 14;
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    const value = values[index] ?? "—";
    if (column === undefined) {
      continue;
    }
    const height = doc.heightOfString(value, { width: column.width - 6 });
    if (height + 6 > rowHeight) {
      rowHeight = height + 6;
    }
  }
  if (doc.y + rowHeight > contentBottom(doc)) {
    doc.addPage();
    redrawHeader();
  }
  const y = doc.y;
  let x = doc.page.margins.left;
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    const value = values[index] ?? "—";
    if (column === undefined) {
      continue;
    }
    doc.font("DejaVu").fontSize(8).fillColor("#111111").text(value, x + 3, y + 2, {
      width: column.width - 6,
      lineBreak: true,
    });
    x += column.width;
  }
  doc.y = y + rowHeight;
}

function drawRegistryTable(doc: PdfDoc, rows: SystemRow[]): void {
  const columns = LIST_PDF_COLUMNS.map((column) => ({ header: column.header, width: column.width }));
  const redraw = (): void => {
    doc.font("DejaVu-Bold").fontSize(12).text("Записи реестра");
    doc.moveDown(0.4);
    drawTableHeader(doc, columns);
  };
  redraw();
  if (rows.length === 0) {
    doc.font("DejaVu").fontSize(10).text("По заданным условиям записей нет.");
    return;
  }
  for (const row of rows) {
    drawDataRow(
      doc,
      columns,
      LIST_PDF_COLUMNS.map((column) => column.value(row)),
      redraw,
    );
  }
}

function drawCardFields(doc: PdfDoc, row: SystemRow): void {
  doc.font("DejaVu-Bold").fontSize(12).text("Параметры записи");
  doc.moveDown(0.3);
  doc.font("DejaVu").fontSize(10);
  for (const column of VISIBLE_REGISTRY_COLUMNS) {
    ensureSpace(doc, 28);
    doc.font("DejaVu").fontSize(8).fillColor("#555555").text(column.header);
    doc.font("DejaVu").fontSize(10).fillColor("#111111").text(column.value(row));
    doc.moveDown(0.25);
  }
}

function drawHistoryTable(doc: PdfDoc, events: ChainedAuditEvent[]): void {
  doc.addPage();
  doc.font("DejaVu-Bold").fontSize(12).text("История изменений");
  doc.moveDown(0.4);
  if (events.length === 0) {
    doc.font("DejaVu").fontSize(10).text("История изменений отсутствует.");
    return;
  }
  const columns = [
    { header: "Когда", width: 110 },
    { header: "Действие", width: 90 },
    { header: "Кто", width: 120 },
    { header: "Изменённые поля", width: 120 },
    { header: "Стало", width: 210 },
    { header: "Причина", width: 108 },
  ];
  const valueFns = [
    HISTORY_COLUMNS[0]?.value,
    HISTORY_COLUMNS[1]?.value,
    HISTORY_COLUMNS[2]?.value,
    HISTORY_COLUMNS[3]?.value,
    HISTORY_COLUMNS[5]?.value,
    HISTORY_COLUMNS[6]?.value,
  ];
  const redraw = (): void => {
    doc.font("DejaVu-Bold").fontSize(12).text("История изменений");
    doc.moveDown(0.3);
    drawTableHeader(doc, columns);
  };
  drawTableHeader(doc, columns);
  for (const event of events) {
    const values = valueFns.map((fn) => (fn === undefined ? "—" : fn(event)));
    drawDataRow(doc, columns, values, redraw);
  }
}

function createDocument(): PdfDoc {
  return new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 40,
    bufferPages: true,
    info: { Title: "Реестр компьютеризированных систем" },
  });
}

export async function buildRegistryPdf(rows: SystemRow[], meta: ExportMeta): Promise<Buffer> {
  const doc = createDocument();
  const done = collectPdf(doc);
  registerFonts(doc);
  drawTitlePage(doc, meta);
  doc.addPage();
  drawRegistryTable(doc, rows);
  stampPages(doc, meta);
  doc.end();
  return done;
}

export async function buildCardPdf(
  row: SystemRow,
  history: ChainedAuditEvent[],
  meta: ExportMeta,
): Promise<Buffer> {
  const doc = createDocument();
  const done = collectPdf(doc);
  registerFonts(doc);
  drawTitlePage(doc, meta);
  doc.addPage();
  drawCardFields(doc, row);
  drawHistoryTable(doc, history);
  stampPages(doc, meta);
  doc.end();
  return done;
}
