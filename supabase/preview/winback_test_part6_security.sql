-- WinBack-Test only: security hardening (0014) in one transaction. Refuses to run on production.
begin;
do $$ begin if to_regnamespace('winback_test_marker') is null then raise exception 'STOPPED: not WinBack-Test. Nothing was changed.'; end if; end $$;
-- WinBack — security hardening (AppSec audit, 2026-11-22)
--
-- Closes what the audit proved against a local copy of 0001–0013:
--   1. AI budget could be bypassed: limits counted ai_messages rows, which any
--      member could DELETE; failed calls were never counted; owners could set an
--      unlimited daily spend. → server-side ledger (ai_usage) that users can
--      neither write nor delete, enforced in one SECURITY DEFINER function with a
--      per-minute, per-business, per-owner and platform-wide daily cap.
--   2. ai_messages status / approval / sent stamps could be forged directly.
--      → integrity trigger (same model as business_email_replies).
--   3. ai_audit_log was member-INSERTable and lead_activity member-UPDATE/
--      DELETE-able. → audit trails are append-only, written by the server.
--   4. An owner could add ANY user to their business. → members may only be
--      added by themselves (no invite flow exists yet).
--   5. No length limits in the database (the forms checked, the API did not).
--   6. Public beta form: unlimited rows of unlimited size. → throttle + limits.
--   7. No rate limiting of our own for sign-in / sign-up / password reset.
--      → consume_rate_limit() + a security_events log for the server to use.
--
-- Safe to re-run. Changes no existing row. New CHECK constraints are added NOT
-- VALID, so they apply to every new write without rejecting old data.
-- Assumes 0001–0013. Tables from 0011+ are handled only when present.

-- ---------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------

-- Add a NOT VALID "length <= n" check when the table and column exist.
create or replace function pg_temp.add_len_check(p_table text, p_column text, p_max integer)
returns void language plpgsql as $$
declare v_name text := left(p_table || '_' || p_column || '_len', 63);
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = p_table and column_name = p_column) then
    return;
  end if;
  if exists (select 1 from pg_constraint where conname = v_name
             and conrelid = format('public.%I', p_table)::regclass) then
    return;
  end if;
  execute format('alter table public.%I add constraint %I check (%I is null or char_length(%I) <= %s) not valid',
                 p_table, v_name, p_column, p_column, p_max);
end
$$;

-- ---------------------------------------------------------------------------
-- 1. AI budget: usage ledger, platform limits, reserve/finish functions
-- ---------------------------------------------------------------------------

-- Platform-wide limits. One row. Only the service role / SQL Editor can change
-- it (no grants to anon/authenticated). Values are USD estimates.
create table if not exists public.platform_ai_limits (
  id boolean primary key default true check (id),
  platform_daily_usd numeric(10, 2) not null default 20.00 check (platform_daily_usd >= 0),
  owner_daily_usd numeric(10, 2) not null default 10.00 check (owner_daily_usd >= 0),
  business_daily_max_usd numeric(10, 2) not null default 5.00 check (business_daily_max_usd >= 0),
  business_calls_per_minute integer not null default 10 check (business_calls_per_minute >= 0),
  updated_at timestamptz not null default now()
);
insert into public.platform_ai_limits (id) values (true) on conflict (id) do nothing;
revoke all on public.platform_ai_limits from anon, authenticated;
alter table public.platform_ai_limits enable row level security;

-- One row per model call, written only by the functions below. business_id is
-- SET NULL on delete so deleting a business never erases spend (owner_id keeps
-- it counted against the owner's daily cap).
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete set null,
  owner_id uuid,
  user_id uuid,
  source text not null check (source in ('manual_followup', 'autopilot_followup', 'manual_reply', 'autopilot_reply')),
  model text not null,
  status text not null default 'reserved' check (status in ('reserved', 'ok', 'failed')),
  estimated_usd numeric(12, 6) not null,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12, 6),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ai_usage_business_created_idx on public.ai_usage (business_id, created_at desc);
create index if not exists ai_usage_owner_created_idx on public.ai_usage (owner_id, created_at desc);
create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);

revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;   -- members may see their spend
alter table public.ai_usage enable row level security;
drop policy if exists "ai_usage_select_member" on public.ai_usage;
create policy "ai_usage_select_member" on public.ai_usage for select
  to authenticated using (business_id is not null and public.is_business_member(business_id));
-- No insert/update/delete policy: only the SECURITY DEFINER functions write.

