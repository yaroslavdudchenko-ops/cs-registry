import { describe, expect, it } from "vitest";

import { SYSTEM_TYPE_NAMES } from "@/lib/labels";
import { SYSTEM_TYPES } from "@/server/db/enums";

import { dictionaryRows } from "./dictionaries";

describe("dictionaryRows", () => {
  it("включает все 35 типов систем с подписью и группой", () => {
    const typeRows = dictionaryRows().filter((row) => row.field === "Тип системы");
    expect(typeRows.map((row) => row.value)).toEqual([...SYSTEM_TYPES]);
    expect(typeRows).toHaveLength(35);
    for (const row of typeRows) {
      expect(row.label).toBe(SYSTEM_TYPE_NAMES[row.value as (typeof SYSTEM_TYPES)[number]]);
      expect(row.label.length).toBeGreaterThan(0);
      if (row.value === "other") {
        expect(row.group).toBe("");
      } else {
        expect(row.group.length).toBeGreaterThan(0);
      }
    }
  });
});
