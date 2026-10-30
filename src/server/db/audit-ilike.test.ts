import { describe, expect, it } from "vitest";

import { escapeIlike } from "./audit-repository";

describe("escapeIlike", () => {
  it("экранирует %, _ и обратный слэш", () => {
    expect(escapeIlike("SYS-0001")).toBe("SYS-0001");
    expect(escapeIlike("100%")).toBe("100\\%");
    expect(escapeIlike("a_b")).toBe("a\\_b");
    expect(escapeIlike("a\\b")).toBe("a\\\\b");
    expect(escapeIlike("%_\\")).toBe("\\%\\_\\\\");
  });
});