-- USD per million tokens (first-party list prices). Unknown model → refused.
create or replace function public.ai_model_price(p_model text, out input_per_mtok numeric, out output_per_mtok numeric)
language sql immutable set search_path = ''
as $$
  select v.i, v.o from (values
    ('claude-haiku-5-5', 0.10::numeric, 0.50::numeric),
    ('claude-sonnet-5-5', 2.00, 10.00),
    ('claude-opus-5-5', 4.00, 20.00)
  ) as v(m, i, o) where v.m = p_model;
$$;

-- Reserve budget for ONE model call. Raises 'AI_BUDGET:<reason>' (errcode
-- P0001) when any cap is reached. Callable by signed-in users (manual sources,
-- members of the business only) and by the service role (background jobs).
create or replace function public.ai_reserve_call(p_business_id uuid, p_source text, p_model text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_lim public.platform_ai_limits%rowtype;
  v_price record;
  v_estimate numeric;
  v_business_cap numeric;
  v_spent numeric;
  v_calls integer;
  v_id uuid;
  v_day timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
begin
  if v_uid is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'AI_BUDGET:not_allowed' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('manual_followup', 'autopilot_followup', 'manual_reply', 'autopilot_reply') then
    raise exception 'AI_BUDGET:bad_source' using errcode = '22023';
  end if;
  if v_uid is not null then
    -- A user may only spend for a business they belong to, and only manually.
    if p_source like 'autopilot_%' or not public.is_business_member(p_business_id) then
      raise exception 'AI_BUDGET:not_allowed' using errcode = '42501';
    end if;
  end if;

  select * into v_price from public.ai_model_price(p_model);
  if v_price.input_per_mtok is null then
    raise exception 'AI_BUDGET:unknown_model' using errcode = '22023';
  end if;
  -- Conservative per-call estimate: 3,000 input + 2,000 output tokens (thinking
  -- tokens count as output). finish_ai_call never records less than this.
  v_estimate := (3000 * v_price.input_per_mtok + 2000 * v_price.output_per_mtok) / 1000000;

  select owner_id into v_owner from public.businesses where id = p_business_id;
  if v_owner is null then
    raise exception 'AI_BUDGET:not_allowed' using errcode = '42501';
  end if;

  -- Serialize reservations so concurrent requests cannot all pass the check.
  perform pg_advisory_xact_lock(hashtext('winback_ai_budget'));

  select * into v_lim from public.platform_ai_limits where id;
  if not found then
    raise exception 'AI_BUDGET:platform_daily' using errcode = 'P0001';
  end if;

  select count(*) into v_calls from public.ai_usage
   where business_id = p_business_id and created_at > now() - interval '1 minute';
  if v_calls >= v_lim.business_calls_per_minute then
    raise exception 'AI_BUDGET:per_minute' using errcode = 'P0001';
  end if;

  -- The business's own setting, clamped to the platform maximum.
  v_business_cap := v_lim.business_daily_max_usd;
  if to_regclass('public.business_ai_autonomy') is not null then
    execute 'select least($1, coalesce((select daily_spend_limit_usd from public.business_ai_autonomy where business_id = $2), $1))'
      into v_business_cap using v_lim.business_daily_max_usd, p_business_id;
  end if;

  select coalesce(sum(coalesce(cost_usd, estimated_usd)), 0) into v_spent from public.ai_usage
   where business_id = p_business_id and created_at >= v_day;
  if v_spent + v_estimate > v_business_cap then
    raise exception 'AI_BUDGET:business_daily' using errcode = 'P0001';
  end if;

  select coalesce(sum(coalesce(cost_usd, estimated_usd)), 0) into v_spent from public.ai_usage
   where owner_id = v_owner and created_at >= v_day;
  if v_spent + v_estimate > v_lim.owner_daily_usd then
    raise exception 'AI_BUDGET:owner_daily' using errcode = 'P0001';
  end if;

  select coalesce(sum(coalesce(cost_usd, estimated_usd)), 0) into v_spent from public.ai_usage
   where created_at >= v_day;
  if v_spent + v_estimate > v_lim.platform_daily_usd then
    raise exception 'AI_BUDGET:platform_daily' using errcode = 'P0001';
  end if;

  insert into public.ai_usage (business_id, owner_id, user_id, source, model, estimated_usd)
  values (p_business_id, v_owner, v_uid, p_source, p_model, v_estimate)
  returning id into v_id;
  return v_id;
end;
$$;

-- Record the outcome of a reserved call. Cost is never below the estimate, so
-- calling this directly with zero tokens cannot free budget. Only the user who
-- reserved the call (or the service role) may finish it, once.
create or replace function public.ai_finish_call(p_id uuid, p_input_tokens integer, p_output_tokens integer, p_ok boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.ai_usage%rowtype;
  v_price record;
  v_actual numeric;
begin
  if v_uid is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'AI_BUDGET:not_allowed' using errcode = '42501';
  end if;
  select * into v_row from public.ai_usage where id = p_id and status = 'reserved' for update;
  if not found then return; end if;
  if v_uid is not null and v_row.user_id is distinct from v_uid then return; end if;

  select * into v_price from public.ai_model_price(v_row.model);
  v_actual := (greatest(coalesce(p_input_tokens, 0), 0) * v_price.input_per_mtok
             + greatest(coalesce(p_output_tokens, 0), 0) * v_price.output_per_mtok) / 1000000;

  update public.ai_usage
     set status = case when p_ok then 'ok' else 'failed' end,
         input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
         cost_usd = greatest(v_row.estimated_usd, v_actual),
         finished_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.ai_model_price(text) from public, anon;
revoke all on function public.ai_reserve_call(uuid, text, text) from public, anon;
revoke all on function public.ai_finish_call(uuid, integer, integer, boolean) from public, anon;
grant execute on function public.ai_model_price(text) to authenticated, service_role;
grant execute on function public.ai_reserve_call(uuid, text, text) to authenticated, service_role;
grant execute on function public.ai_finish_call(uuid, integer, integer, boolean) to authenticated, service_role;

-- Owner-set limits get a ceiling (the reserve function clamps anyway).
do $$
begin
  if to_regclass('public.business_ai_autonomy') is not null then
    if not exists (select 1 from pg_constraint where conname = 'business_ai_autonomy_spend_max') then
      alter table public.business_ai_autonomy
        add constraint business_ai_autonomy_spend_max check (daily_spend_limit_usd <= 100) not valid;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'business_ai_autonomy_actions_max') then
      alter table public.business_ai_autonomy
        add constraint business_ai_autonomy_actions_max check (daily_action_limit <= 5000) not valid;
    end if;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. ai_messages: no deletes by users; status/approval/sent stamps enforced
-- ---------------------------------------------------------------------------
drop policy if exists "ai_messages_delete_member" on public.ai_messages;
revoke delete on public.ai_messages from authenticated, anon;

create or replace function public.ai_messages_enforce_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_privileged boolean := current_user not in ('authenticated', 'anon');
begin
  if v_privileged then
    return new;  -- service role / cron: trusted backend
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'edited') then
      raise exception 'ai_messages: new rows must start as draft' using errcode = 'check_violation';
    end if;
    new.source := 'manual';
    new.followup_number := null;
    new.created_by := auth.uid();
    new.approved_at := null;
    new.approved_by := null;
    new.sent_at := null;
    return new;
  end if;

  -- UPDATE by a signed-in user.
  if old.status in ('sent', 'cancelled', 'discarded') then
    raise exception 'ai_messages: this message is closed and cannot change' using errcode = 'check_violation';
  end if;
  if new.business_id is distinct from old.business_id
     or new.lead_id is distinct from old.lead_id
     or new.source is distinct from old.source
     or new.followup_number is distinct from old.followup_number
     or new.ai_model is distinct from old.ai_model
     or new.prompt_inputs is distinct from old.prompt_inputs
     or new.discount_offered is distinct from old.discount_offered
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'ai_messages: only the text and status can be changed' using errcode = 'insufficient_privilege';
  end if;

  -- Editing the text of an approved message drops the approval.
  if new.message is distinct from old.message then
    if old.status = 'approved' or new.status in ('approved', 'sent') then
      new.status := 'edited';
    end if;
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    if old.status not in ('draft', 'edited') then
      raise exception 'ai_messages: only a draft can be approved' using errcode = 'check_violation';
    end if;
    new.approved_at := now();
    new.approved_by := auth.uid();
  elsif new.status = 'approved' then
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
  elsif new.status = 'sent' then
    if old.status <> 'approved' then
      raise exception 'ai_messages: only an approved message can be marked sent' using errcode = 'check_violation';
    end if;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    new.sent_at := now();
  else
    new.approved_at := null;
    new.approved_by := null;
  end if;
  if new.status <> 'sent' then
    new.sent_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists ai_messages_integrity on public.ai_messages;
