/**
 * Проверка ссылок на документацию. Разрешены только http(s) и сетевые пути
 * вида \\server\share. javascript:, data:, file: и прочие — отклонять.
 * Один источник правды для сервера и браузера.
 */

const HTTP_RE = /^https?:\/\//i;
const UNC_RE = /^\\\\[^\\/\s][^\\]*\\[^\\]+/;

export function isHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (!HTTP_RE.test(trimmed)) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function isUncPath(value: string): boolean {
  return UNC_RE.test(value.trim());
}

export function isAllowedDocumentUrl(value: string): boolean {
  return isHttpUrl(value) || isUncPath(value);
}

export function documentUrlReason(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Укажите адрес.";
  if (isHttpUrl(trimmed) || isUncPath(trimmed)) return null;
  return "Разрешены только http(s)-ссылки и сетевые пути \\\\сервер\\ресурс.";
}
