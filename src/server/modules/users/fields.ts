import type { z } from "zod";

import { ApiError, type FieldError } from "@/server/http/errors";

/** Русские подписи полей учётной записи для сообщений об ошибках проверки. */
export const USER_FIELD_LABELS: Record<string, string> = {
  username: "Логин",
  full_name: "ФИО",
  email: "Электронная почта",
  password: "Пароль",
  role: "Роль",
  is_active: "Активность",
  version: "Версия записи",
  reason: "Причина",
};

const FIELD_MESSAGES: Record<string, string> = {
  username: "Логин: укажите от 1 до 100 символов.",
  full_name: "ФИО: укажите от 1 до 200 символов.",
  email: "Электронная почта: неверный формат, пример name@company.ru.",
  password: "Пароль: не короче 12 символов.",
  role: "Роль: выберите значение из списка.",
  is_active: "Активность: некорректное значение.",
  version: "Версия записи: обновите страницу и повторите.",
  reason: "Причина: укажите текст.",
};

export function userFieldMessage(field: string): string {
  return FIELD_MESSAGES[field] ?? `${USER_FIELD_LABELS[field] ?? field}: некорректное значение.`;
}

export function userFieldErrors(error: z.ZodError): FieldError[] {
  const seen = new Set<string>();
  const out: FieldError[] = [];
  for (const issue of error.issues) {
    const first = issue.path[0];
    const field = first === undefined ? "" : String(first);
    if (seen.has(field)) continue;
    seen.add(field);
    out.push({ field, message: field === "" ? "Запрос не проходит проверку." : userFieldMessage(field) });
  }
  return out;
}

export function userValidationError(fields: FieldError[]): ApiError {
  const message =
    fields.length === 1 && fields[0] !== undefined
      ? fields[0].message
      : `Проверьте поля: ${fields.map((f) => USER_FIELD_LABELS[f.field] ?? f.field).join(", ")}.`;
  return new ApiError("VALIDATION_ERROR", message, fields);
}
