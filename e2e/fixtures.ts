import { expect, type Page } from "@playwright/test";

/**
 * Shared helpers for the WinBack E2E specs. Selectors use accessible
 * labels/roles so they survive styling changes. Everything here drives the real
 * app through the browser — no DB shortcuts — so a green run proves the whole
 * workflow end to end.
 */

export const E2E_ENABLED = Boolean(process.env.E2E_BASE_URL);
export const SKIP_REASON =
  "Set E2E_BASE_URL to a Preview deployment wired to WinBack-Test to run E2E.";

/** A unique, obviously-fake test email so runs never collide or touch real data. */
export function uniqueEmail(prefix: string): string {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${prefix}+${stamp}@winback.test`;
}

export const TEST_PASSWORD = "WinBackE2E!pw8";

export type BusinessSeed = {
  fullName: string;
  businessName: string;
  businessType: string; // must match an option in BUSINESS_TYPES
  phone: string;
  country: string;
  state: string;
  city: string;
};

export const MIAMI_ROOFING: BusinessSeed = {
  fullName: "Riley Owner",
  businessName: "Miami Roofing LLC",
  businessType: "Roofing",
  phone: "+13055550123",
  country: "United States",
  state: "Florida",
  city: "Miami",
};

export const NY_PLUMBING: BusinessSeed = {
  fullName: "Jordan Owner",
  businessName: "New York Plumbing",
  businessType: "Plumbing",
  phone: "+12125550123",
  country: "United States",
  state: "New York",
  city: "New York",
};

/** Sign up a brand-new owner. Assumes Supabase email-confirmation is OFF. */
export async function signUp(page: Page, email: string, fullName: string): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(fullName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();

  // With confirmation off we land in the app (onboarding). If confirmation is
  // ON, the app shows "Confirm your email" — fail loudly with guidance.
  await expect(
    page.getByText(/confirm your email/i),
    "Supabase email-confirmation must be OFF in WinBack-Test for automated E2E",
  ).toHaveCount(0, { timeout: 20_000 });
  await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 20_000 });
}

/** Complete the 3-step onboarding wizard with the minimum required fields. */
export async function completeOnboarding(page: Page, biz: BusinessSeed): Promise<void> {
  if (!page.url().includes("/onboarding")) {
    await page.goto("/onboarding");
  }

  // Step 1 — business basics
  await page.getByLabel("Business name").fill(biz.businessName);
  await page.getByLabel("Business type").selectOption({ label: biz.businessType });
  await page.getByLabel("Business phone number").fill(biz.phone);
  await page.getByLabel("Country").fill(biz.country);
  await page.getByLabel("State / Region").fill(biz.state);
  await page.getByLabel("City").fill(biz.city);
  await page.getByRole("button", { name: /^next$/i }).click();

  // Step 2 — activity (only the follow-up method is required)
  await page
    .getByLabel(/currently follow up/i)
    .selectOption({ index: 1 })
    .catch(() => {});
  await page.getByRole("button", { name: /^next$/i }).click();

  // Step 3 — AI rules (defaults are fine) → finish
  await page.getByRole("button", { name: /finish setup/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

/** Add a lead via the dashboard "Add lead" form. */
export async function addLead(
  page: Page,
  lead: { customerName: string; phone: string; service: string; estimate: string },
): Promise<void> {
  await page.goto("/leads");
  await page.getByRole("button", { name: /add lead/i }).first().click();
  await page.getByLabel("Customer name").fill(lead.customerName);
  await page.getByLabel("Phone number").fill(lead.phone);
  await page.getByLabel("Service").fill(lead.service);
  await page.getByLabel("Estimate amount").fill(lead.estimate);
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(lead.customerName).first()).toBeVisible({ timeout: 15_000 });
}

/** Sign up + onboard in one step; returns the owner's email. */
export async function onboardNewBusiness(page: Page, biz: BusinessSeed): Promise<string> {
  const email = uniqueEmail(biz.businessName.toLowerCase().replace(/[^a-z]+/g, "-"));
  await signUp(page, email, biz.fullName);
  await completeOnboarding(page, biz);
  return email;
}
