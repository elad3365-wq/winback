import { expect, test } from "@playwright/test";

import { E2E_ENABLED, MIAMI_ROOFING, onboardNewBusiness, SKIP_REASON } from "./fixtures";

test.skip(!E2E_ENABLED, SKIP_REASON);

/**
 * Smoke-tests the new AI Autopilot owner surfaces on the Preview. These do not
 * require Gmail OAuth — they confirm the Control Center and Email settings pages
 * render for an onboarded owner and that the autonomy control is present.
 */
test("AI Control Center renders with the autonomy control + emergency stop", async ({ page }) => {
  await onboardNewBusiness(page, MIAMI_ROOFING);

  await page.goto("/settings/autopilot");
  await expect(page.getByRole("heading", { name: /AI Control Center/i })).toBeVisible();
  await expect(page.getByText(/AI autonomy/i)).toBeVisible();
  await expect(page.getByText(/Emergency stop/i).first()).toBeVisible();
  // The autonomy selector offers the four levels.
  await expect(page.getByRole("option", { name: /Autopilot/i })).toHaveCount(1);
});

test("Email settings page renders for an onboarded owner", async ({ page }) => {
  await onboardNewBusiness(page, MIAMI_ROOFING);

  await page.goto("/settings/email");
  await expect(page.getByRole("heading", { name: /^Email$/i })).toBeVisible();
  // Either the connect control (feature enabled) or the "not enabled" notice.
  const connect = page.getByRole("link", { name: /connect gmail/i });
  const notEnabled = page.getByText(/Gmail is not enabled/i);
  await expect(connect.or(notEnabled).first()).toBeVisible();
});