create trigger ai_messages_integrity
  before insert or update on public.ai_messages
  for each row execute function public.ai_messages_enforce_integrity();

-- ---------------------------------------------------------------------------
-- 3. Audit trails are append-only and written by the server
-- ---------------------------------------------------------------------------
drop policy if exists "ai_audit_log_insert_member" on public.ai_audit_log;
revoke insert, update, delete on public.ai_audit_log from authenticated, anon;

drop policy if exists "lead_activity_update_member" on public.lead_activity;
drop policy if exists "lead_activity_delete_member" on public.lead_activity;
revoke update, delete on public.lead_activity from authenticated, anon;

-- A user's timeline entry is always attributed to that user.
create or replace function public.lead_activity_stamp_author()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists lead_activity_stamp_author on public.lead_activity;
create trigger lead_activity_stamp_author before insert on public.lead_activity
  for each row execute function public.lead_activity_stamp_author();

-- ---------------------------------------------------------------------------
-- 4. Memberships: nobody can be added to a business without their own action
-- ---------------------------------------------------------------------------
drop policy if exists "business_members_insert_owner" on public.business_members;
create policy "business_members_insert_owner"
  on public.business_members for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_business_owner(business_id));

-- Direct inserts into businesses skip create_business()'s limit of 25; the app
-- and the signup trigger both use SECURITY DEFINER functions, so users need no
-- direct INSERT at all.
do $$
begin
  if to_regprocedure('public.create_business(text,text,text,text,text,text,text,text,text,text)') is not null then
    drop policy if exists "businesses_insert_own" on public.businesses;
    revoke insert on public.businesses from authenticated, anon;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Length limits (match the forms, with some headroom)
