import { SESSION_COOKIE_NAME, sessionSecure } from "@/server/config/env";
import {
  type ErrorCode,
  ERROR_HTTP_STATUS,
  ERROR_MESSAGES,
} from "@/server/http/errors";

export function jsonResult(
  status: number,
  body: unknown,
  requestId: string,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-request-id", requestId);
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

export function jsonError(
  code: ErrorCode,
  requestId: string,
  message?: string,
  fields?: readonly { field: string; message: string }[],
): Response {
  const body: Record<string, unknown> = {
    code,
    message: message ?? ERROR_MESSAGES[code],
    requestId,
  };
  if (fields !== undefined && fields.length > 0) {
    body.fields = fields;
  }
  return jsonResult(ERROR_HTTP_STATUS[code], body, requestId);
}

export function fileResult(
  body: Buffer,
  requestId: string,
  options: { filename: string; contentType: string },
): Response {
  const headers = new Headers();
  headers.set("content-type", options.contentType);
  headers.set("content-disposition", `attachment; filename="${options.filename}"`);
  headers.set("x-request-id", requestId);
  headers.set("cache-control", "no-store");
  return new Response(Uint8Array.from(body), { status: 200, headers });
}

export function noContent(requestId: string, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("x-request-id", requestId);
  headers.set("cache-control", "no-store");
  return new Response(null, { status: 204, headers });
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${String(maxAgeSeconds)}`,
  ];
  if (sessionSecure()) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function expiredSessionCookie(): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (sessionSecure()) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (header === null) {
    return null;
  }
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (key === name) {
      return trimmed.slice(eq + 1);
    }
  }
  return null;
}
