# WinBack MVP — build progress

> Persistent working doc so this effort can resume across sessions. Update the
> status table and changelog as work lands. Branch: `claude/winback-mvp`.

**Objective:** a real, tested end-to-end pilot for US small businesses — signup,
onboarding, CRM, lead management, AI follow-ups, per-business Gmail, human
approval, and sending approved replies.

**Hard rules (standing):** production DB / env / deploys untouched; no
destructive SQL; no real emails or deploys without explicit approval; don't
modify FragraMood; don't modify WinBack Ops without approval; isolated test
project is **WinBack-Test** (`onydgglobiouuusdiuhu`); never fabricate test
results.

## Phase status

| Phase | Area | Status | Notes |
|---|---|---|---|
| 1 | Audit & verify | ✅ done (this session) | Findings below. Baseline: `tsc` clean, 13/13 unit tests pass. |
| 2 | Preview env → WinBack-Test | 🟡 guide ready, awaiting user | `docs/PREVIEW_SETUP.md` has exact Vercel/Supabase steps + an isolation-verification checklist. One new finding: WinBack-Test must have **Confirm email OFF** for automated E2E. Applying the settings is the user's action. |
| 3 | Customer app workflows | 🟡 ~80% built | Auth, onboarding, CRM, leads, notes/activity, AI drafts, approval all exist. Gaps: see below. |
| 4 | AI system | 🟡 in progress | Anthropic wired. **Model fixed to cost-efficient + configurable.** Guardrails now unit-tested. Provider layer (GPT/Gemini) deferred — Claude-only MVP. |
| 5 | Per-business Gmail | 🟡 built behind flag; needs migration + Google client | Full vertical slice implemented behind `WINBACK_GMAIL_ENABLED` (default off): OAuth connect/callback/disconnect, encrypted tokens, idempotent inbox sync, link-to-lead, AI reply draft→owner approve→gated send. Migration `0011` delivered for review (apply to WinBack-Test only). Needs a Google OAuth client + encryption key (user). Real send double-gated by `WINBACK_GMAIL_ALLOW_SEND`. |
| 6 | Safe automation | ✅ complete | Cron idempotent, draft-only, stop-states, audit log. Reply detection added: linking an inbound email to a lead pauses autopilot; unsubscribe → hard stop; both clear the schedule so the cron stops. Duplicate reply-draft prevention. |
| 7 | End-to-end testing | 🟡 scaffolded | Vitest unit suite now **73 tests** (guardrails, scheduling, Gmail crypto/state/parse/reply/reply-detection). Playwright E2E specs run once Preview is up. Live Gmail E2E is manual (checklist). |
| 8 | Pilot prep | ✅ report ready | `docs/PILOT_READINESS.md` (readiness + safety posture) and `docs/PILOT_SETUP_he.md` (single Hebrew setup checklist). |

## Phase 1 — audit findings (verified by reading the code)

**Repo:** `elad3365-wq/winback`, Next.js 16.3.5 (App Router), Supabase SSR,
Anthropic SDK. Route groups `(auth)`, `(app)`, plus `onboarding`, `api`.

**What works (customer app):**
- Auth: email/password + Google OAuth login; middleware (`src/proxy.ts` →
  `lib/supabase/proxy.ts`) refreshes the session, gates app pages, and has an
  OAuth `?code=` safety-net redirect. Password reset/confirm routes present.
- Multi-tenancy: `requireBusinessContext` / `requireOnboardedContext`
  (`lib/business.ts`) resolve the signed-in user's business via
  `business_members`; every lead/AI query is scoped by `business_id` **and**
  RLS. Service-role admin client is `server-only` and used only by the cron.
- Onboarding wizard + business profile + `business_ai_settings` (tone, discount
  ceiling, financing, payment plans, hours, rules, autopilot config).
- CRM dashboard, leads pipeline/workspace, lead detail, notes, activity timeline.
- AI drafting: `POST /api/leads/[leadId]/ai-followup` — RLS-authorized, rate
  limited (20/business/min), discount guardrails (prompt + output sanitizer),
  stores a draft row with a prompt-input snapshot. Nothing is sent.
