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
