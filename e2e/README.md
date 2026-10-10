# WinBack end-to-end tests (Playwright)

These drive the real app in a browser against a **deployed Preview** that is
wired to the **WinBack-Test** database. They never run against production and
never use real customer data (every account is a fresh `@winback.test` address).

## Prerequisites

1. A Preview deployment of `winback` whose env vars point at WinBack-Test
   (`onydgglobiouuusdiuhu`) — see `docs/PREVIEW_SETUP.md`.
2. In WinBack-Test → Authentication, **turn OFF "Confirm email"** so signup
   yields an immediate session. (With it on, signup stops at "Confirm your
   email" and the specs fail with a clear message.)
3. Optional: `ANTHROPIC_API_KEY` present on the Preview so the AI-draft spec
   exercises a real generation. Without it, that spec skips itself.

## Running

```bash
# point at your Preview URL (NOT production)
export E2E_BASE_URL="https://winback-git-<preview-branch>-<team>.vercel.app"
npm run e2e
```

With `E2E_BASE_URL` unset, every spec skips itself (so `tsc`, CI, and local
`npm test` stay green — `npm test` runs the Vitest unit suite only).

If this machine's bundled Chromium doesn't match Playwright 1.56, run
`npx playwright install chromium` once in your environment.

## Specs

| File | Covers |
|---|---|
| `signup-onboarding.spec.ts` | login page smoke; signup → 3-step onboarding → dashboard |
| `leads-ai.spec.ts` | add a lead → generate AI draft → owner approval (AI step skips if unconfigured) |
| `tenant-isolation.spec.ts` | two businesses in separate sessions never see each other's leads |

Selectors use accessible labels/roles. If the UI copy changes, update
`fixtures.ts` (the shared signup/onboarding/add-lead helpers) in one place.
