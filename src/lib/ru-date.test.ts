import { describe, expect, it } from "vitest";

import { isoToRuDate, maskRuDate, parseRuDate } from "@/lib/ru-date";

describe("parseRuDate", () => {
  it("accepts empty as unset", () => {
    expect(parseRuDate("")).toEqual({ ok: true, iso: null });
    expect(parseRuDate("   ")).toEqual({ ok: true, iso: null });
  });

  it("parses a calendar date", () => {
    expect(parseRuDate("29.10.2026")).toEqual({ ok: true, iso: "2026-10-29" });
  });

  it("rejects impossible dates and latin format", () => {
    expect(parseRuDate("31.02.2026").ok).toBe(false);
    expect(parseRuDate("2026-10-29").ok).toBe(false);
    expect(parseRuDate("10/29/2026").ok).toBe(false);
  });
});

describe("maskRuDate", () => {
  it("inserts dots while typing digits", () => {
    expect(maskRuDate("2")).toBe("2");
    expect(maskRuDate("2910")).toBe("29.10");
    expect(maskRuDate("29102026")).toBe("29.10.2026");
  });
});

describe("isoToRuDate", () => {
  it("turns API dates into the Russian mask", () => {
    expect(isoToRuDate("2026-10-29")).toBe("29.10.2026");
    expect(isoToRuDate("")).toBe("");
  });
});
