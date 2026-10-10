import { defineConfig, devices } from "@playwright/test";

/**
 * WinBack end-to-end tests. These run against a DEPLOYED Preview URL (never
 * production) — set E2E_BASE_URL to the Preview deployment that is wired to the
 * WinBack-Test database. With it unset, the specs skip themselves so `tsc` and
 * casual runs stay green.
 *
 * Prerequisites in the target environment (see e2e/README.md):
 *  - Preview env vars point at WinBack-Test (never production).
 *  - Supabase "Confirm email" is OFF for WinBack-Test, so signup yields an
 *    immediate session (otherwise the flow stops at "Confirm your email").
 *  - ANTHROPIC_API_KEY present if you want the AI-draft spec to exercise a real
 *    generation (it degrades to a skip when AI is not configured).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
