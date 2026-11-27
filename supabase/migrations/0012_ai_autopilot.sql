-- WinBack — AI Autopilot foundation (execution engine + autonomy + memory)
--   [WinBack-Test build]  FOR REVIEW. Apply manually to WinBack-Test
--   (onydgglobiouuusdiuhu) ONLY, after PARTs 1-4 and 0011. The guard refuses to
--   run anywhere without the winback_test_marker schema, so it cannot execute
--   against Production.
--
-- Additive + idempotent. Adds:
--   business_ai_autonomy — per-business autonomy level + emergency stop + limits.
--     Default 'draft' (never silently upgraded). Owner-managed.
--   ai_tasks            — the persistent, idempotent task queue the background
--     worker drains (priority, backoff via run_after, attempts/max_attempts,
--     dead-lettering, stale-lock reclaim). Written by the SERVICE ROLE only;
--     members may read (dashboard). Idempotency: unique (business_id, dedupe_key).
--   business_knowledge  — verified business memory (FAQ / facts / policies /
--     instructions) the AI may cite. Owner-managed, approved-only.
-- Reuses public.is_business_member / is_business_owner / set_updated_at and the
-- existing ai_audit_log for execution history.

do $$
begin
  if to_regnamespace('winback_test_marker') is null then
    raise exception 'STOPPED: winback_test_marker schema not found. Apply only to WinBack-Test. Nothing was changed.';
  end if;
  if to_regproc('public.is_business_member') is null
     or to_regproc('public.is_business_owner') is null
     or to_regproc('public.set_updated_at') is null
     or to_regclass('public.businesses') is null then
    raise exception 'STOPPED: prerequisites (PARTs 1-3) are missing. Nothing was changed.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. business_ai_autonomy  (owner-managed; default DRAFT)
-- ---------------------------------------------------------------------------
create table if not exists public.business_ai_autonomy (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  level text not null default 'draft' check (level in ('off', 'assist', 'draft', 'autopilot')),
  emergency_stop boolean not null default false,
  daily_action_limit integer not null default 200 check (daily_action_limit >= 0),
  daily_spend_limit_usd numeric(10, 2) not null default 5.00 check (daily_spend_limit_usd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists business_ai_autonomy_set_updated_at on public.business_ai_autonomy;
create trigger business_ai_autonomy_set_updated_at
  before update on public.business_ai_autonomy
  for each row execute function public.set_updated_at();

revoke all on public.business_ai_autonomy from anon, authenticated;
grant select on public.business_ai_autonomy to authenticated;
grant insert (business_id, level, emergency_stop, daily_action_limit, daily_spend_limit_usd)
  on public.business_ai_autonomy to authenticated;
grant update (level, emergency_stop, daily_action_limit, daily_spend_limit_usd)
  on public.business_ai_autonomy to authenticated;

alter table public.business_ai_autonomy enable row level security;
drop policy if exists "baa_select_member" on public.business_ai_autonomy;
create policy "baa_select_member" on public.business_ai_autonomy for select
  to authenticated using (public.is_business_member(business_id));
drop policy if exists "baa_insert_owner" on public.business_ai_autonomy;
create policy "baa_insert_owner" on public.business_ai_autonomy for insert
  to authenticated with check (public.is_business_owner(business_id));
drop policy if exists "baa_update_owner" on public.business_ai_autonomy;
create policy "baa_update_owner" on public.business_ai_autonomy for update
  to authenticated using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- ---------------------------------------------------------------------------
-- 2. ai_tasks  (service-role-written queue; members read for the dashboard)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  type text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'dead')),
  priority integer not null default 50,
  run_after timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts >= 1),
  dedupe_key text not null,
  payload jsonb,
  last_error text,
  locked_at timestamptz,
  lead_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, dedupe_key)  -- idempotency / duplicate prevention
);

-- A linked lead must be in the same business; deleting it clears only lead_id.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_tasks'::regclass and conname = 'ai_tasks_business_lead_fkey'
  ) then
    alter table public.ai_tasks
      add constraint ai_tasks_business_lead_fkey
      foreign key (business_id, lead_id)
      references public.leads (business_id, id) on delete set null (lead_id);
  end if;
end
$$;

create index if not exists ai_tasks_runnable_idx
  on public.ai_tasks (status, run_after) where status in ('queued', 'running');
create index if not exists ai_tasks_business_idx on public.ai_tasks (business_id, created_at desc);

drop trigger if exists ai_tasks_set_updated_at on public.ai_tasks;
create trigger ai_tasks_set_updated_at
  before update on public.ai_tasks
  for each row execute function public.set_updated_at();

revoke all on public.ai_tasks from anon, authenticated;
-- Members may READ their business's queue (dashboard). The queue is written and
-- advanced exclusively by the SERVICE ROLE worker — users cannot enqueue, claim,
-- or mutate tasks, so they cannot inject or tamper with automated work.
grant select on public.ai_tasks to authenticated;

alter table public.ai_tasks enable row level security;
drop policy if exists "ai_tasks_select_member" on public.ai_tasks;
create policy "ai_tasks_select_member" on public.ai_tasks for select
  to authenticated using (public.is_business_member(business_id));

-- ---------------------------------------------------------------------------
-- 3. business_knowledge  (verified AI memory; owner-managed, approved-only)
-- ---------------------------------------------------------------------------
create table if not exists public.business_knowledge (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null default 'fact' check (kind in ('faq', 'fact', 'policy', 'instruction')),
  title text,
  content text not null check (char_length(btrim(content)) > 0),
  approved boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_knowledge_business_idx on public.business_knowledge (business_id, kind);

drop trigger if exists business_knowledge_set_updated_at on public.business_knowledge;
create trigger business_knowledge_set_updated_at
  before update on public.business_knowledge
  for each row execute function public.set_updated_at();

revoke all on public.business_knowledge from anon, authenticated;
grant select on public.business_knowledge to authenticated;
grant insert (business_id, kind, title, content, approved, created_by) on public.business_knowledge to authenticated;
grant update (kind, title, content, approved) on public.business_knowledge to authenticated;
grant delete on public.business_knowledge to authenticated;

alter table public.business_knowledge enable row level security;
drop policy if exists "bk_select_member" on public.business_knowledge;
create policy "bk_select_member" on public.business_knowledge for select
  to authenticated using (public.is_business_member(business_id));
drop policy if exists "bk_write_owner" on public.business_knowledge;
create policy "bk_write_owner" on public.business_knowledge for insert
  to authenticated with check (public.is_business_owner(business_id));
drop policy if exists "bk_update_owner" on public.business_knowledge;
create policy "bk_update_owner" on public.business_knowledge for update
  to authenticated using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));
drop policy if exists "bk_delete_owner" on public.business_knowledge;
create policy "bk_delete_owner" on public.business_knowledge for delete
  to authenticated using (public.is_business_owner(business_id));
