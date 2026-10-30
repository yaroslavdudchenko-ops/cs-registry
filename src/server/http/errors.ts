export const ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "REASON_REQUIRED",
  "OWNERS_REQUIRED",
  "NOT_FOUND",
  "CONFLICT",
  "VERSION_CONFLICT",
  "LAST_ADMIN",
  "RATE_LIMITED",
  "AUTH_LOCKED",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  REASON_REQUIRED: 422,
  OWNERS_REQUIRED: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  LAST_ADMIN: 409,
  RATE_LIMITED: 429,
  AUTH_LOCKED: 423,
  INTERNAL_ERROR: 500,
};

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHORIZED: "Необходима аутентификация",
  FORBIDDEN: "Недостаточно прав для этого действия",
  VALIDATION_ERROR: "Запрос не проходит проверку",
  REASON_REQUIRED: "Для этого изменения нужна причина",
  OWNERS_REQUIRED: "Нужны владелец процесса и владелец системы",
  NOT_FOUND: "Объект не найден",
  CONFLICT: "Конфликт уникальности",
  VERSION_CONFLICT: "Запись изменена другим пользователем",
  LAST_ADMIN: "Нельзя деактивировать или сменить роль последнего активного администратора",
  RATE_LIMITED: "Слишком много запросов",
  AUTH_LOCKED: "Вход временно недоступен",
  INTERNAL_ERROR: "Внутренняя ошибка",
};

export const LOGIN_FAILED_MESSAGE = "Неверный логин или пароль";

export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly fields: FieldError[];

  constructor(code: ErrorCode, message?: string, fields: FieldError[] = []) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = "ApiError";
    this.code = code;
    this.fields = fields;
  }
}

export function validationError(fields: FieldError[], message?: string): ApiError {
  return new ApiError("VALIDATION_ERROR", message, fields);
}
