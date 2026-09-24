-- WinBack — AI follow-up messages (generation + history)
-- Stores every AI-generated follow-up draft for a lead. Nothing here is sent:
-- these are drafts the owner reviews, edits and copies out by hand. Sending is
-- a later phase. Safe to run on top of 0001–0005.

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  -- What channel the draft is written for. Drafts only — no send happens yet.
  channel text not null default 'sms' check (channel in ('sms', 'email')),
  -- Lifecycle of a draft. Starts 'draft'; 'edited' once a human changes it,
  -- 'discarded' when thrown away. 'approved'/'sent' are reserved for the future
  -- sending phase and are never set by this feature.
  status text not null default 'draft'
    check (status in ('draft', 'edited', 'approved', 'sent', 'discarded')),
  content text not null check (char_length(btrim(content)) > 0),
  -- The model that produced it, and a snapshot of the exact inputs used, so a
  -- draft can be audited later (e.g. to confirm no discount was offered when
  -- the business had discounts turned off).
  model text,
  prompt_inputs jsonb,
  -- True only when the business allows discounts AND the draft references one.
  discount_offered boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Newest-first history for one lead, and the business-wide window the endpoint
-- counts for rate limiting.
create index if not exists ai_messages_lead_id_created_idx
  on public.ai_messages (lead_id, created_at desc);
create index if not exists ai_messages_business_id_created_idx
  on public.ai_messages (business_id, created_at desc);

drop trigger if exists ai_messages_set_updated_at on public.ai_messages;
create trigger ai_messages_set_updated_at
  before update on public.ai_messages
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.ai_messages to authenticated;

-- Row Level Security — a business only ever touches its own AI messages, using
-- the same membership check as every other table.
alter table public.ai_messages enable row level security;

drop policy if exists "ai_messages_select_member" on public.ai_messages;
create policy "ai_messages_select_member"
  on public.ai_messages for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "ai_messages_insert_member" on public.ai_messages;
create policy "ai_messages_insert_member"
  on public.ai_messages for insert
  to authenticated
  with check (public.is_business_member(business_id));

drop policy if exists "ai_messages_update_member" on public.ai_messages;
create policy "ai_messages_update_member"
  on public.ai_messages for update
  to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

drop policy if exists "ai_messages_delete_member" on public.ai_messages;
create policy "ai_messages_delete_member"
  on public.ai_messages for delete
  to authenticated
  using (public.is_business_member(business_id));
