-- WinBack-Test setup, PART 1 of 4 (migrations 0001, 0002, 0003).
-- Run ONLY in WinBack-Test (onydgglobiouuusdiuhu). Run parts 1 to 4 in order.

do $$
begin
  if to_regclass('public.businesses') is not null then
    raise exception 'STOPPED: this database already has WinBack tables. Nothing was changed.';
  end if;
end
$$;

-- Marks this database as the test copy, so parts 2-4 refuse to run anywhere else.
create schema if not exists winback_test_marker;

-- ==== 0001_schema.sql ====

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

-- ==== 0002_rls.sql ====

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

-- ==== 0003_triggers.sql ====

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
