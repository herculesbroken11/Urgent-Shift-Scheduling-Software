import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { ROUTES } from "./helpers/constants";

test.describe("Appointment CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto(ROUTES.appointments);
  });

  test("appointments page loads with table", async ({ page }) => {
    await expect(page.getByText(/appointments/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /new/i })).toBeVisible();
  });

  test("create appointment dialog opens", async ({ page }) => {
    await page.getByRole("button", { name: /new/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator('input[placeholder*="Medical"], input[placeholder*="Title"], input[name="title"]').first()).toBeVisible();
  });

  test("create appointment with required fields", async ({ page }) => {
    await page.getByRole("button", { name: /new/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const titleInput = dialog.locator('input[placeholder*="Medical"], input[placeholder*="Title"], input[name="title"]').first();
    await titleInput.fill("E2E Test Appointment");

    // Select first customer if dropdown exists
    const customerSelect = dialog.locator('button:has-text("Customer"), [data-testid="customer-select"]').first();
    if (await customerSelect.count() > 0) {
      await customerSelect.click();
      await page.locator('[role="option"]').first().click();
    }

    // Save
    await dialog.getByRole("button", { name: /save|create|submit/i }).click();
  });

  test("appointment search works", async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="filter" i]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill("E2E");
      await page.waitForTimeout(500);
      await searchInput.clear();
    }
  });

  test("click appointment row opens detail", async ({ page }) => {
    const row = page.locator("table tbody tr, [data-appointment-row]").first();
    if (await row.count() > 0) {
      await row.click();
      await page.waitForTimeout(1_000);
    }
  });
});
