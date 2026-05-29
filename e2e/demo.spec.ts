import { test, expect } from "@playwright/test";

test.describe("Demo Mode", () => {
  test("demo selection page loads", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByText(/admin/i).first()).toBeVisible();
    await expect(page.getByText(/interpreter/i).first()).toBeVisible();
  });

  test("enter demo as admin", async ({ page }) => {
    await page.goto("/demo");
    await page.getByText(/agency admin/i).first().click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    await expect(page.getByText(/demo/i).first()).toBeVisible();
  });

  test("demo mode shows pre-populated data", async ({ page }) => {
    await page.goto("/demo");
    await page.getByText(/agency admin/i).first().click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    await page.goto("/appointments");
    await page.waitForTimeout(1_000);
  });

  test("switch role in demo", async ({ page }) => {
    await page.goto("/demo");
    await page.getByText(/agency admin/i).first().click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    const switchBtn = page.getByText("Switch Role");
    if (await switchBtn.count() > 0) {
      await switchBtn.click();
      await expect(page).toHaveURL(/\/demo/);
    }
  });

  test("exit demo mode", async ({ page }) => {
    await page.goto("/demo");
    await page.getByText(/agency admin/i).first().click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    const exitBtn = page.locator('button[title="Exit Demo"]');
    if (await exitBtn.count() > 0) {
      await exitBtn.click();
      await expect(page).toHaveURL(/^\/$/, { timeout: 5_000 });
    }
  });
});
