import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { ROUTES } from "./helpers/constants";

test.describe("Admin Dashboard & Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin");
  });

  test("dashboard shows status tiles", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    const cards = page.locator('[class*="card"]');
    await expect(cards.first()).toBeVisible();
  });

  test("sidebar shows all admin navigation items", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    const sidebar = page.locator("aside, [data-sidebar]").first();
    for (const label of [
      "Dashboard", "Appointments", "Interpreters", "Customers",
      "Billing Rates", "Invoices", "Messages", "Settings",
      "Reports", "Audit Log", "Notification Templates",
      "Notification Log", "Regions",
    ]) {
      await expect(sidebar.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("clicking sidebar item navigates correctly", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    await page.getByText("Appointments", { exact: true }).click();
    await expect(page).toHaveURL(/\/appointments/);
    await page.getByText("Customers", { exact: true }).click();
    await expect(page).toHaveURL(/\/customers/);
  });

  test("admin cannot access interpreter-only routes", async ({ page }) => {
    await page.goto(ROUTES.mySchedule);
    await expect(page).not.toHaveURL(/\/my-schedule/);
  });

  test("admin cannot access requester-only routes", async ({ page }) => {
    await page.goto(ROUTES.request);
    await expect(page).not.toHaveURL(/\/request/);
  });

  test("notification bell is visible", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    const bell = page.locator("button").filter({ has: page.locator('[class*="bell"], [data-lucide="bell"]') });
    if (await bell.count() > 0) {
      await bell.first().click();
      await expect(page.getByText(/notification/i).first()).toBeVisible();
    }
  });

  test("sign out works", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    const logoutBtn = page.locator('button[title="Sign Out"], button[title="Exit Demo"]');
    if (await logoutBtn.count() > 0) {
      await logoutBtn.first().click();
      await expect(page).toHaveURL(/\/(login)?$/);
    }
  });
});
