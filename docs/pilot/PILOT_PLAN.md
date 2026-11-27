# WinBack free pilot — plan (5 businesses, 14 days, no card)

Prepared Nov 21, 2026 during the beta sprint. **Nothing has been sent and no
business has been contacted.** Every step marked *Owner* needs a human.

## 1. Offer

| | |
|---|---|
| Who | 5 US local service businesses (HVAC, roofing, plumbing, cleaning, electrical, auto repair, remodeling) that send written estimates and lose track of follow-ups. Prefer owners who answer the phone themselves. |
| Price | Free for 14 days. **No credit card is collected** — WinBack has no billing code at all. |
| What they get | Their own workspace, the leads CRM, AI-drafted follow-ups they review and approve, a knowledge base the AI must stick to, and a 20-minute personal onboarding call. |
| What WinBack never does in the pilot | Send anything on its own. Every message is a draft until the owner approves it, and then the owner sends it themselves (copy, "Open in Messages", or "Open in Gmail") and clicks **I sent it — mark as sent**. Autonomous sending (`WINBACK_GMAIL_ALLOW_SEND`) stays off. |
| What we ask in return | Add at least 5 real open estimates in week 1, try AI follow-ups on them, two 10-minute feedback check-ins (day 3 and day 10), and an end-of-pilot form. |
| After day 14 | Nothing happens automatically: no charge, no auto-renewal. We ask whether they want to continue; their data stays until they ask us to delete it. |

### Pilot terms (paste into the invite; plain language)

> The WinBack pilot is free for 14 days. We don't ask for a credit card and
> nothing renews or charges at the end. WinBack never sends a message to your
> customers by itself — it drafts, you review and send. Please only add
> customers you already have a business relationship with, and don't put
> card numbers, passwords or health information in notes. You can export or
> delete your data at any time by replying to this email. WinBack is early
> software: tell us when something breaks and we'll fix it with you.

Before any invite goes out, the owner should confirm `/terms` and `/privacy`
match this (they are generic today).

## 2. Readiness gate (do not invite until all are ✅)

See `docs/beta-go-no-go-2026-11-21.md` for the evidence. Minimum:

1. Pilot environment chosen (Production project with Production deploy, **or**
   a dedicated pilot Preview) — owner decision.
2. Real signup → onboarding → add lead → generate draft → approve → mark sent
   completed once by the owner in that environment (≈10 minutes).
3. `ANTHROPIC_API_KEY` set in that environment and one real draft generated.
4. `npm run e2e` green against it (`E2E_BASE_URL=…`), including
   `tenant-isolation.spec.ts`.
5. Supabase Auth: Site URL and Redirect URLs point at the pilot domain;
   anonymous sign-ins off; "Confirm email" on for real users.
6. `beta_signups` insert verified from the live landing page (submit once,
   check the row, delete it).
7. Gmail left **off** for the pilot (`WINBACK_GMAIL_ENABLED` unset) unless
   the Google OAuth app is verified or each pilot user is added as a test user.

## 3. Timeline

| Day | Who | What |
|---|---|---|
| −3 | Owner | Pick 5 businesses from `beta_signups` (+ 2 backups). Send the welcome email (`WELCOME_EMAIL.md`) one at a time. |
| 0 | Owner + business | 20-min call: sign up together, finish onboarding, add 3 real leads, fill the knowledge base (prices they actually quote, hours, warranty wording), generate + approve the first follow-up. |
| 1–2 | Business | Add the rest of their open estimates. |
| 3 | Owner | 10-min check-in (questions in §5). Fix blockers same day. |
| 7 | Owner | Run `supabase/reports/pilot_metrics.sql`; nudge inactive businesses. |
| 10 | Owner | 10-min check-in. |
| 14 | Owner | Send the end-of-pilot form; run metrics; decide continue / change / stop. |

## 4. Metrics (definitions match `supabase/reports/pilot_metrics.sql`)

| Metric | Definition | Pilot target (5 businesses) |
|---|---|---|
| Registrations | profiles created since pilot start | 5 |
| Activated businesses | business with ≥1 lead **and** ≥1 AI draft | ≥4 by day 3 |
| Leads added | leads in pilot businesses | ≥40 total (≈8 each) |
| AI drafts created | follow-up drafts + email reply drafts | ≥40 |
| Drafts approved or sent | status `approved` / `sent` | ≥50% of drafts |
| Weekly active businesses | any lead change, activity or draft in last 7 days | ≥3 in week 2 |
| Leads recovered | lead status `recovered` | any — collect the story |

Also record qualitatively: how often the owner edited the draft before
approving, and every "Check before sending" flag they disagreed with.

The query reads counts only (no customer names or message text) and is
read-only. Run it weekly in the SQL editor of the pilot project.

## 5. Feedback process

1. **One channel:** a single email address / WhatsApp thread per business,
   answered same business day. Log every report in a simple sheet:
   date · business · what happened · severity (blocker / annoying / idea) ·
   fixed? · reply sent?
2. **Check-in questions (day 3 and day 10):**
   - What did you use WinBack for since we last spoke?
   - Show me the last AI draft you approved. What did you change, and why?
   - Was anything confusing or broken? Where did you get stuck?
   - Did any draft say something untrue about your business?
   - Has a customer replied or booked from a WinBack follow-up?
3. **End-of-pilot form** (Google Form or plain email, 6 questions):
   1. How many open estimates did you follow up with WinBack? (number)
   2. Did any of them turn into a job? (yes/no + amount)
   3. How much time per week did it save? (none / <1h / 1–3h / 3h+)
   4. How often did you have to rewrite the AI draft? (rarely / sometimes / usually)
   5. How disappointed would you be if you could no longer use WinBack? (very / somewhat / not)
   6. What's the one thing that would make you pay for it?
4. **Severity rule:** anything that loses data, shows another business's
   data, or sends/claims to send a message the owner didn't approve → stop
   the pilot for everyone and fix first.
