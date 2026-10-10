import { expect, test } from "@playwright/test";

import { addLead, E2E_ENABLED, MIAMI_ROOFING, NY_PLUMBING, onboardNewBusiness, SKIP_REASON } from "./fixtures";

test.skip(!E2E_ENABLED, SKIP_REASON);

/**
 * Two independent businesses must never see each other's leads. Each gets its
 * own browser context (its own session/cookies), onboards, adds a uniquely
 * named lead, then checks it cannot see the other's.
 */
test("tenant isolation: one business never sees another's leads", async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const miamiLead = `Miami Customer ${stamp}`;
  const nyLead = `NY Customer ${stamp}`;

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  try {
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await onboardNewBusiness(pageA, MIAMI_ROOFING);
    await onboardNewBusiness(pageB, NY_PLUMBING);

    await addLead(pageA, {
      customerName: miamiLead,
      phone: "(305) 555-0123",
      service: "roof replacement",
      estimate: "8200",
    });
    await addLead(pageB, {
      customerName: nyLead,
      phone: "(212) 555-0123",
      service: "pipe repair",
      estimate: "1400",
    });

    // Each sees only its own lead.
    await pageA.goto("/leads");
    await expect(pageA.getByText(miamiLead).first()).toBeVisible();
    await expect(pageA.getByText(nyLead)).toHaveCount(0);

    await pageB.goto("/leads");
    await expect(pageB.getByText(nyLead).first()).toBeVisible();
    await expect(pageB.getByText(miamiLead)).toHaveCount(0);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
