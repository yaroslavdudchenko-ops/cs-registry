import { afterEach, describe, expect, it } from "vitest";

import { sessionMinutesForRole } from "@/server/config/env";

describe("sessionMinutesForRole", () => {
  const previousAdmin = process.env["SESSION_MINUTES_ADMIN"];
  const previousDefault = process.env["SESSION_MINUTES_DEFAULT"];

  afterEach(() => {
    if (previousAdmin === undefined) {
      delete process.env["SESSION_MINUTES_ADMIN"];
    } else {
      process.env["SESSION_MINUTES_ADMIN"] = previousAdmin;
    }
    if (previousDefault === undefined) {
      delete process.env["SESSION_MINUTES_DEFAULT"];
    } else {
      process.env["SESSION_MINUTES_DEFAULT"] = previousDefault;
    }
  });

  it("gives admin 30 minutes and other roles 10 minutes by default", () => {
    delete process.env["SESSION_MINUTES_ADMIN"];
    delete process.env["SESSION_MINUTES_DEFAULT"];
    expect(sessionMinutesForRole("admin")).toBe(30);
    expect(sessionMinutesForRole("editor")).toBe(10);
    expect(sessionMinutesForRole("viewer")).toBe(10);
    expect(sessionMinutesForRole("auditor")).toBe(10);
  });

  it("reads SESSION_MINUTES_ADMIN and SESSION_MINUTES_DEFAULT when set", () => {
    process.env["SESSION_MINUTES_ADMIN"] = "45";
    process.env["SESSION_MINUTES_DEFAULT"] = "8";
    expect(sessionMinutesForRole("admin")).toBe(45);
    expect(sessionMinutesForRole("viewer")).toBe(8);
  });

  it("falls back when the override is empty or out of range", () => {
    process.env["SESSION_MINUTES_ADMIN"] = "0";
    process.env["SESSION_MINUTES_DEFAULT"] = "not-a-number";
    expect(sessionMinutesForRole("admin")).toBe(30);
    expect(sessionMinutesForRole("editor")).toBe(10);
  });
});
