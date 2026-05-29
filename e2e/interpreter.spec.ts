import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { ROUTES } from "./helpers/constants";

test.describe("Interpreter Portal", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "interpreter");
  });

  test("interpreter dashboard loads with correct sidebar", async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/);
    const sidebar = page.locator("aside, [data-sidebar]").first();
    for (const label of ["My Schedule", "My Earnings", "My Languages", "Messages", "Settings"]) {
      await expect(sidebar.getByText(label, { exact: true })).toBeVisible();
    }
    // Admin-only items should NOT be visible
    for (const label of ["Customers", "Billing Rates", "Invoices"]) {
      await expect(sidebar.getByText(label, { exact: true })).not.toBeVisible();
    }
  });

  test("my schedule page loads", async ({ page }) => {
    await page.goto(ROUTES.mySchedule);
    await expect(page.getByText(/schedule/i).first()).toBeVisible();
  });

  test("my earnings page loads", async ({ page }) => {
    await page.goto(ROUTES.myEarnings);
    await expect(page.getByText(/earnings/i).first()).toBeVisible();
  });

  test("my languages page loads", async ({ page }) => {
    await page.goto(ROUTES.myLanguages);
    await expect(page.getByText(/languages/i).first()).toBeVisible();
  });

  test("interpreter cannot access admin routes", async ({ page }) => {
    await page.goto(ROUTES.appointments);
    await expect(page).not.toHaveURL(/\/appointments/);
    await page.goto(ROUTES.billingRates);
    await expect(page).not.toHaveURL(/\/billing-rates/);
    await page.goto(ROUTES.customers);
    await expect(page).not.toHaveURL(/\/customers/);
  });

  test("interpreter can access messages", async ({ page }) => {
    await page.goto(ROUTES.messages);
    await expect(page.getByText(/messages/i).first()).toBeVisible();
  });

  test("interpreter settings has notification preferences", async ({ page }) => {
    await page.goto(ROUTES.settings);
    await expect(page.getByText(/notification/i).first()).toBeVisible();
  });
});
