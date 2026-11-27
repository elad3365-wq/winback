import { expect, test } from "@playwright/test";
import { addLead, E2E_ENABLED, MIAMI_ROOFING, onboardNewBusiness, SKIP_REASON, TEST_PASSWORD } from "./fixtures";

test.skip(!E2E_ENABLED, SKIP_REASON);

test("pilot journey: knowledge → lead → AI draft → approve → mark sent → re-login", async ({ page }) => {
  const step = (s: string) => console.log(`STEP ${s}`);
  const email = await onboardNewBusiness(page, MIAMI_ROOFING);
  step("onboarded");

  await page.goto("/settings/knowledge");
  await page.getByLabel("What the AI may say").fill("Roof inspections are free. Financing is available for jobs over $5,000.");
  await page.getByRole("button", { name: /add to knowledge base/i }).click();
  await expect(page.getByText(/Roof inspections are free/).first()).toBeVisible();
  step("knowledge saved");

  await addLead(page, { customerName: "Dana Lopez", phone: "(305) 555-0199", service: "roof replacement", estimate: "8200" });
  step("lead added");
  await page.getByText("Dana Lopez").first().click();
  await page.waitForURL(/\/leads\//);
  await page.getByRole("button", { name: /generate ai follow-up/i }).click();
  const draft = page.getByLabel("Message");
  await expect(draft).not.toHaveValue("", { timeout: 60_000 });
  console.log("DRAFT:", (await draft.inputValue()).slice(0, 400));
  step("draft generated");
  await page.getByRole("button", { name: /^approve$/i }).click();
  await page.getByRole("button", { name: /mark as sent/i }).click();
  await expect(page.getByText(/sent manually/i).first()).toBeVisible();
  step("marked sent");
  await page.reload();
  await expect(page.getByText(/sent manually/i).first()).toBeVisible();
  console.log("LEAD PAGE:", (await page.locator("main").innerText()).slice(0, 1500));

  await page.goto("/dashboard");
  console.log("DASHBOARD:", (await page.locator("main").innerText()).slice(0, 1200));
  await page.context().clearCookies({ name: /sb-/ });
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/dashboard/);
  step("re-login ok");
});
