import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test.describe("Authentication & Onboarding", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("BlueThread")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("login with valid admin credentials succeeds", async ({ page }) => {
    await loginAs(page, "admin");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText("Dashboard")).toBeVisible();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("wrong@example.com");
    await page.locator("#password").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/failed/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("signup page renders and validates", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#confirmPassword")).toBeVisible();
    await page.locator("#password").fill("abc");
    await page.locator("#confirmPassword").fill("def");
    await page.locator("#email").fill("test@example.com");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText(/match|length|short/i)).toBeVisible({ timeout: 5_000 });
  });

  test("unauthenticated user redirected to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("forgot password flow renders", async ({ page }) => {
    await page.goto("/login");
    await page.getByText(/forgot/i).click();
    await expect(page.locator("#resetEmail")).toBeVisible();
    await expect(page.getByRole("button", { name: /send|reset/i })).toBeVisible();
  });

  test("landing page renders all sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("BlueThread")).toBeVisible();
    await expect(page.getByText(/get started|sign up/i).first()).toBeVisible();
  });

  test("404 page renders for unknown routes", async ({ page }) => {
    await page.goto("/nonexistent-route-xyz");
    await expect(page.getByText("404").first()).toBeVisible({ timeout: 5_000 });
  });
});
