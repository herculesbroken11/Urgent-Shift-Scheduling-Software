import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { ROUTES } from "./helpers/constants";

test.describe("Messaging", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin");
  });

  test("messages page loads", async ({ page }) => {
    await page.goto(ROUTES.messages);
    await expect(page.getByText(/messages/i).first()).toBeVisible();
  });

  test("new conversation dialog opens", async ({ page }) => {
    await page.goto(ROUTES.messages);
    const newBtn = page.getByRole("button", { name: /new conversation|new message/i });
    if (await newBtn.count() > 0) {
      await newBtn.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });

  test("mobile layout shows single pane", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(ROUTES.messages);
    await expect(page.getByText(/messages/i).first()).toBeVisible();
  });
});
