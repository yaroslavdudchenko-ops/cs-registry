import "server-only";

import { cookies, headers } from "next/headers";

import { SESSION_COOKIE_NAME } from "@/server/config/env";
import { isUserRole } from "@/server/modules/auth/rbac";
import { loadAuthFromRequest } from "@/server/modules/auth/session";
import type { SessionUser } from "@/lib/session-user";

export async function getPageAuth(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const headerList = await headers();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const cookieHeader =
    token !== undefined && token.length > 0 ? `${SESSION_COOKIE_NAME}=${token}` : "";
  const forwarded = headerList.get("x-forwarded-for");
  const userAgent = headerList.get("user-agent");
  const requestHeaders = new Headers();
  if (cookieHeader.length > 0) {
    requestHeaders.set("cookie", cookieHeader);
  }
  if (userAgent !== null) {
    requestHeaders.set("user-agent", userAgent);
  }
  if (forwarded !== null) {
    requestHeaders.set("x-forwarded-for", forwarded);
  }
  const request = new Request("http://127.0.0.1/ui", { headers: requestHeaders });
  const extras: { requestId: string; ip: string | null; userAgent: string | null } = {
    requestId: "ui",
    ip: forwarded,
    userAgent,
  };
  const auth = await loadAuthFromRequest(request, extras);
  if (auth === null) {
    return null;
  }
  if (!isUserRole(auth.user.role)) {
    return null;
  }
  return {
    id: auth.user.id,
    username: auth.user.username,
    full_name: auth.user.full_name,
    role: auth.user.role,
  };
}
