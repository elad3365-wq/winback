# WinBack MVP — pilot readiness report

Branch `claude/winback-mvp`. Status at the end of Phases 1–8 development.
Verified locally: `tsc` clean · ESLint clean · **73/73 unit tests pass** ·
`next build` succeeds. No production/DB/deploy changes; no email sent.

## What a pilot business can do (all through the website)

| Capability | State |
|---|---|
| Sign up, log in, password reset | ✅ works |
| Create a business + onboarding (details, services context, prices, hours, AI rules) | ✅ works |
| CRM dashboard, lead pipeline, create/update/track leads | ✅ works |
| Lead notes + activity timeline | ✅ works |
| Per-business AI settings (tone, discount ceiling, financing, plans, hours, rules) | ✅ works |
| AI follow-up drafts (cost-efficient model, discount guardrails) | ✅ works (needs `ANTHROPIC_API_KEY`) |
| Owner-only approval; safe edit / discard / re-draft | ✅ works (DB-enforced owner-only) |
| Autopilot scheduler — **draft-only**, idempotent, stop-states, business hours | ✅ works (needs service key + cron secret) |
| Per-business Gmail: connect / status / disconnect | ✅ built, flag-gated |
| Inbox sync + view + link a message to a lead | ✅ built, flag-gated |
| AI reply draft → owner approve → **send only after approval** | ✅ built; send double-gated OFF |
| Customer reply → autopilot pauses; unsubscribe → hard stop | ✅ built |

## Safety posture (all preserved)

- **Tenant isolation**: every table is RLS member-scoped; AI messages, email
  messages, and replies pin a linked lead to the same business with a composite
  FK. Two businesses cannot see or touch each other's data.
- **Owner-only approval & sending**: DB triggers enforce owner-only approval,
  approved-only send, sent-immutable, and "a material edit invalidates
  approval" — independently of the app.
- **No real email in the pilot**: Gmail is behind `WINBACK_GMAIL_ENABLED`
  (off), and outbound send is additionally behind `WINBACK_GMAIL_ALLOW_SEND`
  (off). With send off, replies can be drafted and approved but never sent.
- **Secrets server-side**: tokens stored AES-256-GCM encrypted; service-role
  key and all OAuth/encryption vars are server-only; the browser only ever gets
  the anon key.
- **Duplicate prevention**: inbound messages unique on
  `(business_id, gmail_message_id)`; autopilot one draft per `(lead, follow-up#)`;
  reply generation reuses an existing active draft instead of creating a second.

## Not in the MVP (by decision)

- GPT/Gemini provider layer — Claude-only for the pilot (deferred).
- Gmail push (Pub/Sub) — manual **Sync inbox** button is the pilot path; the
  parser already supports push envelopes for a later phase.
- Multi-member businesses / invites — each account owns one business today, so
  "owner-only" is currently equivalent to the single member.

## Gated items that need the owner (not code)

1. Apply migration `0011_business_gmail.sql` to **WinBack-Test only** (review first).
2. Stand up the Preview env vars → WinBack-Test (never production).
3. Create a Google OAuth client (separate from Ops) + encryption key.
4. Flip `WINBACK_GMAIL_ALLOW_SEND=true` only when you want to test a real send.

The exact, ordered steps are in `docs/PILOT_SETUP_he.md` (Hebrew).

## How to run the pilot test (fictional businesses)

Use Miami Roofing LLC and New York Plumbing (never real customer data). After
the setup checklist: sign up → onboard → add leads → generate + approve an AI
follow-up → connect Gmail → send a test inquiry from a second Gmail → Sync inbox
→ link to a lead → generate + approve a reply (send stays off until you opt in).
Automated coverage: 73 unit tests here, plus the Playwright E2E suite
(`npm run e2e` against the Preview; see `e2e/README.md`).
