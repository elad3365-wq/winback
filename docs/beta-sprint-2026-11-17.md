# WinBack — 5-day beta sprint log (Nov 17–21, 2026)

Sprint branch: `claude/lucid-johnson-w8p0do` (based on `platform`, PR #3).
Draft PR target: `platform`. Environment: WinBack-Test (`onydgglobiouuusdiuhu`) only.
Production DB (`yysmbjnspenslykzmlel`), `main`, and Production deploys were not touched.
`WINBACK_GMAIL_ALLOW_SEND` stays off; no email was sent.

---

## Day 1 — Tuesday, Nov 17 (infrastructure, deployment, security)

### Fixed

1. **Early Access form showed false success** (`src/components/marketing/beta-actions.ts`).
   Before: a failed insert, a thrown error, or missing Supabase config still
   returned `status: "success"` ("Storage is best-effort"). Now success is only
   returned after the `beta_signups` insert returns no error; every other path
   returns a friendly error and logs the cause server-side. Validation moved to
   `validateBetaSignup()` in `beta-form-state.ts` (adds 200-char field cap and
   lower-cases email).
2. **Auth proxy blocked the cron jobs and Gmail push** (`src/lib/supabase/proxy.ts`,
   new `src/lib/supabase/paths.ts`). `/api/cron/*` and `/api/gmail/push` carry no
   user cookie, so the proxy 307-redirected them to `/login` and their own
   `CRON_SECRET` / push-token checks never ran — the daily follow-up and
   Gmail-maintenance crons could not have worked on a deployment. They are now
   passed through (they still reject callers without the secret: verified 401).
3. **Auth proxy hijacked the Gmail OAuth callback.** The "stray `?code=`" safety
   net forwarded *any* non-`/auth` URL carrying `code` to `/auth/callback`,
   including `/api/gmail/callback?code=…` from Google. API routes are now excluded.
4. **Public-path prefix matching was too loose** (`/authority`, `/login-admin`,
   `/termsx` counted as public). Now matched by whole path segment.
5. **Open-redirect hardening** in `safeNext()`: rejects `/\host` and control chars.

### Tests (all ran in the session container)

| Check | Result |
|---|---|
| `tsc --noEmit` | pass |
| `eslint` | pass |
| `vitest` | **171 / 171 pass** (24 files; +15 new: beta action ×5, auth paths ×10) |
| `next build` | pass |
| `next start` smoke: `/api/cron/followups` → 401 (was 307→/login); `/api/gmail/callback?code=` → not forwarded to `/auth/callback`; `/dashboard`, `/authority` → 307 /login | pass |
| WinBack-Test `tenant_isolation.sql` (self-rolling-back) | **34 / 34 pass**; verified 0 leftover rows |
| WinBack-Test anon insert into `beta_signups` (in rolled-back tx) | pass (1 row inside tx, 0 after) |

### Verified on WinBack-Test (read-only)

- `create_business` and `ensure_lead_in_business` exist, `SECURITY DEFINER`, `search_path=""`; anon cannot execute `create_business`.
- The four lead-isolation triggers exist: `lead_notes_lead_in_business`, `lead_activity_lead_in_business`, `ai_messages_lead_in_business`, `ai_audit_log_lead_in_business`.
- RLS enabled on all 16 public tables. `beta_signups`: INSERT-only policy for anon/authenticated, no SELECT.
- Postgres error logs (last 24h): none. Traffic is very low — Preview has barely been exercised.

### Security / performance advisor findings (WinBack-Test)

- WARN `handle_new_user()` (trigger fn) callable via RPC by anon/authenticated → fix prepared, **not applied**: `supabase/preview/winback_test_hardening_2026_11_17.sql`.
- WARN `set_updated_at()` mutable search_path → same file.
- WARN "anonymous access policies" on 15 tables: these policies are scoped to `authenticated`, which also covers Supabase anonymous sign-ins. Recommend keeping **Anonymous sign-ins disabled** in Supabase Auth (dashboard setting — owner to confirm).
- `create_business`, `is_business_member`, `is_business_owner` executable by `authenticated`: intended (RPC + RLS helpers).
- Perf: 7 RLS policies call `auth.uid()` per row (`profiles`, `businesses`, `business_members`) — wrap in `(select auth.uid())`; 17 unindexed FKs (mostly `created_by`/`approved_by` and composite `(business_id, lead_id)`). Harmless at beta scale; not changed.

### Blockers (need the owner)

1. **Vercel access.** The Vercel connector sees team `fragra-mood` but lists **zero projects**; `winback` returns 404 and the Preview URL lookup fails. The session's network proxy also blocks `*.vercel.app`. So I could **not** verify: Preview env vars (presence/target), that Preview points only at WinBack-Test, deployment status, or runtime errors. Fix: extend the Vercel integration's authorization to the `winback` project, and/or allow `winback-git-platform-fragra-mood.vercel.app` in this environment's network policy.
2. Applying `winback_test_hardening_2026_11_17.sql` to WinBack-Test (low-risk, privileges only) — left for review.
3. Supabase Auth dashboard: confirm anonymous sign-ins are off, and `/auth/callback` + `/auth/confirm` for the Preview URL are in Redirect URLs.

### Signup / login / logout (code review; not run end-to-end)

Code paths reviewed: `signUpAction` (handles confirm-email on/off), `signInAction` → `destinationAfterAuth` (onboarding first), `/auth/callback` (PKCE, error mapping), `/auth/confirm` (recovery → `/reset-password`), `signOutAction`, proxy redirects. No defects found beyond items 2–5 above. A live E2E run needs Preview access (blocker 1) — the Playwright suite in `e2e/` is ready.

### Next run (Wed, Nov 18) — onboarding & CRM

- If Vercel access is granted: confirm Preview env targets + run `npm run e2e` against Preview.
- Exercise onboarding → `create_business()` → dashboard → leads CRUD/filters/status/activity on WinBack-Test via SQL-as-user and code review; two fictional businesses.
- Empty-state / first-lead guidance on dashboard and leads pages.
- Fix broken buttons/redirects/validation found.

### Remaining for the free beta

Preview verification (blocked), live E2E of the signup journey, AI drafting with a real key on Preview, Gmail test-account OAuth, pilot docs (Saturday).
