import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { ROUTES } from "./helpers/constants";

test.describe("Settings & Notifications", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin");
  });

  test("settings page loads all sections", async ({ page }) => {
    await page.goto(ROUTES.settings);
    await expect(page.getByText(/profile|first name/i).first()).toBeVisible();
  });

  test("notification templates page loads", async ({ page }) => {
    await page.goto(ROUTES.notificationTemplates);
    await expect(page.getByText(/notification template/i).first()).toBeVisible();
  });

  test("notification log page loads", async ({ page }) => {
    await page.goto(ROUTES.notificationLog);
    await expect(page.getByText(/notification log/i).first()).toBeVisible();
  });

  test("audit log page loads", async ({ page }) => {
    await page.goto(ROUTES.auditLog);
    await expect(page.getByText(/audit/i).first()).toBeVisible();
  });

  test("reports page loads", async ({ page }) => {
    await page.goto(ROUTES.reports);
    await expect(page.getByText(/reports/i).first()).toBeVisible();
  });

  test("regions page loads", async ({ page }) => {
    await page.goto(ROUTES.regions);
    await expect(page.getByText(/regions/i).first()).toBeVisible();
  });
});
