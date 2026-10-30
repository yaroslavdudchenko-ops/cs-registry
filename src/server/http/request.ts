import { randomUUID } from "node:crypto";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestIdFrom(request: Request): string {
  const header = request.headers.get("x-request-id");
  if (header !== null && UUID_RE.test(header.trim())) {
    return header.trim();
  }
  return randomUUID();
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.trim().length > 0) {
    const first = forwarded.split(",")[0];
    if (first !== undefined && first.trim().length > 0) {
      return first.trim();
    }
  }
  const real = request.headers.get("x-real-ip");
  if (real !== null && real.trim().length > 0) {
    return real.trim();
  }
  return "127.0.0.1";
}

export function clientUserAgent(request: Request): string | null {
  const value = request.headers.get("user-agent");
  if (value === null || value.trim().length === 0) {
    return null;
  }
  return value.slice(0, 500);
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim().length === 0) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
