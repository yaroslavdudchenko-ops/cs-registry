import { describe, expect, it } from "vitest";

import { LOGIN_GENERIC, LOGIN_INVALID, LOGIN_TOO_MANY, loginErrorText } from "./login-errors";

describe("loginErrorText", () => {
  it("не показывает коды ошибок", () => {
    expect(loginErrorText(401)).toBe(LOGIN_INVALID);
    expect(loginErrorText(400)).toBe(LOGIN_INVALID);
    expect(loginErrorText(423)).toBe(LOGIN_TOO_MANY);
    expect(loginErrorText(429)).toBe(LOGIN_TOO_MANY);
    expect(loginErrorText(500)).toBe(LOGIN_GENERIC);
    expect(loginErrorText(401)).not.toMatch(/UNAUTHORIZED|AUTH_LOCKED|RATE_LIMITED|INVALID/);
  });
});
