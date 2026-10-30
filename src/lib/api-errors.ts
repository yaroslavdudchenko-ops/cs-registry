import { ERROR_CODES, ERROR_MESSAGES, type ErrorCode } from "@/server/http/errors";

export function apiErrorText(code: string, fallback = "Не удалось выполнить запрос"): string {
  if ((ERROR_CODES as readonly string[]).includes(code)) {
    return ERROR_MESSAGES[code as ErrorCode];
  }
  return fallback;
}
