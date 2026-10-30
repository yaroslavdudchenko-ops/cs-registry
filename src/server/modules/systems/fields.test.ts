import { describe, expect, it } from "vitest";

import { ApiError } from "@/server/http/errors";

import { parseCreateSystem, requireOwners } from "./fields";

describe("owners validation", () => {
  it("OWNERS_REQUIRED если нет process_owner_id", () => {
    expect(() => requireOwners(undefined, "11111111-1111-4111-8111-111111111111")).toThrow(
      ApiError,
    );
    try {
      requireOwners(undefined, "11111111-1111-4111-8111-111111111111");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("OWNERS_REQUIRED");
    }
  });

  it("OWNERS_REQUIRED если нет system_owner_id", () => {
    try {
      requireOwners("11111111-1111-4111-8111-111111111111", null);
    } catch (error) {
      expect((error as ApiError).code).toBe("OWNERS_REQUIRED");
    }
  });

  it("пропускает оба UUID", () => {
    const owners = requireOwners(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    );
    expect(owners.processOwnerId).toHaveLength(36);
  });

  it("невалидный enum — VALIDATION_ERROR, не 422 владельцев", () => {
    try {
      parseCreateSystem({
        name: "X",
        system_type: "NOT_A_TYPE",
        hosting_type: "on_prem",
        data_classification: "internal",
        is_gxp_relevant: false,
        criticality: "low",
        lifecycle_status: "planned",
        validation_status: "not_required",
      });
    } catch (error) {
      expect((error as ApiError).code).toBe("VALIDATION_ERROR");
    }
  });
});
