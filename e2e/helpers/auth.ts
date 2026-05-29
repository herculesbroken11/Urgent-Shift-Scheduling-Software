import { type Page, expect } from "@playwright/test";

const CREDENTIALS: Record<string, { emailEnv: string; passEnv: string }> = {
  admin: { emailEnv: "ADMIN_EMAIL", passEnv: "ADMIN_PASSWORD" },
  scheduler: { emailEnv: "SCHEDULER_EMAIL", passEnv: "SCHEDULER_PASSWORD" },
  requester: { emailEnv: "REQUESTER_EMAIL", passEnv: "REQUESTER_PASSWORD" },
  interpreter: { emailEnv: "INTERPRETER_EMAIL", passEnv: "INTERPRETER_PASSWORD" },
};

export async function loginAs(
  page: Page,
  role: "admin" | "scheduler" | "requester" | "interpreter"
) {
  const cred = CREDENTIALS[role];
  const email = process.env[cred.emailEnv];
  const password = process.env[cred.passEnv];

  if (!email || !password) {
    throw new Error(
      `Missing credentials for ${role}: set ${cred.emailEnv} and ${cred.passEnv}`
    );
  }

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard/);
}
