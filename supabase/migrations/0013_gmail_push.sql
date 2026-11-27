-- WinBack — Gmail real-time push + autonomous-send authorization  [WinBack-Test build]
--
-- FOR REVIEW. Apply manually to WinBack-Test (onydgglobiouuusdiuhu) ONLY, after
-- 0011 (business Gmail) and 0012 (AI autopilot). The guard refuses to run
-- anywhere without the winback_test_marker schema, so it cannot execute against
-- Production. A separate, un-guarded migration will be produced when Production
-- is in scope.
--
-- Additive + idempotent. Adds:
--   business_gmail_connections.watch_topic           — the Pub/Sub topic the
--     mailbox is watched on (audit/debug).
--   business_gmail_connections.watch_last_renewed_at — when the watch was last
--     (re)registered; the maintenance cron renews before the ~7-day expiry.
--   business_gmail_connections.last_synced_at        — when history/push last
--     reconciled this mailbox (Control Center health).
--   business_ai_autonomy.autopilot_send_authorized   — the owner's explicit
--     opt-in to AUTONOMOUS real sending. Required ON TOP OF autonomy level
--     'autopilot' AND the environment's WINBACK_GMAIL_ALLOW_SEND gate before the
--     AI may send a reply without human approval. Default FALSE (never silently
--     enabled). Owner-managed (reuses the existing owner-only RLS on the table).
--
-- The new connection columns are non-secret STATUS columns, selectable by
-- members (added to the existing column-level SELECT grant). Token columns are
-- untouched and remain server-only.

do $$
begin
  if to_regnamespace('winback_test_marker') is null then
    raise exception 'STOPPED: winback_test_marker schema not found. Apply only to WinBack-Test, after 0011 and 0012. Nothing was changed.';
  end if;
  if to_regclass('public.business_gmail_connections') is null then
    raise exception 'STOPPED: business_gmail_connections missing — apply 0011 first. Nothing was changed.';
  end if;
  if to_regclass('public.business_ai_autonomy') is null then
    raise exception 'STOPPED: business_ai_autonomy missing — apply 0012 first. Nothing was changed.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. business_gmail_connections — push watch bookkeeping (status columns)
-- ---------------------------------------------------------------------------
alter table public.business_gmail_connections
  add column if not exists watch_topic text,
  add column if not exists watch_last_renewed_at timestamptz,
  add column if not exists last_synced_at timestamptz;

-- Expose the new NON-SECRET status columns to members (additive column grant).
-- Token columns remain ungranted / server-only.
grant select (watch_topic, watch_last_renewed_at, last_synced_at)
  on public.business_gmail_connections to authenticated;

-- ---------------------------------------------------------------------------
-- 2. business_ai_autonomy — owner opt-in to autonomous sending (default FALSE)
-- ---------------------------------------------------------------------------
alter table public.business_ai_autonomy
  add column if not exists autopilot_send_authorized boolean not null default false;

-- Owner may set it (RLS on the table is already owner-only for insert/update).
grant insert (autopilot_send_authorized) on public.business_ai_autonomy to authenticated;
grant update (autopilot_send_authorized) on public.business_ai_autonomy to authenticated;
