import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "./enums";

const FS_ACTIONS = [
  "create",
  "update",
  "archive",
  "restore",
  "activate",
  "deactivate",
  "login",
  "login_failed",
  "logout",
  "role_change",
  "password_reset",
  "export",
  "read_audit",
  "read_system_history",
] as const;

describe("AUDIT_ACTIONS", () => {
  it("совпадает с полным перечнем FS §6", () => {
    expect([...AUDIT_ACTIONS].sort()).toEqual([...FS_ACTIONS].sort());
  });
});
