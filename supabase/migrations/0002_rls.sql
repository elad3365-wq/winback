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
