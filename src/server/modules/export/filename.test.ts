import { describe, expect, it } from "vitest";

import { exportFilename } from "./filename";

describe("exportFilename", () => {
  it("matches cs-registry_<date>_<HHMM>_<short-id>.<ext>", () => {
    const at = new Date("2026-10-29T14:07:33.000Z");
    const name = exportFilename("9a13fe66-81e4-471a-8816-f5b2cd51e2ff", "xlsx", at);
    expect(name).toBe("cs-registry_2026-10-29_1407_9a13fe66.xlsx");
  });

  it("uses pdf extension", () => {
    const at = new Date("2026-01-02T03:04:00.000Z");
    expect(exportFilename("abcd", "pdf", at)).toBe("cs-registry_2026-01-02_0304_abcd.pdf");
  });
});
