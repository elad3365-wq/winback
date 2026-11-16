import { expect, test } from "@playwright/test";

import { addLead, E2E_ENABLED, MIAMI_ROOFING, onboardNewBusiness, SKIP_REASON } from "./fixtures";

test.skip(!E2E_ENABLED, SKIP_REASON);

test("owner can add a lead, generate an AI draft, and approve it", async ({ page }) => {
  await onboardNewBusiness(page, MIAMI_ROOFING);

  await addLead(page, {
    customerName: "Dana Lopez",
    phone: "(305) 555-0199",
    service: "roof replacement",
    estimate: "8200",
  });

  // Open the lead detail.
  await page.getByText("Dana Lopez").first().click();
  await page.waitForURL(/\/leads\//, { timeout: 15_000 });

  // Generate an AI follow-up draft. If AI is not configured in this environment
  // the app returns a clear "not configured" message — treat that as a skip
  // rather than a failure, so the spec is meaningful with or without a key.
  const generate = page.getByRole("button", { name: /generate ai follow-up/i });
  await expect(generate).toBeVisible();
  await generate.click();

  const notConfigured = page.getByText(/ai is not configured/i);
  const draftOrNotice = page.locator("textarea, [data-ai-draft]").first();
  await Promise.race([
    notConfigured.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {}),
    draftOrNotice.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {}),
  ]);

  if (await notConfigured.isVisible().catch(() => false)) {
    test.skip(true, "AI not configured in this environment — draft generation not exercised.");
    return;
  }

  // A draft exists → approve it. Owner-only approval is enforced in the DB; the
  // signed-in user is the owner here, so this succeeds.
  const approve = page.getByRole("button", { name: /^approve$/i }).first();
  await expect(approve).toBeVisible({ timeout: 30_000 });
  await approve.click();
  await expect(page.getByText(/approved/i).first()).toBeVisible({ timeout: 15_000 });
});
