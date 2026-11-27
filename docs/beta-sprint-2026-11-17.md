# WinBack — 5-day beta sprint log (Nov 17–21, 2026)

Sprint branches (stacked — each scheduled run is assigned its own branch): Day 1 `claude/lucid-johnson-w8p0do` (draft PR #4 → `platform`); Day 2 `claude/lucid-johnson-aiu1rq` (draft PR #5 → Day 1); Day 3 `claude/lucid-johnson-vk2ufp` (draft PR #6 → Day 2); Day 4 `claude/lucid-johnson-v8qqwn` (draft PR #7 → Day 3); Day 5 `claude/lucid-johnson-hgdgkq` (draft PR → Day 4). Merge in order #4 → #5 → #6 → #7 → Day 5, or squash the top branch (`claude/lucid-johnson-hgdgkq`, which contains all five days) into `platform`.
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

---

## Day 3 — Thursday, Nov 19 (AI engine & business intelligence)

Branch `claude/lucid-johnson-vk2ufp` = Day 1 + Day 2 + this work. Nothing was
written to any database (read-only checks on WinBack-Test only). Production,
`main`, Vercel settings and Gmail untouched; no model call was made against a
real API key (no key reachable from the session) — all AI tests use a mocked SDK.

### Problems found

1. **Emergency stop / AI-off / daily limits were ignored by the cron that
   actually runs.** `vercel.json` schedules `/api/cron/followups` daily; it never
   read `business_ai_autonomy`, so it kept drafting (and spending) after an
   owner hit *Emergency stop* or set AI to *Off*, with no daily action or spend
   cap. Only the unscheduled `/api/cron/ai-tasks` engine honoured them.
2. **The knowledge base was unusable.** `business_knowledge` existed (0012) but
   had no UI (0 rows on WinBack-Test), and the owner's *Generate* button ignored
   it — only the Gmail autopilot read it.
3. **No output check beyond discounts.** A draft could quote an invented price,
   a discount above the business's ceiling (when discounts are on), a warranty,
   or "we have an opening Friday at 9am", and nothing told the owner.
4. **Model call failure handling.** `max_tokens: 1024` with the current models'
   default adaptive thinking (thinking counts toward the cap) and no
   `stop_reason` check: a cut-off or refused response could be saved as a draft.
   Provider errors all became one generic message; the Gmail reply action showed
   raw error text.
5. **Approval workflow gaps.** No way to discard a draft (`cancelAiMessageAction`
   was unused), a reload lost the draft, *Regenerate* left orphan drafts, the
   only next step after approval was a disabled "Send (coming soon)", edits never
   set status `edited`, and drafts could be generated for unsubscribed customers.
6. **Approval audit never written (pre-existing).** `ai_audit_log` has no INSERT
   policy for signed-in users (service-role only), so the approve action's audit
   insert has always failed silently. RLS was **not** loosened; approvals are now
   recorded in `lead_activity` (member-insertable) instead.

### Fixed

- `src/lib/ai/guard.ts` (new): one policy for both entry points. AI *off* blocks
  manual + automatic; *emergency stop* halts automatic drafting (a human click
  still works — it's reviewed before anything is sent); daily action limit
  (automatic); daily spend limit (all drafts, estimated per model, UTC day).
- `/api/cron/followups`: applies the guard per business (blocked leads stay due
  and resume later, with a `skipped_<reason>` audit row), passes the knowledge
  base, runs the output review, and counts `edited` drafts in its duplicate check.
- `/api/leads/[leadId]/ai-followup`: knowledge base in the prompt, guard,
  unsubscribed → 409, output review, typed failure messages, usage + review
  flags stored in `prompt_inputs`.
- `src/lib/ai/followup.ts`: "Verified business facts" section; the model may
  state prices/guarantees/policies only from it (or the estimate) and must never
  offer a specific appointment time. Entries capped (25 × 600 chars).
- `src/lib/ai/review.ts` (new): removes sentences with a discount above the
  ceiling; flags unverified prices, guarantees/warranties, specific time slots,
  and financing/payment plans that aren't offered. Shown to the owner as
  "Check before sending".
- `src/lib/ai/anthropic.ts`: `max_tokens` 4096, refusal/truncated/empty →
  `AiGenerationError` (never saved), `classifyAiError()` + owner-safe messages
  (rate limit, bad key, bad model id, outage), token usage returned.
  Model ids/prices in `models.ts`/`limits.ts` checked against current docs: correct.
- Knowledge base UI: `/settings/knowledge` (nav: "Knowledge base") — add/edit/
  delete, "Stop using / Use in AI", owner-only (RLS also enforces), shows which
  Settings facts the AI also uses, helpful empty state.
- Assisted workflow without Gmail (`ai-followup.tsx`, `ai-actions.ts`): latest
  open draft reloads with its flags; Discard; Regenerate cancels the old draft;
  after approval: Copy, **Open in Messages** (`sms:` link with the text), and
  **"I sent it — mark as sent"** (approved → `sent`, counts a contact, logs to the
  timeline). WinBack still sends nothing.

### Tests (all ran in the session container)

| Check | Result |
|---|---|
| `tsc --noEmit` | pass |
| `eslint .` | pass |
| `vitest` | **249 / 249 pass** (35 files; +46 new: review ×11, guard ×7, provider wrapper ×5, knowledge/sms ×5, prompt knowledge ×3, approval actions ×5, generate route ×6, follow-up cron ×3 — one of my own assertions was wrong on the first run and was corrected) |
| `next build` | pass (new route `/settings/knowledge`) |
| `next start` smoke: `/settings/knowledge`, `/leads/abc`, `POST /api/leads/abc/ai-followup` → 307 `/login`; `/api/cron/followups` → 401 | pass |
| WinBack-Test read-only: `create_business`, `ensure_lead_in_business`, 4 `*_lead_in_business` triggers present; `ai_messages` status check allows `sent`/`edited`, members may update `status`/`sent_at`; `business_knowledge` owner-only write policies present, 0 rows | pass |
| Real model call on Preview | **NOT RUN** — no key in the session; Preview unreachable |

### Blockers (need the owner)

1. **Vercel connector** still 404 for project `prj_CMGZpI4AwEahwicobp9W3UgHbDhR`
   in team `team_Ye0AaLmXyvRO2iJY1iV7Xju7` (re-checked today). Can't confirm
   `ANTHROPIC_API_KEY` / `WINBACK_FOLLOWUP_MODEL` / `CRON_SECRET` are set for Preview.
2. **Live AI check** — once Preview is reachable, on WinBack-Test: add 2–3
   knowledge entries, generate a draft on a fictional lead, confirm flags appear
   for an invented price, approve, mark as sent.
3. Still open from Days 1–2: run `supabase/tests/crm_onboarding_flow.sql`,
   review the hardening SQL, check Supabase Auth settings, network allowlist.

### Decisions to confirm

- Emergency stop does **not** block a human clicking *Generate* (drafts are
  always reviewed). If you'd rather it stop all AI spend, it's a one-line change
  in `canGenerateDraft`.
- Daily limits reset at midnight **UTC** (02:00 Israel time).

### Next run (Fri, Nov 20) — Gmail

- Review the Gmail code in `platform` (OAuth, token encryption, sync, push, reply
  drafts) with mocks; make `generateReplyAction` honour the same AI guard and
  output review; duplicate prevention; cross-business isolation.
- `WINBACK_GMAIL_ALLOW_SEND` stays off.

### Remaining for the free beta

Live E2E on Preview (blocked), a real model call on Preview, `crm_onboarding_flow.sql`,
Gmail test-account OAuth, pilot docs and GO/NO-GO (Saturday).

---

## Day 4 — Friday, Nov 20 (Gmail integration & workflow automation)

Branch `claude/lucid-johnson-v8qqwn` = Days 1–3 + this work. No database writes
(read-only checks on WinBack-Test only). Production, `main`, Vercel settings and
Gmail untouched. `WINBACK_GMAIL_ALLOW_SEND` stays off; nothing was sent, no
Google account was connected, no real model call was made (mocks only).

### Reviewed (code in `platform`)

OAuth connect/callback (signed HMAC state, 10-min expiry, same-user + owner
check), AES-256-GCM token encryption (tokens never selectable by users —
confirmed on WinBack-Test), refresh, disconnect (stop watch → revoke → delete),
inbox sync, History-API incremental sync with expired-cursor reset, Pub/Sub push
webhook (constant-time token), watch renewal + daily maintenance cron, ingest
idempotency on `(business_id, gmail_message_id)`, loop prevention (SENT/DRAFT/own
address skipped), reply drafting, approval trigger, send gate, autopilot engine.
The design is sound; the problems below are what I found and fixed.

### Problems found

1. **Owner "Generate AI reply" ignored the AI controls and knowledge base.** AI
   *off* and the daily spend cap were not checked, the knowledge base was not
   passed, unsubscribed customers could still get a draft, and there was no
   output review (invented price / guarantee / time slot went straight into the
   draft). Spend counted only follow-ups, not email replies.
2. **Autopilot reply drafts had no output review either** — and an unverified
   claim did not stop auto-send (auto-send is off globally, but fail-closed matters).
3. **Push webhook mailbox lookup** used `ilike(email)` unescaped: `_` and `%` in an
   address are wildcards (`info_sales@` also matches `infoXsales@`). And because
   one mailbox can be connected to two businesses (no unique constraint — e.g.
   an owner with two workspaces), `maybeSingle()` errored and push was silently
   ignored for both. Error text was returned to the caller.
4. **Gmail OAuth callback bounced to `/login` when the session lapsed during
   Google consent**, carrying Google's one-time `code` onto `/login`, where the
   stray-code rule forwards it to Supabase `/auth/callback` as a login code.
5. **Revoked / expired Google grant** (`invalid_grant`) surfaced as a raw Google
   error; the refreshed-token cache write ignored its error.
6. **Partial consent**: Google lets users untick "Read your email"; the callback
   accepted the grant and every sync would fail with 403.
7. **Dead end while sending is off:** after approval the only button was
   *Send reply*, which returned "… WINBACK_GMAIL_ALLOW_SEND is not on" (env var
   name shown to customers). No way to record a reply sent by hand.
8. **Raw Postgres/RLS/trigger text** shown in the email actions; linking to a
   lead from another business surfaced a raw FK error; the link action's
   `ai_audit_log` insert always failed silently (service-role-only table, same
   as Day 3 finding 6); a non-owner hitting *Connect Gmail* saw raw JSON.
9. Generating a reply did a full page reload to show the draft.

### Fixed

- `src/lib/gmail/reply.ts`: `finalizeReply()` runs `sanitizeDiscounts` +
  `reviewDraft` (Day 3) on every reply; knowledge entries normalized/capped;
  the linked lead's estimate and the knowledge base count as verified facts.
- `settings/email/actions.ts` → `generateReplyAction`: AI key check, AI guard
  (off / spend limit counting follow-ups **and** email replies), unsubscribed
  lead → refused, knowledge base passed, review flags + usage stored in
  `prompt_inputs`, inbound-only, friendly save errors, returns the draft so the
  UI updates without a reload. Existing draft is reused (no second model call).
- `src/lib/ai/autopilot/engine.ts`: stores review flags; any flag ⇒ never auto-send.
- `src/app/api/gmail/push/route.ts` + `escapeLikePattern()` (`parse.ts`): escaped
  exact match, processes every business on that mailbox, one failing business
  doesn't block the rest, 500 (Pub/Sub retry) only if all fail, no error text out.
- `src/lib/supabase/paths.ts`: `/api/gmail/callback` answers itself (it already
  verifies the signed state and session) — invalid state now lands on
  `/settings/email?gmail_error=invalid_state`, not `/login?code=…`.
- `src/lib/gmail/connection.ts`: `GmailReconnectRequiredError` for no row / no
  refresh token / `invalid_grant`; cache-write error logged.
- `src/lib/gmail/errors.ts` (new): owner-safe messages for 401/403/429/5xx and
  missing server config; used by sync / disconnect.
- Callback: `hasRequiredGmailScopes()` → `gmail_error=missing_scope`; storage
  failure → `save_failed` (both with readable messages in the UI).
- Assisted send workflow (`email-inbox.tsx`): while sending is off, an approved
  reply shows **Copy reply**, **Open in Gmail** (the original thread, in the
  connected account) and **I sent it — mark as sent**
  (`markReplySentManuallyAction`: owner-only, approved-only, same-business,
  recorded via service role since users can't set `sent` — the DB trigger is
  unchanged; `gmail_sent_message_id` stays null = sent by hand; lead timeline
  entry). *Send reply* is shown only when sending is enabled and to the owner.
  "Check before sending" flags appear above the draft.
- Link to lead: checks the lead is in this business, verifies the lead update,
  logs `customer_replied` / `customer_unsubscribed` to the timeline (not
  `ai_audit_log`), reverts the dropdown on error, tells the owner follow-ups paused.
- `/api/gmail/connect` for a non-owner → back to `/settings/email?gmail_error=not_owner`.

### Tests (all ran in the session container)

| Check | Result |
|---|---|
| `tsc --noEmit` | pass |
| `eslint .` | pass |
| `vitest` | **287 / 287 pass** (38 files; +38 new: Gmail hardening ×16, email actions ×16, push webhook ×6; auth-paths updated) |
| `next build` | pass |
| `next start` smoke (Gmail flag on, dummy non-secret config, no Supabase): callback bad state → `/settings/email?gmail_error=invalid_state`; callback `error=access_denied` → `gmail_error=access_denied`; `/api/gmail/connect`, `/settings/email` → 307 `/login`; push wrong token → 401, right token + bad body → 200 ignored; `/api/cron/gmail-maintenance` → 401 | pass |
| WinBack-Test read-only: marker present; RLS on all Gmail/AI tables; token columns not selectable and no user write grants on `business_gmail_connections`; users may update only `lead_id` on messages and `status/body/lead_id` on replies; integrity trigger present; idempotency + composite tenant FKs present; push columns (0013) present; `create_business` + 4 lead-isolation triggers still present | pass |
| WinBack-Test data: 0 Gmail connections, 0 messages, 0 replies | Gmail has **never been exercised** on Test |
| Live OAuth / sync / push with a real Google test account | **NOT RUN** — see blockers |

### Not done / found but not changed

- **Automatic matching of incoming email to leads is not possible today:**
  `leads` has no email column (verified on WinBack-Test), so a message only gets a
  lead when the owner picks one from the dropdown. Adding it needs an additive
  migration (`leads.email text null` + index) and an email field in the lead
  form — a schema change, so left for owner approval (good post-beta item).
- One mailbox may be connected to several businesses; each then stores its own
  copy of that mail. Intended for multi-workspace owners — confirm.
- Watch renewal runs only from the daily cron; a missed day still leaves >2 days
  of margin (renew threshold 2 days, watch lifetime 7).

### Blockers (need the owner)

1. **Gmail live test** needs, on Preview only: `WINBACK_GMAIL_ENABLED=true`,
   `GOOGLE_GMAIL_CLIENT_ID/SECRET`, `GOOGLE_GMAIL_REDIRECT_URI` =
   `https://<preview-host>/api/gmail/callback` (also added in the Google Cloud
   OAuth client), `GMAIL_TOKEN_ENCRYPTION_KEY` (64 hex chars, new — not reused
   from Ops), `SUPABASE_SERVICE_ROLE_KEY` (Test project), and a Google test
   user on the OAuth consent screen. Optional push: `GMAIL_PUBSUB_TOPIC`,
   `GMAIL_PUSH_TOKEN`, a push subscription to `/api/gmail/push?token=…`, and
   Publisher for `gmail-api-push@system.gserviceaccount.com`. Keep
   `WINBACK_GMAIL_ALLOW_SEND` unset.
2. **Vercel connector** still 404 for `prj_CMGZpI4AwEahwicobp9W3UgHbDhR` (re-checked
   today) — Preview env presence/targets still unverified.
3. Still open: run `supabase/tests/crm_onboarding_flow.sql`, review the hardening
   SQL, Supabase Auth settings, network allowlist for `*.supabase.co` / `*.vercel.app`.

### Next run (Sat, Nov 21) — release readiness

- Full journey review (signup → business → leads → AI draft → approve → mark
  sent), desktop + mobile viewports where reachable; loading/empty/error states.
- Pilot pack: 14-day free pilot terms (no card), onboarding guide, welcome email
  template (not sent), feedback process, pilot metrics + queries.
- Final GO / NO-GO report; list everything needing approval before production.
- After Nov 21: no further changes under this sprint; disable the schedule.

### Remaining for the free beta

Live E2E on Preview (blocked), a real model call on Preview, `crm_onboarding_flow.sql`,
Gmail test-account OAuth (optional for beta — the assisted SMS/copy workflow works
without Gmail), pilot docs and GO/NO-GO (Saturday).

---

## Day 5 — Saturday, Nov 21 (release readiness) — FINAL

Branch `claude/lucid-johnson-hgdgkq` = Days 1–4 + this work. Read-only queries
on WinBack-Test only. Production, `main`, Vercel settings and Gmail untouched;
nothing sent, nobody contacted.

**Verdict: NO-GO to invite today; conditional GO** once the 8-item gate in
`docs/beta-go-no-go-2026-11-21.md` is done (no new code needed). Main reason:
WinBack-Test has **0 users / 0 businesses / 0 leads / 0 beta signups** — the
journey has never been completed on any deployment, and this sprint could not
reach one.

### Re-checked access (unchanged)

- Vercel connector: `get_project` 404 for `prj_CMGZpI4AwEahwicobp9W3UgHbDhR`;
  `web_fetch_vercel_url` on the platform Preview → 404 "lookup_deployment".
- Network policy: `winback-git-platform-fragra-mood.vercel.app` and
  `onydgglobiouuusdiuhu.supabase.co` → proxy 403.
- Supabase connector: read-only queries work; `crm_onboarding_flow.sql` again
  timed out waiting for a confirmation nobody could give (not retried).

### Problems found and fixed

1. **Manual "Unsubscribed" status was ignored by every drafting path except the
   cron.** The *Generate AI Follow-up* route, the Gmail reply action, the
   autopilot engine and the lead page only checked the `unsubscribe_status`
   flag (set by Gmail opt-out detection). An owner who moved a customer to
   *Unsubscribed* could still get drafts for them, and the lead page said
   "Subscribed". New `isLeadUnsubscribed()` (`src/lib/leads.ts`) treats either
   signal as opted out; used in all four places + the AI panel.
2. **Beta form wiped everything the visitor typed on any error** (React resets
   a form after its action). With Day 1's honest error, a database hiccup meant
   retyping the whole form. The action now echoes the values back and the form
   refills (`beta-form-state.ts`, `beta-actions.ts`, `beta-form.tsx`).
   Verified in Chromium at 375 px: error shown, values kept after error and
   after a retry, no false "Thanks for applying".
3. **Customers were told to "Add the ANTHROPIC_API_KEY environment variable"**
   when AI isn't configured (and "check WINBACK_FOLLOWUP_MODEL" on a bad model).
   Now owner-safe text; the env var name goes to the server log only.
4. **E2E fixture could never add a lead:** `addLead()` clicked a "Save" button
   that doesn't exist on the create form (it's "Add lead" — also true on
   `platform`), so `leads-ai` and `tenant-isolation` specs would have failed at
   step one once Preview access existed. Now clicks the dialog's "Add lead".

### Added

- `docs/beta-go-no-go-2026-11-21.md` — evidence, gaps, 8-item gate, approvals
  needed before production, known limitations, risk register.
- `docs/pilot/PILOT_PLAN.md` — 5 businesses, 14 days, no card; plain-language
  terms; timeline; metric definitions + targets; feedback process (check-in
  questions, end-of-pilot form, stop-the-pilot severity rule).
- `docs/pilot/WELCOME_EMAIL.md` — template, **not sent**.
- `docs/pilot/ONBOARDING_GUIDE.md` — 1-page quick start (claims checked
  against the UI labels in code).
- `supabase/reports/pilot_metrics.sql` — read-only weekly metrics
  (registrations, applications, onboarding, activated businesses, leads, AI
  drafts, approved/sent, weekly active, recovered). **Ran on WinBack-Test:
  executes, all 0.**

### Tests (all ran in the session container)

| Check | Result |
|---|---|
| `tsc --noEmit` | pass |
| `eslint .` | pass |
| `vitest` | **291 / 291 pass** (38 files; +4: beta values echo, helper, route + email action manual-unsubscribe). The new route test was confirmed to **fail** with the old check and pass with the fix |
| `next build` | pass |
| `playwright test --list` | 6 specs in 4 files load (not run: no reachable deployment) |
| Chromium viewport check (1280×800, 375×740) on `next start`: `/`, `/login`, `/signup`, `/forgot-password`, `/privacy`, `/terms`, `/dashboard`→login | pass — no overflow, no console errors |
| Beta form in browser (placeholder, unreachable Supabase) | error shown, no false success, values kept |
| WinBack-Test read-only: `create_business` + `ensure_lead_in_business` present (SECURITY DEFINER) | pass |
| `crm_onboarding_flow.sql` | **NOT RUN** (confirmation timeout) |
| Live E2E / real AI call / Gmail | **NOT RUN** (blocked) |

### Sprint summary (Nov 17–21)

- Tests: 171 → **291** unit/integration tests, all passing; DB isolation test 34/34.
- Fixed: false beta-signup success, auth proxy blocking crons/push and hijacking
  Gmail OAuth, open redirect, RLS "0 rows = success" in every CRM write, raw DB
  errors shown to owners, emergency stop / AI-off / spend caps ignored by the
  scheduled cron, unused knowledge base, unchecked AI claims, truncated/refused
  AI output saved as drafts, missing discard / mark-as-sent flows, Gmail reply
  guardrails, push-webhook wildcard lookup, partial-consent and revoked-grant
  handling, manual unsubscribe ignored, beta form wiping input, env-var names
  shown to owners, broken E2E fixture.
- Never done: any Production change, any send, any contact, any spend.

### Still open (owner)

See the Gate and approvals list in `docs/beta-go-no-go-2026-11-21.md`. In short:
grant Vercel connector access (or test yourself), run the 10-minute journey and
`npm run e2e`, run `crm_onboarding_flow.sql`, check Supabase Auth settings,
review the hardening SQL, decide the pilot environment, merge the stacked PRs.

### Schedule

This was the final scheduled run. **No further repository or database changes
will be made under this sprint.** The routine cannot disable its own schedule
from inside the session — please disable or delete the scheduled task in
Claude Code (claude.ai/code → Routines / scheduled tasks).

