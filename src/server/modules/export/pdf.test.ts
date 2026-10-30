import { describe, expect, it } from "vitest";

import type { SystemRow } from "@/server/db/systems-repository";

import { buildCardPdf, buildRegistryPdf } from "./pdf";
import type { ExportMeta } from "./params";

function sampleRow(): SystemRow {
  return {
    id: "9a13fe66-81e4-471a-8816-f5b2cd51e2ff",
    code: "SYS-0001",
    name: "Параллель А",
    vendor: "Citroën",
    product_version: "1.2",
    description: "Лабораторная система",
    system_type: "LIMS",
    business_process: "QC",
    process_owner_id: "e6c703ef-bb50-419e-b414-082f53bf7a71",
    system_owner_id: "2a5faf58-1658-48a5-92fe-f9abbfc620df",
    quality_owner_id: null,
    process_owner_name: "Иванов Иван",
    system_owner_name: "Петров Пётр",
    quality_owner_name: null,
    site: "Москва",
    hosting_type: "on_prem",
    hosting_provider: null,
    data_classification: "internal",
    is_gxp_relevant: true,
    criticality: "medium",
    lifecycle_status: "active",
    validation_status: "validated",
    validated_at: "2026-03-01",
    next_review_at: "2027-03-01",
    auth_model: "SSO",
    backup_rpo_hours: 24,
    backup_rto_hours: 4,
    notes: null,
    archived_at: null,
    created_at: new Date("2026-10-29T10:00:00.000Z"),
    updated_at: new Date("2026-10-29T10:00:00.000Z"),
    version: 1,
  };
}

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
