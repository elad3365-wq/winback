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
