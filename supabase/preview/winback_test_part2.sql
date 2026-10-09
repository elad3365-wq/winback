-- WinBack-Test setup, PART 2 of 4 (migrations 0004, 0005, 0006).
-- Run ONLY in WinBack-Test (onydgglobiouuusdiuhu). Run parts 1 to 4 in order.

do $$
begin
  if to_regnamespace('winback_test_marker') is null then
    raise exception 'STOPPED: run part 1 first, in WinBack-Test only. Nothing was changed.';
  end if;
end
$$;

-- ==== 0004_beta_signups.sql ====

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

-- ==== 0005_onboarding.sql ====

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

-- ==== 0006_ai_messages.sql ====

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
