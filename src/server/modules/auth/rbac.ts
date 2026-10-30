import { USER_ROLES, type UserRole } from "@/server/db/enums";
import { ApiError } from "@/server/http/errors";

/**
 * Единственная матрица прав. Неизвестная роль или неизвестное действие — отказ.
 * Копировать проверки в роуты нельзя: обход гарда — баг.
 */
export const PERMISSIONS = [
  "systems.read",
  "systems.read_history",
  "systems.create",
  "systems.update",
  "systems.change_validation_status",
  "systems.archive",
  "systems.restore",
  "systems.export",
  "audit.read",
  "users.read",
  "users.create",
  "users.update",
  "auth.logout",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

type RoleFlags = Record<UserRole, boolean>;

const DENY: RoleFlags = { admin: false, editor: false, viewer: false, auditor: false };

const MATRIX: Record<Permission, RoleFlags> = {
  "systems.read": { admin: true, editor: true, viewer: true, auditor: true },
  "systems.read_history": { admin: true, editor: true, viewer: true, auditor: true },
  "systems.create": { admin: true, editor: true, viewer: false, auditor: false },
  "systems.update": { admin: true, editor: true, viewer: false, auditor: false },
  "systems.change_validation_status": {
    admin: true,
    editor: false,
    viewer: false,
    auditor: false,
  },
  "systems.archive": { admin: true, editor: true, viewer: false, auditor: false },
  "systems.restore": { admin: true, editor: true, viewer: false, auditor: false },
  "systems.export": { admin: true, editor: true, viewer: true, auditor: true },
  "audit.read": { admin: true, editor: false, viewer: false, auditor: true },
  "users.read": { admin: true, editor: false, viewer: false, auditor: false },
  "users.create": { admin: true, editor: false, viewer: false, auditor: false },
  "users.update": { admin: true, editor: false, viewer: false, auditor: false },
  "auth.logout": { admin: true, editor: true, viewer: true, auditor: true },
};

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function isAllowed(role: string, permission: string): boolean {
  if (!isUserRole(role)) {
    return false;
  }
  if (!isPermission(permission)) {
    return false;
  }
  const row = MATRIX[permission];
  if (row === undefined) {
    return false;
  }
  return row[role] === true;
}

export function assertAllowed(role: string, permission: Permission): void {
  if (!isAllowed(role, permission)) {
    throw new ApiError("FORBIDDEN");
  }
}

export function permissionMatrix(): Record<Permission, RoleFlags> {
  return { ...MATRIX, "systems.read": { ...MATRIX["systems.read"] } };
}

/**
 * Каноническое `action` аудита при успешном вызове права.
 * `null` — чтение списка/карточки (URS-095 не назначает им отдельного action).
 * Ключи обязаны совпадать с `PERMISSIONS`: интеграционный тест покрытия
 * импортирует обе константы и падает при расхождении.
 */
export const PERMISSION_AUDIT_ACTIONS = {
  "systems.read": null,
  "systems.read_history": "read_system_history",
  "systems.create": "create",
  "systems.update": "update",
  "systems.change_validation_status": "update",
  "systems.archive": "archive",
  "systems.restore": "restore",
  "systems.export": "export",
  "audit.read": "read_audit",
  "users.read": null,
  "users.create": "create",
  "users.update": "update",
  "auth.logout": "logout",
} as const satisfies Record<Permission, string | null>;

/** Запрет по умолчанию: ячейки, которых нет в матрице, не существуют. */
export function defaultDenyProbe(role: string, permission: string): boolean {
  if (!(permission in MATRIX)) {
    return false;
  }
  return isAllowed(role, permission);
}

export { DENY };
