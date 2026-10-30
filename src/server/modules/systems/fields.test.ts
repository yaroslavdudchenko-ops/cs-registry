import { describe, expect, it } from "vitest";

import { ApiError } from "@/server/http/errors";

import { parseCreateSystem } from "./fields";

const BASE = {
  name: "Параллель А",
  domain: "QC" as const,
  system_type: "LIMS" as const,
  hosting_type: "on_prem" as const,
  data_classification: "internal" as const,
  is_gxp_relevant: false,
  criticality: "low" as const,
  lifecycle_status: "planned" as const,
  validation_status: "not_required" as const,
};

describe("parseCreateSystem — валидация 0.9.0", () => {
  it("валидный минимум без владельцев принимается (списки опциональны)", () => {
    const out = parseCreateSystem(BASE);
    expect(out.name).toBe("Параллель А");
    expect(out.domain).toBe("QC");
  });

  it("неизвестный тип системы — VALIDATION_ERROR с полем system_type", () => {
    try {
      parseCreateSystem({ ...BASE, system_type: "NOT_A_TYPE" });
      throw new Error("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const err = error as ApiError;
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.fields.map((f) => f.field)).toContain("system_type");
    }
  });

  it("неизвестный домен — VALIDATION_ERROR с полем domain", () => {
    try {
      parseCreateSystem({ ...BASE, domain: "XX" });
      throw new Error("should throw");
    } catch (error) {
      const err = error as ApiError;
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.fields.map((f) => f.field)).toContain("domain");
    }
  });

  it("http(s)-ссылка допускается", () => {
    const out = parseCreateSystem({
      ...BASE,
      internal_documents: [{ kind: "internal", title: "URS", url: "https://wiki.example/urs" }],
    });
    expect(out.internal_documents?.[0]?.url).toBe("https://wiki.example/urs");
  });

  it("javascript: — VALIDATION_ERROR на поле internal_documents", () => {
    try {
      parseCreateSystem({
        ...BASE,
        internal_documents: [{ kind: "internal", title: "Фишинг", url: "javascript:alert(1)" }],
      });
      throw new Error("should throw");
    } catch (error) {
      const err = error as ApiError;
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.fields.map((f) => f.field)).toContain("internal_documents");
    }
  });

  it("UNC-путь \\\\server\\share принимается как ссылка", () => {
    const out = parseCreateSystem({
      ...BASE,
      vendor_documents: [{ kind: "vendor", title: "Схема", url: "\\\\fileserver\\docs\\sys.pdf" }],
    });
    expect(out.vendor_documents?.[0]?.url.startsWith("\\\\")).toBe(true);
  });

  it("человек без user_id и без full_name — VALIDATION_ERROR", () => {
    try {
      parseCreateSystem({
        ...BASE,
        process_owners: [{}],
      });
      throw new Error("should throw");
    } catch (error) {
      const err = error as ApiError;
      expect(err.code).toBe("VALIDATION_ERROR");
    }
  });

  it("человек текстом (full_name) принимается без учётки", () => {
    const out = parseCreateSystem({
      ...BASE,
      process_owners: [{ full_name: "Иванов Иван" }],
    });
    expect(out.process_owners?.[0]?.full_name).toBe("Иванов Иван");
  });
});

describe("правило GxP", () => {
  it("GxP выключен → статус должен быть not_required, иначе VALIDATION_ERROR", () => {
    try {
      parseCreateSystem({ ...BASE, is_gxp_relevant: false, validation_status: "validated" });
      throw new Error("should throw");
    } catch (error) {
      const err = error as ApiError;
      expect(err.fields.map((f) => f.field)).toContain("validation_status");
    }
  });

  it("GxP выключен → gxp_criticality и gamp_category всегда очищаются до null", () => {
    const out = parseCreateSystem({
      ...BASE,
      is_gxp_relevant: false,
      validation_status: "not_required",
      gxp_criticality: "high",
      gamp_category: "5",
    });
    expect(out.gxp_criticality).toBeNull();
    expect(out.gamp_category).toBeNull();
  });

  it("GxP включён → gxp_criticality и gamp_category обязательны", () => {
    try {
      parseCreateSystem({
        ...BASE,
        is_gxp_relevant: true,
        criticality: "high",
        validation_status: "validated",
      });
      throw new Error("should throw");
    } catch (error) {
      const err = error as ApiError;
      const fields = err.fields.map((f) => f.field);
      expect(fields).toContain("gxp_criticality");
      expect(fields).toContain("gamp_category");
    }
  });

  it("GxP включён → not_required недоступен", () => {
    try {
      parseCreateSystem({
        ...BASE,
        is_gxp_relevant: true,
        criticality: "high",
        gxp_criticality: "high",
        gamp_category: "5",
        validation_status: "not_required",
      });
      throw new Error("should throw");
    } catch (error) {
      const err = error as ApiError;
      expect(err.fields.map((f) => f.field)).toContain("validation_status");
    }
  });
});
