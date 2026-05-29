import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { ROUTES } from "./helpers/constants";

test.describe("Requester Portal", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "requester");
  });

  test("requester dashboard loads", async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/);
    const sidebar = page.locator("aside, [data-sidebar]").first();
    for (const label of ["Dashboard", "Request Interpreter", "Messages", "Settings"]) {
      await expect(sidebar.getByText(label, { exact: true })).toBeVisible();
    }
    for (const label of ["Customers", "Interpreters", "Billing Rates"]) {
      await expect(sidebar.getByText(label, { exact: true })).not.toBeVisible();
    }
  });

  test("request interpreter page loads", async ({ page }) => {
    await page.goto(ROUTES.request);
    await expect(page.getByText(/request/i).first()).toBeVisible();
  });

  test("my requests page loads", async ({ page }) => {
    await page.goto(ROUTES.myRequests);
    await expect(page.getByText(/request/i).first()).toBeVisible();
  });

  test("requester cannot access admin routes", async ({ page }) => {
    await page.goto(ROUTES.appointments);
    await expect(page).not.toHaveURL(/\/appointments/);
    await page.goto(ROUTES.billingRates);
    await expect(page).not.toHaveURL(/\/billing-rates/);
    await page.goto(ROUTES.interpreters);
    await expect(page).not.toHaveURL(/\/interpreters/);
  });

  test("requester can access messages", async ({ page }) => {
    await page.goto(ROUTES.messages);
    await expect(page.getByText(/messages/i).first()).toBeVisible();
  });
});
