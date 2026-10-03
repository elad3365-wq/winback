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