-- ---------------------------------------------------------------------------
select pg_temp.add_len_check('profiles', 'full_name', 200);
select pg_temp.add_len_check('profiles', 'email', 320);
select pg_temp.add_len_check('businesses', 'name', 120);
select pg_temp.add_len_check('businesses', 'business_type', 80);
select pg_temp.add_len_check('businesses', 'custom_business_type', 120);
select pg_temp.add_len_check('businesses', 'phone', 40);
select pg_temp.add_len_check('businesses', 'email', 320);
select pg_temp.add_len_check('businesses', 'website', 300);
select pg_temp.add_len_check('businesses', 'country', 80);
select pg_temp.add_len_check('businesses', 'state', 80);
select pg_temp.add_len_check('businesses', 'city', 120);
select pg_temp.add_len_check('businesses', 'currency', 8);
select pg_temp.add_len_check('businesses', 'current_follow_up_method', 80);
select pg_temp.add_len_check('leads', 'customer_name', 120);
select pg_temp.add_len_check('leads', 'phone', 30);
select pg_temp.add_len_check('leads', 'service', 120);
select pg_temp.add_len_check('leads', 'email', 320);
select pg_temp.add_len_check('lead_notes', 'body', 5000);
select pg_temp.add_len_check('lead_activity', 'type', 80);
select pg_temp.add_len_check('business_ai_settings', 'business_hours', 200);
select pg_temp.add_len_check('business_ai_settings', 'additional_rules', 2000);
select pg_temp.add_len_check('business_knowledge', 'title', 120);
select pg_temp.add_len_check('business_knowledge', 'content', 600);
select pg_temp.add_len_check('ai_messages', 'message', 4000);
select pg_temp.add_len_check('business_email_replies', 'body', 8000);
select pg_temp.add_len_check('beta_signups', 'name', 200);
select pg_temp.add_len_check('beta_signups', 'business_name', 200);
select pg_temp.add_len_check('beta_signups', 'email', 320);
select pg_temp.add_len_check('beta_signups', 'business_type', 200);

-- ---------------------------------------------------------------------------
-- 6. Public beta form throttle
-- ---------------------------------------------------------------------------
create or replace function public.beta_signups_throttle()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- SECURITY DEFINER runs as the owner, so current_user is useless here; the
  -- request's JWT role says who is really calling (service role is exempt).
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return new; end if;
  -- Serialize so a burst cannot slip past the count.
  perform pg_advisory_xact_lock(hashtext('winback_beta_signups'));
  if (select count(*) from public.beta_signups where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Too many applications right now. Please try again in a few minutes.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.beta_signups
             where lower(email) = lower(new.email) and created_at > now() - interval '1 day') then
    raise exception 'We already have an application from this email.' using errcode = '23505';
  end if;
  return new;
