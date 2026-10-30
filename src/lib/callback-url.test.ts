import { describe, expect, it } from "vitest";

import { safeCallbackUrl } from "./callback-url";

describe("safeCallbackUrl", () => {
  it("принимает только внутренние пути приложения", () => {
    expect(safeCallbackUrl("/systems")).toBe("/systems");
    expect(safeCallbackUrl("/systems/abc?x=1")).toBe("/systems/abc?x=1");
    expect(safeCallbackUrl("https://evil.example/")).toBe("/systems");
    expect(safeCallbackUrl("//evil.example")).toBe("/systems");
    expect(safeCallbackUrl("/login")).toBe("/systems");
    expect(safeCallbackUrl("/api/v1/users")).toBe("/systems");
    expect(safeCallbackUrl(null)).toBe("/systems");
  });
});
