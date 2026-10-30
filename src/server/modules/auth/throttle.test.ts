import { afterEach, describe, expect, it } from "vitest";

import {
  LOGIN_LOCKOUT_MAX,
  clearLoginFailures,
  hitLoginRequest,
  isLoginLocked,
  recordLoginFailure,
  resetLoginThrottleForTests,
} from "./throttle";

describe("login throttle", () => {
  afterEach(() => {
    resetLoginThrottleForTests();
  });

  it("блокирует после 5 неудач на ключе ip+username", () => {
    const ip = "10.0.0.1";
    const user = "alice";
    for (let i = 0; i < LOGIN_LOCKOUT_MAX; i += 1) {
      expect(isLoginLocked(ip, user)).toBe(false);
      recordLoginFailure(ip, user);
    }
    expect(isLoginLocked(ip, user)).toBe(true);
    expect(isLoginLocked(ip, "bob")).toBe(false);
  });

  it("успех сбрасывает неудачи", () => {
    recordLoginFailure("10.0.0.2", "carol");
    recordLoginFailure("10.0.0.2", "carol");
    clearLoginFailures("10.0.0.2", "carol");
    expect(isLoginLocked("10.0.0.2", "carol")).toBe(false);
  });

  it("rate limit считает запросы, не только неудачи", () => {
    const ip = "10.0.0.3";
    const user = "dave";
    let limited = false;
    for (let i = 0; i < 25; i += 1) {
      const hit = hitLoginRequest(ip, user);
      if (hit.rateLimited) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});
