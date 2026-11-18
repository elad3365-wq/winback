# WinBack — 5-day beta sprint log (Nov 17–21, 2026)

Sprint branches: Day 1 `claude/lucid-johnson-w8p0do` (draft PR #4 → `platform`); Day 2+ `claude/lucid-johnson-aiu1rq`, stacked on Day 1 (each scheduled run is assigned its own branch, so the day-2 PR targets the day-1 branch).
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

---

## Day 2 — Wednesday, Nov 18 (onboarding & CRM)

Branch `claude/lucid-johnson-aiu1rq` = Day 1 commit + this work. Nothing applied to
any database; Production, `main`, Vercel settings and Gmail untouched.

### Root cause found: "0 rows, no error" reported as success

RLS turns a blocked UPDATE/DELETE into an empty result with **no error**. Every
CRM write only checked `error`, so these all showed success while nothing changed:
editing / re-statusing / deleting a lead after switching business in another tab,
a lead that was already deleted, a team **member** saving onboarding or Settings
(the `businesses_update_owner` policy blocks them), notes edited after deletion.

### Fixed

1. **Lead actions verify the affected row** (`src/app/(app)/leads/actions.ts`,
   `src/app/(app)/leads/[leadId]/actions.ts`): update/delete/status/schedule/
   log-contact/autopilot-pause/note edit+delete all `.select("id")` and return
   "lead not found…" when nothing matched.
2. **Raw Postgres errors no longer shown to owners** (e.g. "new row violates
   row-level security policy"). Mapped by `friendlyLeadError()`; the raw error is
   logged server-side.
3. **Server-side lead validation** moved to `src/lib/lead-input.ts`: length caps
   (name/service 120, phone 30 and must contain a digit), amount ≤ numeric(12,2),
   `$`/`,` tolerated, impossible dates (2026-02-30) rejected. Notes capped at 5,000.
4. **Activity history gap:** changing status in the *Edit lead* form did not log
   `status_changed`. It does now (only when the status actually changed).
5. **Onboarding / Settings for non-owners** (`src/app/onboarding/actions.ts`,
   `src/app/(app)/settings/actions.ts`): owners get an error if the business row
   was not updated; a member finishing onboarding only marks their own profile
   (previously their wizard could overwrite the owner's AI rules, which members
   may write under RLS). Settings refuses non-owners up front.
   Profile completion now *upserts*, so an old account without a `profiles` row
   can't loop back to onboarding forever.
6. **No way to edit a lead from its own page** — added *Edit details*
   (`src/components/leads/edit-lead-button.tsx`). Previously only reachable from
   the List view (the default Pipeline view has no Edit either).
7. **First-run experience**: new dashboard checklist (`src/lib/getting-started.ts`,
   `src/components/dashboard/getting-started.tsx`) — Add first lead → Generate AI
   follow-up → Review & approve → Connect Gmail (optional). Hidden once the three
   required steps are done. A brand-new account no longer sees nine "0" tiles.
   `/leads?new=1` opens the *Add lead* dialog directly; the empty leads page hides
   the filter bar and says only name/phone/service are needed and nothing is sent.
8. Invalid HTML `<a><button>` on the dashboard empty state → `buttonClasses()` link.

### Tests (all ran in the session container)

| Check | Result |
|---|---|
| `tsc --noEmit` | pass |
| `eslint .` | pass |
| `vitest` | **203 / 203 pass** (28 files; +32 new: lead input ×17, lead actions ×8, onboarding action ×4, checklist ×3) |
| `next build` | pass |
| `next start` smoke: `/dashboard`, `/leads?new=1`, `/leads/<id>`, `/onboarding`, `/businesses/new` → 307 `/login`; `/api/cron/followups` → 401; `/` → 200 | pass |
| WinBack-Test read-only re-check: marker present; `create_business` + `ensure_lead_in_business` present; 4 `*_lead_in_business` triggers present; RLS policies on businesses/leads/notes/activity/AI settings/profiles as expected | pass |
| **New** `supabase/tests/crm_onboarding_flow.sql` (27 checks, self-rolling-back) | **NOT RUN** — see blocker 1 |

The new SQL test walks the app's write paths as two fictional owners (Alice: 2
businesses; Bob: 1, later a plain member of Alice's): onboarding updates, AI
settings upsert, `create_business()`, lead add/edit/status/filter/switch, notes,
activity, cross-tenant update/delete/insert attempts (expect 0 rows / rejection),
member permissions, delete cascade.

### Blockers (need the owner)

1. **Supabase MCP write confirmation.** The rolled-back CRM test inserts throwaway
   `auth.users` rows, so the Supabase connector asked for confirmation; nobody was
   present during the scheduled run and it timed out. **To do:** paste
   `supabase/tests/crm_onboarding_flow.sql` into the WinBack-Test SQL editor (it
   refuses to run elsewhere and always ends with `CRM FLOW PASSED/FAILED`, rolling
   everything back), or approve it when a run asks.
2. **Network policy** blocks `*.supabase.co` and `*.vercel.app` from the session
   container, so no live browser E2E (signup → onboarding → leads) could run.
   Allowing `onydgglobiouuusdiuhu.supabase.co` would let a run start the app
   locally against WinBack-Test and run `npm run e2e`.
3. **Vercel access** unchanged since Day 1: team `fragra-mood` lists 0 projects to
   the connector, so Preview env targets / runtime errors are still unverified.
   Confirmed on Day 2: the Vercel bot on PR #5 shows the GitHub app *does* deploy
   this branch (project `winback`, Preview `winback-git-claude-lucid-johnson-aiu1rq-fragra-mood.vercel.app`),
   but the connector gets **404 even for the exact project id** in the team. The
   connector's grant needs the `winback` project added.
4. Day 1 items still open: hardening SQL review, Supabase Auth settings check.

### Not verified (honest gaps)

- Real signup → onboarding → dashboard in a browser (blocker 2/3).
- Business switching UI in a browser (code + RLS reviewed only; the cookie is
  honoured only for the caller's own memberships).

### Next run (Thu, Nov 19) — AI engine

- AI follow-up generation on fictional leads (unit-level with a mocked model;
  real calls only if a key is reachable): draft / edit / approve / discard / copy.
- Knowledge-base guardrails: no invented discounts, prices, guarantees or slots.
- Spend/rate limits, logging, emergency stop; autonomous sending stays off.
- Assisted workflow usable without Gmail.

### Remaining for the free beta

Live E2E on Preview (blocked), run `crm_onboarding_flow.sql`, AI drafting with a
real key on Preview, Gmail test-account OAuth, pilot docs (Saturday).
