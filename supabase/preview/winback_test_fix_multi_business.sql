-- WinBack-Test only: create the 6 missing multi-business objects (from 0011_multi_business.sql).
-- One transaction: any failed check rolls everything back. Inserts, updates and deletes no rows.
-- Touches no RLS policy, no Gmail table and no Gmail setting.
begin;

-- 1. Guard and prerequisites
do $$
declare t text;
begin
  if to_regnamespace('winback_test_marker') is null then
    raise exception 'STOPPED: winback_test_marker not found, this is not WinBack-Test. Nothing was changed.';
  end if;
  foreach t in array array['businesses','business_members','leads','business_ai_settings',
                           'lead_notes','lead_activity','ai_messages','ai_audit_log'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'STOPPED: table public.% is missing. Nothing was changed.', t;
    end if;
  end loop;
  foreach t in array array['lead_notes','lead_activity','ai_messages','ai_audit_log'] loop
    if (select count(*) from information_schema.columns where table_schema = 'public'
        and table_name = t and column_name in ('lead_id','business_id')) <> 2 then
      raise exception 'STOPPED: public.% lacks lead_id or business_id. Nothing was changed.', t;
    end if;
  end loop;
  if to_regproc('public.is_business_member') is null then
    raise exception 'STOPPED: public.is_business_member is missing. Nothing was changed.';
  end if;
  if not exists (select 1 from pg_index i where i.indisunique
      and i.indrelid = 'public.business_members'::regclass
      and (select array_agg(a.attname::text order by a.attname) from pg_attribute a
           where a.attrelid = i.indrelid and a.attnum = any(i.indkey)) = array['business_id','user_id']) then
    raise exception 'STOPPED: business_members has no unique (business_id, user_id). Nothing was changed.';
  end if;
  if not exists (select 1 from pg_index i where i.indisunique
      and i.indrelid = 'public.business_ai_settings'::regclass
      and (select array_agg(a.attname::text) from pg_attribute a
           where a.attrelid = i.indrelid and a.attnum = any(i.indkey)) = array['business_id']) then
    raise exception 'STOPPED: business_ai_settings has no unique business_id. Nothing was changed.';
  end if;
end
$$;

-- Snapshot of every RLS policy, to prove at the end that none changed.
create temp table _policies_before on commit drop as
  select schemaname, tablename, policyname, cmd, roles::text, qual, with_check from pg_policies;

-- 2. create_business(): creates a business, makes the CALLER its owner, adds default AI settings.
--    SECURITY DEFINER, but it only ever acts for auth.uid(); no owner or user id is accepted.
create or replace function public.create_business(
  p_name text, p_business_type text default null, p_custom_business_type text default null,
  p_phone text default null, p_email text default null, p_website text default null,
  p_country text default null, p_state text default null, p_city text default null,
  p_currency text default 'USD'
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_business_id uuid;
  v_owned integer;
begin
  if v_user is null then
    raise exception 'You need to be signed in to create a business.' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Business name is required.' using errcode = '22023';
  end if;
  if char_length(v_name) > 120 then
    raise exception 'Business name must be 120 characters or fewer.' using errcode = '22023';
  end if;
  select count(*) into v_owned from public.businesses where owner_id = v_user;
  if v_owned >= 25 then
    raise exception 'You already own the maximum number of businesses (25).' using errcode = '54000';
  end if;
  insert into public.businesses (name, owner_id) values (v_name, v_user) returning id into v_business_id;
  if exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'businesses' and column_name = 'business_type') then
    execute
      'update public.businesses set
         business_type = $2, custom_business_type = $3, phone = $4, email = $5,
         website = $6, country = $7, state = $8, city = $9,
         currency = coalesce($10, ''USD'')
       where id = $1'
    using v_business_id,
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
  values (v_business_id, v_user, 'owner') on conflict (business_id, user_id) do nothing;
  insert into public.business_ai_settings (business_id, ai_can_offer_discounts)
  values (v_business_id, false) on conflict (business_id) do nothing;
  return v_business_id;
end;
$$;

revoke all on function public.create_business(text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.create_business(text,text,text,text,text,text,text,text,text,text) to authenticated;

-- 3. ensure_lead_in_business(): rejects a row whose lead_id belongs to another business.
create or replace function public.ensure_lead_in_business()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.lead_id is null then return new; end if;
  if not exists (select 1 from public.leads l where l.id = new.lead_id and l.business_id = new.business_id) then
    raise exception 'That lead does not belong to this business.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_lead_in_business() from public, anon, authenticated;

-- 4. The 4 triggers. They check only rows inserted or changed from now on; existing rows are untouched.
drop trigger if exists lead_notes_lead_in_business on public.lead_notes;
create trigger lead_notes_lead_in_business before insert or update of lead_id, business_id
  on public.lead_notes for each row execute function public.ensure_lead_in_business();
drop trigger if exists lead_activity_lead_in_business on public.lead_activity;
create trigger lead_activity_lead_in_business before insert or update of lead_id, business_id
  on public.lead_activity for each row execute function public.ensure_lead_in_business();
drop trigger if exists ai_messages_lead_in_business on public.ai_messages;
create trigger ai_messages_lead_in_business before insert or update of lead_id, business_id
  on public.ai_messages for each row execute function public.ensure_lead_in_business();
drop trigger if exists ai_audit_log_lead_in_business on public.ai_audit_log;
create trigger ai_audit_log_lead_in_business before insert or update of lead_id, business_id
  on public.ai_audit_log for each row execute function public.ensure_lead_in_business();

-- 5. Self-check before commit. Any failure rolls back the whole patch.
do $$
declare v_cb regprocedure := 'public.create_business(text,text,text,text,text,text,text,text,text,text)';
begin
  if not has_function_privilege('authenticated', v_cb, 'execute') then
    raise exception 'CHECK FAILED: authenticated cannot call create_business. Rolled back.';
  end if;
  if has_function_privilege('anon', v_cb, 'execute') then
    raise exception 'CHECK FAILED: anon can call create_business. Rolled back.';
  end if;
  if has_function_privilege('anon', 'public.ensure_lead_in_business()', 'execute')
     or has_function_privilege('authenticated', 'public.ensure_lead_in_business()', 'execute') then
    raise exception 'CHECK FAILED: ensure_lead_in_business is callable by app users. Rolled back.';
  end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O'
      and tgfoid = 'public.ensure_lead_in_business()'::regprocedure) <> 4 then
    raise exception 'CHECK FAILED: expected 4 enabled lead_in_business triggers. Rolled back.';
  end if;
  if exists (
      (select schemaname, tablename, policyname, cmd, roles::text, qual, with_check from pg_policies
       except select * from _policies_before)
      union all
      (select * from _policies_before
       except select schemaname, tablename, policyname, cmd, roles::text, qual, with_check from pg_policies)) then
    raise exception 'CHECK FAILED: an RLS policy changed. Rolled back.';
  end if;
end
$$;

commit;

select 'create_business' as object, true as present where to_regproc('public.create_business') is not null
union all
select tgname, tgenabled = 'O' from pg_trigger where tgname like '%\_lead\_in\_business' and not tgisinternal;
