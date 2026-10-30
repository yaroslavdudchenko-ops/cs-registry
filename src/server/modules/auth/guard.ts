import { getSql } from "@/server/db/client";
import { ApiError } from "@/server/http/errors";
import { appendRejectionEvent } from "@/server/modules/audit/write";
import { type Permission, isAllowed } from "@/server/modules/auth/rbac";
import {
  type AuthContext,
  requireSession,
} from "@/server/modules/auth/session";

export type GuardTarget = {
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
};

/**
 * Единая точка проверки прав. Роут, который не вызывает это перед мутацией —
 * обход гарда и баг. Неизвестная роль/действие уже false в isAllowed.
 */
export async function requirePermission(
  request: Request,
  permission: Permission,
  extras: { requestId: string; ip: string | null; userAgent: string | null },
  target: GuardTarget,
): Promise<AuthContext> {
  const auth = await requireSession(request, extras);
  if (!isAllowed(auth.user.role, permission)) {
    await appendRejectionEvent(getSql(), auth.actor, {
      action: target.action,
      entityType: target.entityType,
      entityId: target.entityId,
      entityLabel: target.entityLabel,
      code: "FORBIDDEN",
    });
    throw new ApiError("FORBIDDEN");
  }
  return auth;
}
