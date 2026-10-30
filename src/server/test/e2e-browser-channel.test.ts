import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_E2E_BROWSER_CHANNEL,
  E2E_BROWSER_MISSING_MESSAGE,
  requestedE2EBrowserChannel,
  resolveE2EBrowser,
} from "../../../e2e/resolve-browser";

const CONFIG = readFileSync(path.join(process.cwd(), "playwright.config.ts"), "utf8");
const LINUX_CHROME = "/opt/google/chrome/chrome";
const BUNDLED = "/tmp/ms-playwright/chromium/chrome";

describe("E2E_BROWSER_CHANNEL", () => {
  it("пусто и не задано означают канал chrome", () => {
    expect(requestedE2EBrowserChannel(undefined)).toBe(DEFAULT_E2E_BROWSER_CHANNEL);
    expect(requestedE2EBrowserChannel("")).toBe(DEFAULT_E2E_BROWSER_CHANNEL);
    expect(requestedE2EBrowserChannel("   ")).toBe(DEFAULT_E2E_BROWSER_CHANNEL);
    expect(requestedE2EBrowserChannel("msedge")).toBe("msedge");
  });

  it("не фиксирует литерал channel chrome в playwright.config.ts", () => {
    expect(CONFIG).not.toMatch(/channel:\s*["']chrome["']/);
  });

  it("берёт системный Chrome, если исполняемый файл на месте", () => {
    const resolved = resolveE2EBrowser({
      envValue: "",
      platform: "linux",
      fileExists: (candidate) => candidate === LINUX_CHROME,
      bundledChromiumPath: BUNDLED,
    });
    expect(resolved.channel).toBe("chrome");
    expect(resolved.message).toContain("Google Chrome");
  });

  it("берёт встроенный Chromium, если Chrome нет", () => {
    const resolved = resolveE2EBrowser({
      envValue: undefined,
      platform: "linux",
      fileExists: (candidate) => candidate === BUNDLED,
      bundledChromiumPath: BUNDLED,
    });
    expect(resolved.channel).toBeUndefined();
    expect(resolved.message).toBe("e2e: Google Chrome не найден, использую встроенный Chromium");
  });

  it("явный chromium не ставит channel", () => {
    const resolved = resolveE2EBrowser({
      envValue: "chromium",
      platform: "linux",
      fileExists: (candidate) => candidate === BUNDLED,
      bundledChromiumPath: BUNDLED,
    });
    expect("channel" in resolved).toBe(false);
    expect(resolved.message).toContain("E2E_BROWSER_CHANNEL=chromium");
  });

  it("бросает русское сообщение, если нет ни Chrome, ни Chromium", () => {
    expect(() =>
      resolveE2EBrowser({
        envValue: "",
        platform: "linux",
        fileExists: () => false,
        bundledChromiumPath: undefined,
      }),
    ).toThrow(E2E_BROWSER_MISSING_MESSAGE);
  });
});
