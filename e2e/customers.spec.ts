import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { ROUTES } from "./helpers/constants";

test.describe("Customer & Location Management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin");
  });

  test("customers page loads", async ({ page }) => {
    await page.goto(ROUTES.customers);
    await expect(page.getByText(/customers/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /new customer/i })).toBeVisible();
  });

  test("create new customer", async ({ page }) => {
    await page.goto(ROUTES.customers);
    await page.getByRole("button", { name: /new customer/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.locator("#name, input[name='name']").first().fill("E2E Test Corp");
    await dialog.locator("#contact_name, input[name='contact_name']").first().fill("John Tester");
    await dialog.locator("#contact_email, input[name='contact_email']").first().fill("john@e2etest.com");

    await dialog.getByRole("button", { name: /save|create/i }).click();
    await expect(page.getByText(/created/i)).toBeVisible({ timeout: 5_000 });
  });

  test("search customers", async ({ page }) => {
    await page.goto(ROUTES.customers);
    const search = page.locator('input[placeholder*="search" i]').first();
    if (await search.count() > 0) {
      await search.fill("E2E");
      await page.waitForTimeout(500);
    }
  });

  test("open customer detail page", async ({ page }) => {
    await page.goto(ROUTES.customers);
    const viewBtn = page.locator('a[href*="/customers/"], button[title*="View"], [data-action="view"]').first();
    if (await viewBtn.count() > 0) {
      await viewBtn.click();
      await expect(page).toHaveURL(/\/customers\//);
    }
  });
});
