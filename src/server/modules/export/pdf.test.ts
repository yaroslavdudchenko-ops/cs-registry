import { describe, expect, it } from "vitest";

import { buildCardPdf, buildRegistryPdf } from "./pdf";
import type { ExportMeta } from "./params";
import { sampleSystemRow as sampleRow } from "./fixtures.test-helpers";

function meta(): ExportMeta {
  return {
    actorUsername: "editor.one",
    actorRole: "editor",
    generatedAt: "2026-10-29T14:07:33.000Z",
    filters: { Тип: "LIMS" },
    rowCount: 1,
    appVersion: "test-build",
    filename: "cs-registry_2026-10-29_1407_abcd1234.pdf",
    requestId: "abcd1234-1111-4111-8111-111111111111",
    title: "Реестр компьютеризированных систем",
  };
}

describe("buildRegistryPdf", () => {
  it("embeds DejaVu and starts with a PDF header", async () => {
    const buffer = await buildRegistryPdf([sampleRow()], meta());
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    const asAscii = buffer.toString("latin1");
    expect(asAscii).toContain("DejaVu");
    expect(asAscii).not.toContain("password_hash");
    expect(asAscii).not.toContain("mfa_secret");
    const count = /\/Count\s+(\d+)/.exec(asAscii);
    expect(Number(count?.[1])).toBe(2);
  });
});

describe("buildCardPdf", () => {
  it("produces a readable PDF for a card with empty history", async () => {
    const buffer = await buildCardPdf(sampleRow(), [], {
      ...meta(),
      title: "Карточка системы SYS-0001 Параллель А",
    });
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });
});
