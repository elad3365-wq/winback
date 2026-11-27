import { expect, test } from "@playwright/test";

import { completeOnboarding, E2E_ENABLED, MIAMI_ROOFING, signUp, SKIP_REASON } from "./fixtures";

/**
 * Builds a sales-demo account with FICTIONAL data on the Preview/WinBack-Test
 * environment. Runs only when E2E_DEMO_EMAIL and E2E_DEMO_PASSWORD are set, so
 * the normal suite never creates it. Never point this at production.
 */
const DEMO_EMAIL = process.env.E2E_DEMO_EMAIL;
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD;

test.skip(!E2E_ENABLED || !DEMO_EMAIL || !DEMO_PASSWORD, SKIP_REASON);

const KNOWLEDGE = [
  "Free roof inspections with a written estimate within 48 hours.",
  "Financing is available on jobs over $5,000 through our lending partner (subject to approval).",
  "All roof replacements include a 10-year workmanship warranty.",
  "Office hours: Monday to Saturday, 8am to 6pm.",
];

const LEADS = [
  { customerName: "Dana Lopez", phone: "(305) 555-0199", service: "Full roof replacement (shingle)", estimate: "14800", status: "Follow-up needed" },
  { customerName: "Marcus Bell", phone: "(305) 555-0142", service: "Storm damage repair", estimate: "3200", status: "New" },
  { customerName: "Priya Shah", phone: "(786) 555-0117", service: "Tile roof re-seal", estimate: "6400", status: "Follow-up 1" },
  { customerName: "Tom Alvarez", phone: "(305) 555-0168", service: "Gutter replacement", estimate: "1850", status: "Interested" },
  { customerName: "Grace Kim", phone: "(954) 555-0130", service: "Flat roof coating", estimate: "4700", status: "Recovered" },
  { customerName: "Luis Moreno", phone: "(305) 555-0185", service: "Skylight leak repair", estimate: "950", status: "Cold" },
];

test("build the demo account (fictional Miami Roofing LLC)", async ({ page }) => {
  test.setTimeout(300_000);
  await signUp(page, DEMO_EMAIL!, MIAMI_ROOFING.fullName, DEMO_PASSWORD!);
  await completeOnboarding(page, MIAMI_ROOFING);

  await page.goto("/settings/knowledge");
  for (const fact of KNOWLEDGE) {
    await page.getByLabel("What the AI may say").fill(fact);
    await page.getByRole("button", { name: /add to knowledge base/i }).click();
    await expect(page.getByText(fact).first()).toBeVisible();
  }

  for (const lead of LEADS) {
    await page.goto("/leads");
    await page.getByRole("button", { name: /add lead/i }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Customer name").fill(lead.customerName);
    await dialog.getByLabel("Phone number").fill(lead.phone);
    await dialog.getByLabel("Service").fill(lead.service);
    await dialog.getByLabel("Estimate amount").fill(lead.estimate);
    await dialog.getByLabel("Status").selectOption({ label: lead.status });
    await dialog.getByRole("button", { name: /^add lead$/i }).click();
    await expect(page.getByText(lead.customerName).first()).toBeVisible();
  }

  // One AI draft on the hottest lead, so the demo opens with a ready example.
  await page.goto("/leads");
  await page.getByText("Dana Lopez").first().click();
  await page.waitForURL(/\/leads\//);
  await page.getByRole("button", { name: /generate ai follow-up/i }).click();
  await expect(page.getByLabel("Message")).not.toHaveValue("", { timeout: 60_000 });
  console.log("DEMO DRAFT:", await page.getByLabel("Message").inputValue());
});
