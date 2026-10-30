import { SESSION_COOKIE_NAME } from "@/server/config/env";

export function cookieFrom(response: Response): string | null {
  const header = response.headers.get("set-cookie");
  if (header === null) {
    return null;
  }
  const match = header.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  return match?.[1] ?? null;
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.length === 0) {
    return {};
  }
  return JSON.parse(text) as Record<string, unknown>;
}

export function jsonRequest(
  url: string,
  init: {
    method: string;
    body?: unknown;
    cookie?: string | null;
    headers?: Record<string, string>;
  },
): Request {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (init.cookie !== undefined && init.cookie !== null && init.cookie.length > 0) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${init.cookie}`);
  }
  const requestInit: RequestInit = { method: init.method, headers };
  if (init.body !== undefined) {
    requestInit.body = JSON.stringify(init.body);
  }
  return new Request(url, requestInit);
}

export function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
