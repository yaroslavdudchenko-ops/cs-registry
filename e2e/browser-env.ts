import { existsSync } from "node:fs";

import { chromium } from "@playwright/test";

import { resolveE2EBrowser } from "./resolve-browser";

/** Каталог скриншота и канал браузера читает только Node; в Chrome они не нужны. */
export function e2eBrowserEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || key === "E2E_SCREENSHOT_DIR" || key === "E2E_BROWSER_CHANNEL") {
      continue;
    }
    env[key] = value;
  }
  return env;
}

export function e2eLaunchOptions(args: readonly string[] = []): {
  env: Record<string, string>;
  args?: string[];
} {
  const env = e2eBrowserEnv();
  if (args.length === 0) {
    return { env };
  }
  return { env, args: [...args] };
}

export function bundledChromiumPath(): string | undefined {
  try {
    const executable = chromium.executablePath();
    return executable.length > 0 ? executable : undefined;
  } catch {
    return undefined;
  }
}

export function resolveE2EChannel(): string | undefined {
  const resolved = resolveE2EBrowser({
    envValue: process.env["E2E_BROWSER_CHANNEL"],
    platform: process.platform,
    fileExists: existsSync,
    bundledChromiumPath: bundledChromiumPath(),
    env: process.env,
  });
  console.log(resolved.message);
  return resolved.channel;
}
