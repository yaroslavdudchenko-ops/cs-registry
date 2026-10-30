export const LOGIN_INVALID = "Неверный логин или пароль";
export const LOGIN_TOO_MANY = "Слишком много попыток, попробуйте позже";
export const LOGIN_GENERIC = "Не удалось выполнить вход. Попробуйте ещё раз.";
export const LOGIN_EMPTY = "Укажите логин и пароль";

export function loginErrorText(status: number): string {
  if (status === 401 || status === 400) {
    return LOGIN_INVALID;
  }
  if (status === 423 || status === 429) {
    return LOGIN_TOO_MANY;
  }
  return LOGIN_GENERIC;
}
