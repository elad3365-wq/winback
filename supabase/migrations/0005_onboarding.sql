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
