import { loadEnvFile } from "node:process";

import { defineConfig, devices } from "@playwright/test";

import { e2eLaunchOptions, resolveE2EChannel } from "./e2e/browser-env";

try {
  loadEnvFile(".env");
} catch {
  // переменные могут прийти из окружения
}

const baseURL = "http://127.0.0.1:43123";

function resolvedBrowserChannel(): string | undefined {
  try {
    return resolveE2EChannel();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

const browserChannel = resolvedBrowserChannel();
const launchOptions = e2eLaunchOptions();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    ...devices["Desktop Chrome"],
    ...(browserChannel !== undefined ? { channel: browserChannel } : {}),
    baseURL,
    headless: true,
    trace: "on-first-retry",
    launchOptions,
  },
  webServer: {
    command: "pnpm start",
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...launchOptions.env,
      DATABASE_URL: process.env["TEST_DATABASE_URL"] ?? "",
      DATABASE_ADMIN_URL: process.env["TEST_DATABASE_ADMIN_URL"] ?? "",
      SESSION_SECURE: "false",
    },
  },
});
