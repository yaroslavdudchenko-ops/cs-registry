import { z } from "zod";

import { getSql } from "@/server/db/client";
import { USER_ROLES } from "@/server/db/enums";
import { revokeSessionsForUser } from "@/server/db/sessions-repository";
import {
  countActiveAdmins,
  insertUser,
  listUsers,
  publicUser,
  selectUserById,
  updateUser,
} from "@/server/db/users-repository";
import { ApiError } from "@/server/http/errors";
import { assertReason, ReasonRequiredError } from "@/server/modules/audit/reason";
import {
  appendAuditEventInTx,
  appendRejectionEvent,
  type AuditActorContext,
} from "@/server/modules/audit/write";
import { hashPassword, isArgon2idHash, isPasswordLongEnough } from "@/server/modules/auth/password";

const createUserSchema = z.object({
  username: z.string().trim().min(1).max(100),
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  password: z.string(),
  role: z.enum(USER_ROLES),
});

const patchUserSchema = z.object({
  version: z.number().int(),
  full_name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(320).optional(),
  password: z.string().optional(),
  role: z.enum(USER_ROLES).optional(),
  is_active: z.boolean().optional(),
  reason: z.string().optional(),
});

export type UserMutationAuditAction =
  | "deactivate"
  | "activate"
  | "password_reset"
  | "role_change"
  | "update";

/** Одно событие на PATCH: приоритет deactivate > activate > password_reset > role_change > update. */
export function userMutationAuditAction(input: {
  isDeactivation: boolean;
  isActivation: boolean;
  passwordChange: boolean;
  isRoleChange: boolean;
}): UserMutationAuditAction {
  if (input.isDeactivation) {
    return "deactivate";
  }
  if (input.isActivation) {
    return "activate";
  }
  if (input.passwordChange) {
    return "password_reset";
  }
  if (input.isRoleChange) {
    return "role_change";
  }
  return "update";
}

export async function createUserRecord(
  body: unknown,
  actor: AuditActorContext,
): Promise<Record<string, unknown>> {
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR");
  }
  if (!isPasswordLongEnough(parsed.data.password)) {
    throw new ApiError("VALIDATION_ERROR");
  }
  const username = parsed.data.username.toLowerCase();
  const email = parsed.data.email.toLowerCase();
  const passwordHash = await hashPassword(parsed.data.password);
  const sql = getSql();
  try {
    const created = await sql.begin(async (tx) => {
      const row = await insertUser(tx, {
        username,
        fullName: parsed.data.full_name,
        email,
        passwordHash,
        role: parsed.data.role,
      });
      const pub = publicUser(row);
      await appendAuditEventInTx(tx, actor, {
        action: "create",
        entityType: "users",
        entityId: row.id,
        entityLabel: row.username,
        changedFields: ["username", "full_name", "email", "role", "is_active"],
        before: null,
        after: {
          username: pub.username,
          full_name: pub.full_name,
          email: pub.email,
          role: pub.role,
          is_active: pub.is_active,
        },
        reason: null,
      });
      return pub;
    });
    if (!isArgon2idHash(passwordHash)) {
      throw new ApiError("INTERNAL_ERROR");
    }
    return created;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError("CONFLICT");
  }
}

export async function listUserRecords(): Promise<Record<string, unknown>[]> {
  const rows = await listUsers(getSql());
  return rows.map(publicUser);
}

export async function updateUserRecord(
  id: string,
  body: unknown,
  actor: AuditActorContext,
): Promise<Record<string, unknown>> {
  const parsed = patchUserSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR");
  }
  const sql = getSql();
  const current = await selectUserById(sql, id);
  if (current === null) {
    throw new ApiError("NOT_FOUND");
  }

  const isRoleChange = parsed.data.role !== undefined && parsed.data.role !== current.role;
  const isDeactivation = parsed.data.is_active === false && current.is_active;
  const isActivation = parsed.data.is_active === true && !current.is_active;
  const passwordChange = parsed.data.password !== undefined;
  const auditAction = userMutationAuditAction({
    isDeactivation,
    isActivation,
    passwordChange,
    isRoleChange,
  });

  if (passwordChange && parsed.data.password !== undefined && !isPasswordLongEnough(parsed.data.password)) {
    throw new ApiError("VALIDATION_ERROR");
  }

  try {
    assertReason(parsed.data.reason ?? null, {
      changedFields: [
        ...(isRoleChange ? ["role"] : []),
        ...(isDeactivation ? ["is_active"] : []),
      ],
      isRoleChange,
      isDeactivation,
    });
  } catch (error) {
    if (error instanceof ReasonRequiredError) {
      await appendRejectionEvent(sql, actor, {
        action: auditAction,
        entityType: "users",
        entityId: id,
        entityLabel: current.username,
        code: "REASON_REQUIRED",
      });
      throw new ApiError("REASON_REQUIRED");
    }
    throw error;
  }

  if ((isDeactivation || isRoleChange) && current.role === "admin" && current.is_active) {
    const admins = await countActiveAdmins(sql);
    if (admins <= 1 && (isDeactivation || parsed.data.role !== "admin")) {
      throw new ApiError("LAST_ADMIN");
    }
  }

  const passwordHash =
    parsed.data.password !== undefined ? await hashPassword(parsed.data.password) : undefined;

  const updated = await sql.begin(async (tx) => {
    const userPatch: {
      fullName?: string;
      email?: string;
      passwordHash?: string;
      role?: (typeof USER_ROLES)[number];
      isActive?: boolean;
    } = {};
    if (parsed.data.full_name !== undefined) userPatch.fullName = parsed.data.full_name;
    if (parsed.data.email !== undefined) userPatch.email = parsed.data.email.toLowerCase();
    if (passwordHash !== undefined) userPatch.passwordHash = passwordHash;
    if (parsed.data.role !== undefined) userPatch.role = parsed.data.role;
    if (parsed.data.is_active !== undefined) userPatch.isActive = parsed.data.is_active;
    const row = await updateUser(tx, id, parsed.data.version, userPatch);
    if (row === null) {
      throw new ApiError("VERSION_CONFLICT");
    }
    if (isDeactivation || passwordChange) {
      await revokeSessionsForUser(tx, id);
    }
    const changed: string[] = [];
    const before: Record<string, string | boolean | null> = {};
    const after: Record<string, string | boolean | null> = {};
    if (parsed.data.full_name !== undefined && parsed.data.full_name !== current.full_name) {
      changed.push("full_name");
      before.full_name = current.full_name;
      after.full_name = row.full_name;
    }
    if (parsed.data.email !== undefined && parsed.data.email.toLowerCase() !== current.email) {
      changed.push("email");
      before.email = current.email;
      after.email = row.email;
    }
    if (isRoleChange) {
      changed.push("role");
      before.role = current.role;
      after.role = row.role;
    }
    if (parsed.data.is_active !== undefined && parsed.data.is_active !== current.is_active) {
      changed.push("is_active");
      before.is_active = current.is_active;
      after.is_active = row.is_active;
    }
    if (passwordChange) {
      changed.push("password");
      before.password = null;
      after.password = "rotated";
    }
    await appendAuditEventInTx(tx, actor, {
      action: auditAction,
      entityType: "users",
      entityId: id,
      entityLabel: row.username,
      changedFields: changed,
      before,
      after,
      reason: parsed.data.reason ?? null,
    });
    return publicUser(row);
  });

  return updated;
}
