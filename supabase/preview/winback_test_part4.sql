-- WinBack-Test setup, PART 4 of 4 (migrations 0010, 0011).
-- Run ONLY in WinBack-Test (onydgglobiouuusdiuhu). Run parts 1 to 4 in order.

do $$
begin
  if to_regnamespace('winback_test_marker') is null then
    raise exception 'STOPPED: run part 1 first, in WinBack-Test only. Nothing was changed.';
  end if;
end
$$;

-- ==== 0010_lead_notes_activity.sql ====

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

-- ==== 0011_multi_business.sql ====

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
