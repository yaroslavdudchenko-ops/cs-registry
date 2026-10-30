import { getSql } from "@/server/db/client";
import { selectSessionByTokenHash, touchSession } from "@/server/db/sessions-repository";
import { selectUserById, type UserRow } from "@/server/db/users-repository";
import { SESSION_COOKIE_NAME } from "@/server/config/env";
import { ApiError } from "@/server/http/errors";
import { readCookie } from "@/server/http/response";
import type { AuditActorContext } from "@/server/modules/audit/write";
import { hashSessionToken } from "@/server/modules/auth/token";

export type AuthContext = {
  user: UserRow;
  sessionId: string;
  actor: AuditActorContext;
};

export function actorFromUser(
  user: UserRow,
  extras: { requestId: string; ip: string | null; userAgent: string | null },
): AuditActorContext {
  return {
    actorId: user.id,
    actorUsername: user.username,
    actorRole: user.role,
    requestId: extras.requestId,
    ip: extras.ip,
    userAgent: extras.userAgent,
  };
}

export async function loadAuthFromRequest(
  request: Request,
  extras: { requestId: string; ip: string | null; userAgent: string | null },
): Promise<AuthContext | null> {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  if (token === null || token.length === 0) {
    return null;
  }
  const sql = getSql();
  const tokenHash = hashSessionToken(token);
  const session = await selectSessionByTokenHash(sql, tokenHash);
  if (session === null) {
    return null;
  }
  if (session.revoked_at !== null) {
    return null;
  }
  if (session.expires_at.getTime() <= Date.now()) {
    return null;
  }
  const user = await selectUserById(sql, session.user_id);
  if (user === null || !user.is_active) {
    return null;
  }
  await touchSession(sql, session.id);
  return {
    user,
    sessionId: session.id,
    actor: actorFromUser(user, extras),
  };
}

export async function requireSession(
  request: Request,
  extras: { requestId: string; ip: string | null; userAgent: string | null },
): Promise<AuthContext> {
  const auth = await loadAuthFromRequest(request, extras);
  if (auth === null) {
    throw new ApiError("UNAUTHORIZED");
  }
  return auth;
}
