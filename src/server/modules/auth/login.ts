import { getSql } from "@/server/db/client";
import { insertSession, revokeSession } from "@/server/db/sessions-repository";
import { selectUserByUsername, updateUserLastLogin } from "@/server/db/users-repository";
import { sessionMinutesForRole } from "@/server/config/env";
import { ApiError, LOGIN_FAILED_MESSAGE } from "@/server/http/errors";
import {
  dummyPasswordHash,
  verifyPassword,
} from "@/server/modules/auth/password";
import { actorFromUser } from "@/server/modules/auth/session";
import {
  clearLoginFailures,
  hitLoginRequest,
  isLoginLocked,
  recordLoginFailure,
  throttleKey,
} from "@/server/modules/auth/throttle";
import { hashSessionToken, randomSessionToken } from "@/server/modules/auth/token";
import {
  appendAuditEvent,
  appendAuditEventInTx,
  type AuditActorContext,
} from "@/server/modules/audit/write";

export type LoginResult = {
  token: string;
  maxAgeSeconds: number;
  user: { id: string; username: string; full_name: string; role: string };
};

function anonymousActor(
  extras: { requestId: string; ip: string | null; userAgent: string | null },
  username: string,
): AuditActorContext {
  return {
    actorId: null,
    actorUsername: username.length === 0 ? "unknown" : username,
    actorRole: "anonymous",
    requestId: extras.requestId,
    ip: extras.ip,
    userAgent: extras.userAgent,
  };
}

export async function loginWithPassword(
  usernameRaw: string,
  password: string,
  extras: { requestId: string; ip: string | null; userAgent: string | null },
): Promise<LoginResult> {
  const username = usernameRaw.trim().toLowerCase();
  const { ip, username: throttleUser } = throttleKey(extras.ip, username);
  const sql = getSql();

  const rate = hitLoginRequest(ip, throttleUser);
  if (rate.rateLimited) {
    throw new ApiError("RATE_LIMITED");
  }

  if (isLoginLocked(ip, throttleUser)) {
    await appendAuditEvent(sql, anonymousActor(extras, username), {
      action: "login_failed",
      entityType: "auth",
      entityId: null,
      entityLabel: username,
      changedFields: null,
      before: null,
      after: { code: "AUTH_LOCKED" },
      reason: null,
    });
    throw new ApiError("AUTH_LOCKED");
  }

  const user = await selectUserByUsername(sql, username);
  const hash = user?.password_hash ?? (await dummyPasswordHash());
  const passwordOk = await verifyPassword(password, hash);
  const active = user !== null && user.is_active && passwordOk;

  if (!active) {
    recordLoginFailure(ip, throttleUser);
    await appendAuditEvent(sql, anonymousActor(extras, username), {
      action: "login_failed",
      entityType: "auth",
      entityId: user?.id ?? null,
      entityLabel: username,
      changedFields: null,
      before: null,
      after: { code: "UNAUTHORIZED" },
      reason: null,
    });
    throw new ApiError("UNAUTHORIZED", LOGIN_FAILED_MESSAGE);
  }

  clearLoginFailures(ip, throttleUser);

  const token = randomSessionToken();
  const tokenHash = hashSessionToken(token);
  const maxAgeSeconds = sessionMinutesForRole(user.role) * 60;
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

  await sql.begin(async (tx) => {
    await insertSession(tx, {
      userId: user.id,
      tokenHash,
      expiresAt,
      ip: extras.ip,
      userAgent: extras.userAgent,
    });
    await updateUserLastLogin(tx, user.id);
    await appendAuditEventInTx(tx, actorFromUser(user, extras), {
      action: "login",
      entityType: "auth",
      entityId: user.id,
      entityLabel: user.username,
      changedFields: null,
      before: null,
      after: { username: user.username },
      reason: null,
    });
  });

  return {
    token,
    maxAgeSeconds,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    },
  };
}

export async function logoutSession(
  sessionId: string,
  actor: AuditActorContext,
): Promise<void> {
  const sql = getSql();
  await sql.begin(async (tx) => {
    await revokeSession(tx, sessionId);
    await appendAuditEventInTx(tx, actor, {
      action: "logout",
      entityType: "auth",
      entityId: actor.actorId,
      entityLabel: actor.actorUsername,
      changedFields: null,
      before: null,
      after: null,
      reason: null,
    });
  });
}
