import { describe, expect, it } from "vitest";

import { parseAuditOrder } from "./read";

describe("URS-104 направление сортировки журнала", () => {
  it("пустое и отсутствие — newest, невалидное — null", () => {
    expect(parseAuditOrder(null)).toBe("newest");
    expect(parseAuditOrder("")).toBe("newest");
    expect(parseAuditOrder("newest")).toBe("newest");
    expect(parseAuditOrder("oldest")).toBe("oldest");
    expect(parseAuditOrder("asc")).toBeNull();
    expect(parseAuditOrder("desc")).toBeNull();
    expect(parseAuditOrder("NEWEST")).toBeNull();
  });
});
