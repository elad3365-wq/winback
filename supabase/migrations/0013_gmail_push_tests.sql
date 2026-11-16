-- WinBack — ROLLBACK-ONLY verification for 0013 (Gmail push + autonomous send).
--
-- Safe to run against WinBack-Test AFTER 0013. Everything runs inside a single
-- transaction that ALWAYS rolls back, so it writes nothing permanent. It asserts
-- the new columns, their defaults, and the member/owner grants. Any failed
-- assertion raises and aborts; reaching the final notice means all passed.

begin;

do $$
begin
  -- 1. New connection status columns exist.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'business_gmail_connections' and column_name = 'watch_topic'
  ) then raise exception 'FAIL 1a: business_gmail_connections.watch_topic missing'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'business_gmail_connections' and column_name = 'watch_last_renewed_at'
  ) then raise exception 'FAIL 1b: business_gmail_connections.watch_last_renewed_at missing'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'business_gmail_connections' and column_name = 'last_synced_at'
  ) then raise exception 'FAIL 1c: business_gmail_connections.last_synced_at missing'; end if;

  -- 2. Autonomous-send opt-in exists, NOT NULL, defaults FALSE.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'business_ai_autonomy'
      and column_name = 'autopilot_send_authorized'
      and is_nullable = 'NO'
      and column_default = 'false'
  ) then raise exception 'FAIL 2: autopilot_send_authorized must be NOT NULL DEFAULT false'; end if;

  -- 3. Members may read the new connection status columns...
  if not has_column_privilege('authenticated', 'public.business_gmail_connections', 'watch_topic', 'SELECT') then
    raise exception 'FAIL 3a: authenticated should SELECT watch_topic';
  end if;
  if not has_column_privilege('authenticated', 'public.business_gmail_connections', 'last_synced_at', 'SELECT') then
    raise exception 'FAIL 3b: authenticated should SELECT last_synced_at';
  end if;
  -- ...but still NOT the secret token columns (server-only).
  if has_column_privilege('authenticated', 'public.business_gmail_connections', 'access_token_encrypted', 'SELECT') then
    raise exception 'FAIL 3c: authenticated must NOT SELECT access_token_encrypted';
  end if;

  -- 4. Owner (authenticated, gated further by RLS) may write the opt-in column.
  if not has_column_privilege('authenticated', 'public.business_ai_autonomy', 'autopilot_send_authorized', 'UPDATE') then
    raise exception 'FAIL 4a: authenticated should UPDATE autopilot_send_authorized';
  end if;
  if not has_column_privilege('authenticated', 'public.business_ai_autonomy', 'autopilot_send_authorized', 'INSERT') then
    raise exception 'FAIL 4b: authenticated should INSERT autopilot_send_authorized';
  end if;

  raise notice 'PASS: all 0013 assertions succeeded (rolled back, nothing written).';
end
$$;

rollback;
