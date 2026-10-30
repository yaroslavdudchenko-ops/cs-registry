export function safeCallbackUrl(raw: string | null | undefined): string {
  if (raw === undefined || raw === null || raw.length === 0) {
    return "/systems";
  }
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/login") || raw.startsWith("/api")) {
    return "/systems";
  }
  return raw;
}