end;
$$;
revoke all on function public.beta_signups_throttle() from public, anon, authenticated;
drop trigger if exists beta_signups_throttle on public.beta_signups;
create trigger beta_signups_throttle before insert on public.beta_signups
  for each row execute function public.beta_signups_throttle();

-- ---------------------------------------------------------------------------
-- 7. Rate limiting and security event log for the server
-- ---------------------------------------------------------------------------
-- Buckets are opaque HMACs the server computes (IP, email, action), so a
-- direct caller cannot target another person's bucket without the server key.
create table if not exists public.rate_limit_hits (
  bucket text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_hits_bucket_idx on public.rate_limit_hits (bucket, created_at desc);
revoke all on public.rate_limit_hits from anon, authenticated;
alter table public.rate_limit_hits enable row level security;

-- Returns true and records a hit when the bucket is under p_limit hits in the
-- last p_window_seconds; otherwise false (and records nothing).
create or replace function public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if p_bucket is null or p_bucket !~ '^[a-z_]{1,32}:[0-9a-f]{64}$' then
    raise exception 'bad bucket' using errcode = '22023';
  end if;
  if p_limit not between 1 and 1000 or p_window_seconds not between 1 and 86400 then
    raise exception 'bad limit' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_bucket));
  select count(*) into v_count from public.rate_limit_hits
   where bucket = p_bucket and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then
    return false;
  end if;
  insert into public.rate_limit_hits (bucket) values (p_bucket);
  -- Housekeeping: keep the table small.
  delete from public.rate_limit_hits
   where ctid in (select ctid from public.rate_limit_hits where created_at < now() - interval '1 day' limit 500);
  return true;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to anon, authenticated, service_role;

-- Security events: sign-ins (ok / failed / blocked), sign-ups, password
-- resets, AI budget blocks. Readable only from the SQL Editor / service role.
create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  event text not null,
  subject text,                -- HMAC of the email (never the address itself)
  ip_hash text,                -- HMAC of the IP
  user_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists security_events_created_idx on public.security_events (created_at desc);
create index if not exists security_events_subject_idx on public.security_events (subject, created_at desc);
revoke all on public.security_events from anon, authenticated;
alter table public.security_events enable row level security;

create or replace function public.log_security_event(p_event text, p_subject text, p_ip_hash text, p_detail jsonb default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_event not in ('sign_in_ok', 'sign_in_failed', 'sign_in_blocked', 'sign_up', 'sign_up_blocked',
                     'password_reset_requested', 'password_reset_blocked', 'password_changed',
                     'ai_budget_blocked', 'gmail_connected', 'gmail_disconnected') then
    raise exception 'bad event' using errcode = '22023';
  end if;
  if (p_subject is not null and p_subject !~ '^[0-9a-f]{64}$')
     or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$')
     or (p_detail is not null and length(p_detail::text) > 1000) then
    raise exception 'bad event data' using errcode = '22023';
  end if;
  -- Flood guard: a direct caller cannot fill the table.
  if (select count(*) from public.security_events where created_at > now() - interval '10 minutes') >= 5000 then
    return;
  end if;
  insert into public.security_events (event, subject, ip_hash, user_id, detail)
  values (p_event, p_subject, p_ip_hash, auth.uid(), p_detail);
end;
$$;
revoke all on function public.log_security_event(text, text, text, jsonb) from public;
grant execute on function public.log_security_event(text, text, text, jsonb) to anon, authenticated, service_role;

-- Suspicious activity in the last 24 hours, for the SQL Editor:
--   select * from public.security_alerts;
create or replace view public.security_alerts
with (security_invoker = true) as
  select 'many_failed_sign_ins'::text as alert, subject, ip_hash, count(*) as events,
         min(created_at) as first_seen, max(created_at) as last_seen
    from public.security_events
   where event in ('sign_in_failed', 'sign_in_blocked') and created_at > now() - interval '24 hours'
   group by subject, ip_hash having count(*) >= 5
  union all
  select 'ai_budget_blocked', null, null, count(*), min(created_at), max(created_at)
    from public.security_events
   where event = 'ai_budget_blocked' and created_at > now() - interval '24 hours'
  having count(*) > 0;
revoke all on public.security_alerts from anon, authenticated;
commit;
