import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildCardXlsx, buildRegistryXlsx } from "./xlsx";
import type { ExportMeta } from "./params";
import { sampleSystemRow as sampleRow } from "./fixtures.test-helpers";

async function loadWorkbook(data: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data as never);
  return workbook;
}

function headerCells(sheet: ExcelJS.Worksheet): string[] {
  const values = sheet.getRow(1).values;
  if (!Array.isArray(values)) {
    return [];
  }
  return values.slice(1).map((value) => String(value ?? ""));
}

function meta(): ExportMeta {
  return {
    actorUsername: "editor.one",
    actorRole: "editor",
    generatedAt: "2026-10-29T14:07:33.000Z",
    filters: { Тип: "LIMS" },
    rowCount: 1,
    appVersion: "test-build",
    filename: "cs-registry_2026-10-29_1407_abcd1234.xlsx",
    requestId: "abcd1234-1111-4111-8111-111111111111",
    title: "Реестр компьютеризированных систем",
  };
}

describe("buildRegistryXlsx", () => {
  it("builds three Russian sheets with frozen header, hidden id and DD.MM.YYYY dates", async () => {
    const buffer = await buildRegistryXlsx([sampleRow()], meta());
    const workbook = await loadWorkbook(Uint8Array.from(buffer));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Реестр",
      "Параметры выгрузки",
      "Справочники",
    ]);
    const registry = workbook.getWorksheet("Реестр");
    expect(registry).toBeDefined();
    if (registry === undefined) {
      throw new Error("missing registry sheet");
    }
    const headers = headerCells(registry);
    expect(headers[0]).toBe("ID системы");
    expect(headers.at(-1)).toBe("Служебный ключ");
    expect(headers).not.toContain("email");
    expect(headers).not.toContain("password_hash");
    expect(headers).not.toContain("mfa_secret");
    expect(registry?.getColumn(headers.length).hidden).toBe(true);
    const data = registry?.getRow(2);
    expect(data?.getCell(1).value).toBe("SYS-QC-0001");
    const dateCell = headers.indexOf("Дата последней валидации") + 1;
    expect(data?.getCell(dateCell).value).toBe("01.03.2026");
    expect(headers.join(" ")).not.toContain("password_hash");
    expect(headers.join(" ")).not.toContain("mfa_secret");
    expect(headers.join(" ")).not.toContain("email");
    const dict = workbook.getWorksheet("Справочники");
    expect(dict).toBeDefined();
    if (dict === undefined) {
      throw new Error("missing dictionaries sheet");
    }
    expect(headerCells(dict)).toEqual(["Поле", "Значение", "Расшифровка", "Группа"]);
    const typeValues: string[] = [];
    dict.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }
      if (String(row.getCell(1).value ?? "") === "Тип системы") {
        typeValues.push(String(row.getCell(2).value ?? ""));
      }
    });
    expect(typeValues).toHaveLength(35);
    expect(typeValues.at(-1)).toBe("other");
    const limsRow = dict.getRow(2);
    expect(limsRow.getCell(2).value).toBe("LIMS");
    expect(limsRow.getCell(3).value).toBe("Лабораторная информационная система");
    expect(limsRow.getCell(4).value).toBe("Лаборатория и качество");
  });
});

describe("buildCardXlsx", () => {
  it("includes card, history, params and dictionaries", async () => {
    const buffer = await buildCardXlsx(sampleRow(), [], {
      ...meta(),
      title: "Карточка системы SYS-0001 Параллель А",
    });
    const workbook = await loadWorkbook(Uint8Array.from(buffer));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Карточка",
      "История",
      "Параметры выгрузки",
      "Справочники",
    ]);
  });
});
