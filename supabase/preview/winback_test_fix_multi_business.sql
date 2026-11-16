-- WinBack-Test fix: adds only the missing multi-business pieces (migration 0011_multi_business).
-- Adds 2 functions and 4 triggers. Never updates or deletes a row. Safe to run twice.
-- Refuses to run anywhere except WinBack-Test.
do $$
begin
  if to_regnamespace('winback_test_marker') is null then
    raise exception 'STOPPED: this is not WinBack-Test. Nothing was changed.';
  end if;
  if to_regclass('public.businesses') is null or to_regclass('public.business_members') is null
     or to_regclass('public.leads') is null or to_regproc('public.is_business_member') is null then
    raise exception 'STOPPED: core tables or helpers are missing. Nothing was changed.';
  end if;
end
$$;

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

  select count(*) into v_owned from public.businesses where owner_id = v_user;
  if v_owned >= 25 then
    raise exception 'You already own the maximum number of businesses (25).'
      using errcode = '54000';
  end if;

  insert into public.businesses (name, owner_id)
  values (v_name, v_user)
  returning id into v_business_id;

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

select 'create_business' as object, to_regproc('public.create_business') is not null as present
union all
select tgname, true from pg_trigger where tgname like '%\_lead\_in\_business' and not tgisinternal;
