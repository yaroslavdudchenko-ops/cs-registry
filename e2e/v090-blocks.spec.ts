import { expect, test } from "@playwright/test";

import { E2E_FULL_NAME, E2E_PASSWORD, E2E_USERNAME } from "./credentials";

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(E2E_USERNAME);
  await page.getByLabel("Пароль").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Системы" })).toBeVisible();
}

test.describe("CS Registry 0.9.0 — 8 блоков, GxP, колонки и ссылки", () => {
  test("не-GxP: статус валидации и соседние поля серые, выставлены в «Не требуется»", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Добавить систему" }).first().click();
    await expect(page.getByRole("heading", { name: "Новая система" })).toBeVisible();

    // по умолчанию чекбокс выключен — поля GxP-блока серые и disabled
    const validation = page.getByTestId("validation_status");
    await expect(validation).toBeDisabled();
    await expect(validation).toHaveValue("not_required");

    // включаем GxP — поле становится активным
    await page.getByTestId("is_gxp_relevant").check();
    await expect(validation).toBeEnabled();
    await expect(page.getByLabel("GxP-критичность")).toBeEnabled();
    await expect(page.getByLabel("Категория GAMP 5")).toBeEnabled();

    // выключаем — снова disabled
    await page.getByTestId("is_gxp_relevant").uncheck();
    await expect(validation).toBeDisabled();
    await expect(validation).toHaveValue("not_required");
  });

  test("создание системы с GxP: заполняем крит, GAMP, валидация", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Добавить систему" }).first().click();
    await page.getByLabel("Название").fill("GxP-демо");
    await page.getByLabel("Домен", { exact: true }).selectOption("QC");
    await page.getByTestId("is_gxp_relevant").check();
    await page.getByLabel("GxP-критичность").selectOption("high");
    await page.getByLabel("Категория GAMP 5").selectOption("5");
    await page.getByTestId("validation_status").selectOption("in_validation");
    await page.getByTestId("system_owner-user").selectOption({ label: E2E_FULL_NAME });
    await page.getByRole("button", { name: "Создать" }).click();
    await expect(page.getByRole("heading", { name: "GxP-демо" })).toBeVisible();
    // карточка 0.9.0 — восемь блоков
    for (const title of [
      "1. Идентификация",
      "2. Владельцы и ответственные",
      "3. Компания",
      "4. GxP и валидация",
      "5. ИТ",
      "6. Инфраструктура",
      "7. Документация",
      "8. Примечания",
    ]) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
  });

  test("колонки: переключение видимой колонки запоминается в localStorage", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "Колонки" }).click();
    const toggle = page.getByTestId("columns-toggle-vendor");
    await expect(toggle).toBeVisible();
    await toggle.check();
    const value = await page.evaluate(() => window.localStorage.getItem("cs-registry:list-columns:v1"));
    expect(value).toContain("vendor");
  });

  test("ссылка документации в карточке открывается в новой вкладке с rel=noopener", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Добавить систему" }).first().click();
    await page.getByLabel("Название").fill("Карточка со ссылкой");
    await page.getByLabel("Домен", { exact: true }).selectOption("IT");
    await page.getByTestId("system_owner-user").selectOption({ label: E2E_FULL_NAME });

    const docs = page.locator("fieldset", { hasText: "Внутренняя документация" });
    await docs.getByRole("button", { name: "Добавить" }).click();
    await page.getByTestId("internal_documents-title-0").fill("URS");
    await page.getByTestId("internal_documents-url-0").fill("https://example.test/urs");

    await page.getByRole("button", { name: "Создать" }).click();
    await expect(page.getByRole("heading", { name: "Карточка со ссылкой" })).toBeVisible();

    const link = page.getByRole("link", { name: /URS/ });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });
});
