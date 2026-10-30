import { describe, expect, it } from "vitest";

import {
  SYSTEM_TYPE_LABELS,
  SYSTEM_TYPE_NAMES,
  SYSTEM_TYPE_OPTIONS_GROUPED,
  systemTypeGroup,
  systemTypeOptionLabel,
} from "@/lib/labels";
import { SYSTEM_TYPE_GROUPS, SYSTEM_TYPES } from "@/server/db/enums";

const CODE_RE = /^[A-Z]+$/;

describe("справочник system_type", () => {
  it("содержит 35 уникальных кодов, other последний, именованные коды латиницей", () => {
    expect(SYSTEM_TYPES).toHaveLength(35);
    expect(new Set(SYSTEM_TYPES).size).toBe(35);
    expect(SYSTEM_TYPES.at(-1)).toBe("other");
    for (const value of SYSTEM_TYPES.slice(0, -1)) {
      expect(value).toMatch(CODE_RE);
    }
  });

  it("сохраняет коды 0.5.0", () => {
    for (const value of ["LIMS", "ERP", "MES", "QMS", "SCADA", "DMS", "EDC", "other"] as const) {
      expect(SYSTEM_TYPES).toContain(value);
    }
  });

  it("даёт каждому коду непустые короткую метку и полное название", () => {
    for (const value of SYSTEM_TYPES) {
      expect(SYSTEM_TYPE_LABELS[value].length).toBeGreaterThan(0);
      expect(SYSTEM_TYPE_NAMES[value].length).toBeGreaterThan(0);
    }
    for (const value of SYSTEM_TYPES.slice(0, -1)) {
      expect(SYSTEM_TYPE_LABELS[value]).toBe(value);
    }
    expect(SYSTEM_TYPE_LABELS.other).toBe("Прочее");
    expect(SYSTEM_TYPE_NAMES.LIMS).toBe("Лабораторная информационная система");
    expect(SYSTEM_TYPE_NAMES.ERP).toBe("Планирование ресурсов предприятия");
    expect(SYSTEM_TYPE_NAMES.other).toBe("Прочее");
    expect(systemTypeOptionLabel("WMS")).toBe("WMS — Управление складом");
  });

  it("покрывает все коды кроме other ровно одной группой", () => {
    const seen: string[] = [];
    for (const entry of SYSTEM_TYPE_GROUPS) {
      expect(entry.group.length).toBeGreaterThan(0);
      expect(entry.values.length).toBeGreaterThan(0);
      for (const value of entry.values) {
        expect(value).not.toBe("other");
        expect(seen).not.toContain(value);
        seen.push(value);
      }
    }
    const named = SYSTEM_TYPES.filter((value) => value !== "other");
    expect([...seen].sort()).toEqual([...named].sort());
    expect(systemTypeGroup("other")).toBe("");
    expect(systemTypeGroup("LIMS")).toBe("Лаборатория и качество");
  });

  it("строит сгруппированные опции селекта без other внутри групп", () => {
    expect(SYSTEM_TYPE_OPTIONS_GROUPED).toHaveLength(SYSTEM_TYPE_GROUPS.length);
    const optionValues = SYSTEM_TYPE_OPTIONS_GROUPED.flatMap((entry) =>
      entry.options.map((option) => option.value),
    );
    expect(optionValues).not.toContain("other");
    expect(optionValues).toHaveLength(34);
    const wms = SYSTEM_TYPE_OPTIONS_GROUPED.flatMap((entry) => entry.options).find(
      (option) => option.value === "WMS",
    );
    expect(wms?.label).toBe("WMS — Управление складом");
  });
});
