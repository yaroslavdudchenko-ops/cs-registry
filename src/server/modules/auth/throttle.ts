/**
 * Счётчик попыток входа в памяти процесса: ключ IP + нормализованный username.
 * При нескольких инстансах счётчики не общие — для MVP допустимо (нет Redis).
 * Edge/Caddy может дублировать лимит; здесь — защита самого приложения.
 */

export const LOGIN_RATE_LIMIT_MAX = 20;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000;
export const LOGIN_LOCKOUT_MAX = 5;
export const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

type Bucket = {
  requests: number[];
  failures: number[];
};

const buckets = new Map<string, Bucket>();

function nowMs(): number {
  return Date.now();
}

function prune(timestamps: number[], windowMs: number, now: number): number[] {
  return timestamps.filter((stamp) => now - stamp < windowMs);
}

function keyFor(ip: string, username: string): string {
  return `${ip}\u0000${username}`;
}

function bucket(ip: string, username: string): Bucket {
  const key = keyFor(ip, username);
  const existing = buckets.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created: Bucket = { requests: [], failures: [] };
  buckets.set(key, created);
  return created;
}

export function throttleKey(ip: string | null, username: string): { ip: string; username: string } {
  return {
    ip: ip === null || ip.length === 0 ? "0.0.0.0" : ip,
    username: username.trim().toLowerCase(),
  };
}

export function hitLoginRequest(ip: string, username: string): { rateLimited: boolean } {
  const now = nowMs();
  const item = bucket(ip, username);
  item.requests = prune(item.requests, LOGIN_RATE_LIMIT_WINDOW_MS, now);
  if (item.requests.length >= LOGIN_RATE_LIMIT_MAX) {
    return { rateLimited: true };
  }
  item.requests.push(now);
  return { rateLimited: false };
}

export function isLoginLocked(ip: string, username: string): boolean {
  const now = nowMs();
  const item = bucket(ip, username);
  item.failures = prune(item.failures, LOGIN_LOCKOUT_WINDOW_MS, now);
  return item.failures.length >= LOGIN_LOCKOUT_MAX;
}

export function recordLoginFailure(ip: string, username: string): { locked: boolean } {
  const now = nowMs();
  const item = bucket(ip, username);
  item.failures = prune(item.failures, LOGIN_LOCKOUT_WINDOW_MS, now);
  item.failures.push(now);
  return { locked: item.failures.length >= LOGIN_LOCKOUT_MAX };
}

export function clearLoginFailures(ip: string, username: string): void {
  const item = bucket(ip, username);
  item.failures = [];
}

/** Только для тестов: изоляция файлов/кейсов. */
export function resetLoginThrottleForTests(): void {
  buckets.clear();
}
