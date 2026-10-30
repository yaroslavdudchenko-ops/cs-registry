import { describe, expect, it } from "vitest";

import {
  assertReason,
  isReasonRequired,
  ReasonRequiredError,
} from "./reason";

describe("isReasonRequired", () => {
  it("требует причину при смене validation_status", () => {
    expect(isReasonRequired({ changedFields: ["validation_status"] })).toBe(true);
  });

  it("требует причину при смене criticality", () => {
    expect(isReasonRequired({ changedFields: ["criticality"] })).toBe(true);
  });

  it("требует причину при смене is_gxp_relevant", () => {
    expect(isReasonRequired({ changedFields: ["is_gxp_relevant"] })).toBe(true);
  });

  it("требует причину при архивировании", () => {
    expect(isReasonRequired({ changedFields: ["archived_at"], isArchive: true })).toBe(true);
  });

  it("требует причину при восстановлении", () => {
    expect(isReasonRequired({ changedFields: ["archived_at"], isRestore: true })).toBe(true);
  });

  it("требует причину при смене роли", () => {
    expect(isReasonRequired({ changedFields: ["role"], isRoleChange: true })).toBe(true);
  });

  it("требует причину при деактивации", () => {
    expect(isReasonRequired({ changedFields: ["is_active"], isDeactivation: true })).toBe(true);
  });

  it("требует причину при любом редактировании validated-системы", () => {
    expect(
      isReasonRequired({
        changedFields: ["name"],
        currentValidationStatus: "validated",
      }),
    ).toBe(true);
  });

  it("не требует причину для некритичного поля вне validated", () => {
    expect(
      isReasonRequired({
        changedFields: ["name"],
        currentValidationStatus: "not_validated",
      }),
    ).toBe(false);
  });

  it("не требует причину для notes на in_validation", () => {
    expect(
      isReasonRequired({
        changedFields: ["notes"],
        currentValidationStatus: "in_validation",
      }),
    ).toBe(false);
  });

  it("не требует причину при реактивации пользователя", () => {
    expect(
      isReasonRequired({
        changedFields: ["is_active"],
        isDeactivation: false,
      }),
    ).toBe(false);
  });

  it("не требует причину при пустом списке полей", () => {
    expect(isReasonRequired({ changedFields: [] })).toBe(false);
  });
});

describe("assertReason", () => {
  it("бросает ReasonRequiredError без причины на критичном поле", () => {
    expect(() => assertReason(null, { changedFields: ["criticality"] })).toThrow(
      ReasonRequiredError,
    );
    expect(() => assertReason("", { changedFields: ["criticality"] })).toThrow(
      ReasonRequiredError,
    );
    expect(() => assertReason("   ", { changedFields: ["criticality"] })).toThrow(
      ReasonRequiredError,
    );
  });

  it("принимает непустую причину на критичном поле", () => {
    expect(() =>
      assertReason("смена класса риска", { changedFields: ["criticality"] }),
    ).not.toThrow();
  });

  it("не требует причину на некритичном изменении", () => {
    expect(() =>
      assertReason(null, { changedFields: ["vendor"], currentValidationStatus: "not_validated" }),
    ).not.toThrow();
  });

  it("код ошибки — REASON_REQUIRED", () => {
    try {
      assertReason(null, { changedFields: ["validation_status"] });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ReasonRequiredError);
      if (error instanceof ReasonRequiredError) {
        expect(error.code).toBe("REASON_REQUIRED");
      }
    }
  });
});
