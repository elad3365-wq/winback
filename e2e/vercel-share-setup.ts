import { chromium } from "@playwright/test";

/**
 * Optional: when the Preview is behind Vercel Authentication, set
 * E2E_VERCEL_SHARE to a share token (Vercel → deployment → Share) and this
 * setup visits the deployment once so every test context carries the access
 * cookie. Without the variable it writes an empty state and does nothing else.
 */
export const SHARE_STATE = "e2e/.share-state.json";

export default async function globalSetup(): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const base = process.env.E2E_BASE_URL;
  const share = process.env.E2E_VERCEL_SHARE;
  if (base && share) {
    const page = await context.newPage();
    await page.goto(`${base}/?_vercel_share=${encodeURIComponent(share)}`);
  }
  await context.storageState({ path: SHARE_STATE });
  await browser.close();
}
