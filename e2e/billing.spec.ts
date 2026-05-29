import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { ROUTES } from "./helpers/constants";

test.describe("Billing & Invoice", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin");
  });

  test("billing rates page loads", async ({ page }) => {
    await page.goto(ROUTES.billingRates);
    await expect(page.getByText(/billing/i).first()).toBeVisible();
  });

  test("invoices page loads", async ({ page }) => {
    await page.goto(ROUTES.invoices);
    await expect(page.getByText(/invoices/i).first()).toBeVisible();
  });

  test("interpreter pay page loads", async ({ page }) => {
    await page.goto(ROUTES.interpreterPay);
    await expect(page.getByText(/pay/i).first()).toBeVisible();
  });

  test("customer billing page loads", async ({ page }) => {
    await page.goto(ROUTES.customerBilling);
    await expect(page.getByText(/billing/i).first()).toBeVisible();
  });

  test("billing report page loads", async ({ page }) => {
    await page.goto("/billing-report");
    await expect(page.locator("body")).toBeVisible();
  });
});
