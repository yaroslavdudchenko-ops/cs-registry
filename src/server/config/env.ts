import packageJson from "../../../package.json";

const DEFAULT_SESSION_MINUTES_ADMIN = 30;
const DEFAULT_SESSION_MINUTES_OTHERS = 10;
const MAX_SESSION_MINUTES = 24 * 60;
const PACKAGE_VERSION: string = packageJson.version;

export const SESSION_COOKIE_NAME = "sid";

function parseSessionMinutes(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_SESSION_MINUTES) {
    return fallback;
  }
  return parsed;
}

export function sessionMinutesForRole(role: string): number {
  if (role === "admin") {
    return parseSessionMinutes(process.env["SESSION_MINUTES_ADMIN"], DEFAULT_SESSION_MINUTES_ADMIN);
  }
  return parseSessionMinutes(process.env["SESSION_MINUTES_DEFAULT"], DEFAULT_SESSION_MINUTES_OTHERS);
}

export function sessionSecure(): boolean {
  const raw = process.env["SESSION_SECURE"];
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

export function appVersion(): string {
  const override = process.env["APP_VERSION"];
  if (override !== undefined && override.length > 0) {
    return override;
  }
  return PACKAGE_VERSION;
}
