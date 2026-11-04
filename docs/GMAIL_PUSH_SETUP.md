# Gmail real-time automation (Pub/Sub push) — setup

This turns the per-business Gmail inbox into a **24/7, event-driven** loop:
a customer email arrives → Google Cloud Pub/Sub notifies WinBack within seconds →
the AI analyzes it with CRM + approved business knowledge → it updates the CRM,
pauses/relieves follow-ups, and drafts a reply → at AUTOPILOT (with sending
authorized) it sends the reply in the original thread; otherwise it waits for the
owner's approval. Target: **30–60s** for a routine email.

Everything is **reuse** of the existing Gmail OAuth, crypto, and AI orchestration
— push is an *addition*, not a rebuild. Without push configured, the system still
works via the daily maintenance cron (reconciliation); push just makes it real-time.

---

## 1. What runs where

| Piece | Where | Notes |
| --- | --- | --- |
| `users.watch` registration + 7-day renewal | `src/lib/gmail/watch.ts`; daily `/api/cron/gmail-maintenance` | Watch lasts ~7 days; renewed daily, well before expiry. |
| Authenticated webhook | `POST /api/gmail/push?token=…` | Verifies a shared secret (constant-time), then pulls new mail. |
| Reliable new-mail retrieval | `src/lib/gmail/history.ts` (Gmail History API) | Incremental from a stored cursor; auto-reseeds if the cursor expires. |
| Immediate processing | push handler calls `drainQueue` inline | No waiting for the daily cron. |
| Fallback reconciliation | daily `/api/cron/gmail-maintenance` | Catches any dropped Pub/Sub notification. |
| Autonomous send decision | `src/lib/gmail/autosend.ts` (pure, unit-tested) | Fail-closed; sensitive/uncertain → human. |

Vercel **Hobby** allows 2 cron jobs; we use exactly 2: daily follow-ups and daily
Gmail maintenance (watch renewal + reconciliation + queue drain).

## 2. Environment variables (Vercel → Preview scope)

Already required (unchanged): `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`,
`GOOGLE_GMAIL_REDIRECT_URI`, `GMAIL_TOKEN_ENCRYPTION_KEY`, `WINBACK_GMAIL_ENABLED=true`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**New for push (both required to enable real-time):**

| Name | Value |
| --- | --- |
| `GMAIL_PUBSUB_TOPIC` | Full topic name, e.g. `projects/<gcp-project>/topics/winback-gmail-push` |
| `GMAIL_PUSH_TOKEN` | A long random secret (e.g. `openssl rand -hex 32`). Also appended to the push endpoint URL. |

**Keep OFF for the pilot:** `WINBACK_GMAIL_ALLOW_SEND` — leave it **unset**. While unset,
the AI only ever drafts; nothing is sent, even at AUTOPILOT. Turn it on (`true`) only
when you explicitly authorize real sending.

## 3. Google Cloud (one-time; reuse the existing project that owns the OAuth client)

1. **Enable APIs** (same GCP project as the Gmail OAuth client): *Gmail API* and *Cloud Pub/Sub API*.
2. **Create a topic**: Pub/Sub → Topics → Create → id `winback-gmail-push`.
3. **Let Gmail publish to it**: on the topic → Permissions → *Add principal* →
   `gmail-api-push@system.gserviceaccount.com` → role **Pub/Sub Publisher** → Save.
   (This fixed service account is how Gmail publishes watch notifications.)
4. **Create a push subscription** on that topic:
   - Delivery type: **Push**
   - Endpoint URL: `https://<your-preview-domain>/api/gmail/push?token=<GMAIL_PUSH_TOKEN>`
     (use the exact same secret you put in the Vercel env var).
   - Acknowledgement deadline: ~60s. Leave OIDC auth off (the `?token=` secret is the auth).
5. Put `GMAIL_PUBSUB_TOPIC` and `GMAIL_PUSH_TOKEN` into Vercel (Preview), then redeploy.
6. **Start watching**: disconnect + reconnect the mailbox once (Settings → Email). The
   callback registers the watch automatically; the daily cron renews it from then on.

No change to OAuth scopes (still `gmail.readonly` + `gmail.send`) and no new OAuth
client — the existing one is reused. The only OAuth requirement remains that the
Preview callback `https://<preview-domain>/api/gmail/callback` is an Authorized redirect URI.

## 4. Safety model (unchanged guarantees, extended)

- **No real email leaves** unless `WINBACK_GMAIL_ALLOW_SEND=true` **and** the business is
  at AUTOPILOT **and** the owner toggled *Authorize auto-send* in the Control Center.
- **Sensitive** inbound (refund, legal, complaint, dispute, cancellation…) and **uncertain**
  drafts (the AI punts to "a team member will follow up") are **never** auto-sent — they go to
  the owner.
- **Loop/spam prevention**: our own sent/draft mail is never ingested; no-reply / mailer-daemon
  senders are never auto-answered; one active draft per message (idempotent); per-business daily
  action + AI-spend caps; global **emergency stop** halts everything instantly.
- The webhook is authenticated (shared secret, constant-time compare); all data access is
  service-role and scoped by `business_id`; tokens stay server-only and encrypted.

---

## רשימת הפעלה בעברית (Preview + WinBack-Test + Google Cloud)

כל השלבים ל-Preview בלבד. אל תיגעו ב-Production. השליחה האמיתית נשארת כבויה.

**Supabase (WinBack-Test):**
1. הריצו ב-SQL Editor את `supabase/migrations/0013_gmail_push.sql` (רק אחרי 0011 ו-0012).
2. לאימות בלבד: הריצו `supabase/migrations/0013_gmail_push_tests.sql` — הכול רץ ומתגלגל אחורה (rollback), לא כותב כלום. אמור להופיע `PASS`.

**Google Cloud (באותו פרויקט של ה-OAuth הקיים — לא יוצרים חדש):**
3. הפעילו את ה-APIs: *Gmail API* ו-*Cloud Pub/Sub API*.
4. צרו Topic בשם `winback-gmail-push`.
5. ב-Topic → Permissions → הוסיפו את `gmail-api-push@system.gserviceaccount.com` עם תפקיד **Pub/Sub Publisher**.
6. צרו Subscription מסוג **Push** עם כתובת: `https://<כתובת-ה-Preview>/api/gmail/push?token=<הסוד>`.

**Vercel (Preview):**
7. הוסיפו שני משתנים: `GMAIL_PUBSUB_TOPIC` (שם ה-Topic המלא) ו-`GMAIL_PUSH_TOKEN` (אותו סוד מהכתובת).
8. ודאו ש-`WINBACK_GMAIL_ALLOW_SEND` **לא** מוגדר (כדי שלא יישלחו מיילים אמיתיים).
9. עשו Redeploy.

**הפעלה:**
10. בהגדרות → Email: נתקו וחברו מחדש את תיבת ה-Gmail (זה רושם את ה-watch אוטומטית).
11. שלחו מייל בדיקה לתיבה המחוברת. תוך 30–60 שניות אמורים לראות ב-AI Control Center: הודעה נכנסת, עדכון CRM, וטיוטת תשובה הממתינה לאישור.
12. שליחה אוטומטית אמיתית — רק כשתחליטו: הגדירו רמת Autopilot, לחצו "Authorize auto-send", והפעילו `WINBACK_GMAIL_ALLOW_SEND=true`.
