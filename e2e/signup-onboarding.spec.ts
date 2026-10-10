import { expect, test } from "@playwright/test";

import {
  completeOnboarding,
  E2E_ENABLED,
  MIAMI_ROOFING,
  signUp,
  SKIP_REASON,
  uniqueEmail,
} from "./fixtures";

test.skip(!E2E_ENABLED, SKIP_REASON);

test("a new owner can sign up and finish onboarding", async ({ page }) => {
  const email = uniqueEmail("miami-roofing");
  await signUp(page, email, MIAMI_ROOFING.fullName);
  await completeOnboarding(page, MIAMI_ROOFING);

  // Landed in the app, onboarding gate cleared.
  await expect(page).toHaveURL(/\/dashboard/);
});

test("the login page renders (smoke)", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});
