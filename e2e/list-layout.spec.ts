import { mkdirSync } from "node:fs";
import path from "node:path";

import { chromium, expect, test, type Page } from "@playwright/test";

import { e2eLaunchOptions, resolveE2EChannel } from "./browser-env";
import { E2E_PASSWORD, E2E_USERNAME } from "./credentials";
import { seedListLayoutSystems } from "./seed-list-layout";

const LAYOUT_VIEWPORT = { width: 1280, height: 800 };
const LAYOUT_WIDTH_MARGIN_PX = 8;
const APP_ORIGIN = "http://127.0.0.1:43123";

function screenshotPath(suffix: string): string {
  const dir = process.env["E2E_SCREENSHOT_DIR"] ?? path.join("test-results", "screenshots");
  const file = suffix.length > 0 ? `systems-list-layout-1280-${suffix}.png` : "systems-list-layout-1280.png";
  return path.join(dir, file);
}

function ensureDir(dir: string): void {
  const absolute = path.resolve(dir);
  const parts = absolute.split(path.sep);
  let current = absolute.startsWith(path.sep) ? path.sep : "";
  for (const part of parts) {
    if (part.length === 0) {
      continue;
    }
    current = path.join(current, part);
    try {
      mkdirSync(current);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        continue;
      }
      throw error;
    }
  }
}

async function trySaveLayoutScreenshot(page: Page, suffix: string): Promise<void> {
  const filePath = screenshotPath(suffix);
  try {
    ensureDir(path.dirname(filePath));
    await Promise.race([
      page.screenshot({ path: filePath, fullPage: true }),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("таймаут записи скриншота"));
        }, 5_000);
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`не удалось записать скриншот ${filePath}: ${message}`);
  }
}

async function withLayoutPage(args: readonly string[], run: (page: Page) => Promise<void>): Promise<void> {
  const channel = resolveE2EChannel();
  const browser = await chromium.launch({
    ...(channel !== undefined ? { channel } : {}),
    headless: true,
    ...e2eLaunchOptions(args),
  });
  try {
    const context = await browser.newContext({ viewport: LAYOUT_VIEWPORT });
    const page = await context.newPage();
    try {
      await run(page);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

async function assertSystemsListLayout(page: Page, screenshotSuffix: string): Promise<void> {
  const seeded = await seedListLayoutSystems();
  expect(seeded).toBeGreaterThanOrEqual(15);

  await page.goto(`${APP_ORIGIN}/login`);
  await page.getByLabel("Логин").fill(E2E_USERNAME);
  await page.getByLabel("Пароль").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Системы" })).toBeVisible();

  const table = page.getByRole("table", { name: "Список компьютеризированных систем" });
  await expect(table).toBeVisible();
  await page.evaluate(
    () =>
      Promise.race([
        document.fonts.ready.then(() => undefined),
        new Promise<void>((resolve) => {
          setTimeout(resolve, 3_000);
        }),
      ]),
  );
  const rowCount = await table.locator("tbody tr").count();
  expect(rowCount).toBeGreaterThanOrEqual(15);

  await expect(page.getByRole("link", { name: "Юридический документообор" })).toBeVisible();
  // В 0.9.0 по умолчанию видны домен и системный владелец, вместо прежних Площадка и Тип.
  await expect(table.getByText("IT — ИТ", { exact: true }).first()).toBeVisible();

  const overflows = await table.locator("tbody td").evaluateAll((cells) =>
    cells
      .map((el) => ({
        text: (el.textContent ?? "").trim().slice(0, 80),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }))
      .filter((cell) => cell.scrollWidth > cell.clientWidth + 1),
  );
  expect(overflows).toEqual([]);

  const codeMetrics = await table.locator("tbody tr td:first-child a").evaluateAll((links) =>
    links.map((el) => {
      const style = window.getComputedStyle(el);
      const lineHeight = Number.parseFloat(style.lineHeight);
      return {
        text: (el.textContent ?? "").trim(),
        height: el.getBoundingClientRect().height,
        lineHeight,
      };
    }),
  );
  expect(codeMetrics.length).toBeGreaterThanOrEqual(15);
  for (const item of codeMetrics) {
    expect(item.height, item.text).toBeLessThanOrEqual(item.lineHeight * 1.6);
  }

  const wrap = page.locator("div.overflow-x-auto").filter({ has: table }).first();
  const sizes = await wrap.evaluate((el) => {
    const tableEl = el.querySelector("table");
    if (tableEl === null) {
      return { tableScrollWidth: 0, containerClientWidth: el.clientWidth };
    }
    const previousWidth = tableEl.style.width;
    tableEl.style.width = "min-content";
    const tableScrollWidth = tableEl.scrollWidth;
    tableEl.style.width = previousWidth;
    return {
      tableScrollWidth,
      containerClientWidth: el.clientWidth,
    };
  });
  expect(sizes.containerClientWidth - sizes.tableScrollWidth).toBeGreaterThanOrEqual(LAYOUT_WIDTH_MARGIN_PX);

  await trySaveLayoutScreenshot(page, screenshotSuffix);
}

test.describe("вёрстка списка систем 1280×800", () => {
  test("хинтинг по умолчанию: ячейки не переполняются, код одной строкой, запас ≥ 8 px", async () => {
    await withLayoutPage([], (page) => assertSystemsListLayout(page, "hinting-default"));
  });

  test("--font-render-hinting=none: ячейки не переполняются, код одной строкой, запас ≥ 8 px", async () => {
    await withLayoutPage(["--font-render-hinting=none"], (page) =>
      assertSystemsListLayout(page, "hinting-none"),
    );
  });
});
