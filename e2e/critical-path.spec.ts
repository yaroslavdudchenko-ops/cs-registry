import { expect, test } from "@playwright/test";

import { E2E_FULL_NAME, E2E_PASSWORD, E2E_USERNAME } from "./credentials";

test.describe("URS-103 критический путь", () => {
  test("вход → создание → поиск → правка с причиной → журнал → история карточки", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Вход в реестр" })).toBeVisible();
    await page.getByLabel("Логин").fill(E2E_USERNAME);
    await page.getByLabel("Пароль").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByRole("heading", { name: "Системы" })).toBeVisible();

    await page.getByRole("link", { name: "Добавить систему" }).first().click();
    await expect(page.getByRole("heading", { name: "Новая система" })).toBeVisible();
    await page.getByLabel("Наименование").fill("Параллель А");
    await page.getByLabel("Владелец процесса").selectOption({ label: E2E_FULL_NAME });
    await page.getByLabel("Владелец системы").selectOption({ label: E2E_FULL_NAME });
    await page.getByRole("button", { name: "Создать" }).click();
    await expect(page.getByText("Параллель А").first()).toBeVisible();

    await page.getByRole("link", { name: "Системы" }).click();
    await page.getByLabel("Поиск").fill("Параллель");
    await expect(page.getByRole("link", { name: "Параллель А" })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("link", { name: "Параллель А" }).click();
    await page.getByRole("link", { name: "Изменить" }).click();
    await page.getByLabel("Наименование").fill("Параллель Б");
    await page.getByLabel("Причина изменения").fill("Плановая актуализация карточки");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Параллель Б").first()).toBeVisible();

    await page.getByRole("link", { name: "Журнал аудита" }).click();
    await expect(page.getByRole("heading", { name: "Журнал аудита" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Журнал аудита" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Создание", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Изменение", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Плановая актуализация карточки" })).toBeVisible();

    await page.getByRole("link", { name: "Системы" }).click();
    await page.getByLabel("Поиск").fill("Параллель");
    await expect(page.getByRole("link", { name: "Параллель Б" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("link", { name: "Параллель Б" }).click();
    await expect(page.getByRole("heading", { name: "История изменений" })).toBeVisible();
    await expect(page.getByText("Создание").first()).toBeVisible();
    await expect(page.getByText("Плановая актуализация карточки")).toBeVisible();
  });
});
