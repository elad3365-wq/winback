-- WinBack — AI Autopilot foundation
-- Aligns ai_messages to the autopilot spec, adds the per-business autopilot
-- settings, the per-lead follow-up state, and an audit log. Sending is NOT
-- implemented: nothing here dispatches a message. Safe to run on top of
-- 0001–0008 (run 0008 first — it adds the lead_status values used below).

-- 1. ai_messages: rename to the spec's column names and add source tracking.
--    Renames are guarded so the migration is idempotent.
do $$
begin
  if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'ai_messages' and column_name = 'content'
      )
     and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'ai_messages' and column_name = 'message'
      ) then
    alter table public.ai_messages rename column content to message;
  end if;

  if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'ai_messages' and column_name = 'model'
      )
     and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'ai_messages' and column_name = 'ai_model'
      ) then
    alter table public.ai_messages rename column model to ai_model;
  end if;
end
$$;

-- Where the draft came from, and which follow-up in the sequence it is (null for
-- manual drafts). Used for autopilot idempotency and the audit trail.
alter table public.ai_messages
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'autopilot'));
alter table public.ai_messages
  add column if not exists followup_number integer;

-- Allow the spec's 'cancelled' status (keeps the earlier values for back-compat).
alter table public.ai_messages drop constraint if exists ai_messages_status_check;
alter table public.ai_messages
  add constraint ai_messages_status_check
  check (status in ('draft', 'edited', 'approved', 'sent', 'cancelled', 'discarded'));

create index if not exists ai_messages_lead_source_followup_idx
  on public.ai_messages (lead_id, source, followup_number);

-- 2. business_ai_settings: the autopilot configuration.
alter table public.business_ai_settings
  add column if not exists autopilot_enabled boolean not null default false,
  add column if not exists autopilot_mode text not null default 'manual'
    check (autopilot_mode in ('manual', 'assisted', 'full')),
  add column if not exists first_followup_delay_minutes integer not null default 60
    check (first_followup_delay_minutes >= 0),
  add column if not exists second_followup_delay_minutes integer not null default 1440
    check (second_followup_delay_minutes >= 0),
  add column if not exists third_followup_delay_minutes integer not null default 4320
    check (third_followup_delay_minutes >= 0),
  add column if not exists maximum_followups integer not null default 3
    check (maximum_followups between 0 and 10),
  add column if not exists approval_required_for_discounts boolean not null default true,
  add column if not exists approval_required_for_custom_answers boolean not null default true,
  add column if not exists tone text not null default 'professional'
    check (tone in ('professional', 'friendly', 'direct', 'premium'));

-- 3. leads: per-lead follow-up state.
alter table public.leads
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists follow_up_count integer not null default 0
    check (follow_up_count >= 0),
  add column if not exists last_follow_up_at timestamptz,
  add column if not exists autopilot_paused boolean not null default false,
  add column if not exists unsubscribe_status text not null default 'subscribed'
    check (unsubscribe_status in ('subscribed', 'unsubscribed'));

-- Due-scan index for the scheduler.
create index if not exists leads_next_follow_up_at_idx
  on public.leads (next_follow_up_at)
  where next_follow_up_at is not null;

-- 4. ai_audit_log: append-only trail of autopilot/AI actions.
create table if not exists public.ai_audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  ai_message_id uuid references public.ai_messages (id) on delete set null,
  event text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_audit_log_business_created_idx
  on public.ai_audit_log (business_id, created_at desc);

grant select, insert on public.ai_audit_log to authenticated;

alter table public.ai_audit_log enable row level security;

drop policy if exists "ai_audit_log_select_member" on public.ai_audit_log;
create policy "ai_audit_log_select_member"
  on public.ai_audit_log for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "ai_audit_log_insert_member" on public.ai_audit_log;
create policy "ai_audit_log_insert_member"
  on public.ai_audit_log for insert
  to authenticated
  with check (public.is_business_member(business_id));
