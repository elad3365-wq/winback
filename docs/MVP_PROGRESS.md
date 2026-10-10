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
| 2 | Preview env → WinBack-Test | ⛔ blocked on user | Needs Vercel Preview env vars + Supabase redirect URLs + (for Gmail) a Google OAuth client. Exact actions listed below. |
| 3 | Customer app workflows | 🟡 ~80% built | Auth, onboarding, CRM, leads, notes/activity, AI drafts, approval all exist. Gaps: see below. |
| 4 | AI system | 🟡 in progress | Anthropic wired. **Model fixed to cost-efficient + configurable (this session).** Provider layer (GPT/Gemini) evaluated — deferred, Claude-only MVP. |
| 5 | Per-business Gmail | ❌ not built | Net-new. Needs migration (approval-gated) + Google OAuth client (user). Code will land behind a feature flag. |
| 6 | Safe automation | 🟡 ~85% built | Cron is idempotent, draft-only, stop-states, audit log. "Cancel on customer reply" depends on Phase 5 inbound. |
| 7 | End-to-end testing | ⬜ pending | Unit tests added incrementally; full E2E needs Preview + Gmail. |
| 8 | Pilot prep | ⬜ pending | Checklist + readiness report at the end. |

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

## Changelog

- _This session_: created branch `claude/winback-mvp`; added this progress doc;
  Phase 1 audit complete; Phase 4 increment — cost-efficient, configurable
  follow-up model (`lib/ai/models.ts`, wired into `lib/ai/anthropic.ts`, env
  documented, unit-tested).
