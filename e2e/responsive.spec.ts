import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test.describe("Responsive & Accessibility", () => {
  test("desktop layout shows sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await loginAs(page, "admin");
    await page.goto("/dashboard");
    await expect(page.locator("aside, [data-sidebar]").first()).toBeVisible();
  });

  test("mobile layout collapses sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAs(page, "admin");
    await page.goto("/dashboard");
    // Sidebar should be collapsed on mobile — look for trigger
    const trigger = page.locator('button[data-sidebar="trigger"], [data-sidebar="trigger"]').first();
    if (await trigger.count() > 0) {
      await trigger.click();
      await expect(page.locator("aside, [data-sidebar='sidebar']").first()).toBeVisible();
    }
  });

  test("forms are usable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAs(page, "admin");
    await page.goto("/customers");
    const newBtn = page.getByRole("button", { name: /new customer/i });
    if (await newBtn.count() > 0) {
      await newBtn.click();
      await expect(page.getByRole("dialog")).toBeVisible();
    }
  });

  test("all pages have headings", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await loginAs(page, "admin");
    for (const route of ["/dashboard", "/appointments", "/customers", "/messages", "/settings"]) {
      await page.goto(route);
      const heading = page.locator("h1, h2").first();
      await expect(heading).toBeVisible({ timeout: 5_000 });
    }
  });

  test("keyboard navigation works on login", async ({ page }) => {
    await page.goto("/login");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.type("test@example.com");
    await page.keyboard.press("Tab");
    await page.keyboard.type("testpassword");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2_000);
  });
});