- Approval workflow (`leads/ai-actions.ts`): draft → approved → (cancel /
  reopen). Writes `ai_audit_log`.
- Autopilot cron (`/api/cron/followups`, `CRON_SECRET`): due-scan, stop states,
  max-followups → cold, coarse business-hours, per-(lead,followup#) idempotency,
  audit rows, **draft-only**. Vercel cron daily (`0 9 * * *`, Hobby limit).

**Gaps / fixes identified:**
1. **AI model was `claude-opus-5` (expensive) for short drafts.** → fixed this
   session to a configurable, cost-efficient default (`claude-sonnet-5-5`), env
   override `WINBACK_FOLLOWUP_MODEL`. (`lib/ai/anthropic.ts`, `lib/ai/models.ts`.)
2. **Owner-only approval** is enforced in the DB (WinBack-Test PART 3/4 trigger)
   but the app UI lets any member click approve; today each business has exactly
   one member (the owner), so this is latent. Revisit when multi-member invites
   ship. App's `approveAiMessageAction` sets approved_by/at which the DB trigger
   re-stamps (same values for the owner) — compatible.
3. **Per-business Gmail (Phase 5) is entirely absent** in `winback`. The only
   "google" here is Supabase login. WinBack Ops' single-owner mailbox is **not**
   reused (tenant isolation).
4. **"Cancel follow-ups when the customer replies" (Phase 6)** needs inbound
   email → depends on Phase 5.
5. Single AI provider (Anthropic). GPT/Gemini provider layer is optional for MVP.

**Security-test execution (PARTs 1–4):** the rollback-only suites were authored
and reviewed. **I cannot execute them from this environment** — the Supabase MCP
here only sees the `FragraMood` project, not WinBack-Test. They must be run in
the WinBack-Test SQL editor by the user; results pasted back for confirmation.
Scripts live in the session scratchpad (`WinBack-Test-PART3-tests.sql`,
`WinBack-Test-PART4-tests.sql`).

## External actions needed from the user (unblock Phase 2 & 5)

These change external credentials / settings, so they need the user. Listed with
exact steps; other independent dev proceeds meanwhile.

1. **Vercel Preview env (Phase 2).** In the `winback` Vercel project → Settings →
   Environment Variables, add **Preview-scoped** (not Production) values pointing
   at WinBack-Test: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `CRON_SECRET`.
   Do **not** touch Production values. Confirm Preview deployments use the WinBack-Test DB only.
2. **Supabase auth redirect URLs (Phase 2).** In WinBack-Test → Authentication →
   URL Configuration, allow-list the Preview domain(s) `…/auth/callback` and set a
   Site URL appropriate for Preview. (Fixes the OAuth `?code=` fallback.)
3. **Google OAuth client for the customer app (Phase 5).** A dedicated OAuth
   client (separate from WinBack Ops) with least-privilege Gmail scopes, plus a
   token-encryption key. Exact scopes/redirects will be specified when Phase 5
   code is ready for review.

## Decisions

- **Claude-only MVP.** Claude via the existing Anthropic SDK is the MVP path.
  A provider abstraction (Claude/GPT/Gemini) is deferred; it won't block pilot.
- **Follow-up model default `claude-sonnet-5-5`** (was `claude-opus-5`): ~2.5×
  cheaper input, strong writing for short customer messages; override via
  `WINBACK_FOLLOWUP_MODEL` (`claude-haiku-5-5` cheapest, `claude-opus-5-5` best).
- **Gmail lands behind a feature flag**, migration delivered for review (same
  PART-style as the WinBack-Test setup); no auto-send in the pilot.

## Security hardening of 0011 (per review)

Applied to `0011_business_gmail.sql` + app code + new tests:
1. **WinBack-Test guard** — refuses to run without `winback_test_marker` and the
   PART 1–3 helpers; cannot execute against Production.
2. **Server-only tokens** — authenticated users get SELECT on status columns
   only (no token columns) and no write access; all token read/write/refresh/
   disconnect go through the service role (`connection.ts` refactor,
   `getConnectionStatus` selects safe columns).
3. **Composite FK for replies** — `(business_id, message_id)` →
   `business_email_messages(business_id, id)` with a `unique (business_id, id)`.
4. **PG15+ column-list `SET NULL`** — lead FKs use `on delete set null (lead_id)`
   so deleting a lead clears only `lead_id`, never the NOT NULL `business_id`.
5. **Backend-only send** — users cannot set `status='sent'`, `sent_at`, or
   `gmail_sent_message_id` (column grants + trigger); the service role marks
   sent only after Gmail confirms (`sendReplyAction` refactor). Owner-only
   approval and edit-invalidates-approval preserved.
6. **Locked-down writes** — messages are service-role-written (users may update
   only `lead_id`, cannot insert/delete/forge); replies have no DELETE grant
   (use `cancelled`); a sent reply is immutable.
7. **Rollback-only tests** — `0011_business_gmail_tests.sql` covers the guard,
   tenant isolation, server-only tokens, approval integrity, send restrictions,
   and FK deletion behavior.

All app code still compiles and passes (tsc, 73 tests, ESLint, `next build`).

## Changelog

- _This session_: created branch `claude/winback-mvp`; added this progress doc;
  Phase 1 audit complete; Phase 4 increment — cost-efficient, configurable
  follow-up model (`lib/ai/models.ts`, wired into `lib/ai/anthropic.ts`, env
  documented, unit-tested).
- _This session (milestone 2, Phase 2/7)_: expanded Vitest suite 13 → **44**
  tests — AI discount guardrails + prompt builder (`followup.test.ts`),
  business-hours gate (`business-hours.test.ts`), autopilot delays/guards
  (`autopilot.test.ts`); all green, no bugs surfaced. Added Playwright E2E:
  `playwright.config.ts`, `e2e/fixtures.ts`, specs for signup→onboarding,
  lead→AI draft→approval, and tenant isolation (parameterized by
  `E2E_BASE_URL`; skip when unset; 4 tests discovered). `npm run e2e` script
  added, `@playwright/test@1.56.0` devDep. Wrote `docs/PREVIEW_SETUP.md`
  (Phase 2 setup + isolation verification) and `e2e/README.md`.
- _This session (milestone 3, Phase 5 — per-business Gmail)_: full tenant-scoped
  Gmail integration behind `WINBACK_GMAIL_ENABLED` (off by default). Ported the
  proven pure modules from Ops (crypto AES-256-GCM, Google OAuth, Gmail REST,
  MIME parse) into `src/lib/gmail/`; added `config.ts` (feature flag + least-
  privilege scopes), `oauth-state.ts` (signed, CSRF-safe state binding the round
  trip to one business), `connection.ts` (encrypted token store + refresh +
  disconnect, RLS/owner-scoped), `sync.ts` (idempotent inbox store), `reply.ts`
  (AI reply prompt + guardrails). Routes `/api/gmail/connect` + `/callback`
  (owner-only, state-verified, never writes another tenant's mailbox). Server
  actions for sync / generate / edit / approve / send / link-to-lead / disconnect;
  **send double-gated** by `WINBACK_GMAIL_ALLOW_SEND` so no real email leaves
  during the pilot. UI: `/settings/email` + connection + inbox client components;
  nav link added. Migration `0011_business_gmail.sql` (three RLS tables, tenant
  composite FKs, owner-only approve/send + sent-immutable + edit-invalidates-
  approval trigger) — **for review, apply to WinBack-Test only**. Types added to
  `database.types.ts`. Tests +23 (crypto, signed state, MIME parse/reply build,
  reply guardrails) → **67 total, all green**; `tsc`, ESLint, and `next build`
  all pass. `.env.example` documents every new SERVER-ONLY var.
- _This session (milestone 4, Phase 6 + 8)_: reply detection — `reply-detection.ts`
  (`isUnsubscribeRequest`, `leadUpdateForInboundReply`, pure + tested); linking an
  inbound email to a lead now pauses the autopilot (or hard-stops on unsubscribe),
  clears the schedule, and logs lead_activity + ai_audit_log. Duplicate
  reply-draft prevention in `generateReplyAction`. Tests +6 → **73 total, green**;
  `tsc`/ESLint/`next build` pass. Phase 8: `docs/PILOT_READINESS.md`. Single
  Hebrew setup checklist remains `docs/PILOT_SETUP_he.md`.
