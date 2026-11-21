# WinBack free beta — GO / NO-GO (Saturday, Nov 21, 2026)

## Verdict: **NO-GO to invite today → conditional GO** after ~2 hours of owner work

The code is ready for a 5-business, human-approved pilot. **But no one has ever
completed the customer journey on a deployed WinBack against a real database:**
WinBack-Test has **0 users, 0 businesses, 0 leads, 0 AI messages, 0 beta
signups** (read-only count, Nov 21), and this sprint could not reach any
Vercel deployment. Inviting real businesses before one owner-run journey
succeeds would make them the first testers of sign-up itself.

Flip to **GO** when every item in "Gate" below is ticked. None of it needs new code.

## Evidence

### Verified (ran and passed this week)

| Area | Evidence |
|---|---|
| Static checks | `tsc --noEmit`, `eslint .`, `next build`: pass (Nov 21) |
| Unit / integration (mocked) | `vitest`: **291 / 291** pass, 38 files (171 on Day 1 → 291 today) |
| Tenant isolation (DB) | `supabase/tests/tenant_isolation.sql` on WinBack-Test: **34 / 34** (Day 1, self-rolling-back) |
| Test DB structure | `create_business`, `ensure_lead_in_business` (SECURITY DEFINER, empty search_path), 4 lead-isolation triggers, RLS on every public table, Gmail token columns not user-selectable — re-checked Days 1–5 |
| Beta form honesty | Browser (Playwright, 375 px): DB unreachable → error message, **no** "Thanks for applying", values kept after error and on retry (Nov 21) |
| Public pages, desktop 1280 + mobile 375 | `/`, `/login`, `/signup`, `/forgot-password`, `/privacy`, `/terms`: 200, no horizontal overflow, no console errors; `/dashboard` → `/login?next=…` (Nov 21) |
| Auth proxy | cron/push routes reach their own secret checks (401), Gmail callback not hijacked, open-redirect guard (Day 1, Day 4 smoke) |
| Safety | No sending path is reachable: `WINBACK_GMAIL_ALLOW_SEND` off; "Send reply" hidden unless enabled; assisted send = copy / Open in Messages / Open in Gmail + "mark as sent" |

### Not verified (blocked) — honest gaps

| Gap | Why | Owner action |
|---|---|---|
| Any deployed page (Preview or Production) | Vercel connector 404 for project `prj_CMGZpI4AwEahwicobp9W3UgHbDhR` (re-checked Nov 21); network policy blocks `*.vercel.app` | Grant the connector the `winback` project, or test it yourself |
| Preview env vars point **only** at WinBack-Test | same | Vercel → winback → Settings → Environment Variables → check Preview values |
| Real signup → onboarding → lead → draft → approve | Test DB empty; `*.supabase.co` blocked from the session | Run the 10-minute journey once (Gate 2) |
| `supabase/tests/crm_onboarding_flow.sql` (27 checks) | Supabase connector asks for confirmation; nobody present (Day 2 and again Nov 21) | Paste into the WinBack-Test SQL editor; expect `ERROR: CRM FLOW PASSED: 27 of 27 checks` (it always rolls back) |
| A real model call | No `ANTHROPIC_API_KEY` reachable | Generate one draft in the pilot environment |
| Gmail OAuth / sync / push | No Google test credentials | **Not needed for the pilot** — keep Gmail off |
| Playwright E2E (6 specs) | needs a reachable deployment | `E2E_BASE_URL=<preview> npm run e2e` |

## Gate (all required before the first invite)

1. ☐ Decide the pilot environment. Recommended: **Production** (`yysmbjnspenslykzmlel` + Production deploy) after merging the sprint PRs into `platform` → `main`, since pilot data is real customer data. Every step here needs your approval; nothing was done to Production.
2. ☐ In that environment, sign up as a new user and do: onboarding → add 2 leads → Knowledge base entry → Generate AI Follow-up → Approve → Open in Messages → mark as sent → switch business → log out/in. (~10 min)
3. ☐ `npm run e2e` green against it (or against Preview on WinBack-Test first).
4. ☐ Run `crm_onboarding_flow.sql` on WinBack-Test → PASSED.
5. ☐ Supabase Auth (pilot project): Site URL + Redirect URLs = pilot domain (`/auth/callback`, `/auth/confirm`); anonymous sign-ins **off**; Confirm email **on**; Google provider configured if "Continue with Google" stays visible.
6. ☐ Submit the landing-page form once on the live site; confirm the `beta_signups` row; delete it.
7. ☐ Env present in the pilot environment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`; `CRON_SECRET` + `SUPABASE_SERVICE_ROLE_KEY` only if the daily follow-up cron should draft. `WINBACK_GMAIL_ENABLED` and `WINBACK_GMAIL_ALLOW_SEND` **unset**.
8. ☐ Review `/terms` and `/privacy` against the pilot terms in `docs/pilot/PILOT_PLAN.md`.

## Needs explicit owner approval before any production release

- Merging draft PRs #4 → #5 → #6 → #7 → Day 5 into `platform`, and PR #3 (`platform` → `main`).
- Applying migrations 0011–0013 (+ fixes) to the Production DB; checking it has `create_business`, `ensure_lead_in_business` and the 4 lead-isolation triggers like Test.
- Production deploy / promotion on Vercel.
- `supabase/preview/winback_test_hardening_2026_11_17.sql` (revoke RPC on `handle_new_user`, pin `set_updated_at` search_path) — and the same for Production.
- Any Gmail enablement (Google OAuth verification or test users) — recommended **after** the pilot.
- Enabling `WINBACK_GMAIL_ALLOW_SEND` — not recommended for the pilot at all.
- Sending the welcome email (`docs/pilot/WELCOME_EMAIL.md`) — nothing was sent.
- Do **not** merge PR #2 (separate Gmail implementation) without a compatibility review; `platform` already contains Gmail.

## Known limitations to tell pilot users (acceptable for the beta)

- WinBack never sends; owners send from their phone/email and click "mark as sent".
- Incoming email can't auto-match leads (leads have no email column) — Gmail is off anyway.
- Daily AI limits reset at 00:00 UTC (02:00 Israel).
- Emergency stop halts automatic drafting only; a human click still drafts (always reviewed).
- No self-serve data export/delete; done by the founder on request.
- Inline text links on the landing page are 17 px tall on mobile (fine to tap, below the 44 px guideline).

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Signup/email-confirm misconfigured in the pilot project | Medium (never exercised) | Blocks every pilot user | Gate 2 + 5 |
| Preview/Prod env mixed (Preview writing to Prod DB) | Unknown (unverifiable) | Test data in Prod | Gate 1 + 7 |
| AI states something untrue | Low–medium | Owner embarrassment | Knowledge-base-only facts, "Check before sending" flags, mandatory approval |
| Cross-tenant data leak | Low (RLS + triggers + 34/34 DB test) | Severe | Run `tenant-isolation.spec.ts` in Gate 3; stop-the-pilot rule |
| AI cost runaway | Low | Low | Per-business daily spend + action caps (Day 3) |
