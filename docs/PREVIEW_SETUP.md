# WinBack Preview environment — setup & verification (Phase 2)

Goal: an isolated **Preview** of `winback` wired **exclusively** to the
**WinBack-Test** Supabase project (`onydgglobiouuusdiuhu`), so the full app can
be exercised without touching production data, env, or deployments.

> These steps change external credentials / platform settings, so **you** make
> them (Claude can't, and won't, change them). Nothing here alters Production.

## 1. Vercel — Preview-scoped environment variables

In the **winback** Vercel project → **Settings → Environment Variables**, add
each of the following with the **Preview** environment checked **only** (leave
Production untouched):

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | WinBack-Test project URL | `https://onydgglobiouuusdiuhu.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | WinBack-Test anon/publishable key | browser-safe |
| `ANTHROPIC_API_KEY` | an Anthropic key | server-only; enables AI drafts |
| `SUPABASE_SERVICE_ROLE_KEY` | WinBack-Test service-role key | **server-only**, bypasses RLS; used only by the cron |
| `CRON_SECRET` | a long random string | protects `/api/cron/followups` |
| `WINBACK_FOLLOWUP_MODEL` | *(optional)* `claude-haiku-5-5` to minimise cost | defaults to `claude-sonnet-5-5` |

Double-check these are **not** set for Production, and that Production's own
values are unchanged.

## 2. Supabase (WinBack-Test) — auth redirect configuration

WinBack-Test → **Authentication → URL Configuration**:

- **Site URL:** your stable Preview URL (or the branch Preview URL you test on).
- **Redirect URLs (allow-list):** add `https://<your-preview-domain>/auth/callback`
  (and `http://localhost:3000/auth/callback` for local dev). This makes Google
  OAuth and email links land on the real callback and preserves the `next` param
  (the app has a `?code=` fallback, but allow-listing is the proper fix).
- **Email → Confirm email:** **turn OFF** for the test project so automated E2E
  gets a session immediately on signup. (Leave Production as-is — this change is
  only in WinBack-Test.)

## 3. Verify isolation (do this before trusting any test)

1. Open the Preview URL, sign up a throwaway `@winback.test` account, finish
   onboarding. Confirm the account/business appears **in WinBack-Test** (SQL
   editor: `select email from auth.users order by created_at desc limit 5;`) and
   **not** in the production project.
2. Confirm Production has no new rows (spot-check production `auth.users`).
3. Confirm the Preview deployment's "Environment Variables" inspector shows the
   WinBack-Test URL, not the production URL.

Only once that isolation is confirmed should the E2E suite be pointed at the
Preview (`E2E_BASE_URL=…`; see `e2e/README.md`).

## Guardrails that keep this safe

- Service-role key is server-only (`lib/supabase/admin.ts` imports
  `server-only`), used only by the `CRON_SECRET`-protected cron.
- The cron and all AI drafting are **draft-only** — no messages are sent.
- No production customer data is ever copied into WinBack-Test; test accounts
  use obviously-fake `@winback.test` addresses.
