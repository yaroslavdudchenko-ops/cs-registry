import { describe, expect, it } from "vitest";

import { USER_ROLES } from "@/server/db/enums";

import { PERMISSIONS, PERMISSION_AUDIT_ACTIONS, isAllowed } from "./rbac";

describe("RBAC default-deny", () => {
  it("запрещает неизвестную роль", () => {
    expect(isAllowed("superuser", "systems.read")).toBe(false);
    expect(isAllowed("", "systems.read")).toBe(false);
  });

  it("запрещает неизвестное действие — обход гарда новой строкой матрицы не проходит", () => {
    expect(isAllowed("admin", "systems.delete")).toBe(false);
    expect(isAllowed("admin", "audit.update")).toBe(false);
    expect(isAllowed("editor", "")).toBe(false);
  });

  it("viewer и auditor не пишут реестр", () => {
    for (const role of ["viewer", "auditor"] as const) {
      expect(isAllowed(role, "systems.create")).toBe(false);
      expect(isAllowed(role, "systems.update")).toBe(false);
      expect(isAllowed(role, "systems.archive")).toBe(false);
      expect(isAllowed(role, "systems.restore")).toBe(false);
      expect(isAllowed(role, "users.create")).toBe(false);
    }
  });

  it("editor не меняет validation_status и не читает аудит", () => {
    expect(isAllowed("editor", "systems.change_validation_status")).toBe(false);
    expect(isAllowed("editor", "audit.read")).toBe(false);
    expect(isAllowed("editor", "systems.create")).toBe(true);
    expect(isAllowed("editor", "systems.update")).toBe(true);
  });

  it("auditor читает журнал, viewer нет", () => {
    expect(isAllowed("auditor", "audit.read")).toBe(true);
    expect(isAllowed("viewer", "audit.read")).toBe(false);
    expect(isAllowed("admin", "audit.read")).toBe(true);
  });

  it("история объекта доступна всем четырём ролям, общий журнал — нет", () => {
    for (const role of USER_ROLES) {
      expect(isAllowed(role, "systems.read_history")).toBe(true);
    }
    expect(isAllowed("editor", "audit.read")).toBe(false);
    expect(isAllowed("viewer", "audit.read")).toBe(false);
  });

  it("выгрузка доступна всем четырём ролям просмотра", () => {
    for (const role of USER_ROLES) {
      expect(isAllowed(role, "systems.export")).toBe(true);
    }
  });

  it("каждая ячейка матрицы задана явно для всех ролей", () => {
    for (const permission of PERMISSIONS) {
      for (const role of USER_ROLES) {
        expect(typeof isAllowed(role, permission)).toBe("boolean");
      }
    }
  });

  it("карта аудита покрывает ровно права матрицы — расхождение валит тест", () => {
    expect(Object.keys(PERMISSION_AUDIT_ACTIONS).sort()).toEqual([...PERMISSIONS].sort());
  });
});
