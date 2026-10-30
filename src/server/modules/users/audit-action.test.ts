import { describe, expect, it } from "vitest";

import { userMutationAuditAction } from "./service";

describe("userMutationAuditAction", () => {
  it("деактивация важнее остальных полей того же PATCH", () => {
    expect(
      userMutationAuditAction({
        isDeactivation: true,
        isActivation: false,
        passwordChange: true,
        isRoleChange: true,
      }),
    ).toBe("deactivate");
  });

  it("активация, сброс пароля и смена роли различимы", () => {
    expect(
      userMutationAuditAction({
        isDeactivation: false,
        isActivation: true,
        passwordChange: false,
        isRoleChange: false,
      }),
    ).toBe("activate");
    expect(
      userMutationAuditAction({
        isDeactivation: false,
        isActivation: false,
        passwordChange: true,
        isRoleChange: false,
      }),
    ).toBe("password_reset");
    expect(
      userMutationAuditAction({
        isDeactivation: false,
        isActivation: false,
        passwordChange: false,
        isRoleChange: true,
      }),
    ).toBe("role_change");
    expect(
      userMutationAuditAction({
        isDeactivation: false,
        isActivation: false,
        passwordChange: false,
        isRoleChange: false,
      }),
    ).toBe("update");
  });
});
