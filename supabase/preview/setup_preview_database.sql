-- WinBack — set up a SEPARATE test database for Preview, in one paste.
--
-- Run this ONLY in the new, empty Supabase project you created for Preview
-- testing. Never run it in the production project (ref yysmbjnspenslykzmlel);
-- production gets 0011 and 0012 on their own, and only after you approve them.
--
-- It is migrations 0001 to 0012 joined in order, unchanged. Generated from
-- supabase/migrations/*.sql; regenerate it if a migration changes. Already ran
-- the earlier 0001-0011 version? Then run only migrations/0012_gmail_integration.sql.

-- Safety stop: refuses to run in a database that already has WinBack tables,
-- such as production. The whole paste runs as one transaction, so if this
-- stops, nothing below it is applied.
do $$
begin
  if to_regclass('public.businesses') is not null then
    raise exception 'STOPPED: this database already has WinBack tables. Run this file only in the new, empty Preview test project. Nothing was changed.';
  end if;
end
$$;


-- ===========================================================================
-- 0001_schema.sql
-- ===========================================================================

-- WinBack Phase 1 — schema
-- Tables: profiles, businesses, business_members, leads
-- Run this first, then 0002_rls.sql, then 0003_triggers.sql.

create extension if not exists "pgcrypto";

-- Lead statuses used across the app.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type public.lead_status as enum (
      'new',
      'follow_up_needed',
      'contacted',
      'interested',
      'recovered',
      'lost'
    );
  end if;
end
$$;

-- One row per authenticated user.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One business per user for Phase 1, but modelled so a business can grow members later.
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists businesses_owner_id_idx on public.businesses (owner_id);

-- Join table deciding who can see which business's data.
create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists business_members_user_id_idx on public.business_members (user_id);
create index if not exists business_members_business_id_idx on public.business_members (business_id);

-- The customers who got an estimate and went quiet.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_name text not null check (char_length(btrim(customer_name)) > 0),
  phone text not null check (char_length(btrim(phone)) > 0),
  service text not null check (char_length(btrim(service)) > 0),
  estimate_amount numeric(12, 2) not null default 0 check (estimate_amount >= 0),
  status public.lead_status not null default 'new',
  follow_up_date date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_business_id_idx on public.leads (business_id);
create index if not exists leads_business_id_status_idx on public.leads (business_id, status);
create index if not exists leads_follow_up_date_idx on public.leads (business_id, follow_up_date);

-- Supabase grants these by default for new tables; stated explicitly so the
-- migration is self-contained. Row Level Security is what actually restricts
-- access (see 0002_rls.sql).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.businesses to authenticated;
grant select, insert, update, delete on public.business_members to authenticated;
grant select, insert, update, delete on public.leads to authenticated;

-- ===========================================================================
-- 0002_rls.sql
-- ===========================================================================

-- WinBack Phase 1 — Row Level Security
-- Every exposed table has RLS enabled and is scoped to the caller's business.

-- Membership check as SECURITY DEFINER so policies on business_members can call
-- it without recursing into their own policy.
create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
  );
$$;

create or replace function public.is_business_owner(p_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.businesses b
    where b.id = p_business_id
      and b.owner_id = auth.uid()
  );
$$;

revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.is_business_owner(uuid) from public;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.is_business_owner(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.leads enable row level security;

-- profiles: a user sees and edits only their own profile.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- businesses: visible to members, writable by the owner.
drop policy if exists "businesses_select_member" on public.businesses;
create policy "businesses_select_member"
  on public.businesses for select
  to authenticated
  using (public.is_business_member(id));

drop policy if exists "businesses_insert_own" on public.businesses;
create policy "businesses_insert_own"
  on public.businesses for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "businesses_update_owner" on public.businesses;
create policy "businesses_update_owner"
  on public.businesses for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "businesses_delete_owner" on public.businesses;
create policy "businesses_delete_owner"
  on public.businesses for delete
  to authenticated
  using (owner_id = auth.uid());

-- business_members: a member sees the roster of businesses they belong to;
-- only the business owner changes it.
drop policy if exists "business_members_select_member" on public.business_members;
create policy "business_members_select_member"
  on public.business_members for select
  to authenticated
  using (user_id = auth.uid() or public.is_business_member(business_id));

drop policy if exists "business_members_insert_owner" on public.business_members;
create policy "business_members_insert_owner"
  on public.business_members for insert
  to authenticated
  with check (public.is_business_owner(business_id));

drop policy if exists "business_members_update_owner" on public.business_members;
create policy "business_members_update_owner"
  on public.business_members for update
  to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

drop policy if exists "business_members_delete_owner" on public.business_members;
create policy "business_members_delete_owner"
  on public.business_members for delete
  to authenticated
  using (public.is_business_owner(business_id));

-- leads: the whole point — a user only ever touches their own business's leads.
drop policy if exists "leads_select_member" on public.leads;
create policy "leads_select_member"
  on public.leads for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "leads_insert_member" on public.leads;
create policy "leads_insert_member"
  on public.leads for insert
  to authenticated
  with check (public.is_business_member(business_id));

drop policy if exists "leads_update_member" on public.leads;
create policy "leads_update_member"
  on public.leads for update
  to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "leads_delete_member" on public.leads;
create policy "leads_delete_member"
  on public.leads for delete
  to authenticated
  using (public.is_business_member(business_id));

-- ===========================================================================
-- 0003_triggers.sql
-- ===========================================================================

-- WinBack Phase 1 — triggers
-- A new signup gets a profile, a business, and an owner membership in one step,
-- so every authenticated user maps to exactly one business.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_business_name text;
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;

  v_business_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'business_name', '')), '');

  if v_business_name is null then
    v_business_name := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
    if v_business_name is not null then
      v_business_name := v_business_name || '''s business';
    end if;
  end if;

  if v_business_name is null then
    v_business_name := 'My business';
  end if;

  insert into public.businesses (name, owner_id)
  values (v_business_name, new.id)
  returning id into v_business_id;

  insert into public.business_members (business_id, user_id, role)
  values (v_business_id, new.id, 'owner')
  on conflict (business_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- 0004_beta_signups.sql
-- ===========================================================================

-- WinBack — beta interest signups
-- Captures submissions from the public landing page's "Join the Beta" form.
-- Anonymous visitors may INSERT only; nobody can read rows through the anon or
-- authenticated roles (read them from the Supabase dashboard / service role).

create table if not exists public.beta_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  business_name text not null check (char_length(btrim(business_name)) > 0),
  email text not null check (position('@' in email) > 1),
  business_type text not null check (char_length(btrim(business_type)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists beta_signups_created_at_idx on public.beta_signups (created_at desc);

-- The landing page is public, so the anon role needs INSERT.
grant insert on public.beta_signups to anon, authenticated;

alter table public.beta_signups enable row level security;

-- Allow inserts from anyone hitting the public form, but never expose the rows
-- back to the anon/authenticated roles (no SELECT policy on purpose).
drop policy if exists "beta_signups_insert_public" on public.beta_signups;
create policy "beta_signups_insert_public"
  on public.beta_signups for insert
  to anon, authenticated
  with check (true);

-- ===========================================================================
-- 0005_onboarding.sql
-- ===========================================================================

-- WinBack — signup & business onboarding
-- Adds the onboarding flag, the extended business profile columns and the
-- per-business AI settings table. Safe to run on top of 0001–0004.

-- 1. profiles: track whether the owner finished onboarding.
alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

-- 2. businesses: the details collected during onboarding.
alter table public.businesses add column if not exists business_type text;
alter table public.businesses add column if not exists custom_business_type text;
alter table public.businesses add column if not exists phone text;
alter table public.businesses add column if not exists email text;
alter table public.businesses add column if not exists website text;
alter table public.businesses add column if not exists country text;
alter table public.businesses add column if not exists state text;
alter table public.businesses add column if not exists city text;
alter table public.businesses add column if not exists monthly_estimates integer
  check (monthly_estimates is null or monthly_estimates >= 0);
alter table public.businesses add column if not exists average_estimate_value numeric(12, 2)
  check (average_estimate_value is null or average_estimate_value >= 0);
alter table public.businesses add column if not exists currency text not null default 'USD';
alter table public.businesses add column if not exists employee_count integer
  check (employee_count is null or employee_count >= 0);
alter table public.businesses add column if not exists current_follow_up_method text;

-- 3. business_ai_settings: one row per business.
create table if not exists public.business_ai_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  financing_available boolean not null default false,
  payment_plans_available boolean not null default false,
  maximum_discount_percent integer not null default 0
    check (maximum_discount_percent between 0 and 5),
  ai_can_offer_discounts boolean not null default true,
  business_hours text,
  additional_rules text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists business_ai_settings_set_updated_at on public.business_ai_settings;
create trigger business_ai_settings_set_updated_at
  before update on public.business_ai_settings
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.business_ai_settings to authenticated;

-- 4. Row Level Security for the new table — scoped to the caller's business.
alter table public.business_ai_settings enable row level security;

drop policy if exists "business_ai_settings_select_member" on public.business_ai_settings;
create policy "business_ai_settings_select_member"
  on public.business_ai_settings for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "business_ai_settings_insert_member" on public.business_ai_settings;
create policy "business_ai_settings_insert_member"
  on public.business_ai_settings for insert
  to authenticated
  with check (public.is_business_member(business_id));

drop policy if exists "business_ai_settings_update_member" on public.business_ai_settings;
create policy "business_ai_settings_update_member"
  on public.business_ai_settings for update
  to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "business_ai_settings_delete_member" on public.business_ai_settings;
create policy "business_ai_settings_delete_member"
  on public.business_ai_settings for delete
  to authenticated
  using (public.is_business_member(business_id));

-- ===========================================================================
-- 0006_ai_messages.sql
-- ===========================================================================

-- WinBack — AI follow-up messages (generation + history)
-- Stores every AI-generated follow-up draft for a lead. Nothing here is sent:
-- these are drafts the owner reviews, edits and copies out by hand. Sending is
-- a later phase. Safe to run on top of 0001–0005.

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  -- What channel the draft is written for. Drafts only — no send happens yet.
  channel text not null default 'sms' check (channel in ('sms', 'email')),
  -- Lifecycle of a draft. Starts 'draft'; 'edited' once a human changes it,
  -- 'discarded' when thrown away. 'approved'/'sent' are reserved for the future
  -- sending phase and are never set by this feature.
  status text not null default 'draft'
    check (status in ('draft', 'edited', 'approved', 'sent', 'discarded')),
  content text not null check (char_length(btrim(content)) > 0),
  -- The model that produced it, and a snapshot of the exact inputs used, so a
  -- draft can be audited later (e.g. to confirm no discount was offered when
  -- the business had discounts turned off).
  model text,
  prompt_inputs jsonb,
  -- True only when the business allows discounts AND the draft references one.
  discount_offered boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Newest-first history for one lead, and the business-wide window the endpoint
-- counts for rate limiting.
create index if not exists ai_messages_lead_id_created_idx
  on public.ai_messages (lead_id, created_at desc);
create index if not exists ai_messages_business_id_created_idx
  on public.ai_messages (business_id, created_at desc);

drop trigger if exists ai_messages_set_updated_at on public.ai_messages;
create trigger ai_messages_set_updated_at
  before update on public.ai_messages
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.ai_messages to authenticated;

-- Row Level Security — a business only ever touches its own AI messages, using
-- the same membership check as every other table.
alter table public.ai_messages enable row level security;

drop policy if exists "ai_messages_select_member" on public.ai_messages;
create policy "ai_messages_select_member"
  on public.ai_messages for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "ai_messages_insert_member" on public.ai_messages;
create policy "ai_messages_insert_member"
  on public.ai_messages for insert
  to authenticated
  with check (public.is_business_member(business_id));

drop policy if exists "ai_messages_update_member" on public.ai_messages;
create policy "ai_messages_update_member"
  on public.ai_messages for update
  to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "ai_messages_delete_member" on public.ai_messages;
create policy "ai_messages_delete_member"
  on public.ai_messages for delete
  to authenticated
  using (public.is_business_member(business_id));

-- ===========================================================================
-- 0007_ai_message_approvals.sql
-- ===========================================================================

-- WinBack — AI follow-up approval workflow
-- Adds the audit columns for the draft -> approved -> sent lifecycle. The
-- status column and its allowed values already exist from 0006; this only adds
-- the timestamps and the approver. Sending is still disabled — sent_at stays
-- null until a later phase actually sends. Safe to run on top of 0001–0006.

alter table public.ai_messages
  add column if not exists approved_at timestamptz;

alter table public.ai_messages
  add column if not exists approved_by uuid references auth.users (id) on delete set null;

alter table public.ai_messages
  add column if not exists sent_at timestamptz;

-- ===========================================================================
-- 0008_lead_status_values.sql
-- ===========================================================================

-- WinBack — extend the lead_status enum for the autopilot follow-up lifecycle.
-- Adds the follow-up progression (followup_1..3, cold) and the interrupt states
-- (call_requested, paused, unsubscribed). Kept in its own migration because
-- ADD VALUE must not be used in the same transaction that references the value;
-- nothing here references them, so this is safe to apply on its own.
-- (interested, recovered, lost already exist from 0001.)

alter type public.lead_status add value if not exists 'followup_1';
alter type public.lead_status add value if not exists 'followup_2';
alter type public.lead_status add value if not exists 'followup_3';
alter type public.lead_status add value if not exists 'cold';
alter type public.lead_status add value if not exists 'call_requested';
alter type public.lead_status add value if not exists 'paused';
alter type public.lead_status add value if not exists 'unsubscribed';

-- ===========================================================================
-- 0009_autopilot_foundation.sql
-- ===========================================================================

-- WinBack — AI Autopilot foundation
-- Aligns ai_messages to the autopilot spec, adds the per-business autopilot
-- settings, the per-lead follow-up state, and an audit log. Sending is NOT
-- implemented: nothing here dispatches a message. Safe to run on top of
-- 0001–0008 (run 0008 first — it adds the lead_status values used below).

-- 1. ai_messages: rename to the spec's column names and add source tracking.
--    Renames are guarded so the migration is idempotent.
do $$
begin
  if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'ai_messages' and column_name = 'content'
      )
     and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'ai_messages' and column_name = 'message'
      ) then
    alter table public.ai_messages rename column content to message;
  end if;

  if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'ai_messages' and column_name = 'model'
      )
     and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'ai_messages' and column_name = 'ai_model'
      ) then
    alter table public.ai_messages rename column model to ai_model;
  end if;
end
$$;

-- Where the draft came from, and which follow-up in the sequence it is (null for
-- manual drafts). Used for autopilot idempotency and the audit trail.
alter table public.ai_messages
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'autopilot'));
alter table public.ai_messages
  add column if not exists followup_number integer;

-- Allow the spec's 'cancelled' status (keeps the earlier values for back-compat).
alter table public.ai_messages drop constraint if exists ai_messages_status_check;
alter table public.ai_messages
  add constraint ai_messages_status_check
  check (status in ('draft', 'edited', 'approved', 'sent', 'cancelled', 'discarded'));

create index if not exists ai_messages_lead_source_followup_idx
  on public.ai_messages (lead_id, source, followup_number);

-- 2. business_ai_settings: the autopilot configuration.
alter table public.business_ai_settings
  add column if not exists autopilot_enabled boolean not null default false,
  add column if not exists autopilot_mode text not null default 'manual'
    check (autopilot_mode in ('manual', 'assisted', 'full')),
  add column if not exists first_followup_delay_minutes integer not null default 60
    check (first_followup_delay_minutes >= 0),
  add column if not exists second_followup_delay_minutes integer not null default 1440
    check (second_followup_delay_minutes >= 0),
  add column if not exists third_followup_delay_minutes integer not null default 4320
    check (third_followup_delay_minutes >= 0),
  add column if not exists maximum_followups integer not null default 3
    check (maximum_followups between 0 and 10),
  add column if not exists approval_required_for_discounts boolean not null default true,
  add column if not exists approval_required_for_custom_answers boolean not null default true,
  add column if not exists tone text not null default 'professional'
    check (tone in ('professional', 'friendly', 'direct', 'premium'));

-- 3. leads: per-lead follow-up state.
alter table public.leads
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists follow_up_count integer not null default 0
    check (follow_up_count >= 0),
  add column if not exists last_follow_up_at timestamptz,
  add column if not exists autopilot_paused boolean not null default false,
  add column if not exists unsubscribe_status text not null default 'subscribed'
    check (unsubscribe_status in ('subscribed', 'unsubscribed'));

-- Due-scan index for the scheduler.
create index if not exists leads_next_follow_up_at_idx
  on public.leads (next_follow_up_at)
  where next_follow_up_at is not null;

-- 4. ai_audit_log: append-only trail of autopilot/AI actions.
create table if not exists public.ai_audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  ai_message_id uuid references public.ai_messages (id) on delete set null,
  event text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_audit_log_business_created_idx
  on public.ai_audit_log (business_id, created_at desc);

grant select, insert on public.ai_audit_log to authenticated;

alter table public.ai_audit_log enable row level security;

drop policy if exists "ai_audit_log_select_member" on public.ai_audit_log;
create policy "ai_audit_log_select_member"
  on public.ai_audit_log for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "ai_audit_log_insert_member" on public.ai_audit_log;
create policy "ai_audit_log_insert_member"
  on public.ai_audit_log for insert
  to authenticated
  with check (public.is_business_member(business_id));

-- ===========================================================================
-- 0010_lead_notes_activity.sql
-- ===========================================================================

-- WinBack — lead notes + activity timeline
--
-- Additive and idempotent. Adds two member-scoped tables used by the lead
-- detail page: lead_notes (free-text notes) and lead_activity (an append-only
-- timeline of status changes, scheduling, notes, and contacts). Does not touch
-- any existing table or data. RLS reuses public.is_business_member(uuid);
-- updated_at reuses public.set_updated_at(). Safe to run on top of 0001–0009.

-- ---------------------------------------------------------------------------
-- 1. lead_notes
-- ---------------------------------------------------------------------------
create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  body text not null check (char_length(btrim(body)) > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lead_notes_lead_id_idx on public.lead_notes (lead_id, created_at desc);
create index if not exists lead_notes_business_id_idx on public.lead_notes (business_id);

drop trigger if exists lead_notes_set_updated_at on public.lead_notes;
create trigger lead_notes_set_updated_at
  before update on public.lead_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. lead_activity (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.lead_activity (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  type text not null,
  metadata jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists lead_activity_lead_id_idx on public.lead_activity (lead_id, created_at desc);
create index if not exists lead_activity_business_id_idx on public.lead_activity (business_id);

-- ---------------------------------------------------------------------------
-- 3. Grants + Row Level Security (member-scoped, mirrors the leads policies).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.lead_notes to authenticated;
grant select, insert, update, delete on public.lead_activity to authenticated;

alter table public.lead_notes enable row level security;
alter table public.lead_activity enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['lead_notes', 'lead_activity']
  loop
    execute format('drop policy if exists "%s_select_member" on public.%I;', t, t);
    execute format(
      'create policy "%s_select_member" on public.%I for select to authenticated '
      'using (public.is_business_member(business_id));', t, t
    );

    execute format('drop policy if exists "%s_insert_member" on public.%I;', t, t);
    execute format(
      'create policy "%s_insert_member" on public.%I for insert to authenticated '
      'with check (public.is_business_member(business_id));', t, t
    );

    execute format('drop policy if exists "%s_update_member" on public.%I;', t, t);
    execute format(
      'create policy "%s_update_member" on public.%I for update to authenticated '
      'using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));', t, t
    );

    execute format('drop policy if exists "%s_delete_member" on public.%I;', t, t);
    execute format(
      'create policy "%s_delete_member" on public.%I for delete to authenticated '
      'using (public.is_business_member(business_id));', t, t
    );
  end loop;
end
$$;

-- ===========================================================================
-- 0011_multi_business.sql
-- ===========================================================================

-- WinBack — multi-business management
--
-- Lets one signed-in user own or belong to several businesses and switch
-- between them. Additive and idempotent: it creates one function and some
-- integrity triggers, and never updates or deletes an existing row. Safe to run
-- on top of 0001–0010; the parts that depend on tables from 0005/0006/0010
-- are skipped when those tables do not exist yet, so re-run this file after
-- running any of those later.
--
-- Isolation still comes from the existing RLS policies built on
-- public.is_business_member(uuid). Nothing here weakens them.

-- ---------------------------------------------------------------------------
-- 1. create_business(): one atomic call that creates a business, makes the
--    caller its owner member, and gives it its own default AI settings row.
--
--    Why a function: the businesses SELECT policy only shows a business to its
--    members, so a plain INSERT ... RETURNING from the app cannot read back the
--    row it just created (the membership does not exist yet), and two separate
--    inserts could leave an orphan business behind if the second one failed.
--
--    It is SECURITY DEFINER but can only ever act for auth.uid(): the owner and
--    the member are always the caller, never a value passed in.
-- ---------------------------------------------------------------------------
create or replace function public.create_business(
  p_name text,
  p_business_type text default null,
  p_custom_business_type text default null,
  p_phone text default null,
  p_email text default null,
  p_website text default null,
  p_country text default null,
  p_state text default null,
  p_city text default null,
  p_currency text default 'USD'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_business_id uuid;
  v_owned integer;
begin
  if v_user is null then
    raise exception 'You need to be signed in to create a business.'
      using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'Business name is required.' using errcode = '22023';
  end if;

  if char_length(v_name) > 120 then
    raise exception 'Business name must be 120 characters or fewer.' using errcode = '22023';
  end if;

  -- A ceiling, so a runaway client cannot create businesses without limit.
  select count(*) into v_owned from public.businesses where owner_id = v_user;
  if v_owned >= 25 then
    raise exception 'You already own the maximum number of businesses (25).'
      using errcode = '54000';
  end if;

  insert into public.businesses (name, owner_id)
  values (v_name, v_user)
  returning id into v_business_id;

  -- The profile columns arrive in 0005. Set them only when they exist so this
  -- function still works on a database that has not run 0005.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'business_type'
  ) then
    execute
      'update public.businesses set
         business_type = $2, custom_business_type = $3, phone = $4, email = $5,
         website = $6, country = $7, state = $8, city = $9,
         currency = coalesce($10, ''USD'')
       where id = $1'
    using
      v_business_id,
      nullif(btrim(coalesce(p_business_type, '')), ''),
      nullif(btrim(coalesce(p_custom_business_type, '')), ''),
      nullif(btrim(coalesce(p_phone, '')), ''),
      nullif(btrim(coalesce(p_email, '')), ''),
      nullif(btrim(coalesce(p_website, '')), ''),
      nullif(btrim(coalesce(p_country, '')), ''),
      nullif(btrim(coalesce(p_state, '')), ''),
      nullif(btrim(coalesce(p_city, '')), ''),
      nullif(btrim(coalesce(p_currency, '')), '');
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (v_business_id, v_user, 'owner')
  on conflict (business_id, user_id) do nothing;

  -- Each business starts with its own AI settings at the safest defaults
  -- (no discounts, no financing, autopilot off).
  if to_regclass('public.business_ai_settings') is not null then
    execute
      'insert into public.business_ai_settings (business_id, ai_can_offer_discounts)
       values ($1, false)
       on conflict (business_id) do nothing'
    using v_business_id;
  end if;

  return v_business_id;
end;
$$;

revoke all on function public.create_business(text, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.create_business(text, text, text, text, text, text, text, text, text, text) from anon;
grant execute on function public.create_business(text, text, text, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Cross-business integrity for rows that point at a lead.
--
--    The member policies on lead_notes, lead_activity, ai_messages and
--    ai_audit_log check only business_id. A user who belongs to business A
--    could otherwise write a row with business_id = A that names a lead_id from
--    business B. They still could not read B's data, but B's lead would then
--    carry rows that belong to A. This trigger rejects any row whose lead does
--    not belong to the same business. It runs as definer so it can see the
--    lead's real business even when RLS hides that lead from the caller.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_lead_in_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_id is null then
    return new;
  end if;

  if not exists (
    select 1 from public.leads l
    where l.id = new.lead_id and l.business_id = new.business_id
  ) then
    raise exception 'That lead does not belong to this business.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.ensure_lead_in_business() from public;

do $$
declare
  t text;
begin
  foreach t in array array['lead_notes', 'lead_activity', 'ai_messages', 'ai_audit_log']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I;', t || '_lead_in_business', t);
      execute format(
        'create trigger %I before insert or update of lead_id, business_id on public.%I '
        'for each row execute function public.ensure_lead_in_business();',
        t || '_lead_in_business', t
      );
    end if;
  end loop;
end
$$;


-- ===========================================================================
-- 0012_gmail_integration.sql
-- ===========================================================================

-- WinBack — per-business Gmail integration
--
-- Each business can connect its own Gmail inbox. Incoming customer emails are
-- copied in, matched to that business's leads by sender address, and get an AI
-- reply DRAFT. Nothing is ever sent automatically: a draft leaves WinBack only
-- when a member of the business clicks "Approve and send" on that one draft,
-- and only when the server has GMAIL_SENDING_ENABLED=true.
--
-- Additive and idempotent. It adds one nullable column to leads (email) and new
-- tables; it never updates or deletes an existing row and changes no existing
-- policy. Run after 0011_multi_business.sql.
--
-- Access model:
--   * Members of a business can READ its connection status, messages and
--     drafts (RLS on public.is_business_member, like every other table).
--   * Nobody signed in can WRITE these tables directly. Every write goes
--     through WinBack's server, which checks membership first and then writes
--     with the service-role key. So the browser can never mark a draft "sent",
--     attach a draft to another business, or plant a fake connection.
--   * OAuth tokens live in gmail_connection_secrets, encrypted by the server
--     (AES-256-GCM) before they get here. That table has no grants and no
--     policies for anon or authenticated: only the service role can touch it.

-- ---------------------------------------------------------------------------
-- 1. Leads get an optional email address, used to match incoming mail.
-- ---------------------------------------------------------------------------
alter table public.leads add column if not exists email text;

alter table public.leads drop constraint if exists leads_email_format;
alter table public.leads
  add constraint leads_email_format
  check (email is null or (char_length(email) <= 320 and position('@' in email) > 1));

create index if not exists leads_business_email_idx
  on public.leads (business_id, lower(email))
  where email is not null;

-- ---------------------------------------------------------------------------
-- 2. One Gmail connection per business (status only, no secrets).
-- ---------------------------------------------------------------------------
create table if not exists public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  email_address text not null,
  status text not null default 'connected'
    check (status in ('connected', 'needs_reconnect', 'disconnected')),
  scopes text,
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists gmail_connections_set_updated_at on public.gmail_connections;
create trigger gmail_connections_set_updated_at
  before update on public.gmail_connections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Encrypted OAuth refresh tokens. Service role only.
-- ---------------------------------------------------------------------------
create table if not exists public.gmail_connection_secrets (
  connection_id uuid primary key references public.gmail_connections (id) on delete cascade,
  -- The business is repeated here so a secret can never be read back for the
  -- wrong business by a join mistake in server code.
  business_id uuid not null references public.businesses (id) on delete cascade,
  refresh_token_encrypted text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Emails copied in from (and sent out through) the business's inbox.
-- ---------------------------------------------------------------------------
create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  connection_id uuid not null references public.gmail_connections (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  gmail_message_id text not null,
  gmail_thread_id text not null,
  -- The RFC 5322 Message-ID header, for In-Reply-To/References on replies.
  rfc822_message_id text,
  from_address text not null,
  from_name text,
  to_address text,
  subject text,
  snippet text,
  body_text text,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (connection_id, gmail_message_id)
);

create index if not exists email_messages_business_received_idx
  on public.email_messages (business_id, received_at desc);
create index if not exists email_messages_lead_idx
  on public.email_messages (lead_id, received_at desc)
  where lead_id is not null;

-- ---------------------------------------------------------------------------
-- 5. AI reply drafts. 'sending' is a short claim so a double click cannot send
--    twice; 'failed' keeps the error and can be retried by a person.
-- ---------------------------------------------------------------------------
create table if not exists public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email_message_id uuid not null references public.email_messages (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  to_address text not null,
  subject text not null,
  body text not null check (char_length(btrim(body)) > 0),
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'sent', 'failed', 'discarded')),
  ai_model text,
  discount_offered boolean not null default false,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  sent_gmail_message_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one open draft per incoming email, so repeated syncs never pile up.
create unique index if not exists email_drafts_one_open_per_message
  on public.email_drafts (email_message_id)
  where status in ('draft', 'sending', 'failed');

create index if not exists email_drafts_business_created_idx
  on public.email_drafts (business_id, created_at desc);

drop trigger if exists email_drafts_set_updated_at on public.email_drafts;
create trigger email_drafts_set_updated_at
  before update on public.email_drafts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Cross-business integrity. Every row must point only at its own
--    business's connection, message and lead, even when written by the server.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_email_rows_in_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'gmail_connection_secrets' then
    if not exists (
      select 1 from public.gmail_connections c
      where c.id = new.connection_id and c.business_id = new.business_id
    ) then
      raise exception 'That Gmail connection does not belong to this business.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'email_messages' then
    if not exists (
      select 1 from public.gmail_connections c
      where c.id = new.connection_id and c.business_id = new.business_id
    ) then
      raise exception 'That Gmail connection does not belong to this business.' using errcode = '42501';
    end if;
  end if;

  if tg_table_name = 'email_drafts' then
    if not exists (
      select 1 from public.email_messages m
      where m.id = new.email_message_id and m.business_id = new.business_id
    ) then
      raise exception 'That email does not belong to this business.' using errcode = '42501';
    end if;
  end if;

  if new.lead_id is not null and not exists (
    select 1 from public.leads l
    where l.id = new.lead_id and l.business_id = new.business_id
  ) then
    raise exception 'That lead does not belong to this business.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.ensure_email_rows_in_business() from public;

drop trigger if exists gmail_connection_secrets_in_business on public.gmail_connection_secrets;
create trigger gmail_connection_secrets_in_business
  before insert or update on public.gmail_connection_secrets
  for each row execute function public.ensure_email_rows_in_business();

drop trigger if exists email_messages_in_business on public.email_messages;
create trigger email_messages_in_business
  before insert or update on public.email_messages
  for each row execute function public.ensure_email_rows_in_business();

drop trigger if exists email_drafts_in_business on public.email_drafts;
create trigger email_drafts_in_business
  before insert or update on public.email_drafts
  for each row execute function public.ensure_email_rows_in_business();

-- ---------------------------------------------------------------------------
-- 7. Grants and Row Level Security.
-- ---------------------------------------------------------------------------
revoke all on public.gmail_connections from anon, authenticated;
revoke all on public.gmail_connection_secrets from anon, authenticated;
revoke all on public.email_messages from anon, authenticated;
revoke all on public.email_drafts from anon, authenticated;

grant select on public.gmail_connections to authenticated;
grant select on public.email_messages to authenticated;
grant select on public.email_drafts to authenticated;

alter table public.gmail_connections enable row level security;
alter table public.gmail_connection_secrets enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_drafts enable row level security;

drop policy if exists "gmail_connections_select_member" on public.gmail_connections;
create policy "gmail_connections_select_member"
  on public.gmail_connections for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "email_messages_select_member" on public.email_messages;
create policy "email_messages_select_member"
  on public.email_messages for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "email_drafts_select_member" on public.email_drafts;
create policy "email_drafts_select_member"
  on public.email_drafts for select
  to authenticated
  using (public.is_business_member(business_id));

-- gmail_connection_secrets: RLS on, no policies, no grants. Deliberately empty.
