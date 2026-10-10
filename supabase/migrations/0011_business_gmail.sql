-- WinBack — per-business Gmail integration (customer app)  [WinBack-Test build]
--
-- FOR REVIEW. Apply manually to WinBack-Test (onydgglobiouuusdiuhu) ONLY, after
-- PARTs 1–4. The guard below refuses to run anywhere without the
-- winback_test_marker schema, so it cannot execute against Production. A
-- separate, un-guarded migration will be produced when Production is in scope.
--
-- Security model (hardened):
--   business_gmail_connections — one mailbox per business. Token columns are
--     SERVER-ONLY: authenticated users get SELECT on status columns only and no
--     write access at all; all token read/write/disconnect happens through the
--     service role in server code. Tokens are AES-256-GCM encrypted app-side.
--   business_email_messages    — server-written inbound/outbound store,
--     idempotent on (business_id, gmail_message_id). Authenticated users may
--     read and may update ONLY lead_id (link-to-lead); they cannot insert,
--     delete, or forge messages.
--   business_email_replies     — draft→approved→sent. Authenticated owners
--     approve; SENDING is backend-only (service role) after Gmail confirms —
--     users cannot set status='sent', sent_at, or gmail_sent_message_id. A sent
--     reply is immutable; a material edit invalidates approval. Enforced by RLS,
--     column grants, AND a trigger (defence in depth).
--
-- Tenant isolation is enforced by composite FKs: a linked lead and the replied-
-- to message must belong to the SAME business. ON DELETE SET NULL uses the
-- PostgreSQL 15+ column-list form so only lead_id is cleared (business_id is
-- NOT NULL and must never be nulled).
--
-- Additive and idempotent. Reuses public.is_business_member / is_business_owner
-- / set_updated_at. Does not touch existing tables or data.

-- ---------------------------------------------------------------------------
-- 0. Guard: WinBack-Test only + PART 1–4 prerequisites
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regnamespace('winback_test_marker') is null then
    raise exception 'STOPPED: winback_test_marker schema not found. Apply only to WinBack-Test, after PARTs 1-4. Nothing was changed.';
  end if;
  if to_regclass('public.businesses') is null
     or to_regclass('public.leads') is null then
    raise exception 'STOPPED: core tables missing — PART 1 has not been applied. Nothing was changed.';
  end if;
  if to_regproc('public.is_business_member') is null
     or to_regproc('public.is_business_owner') is null
     or to_regproc('public.set_updated_at') is null then
    raise exception 'STOPPED: helper functions from PARTs 1-3 are missing. Nothing was changed.';
  end if;
end
$$;

-- Superkey on leads so (business_id, id) can be a composite-FK target.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.leads'::regclass and conname = 'leads_business_id_id_key'
  ) then
    alter table public.leads add constraint leads_business_id_id_key unique (business_id, id);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. business_gmail_connections  (tokens are server-only)
-- ---------------------------------------------------------------------------
create table if not exists public.business_gmail_connections (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  google_account_email text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  access_token_expires_at timestamptz,
  scope text,
  history_id text,
  watch_expiration timestamptz,
  connected_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists business_gmail_connections_set_updated_at on public.business_gmail_connections;
create trigger business_gmail_connections_set_updated_at
  before update on public.business_gmail_connections
  for each row execute function public.set_updated_at();

-- Lock the table down, then grant SELECT on STATUS columns only. The encrypted
-- token columns (access_token_encrypted, refresh_token_encrypted) and
-- access_token_expires_at are never selectable by authenticated/anon. No write
-- grants: connect/refresh/disconnect run through the service role server-side.
revoke all on public.business_gmail_connections from anon, authenticated;
grant select (
  business_id, google_account_email, scope, history_id, watch_expiration,
  connected_by, revoked_at, created_at, updated_at
) on public.business_gmail_connections to authenticated;

alter table public.business_gmail_connections enable row level security;

drop policy if exists "bgc_select_member" on public.business_gmail_connections;
create policy "bgc_select_member" on public.business_gmail_connections for select
  to authenticated using (public.is_business_member(business_id));
-- No insert/update/delete policies: those operations are service-role only.

-- ---------------------------------------------------------------------------
-- 2. business_email_messages  (server-written; users may only link a lead)
-- ---------------------------------------------------------------------------
create table if not exists public.business_email_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text,
  lead_id uuid,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  from_address text,
  to_addresses text[],
  subject text,
  snippet text,
  body_text text,
  rfc822_message_id text,
  in_reply_to text,
  email_references text,
  internal_date timestamptz,
  label_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (business_id, gmail_message_id),  -- idempotency
  unique (business_id, id)                 -- composite-FK target for replies
);

-- A linked lead must be in the same business; deleting the lead clears ONLY
-- lead_id (business_id stays — it is NOT NULL). PG15+ column-list SET NULL.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_email_messages'::regclass and conname = 'bem_business_lead_fkey'
  ) then
    alter table public.business_email_messages
      add constraint bem_business_lead_fkey
      foreign key (business_id, lead_id)
      references public.leads (business_id, id) on delete set null (lead_id);
  end if;
end
$$;

create index if not exists bem_business_created_idx
  on public.business_email_messages (business_id, created_at desc);
create index if not exists bem_lead_idx
  on public.business_email_messages (lead_id) where lead_id is not null;

revoke all on public.business_email_messages from anon, authenticated;
-- Read everything (no secrets here) but WRITE only lead_id (link-to-lead).
-- No INSERT/DELETE grant: messages are written by the service role (sync), so
-- a user can neither forge an inbound/outbound message nor delete one.
grant select on public.business_email_messages to authenticated;
grant update (lead_id) on public.business_email_messages to authenticated;

alter table public.business_email_messages enable row level security;

drop policy if exists "bem_select_member" on public.business_email_messages;
create policy "bem_select_member" on public.business_email_messages for select
  to authenticated using (public.is_business_member(business_id));
drop policy if exists "bem_update_member" on public.business_email_messages;
create policy "bem_update_member" on public.business_email_messages for update
  to authenticated using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
-- Drop any prior insert/delete policies (writes are service-role only now).
drop policy if exists "bem_insert_member" on public.business_email_messages;
drop policy if exists "bem_delete_member" on public.business_email_messages;

-- ---------------------------------------------------------------------------
-- 3. business_email_replies  (draft→approved→sent; sending is backend-only)
-- ---------------------------------------------------------------------------
create table if not exists public.business_email_replies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  message_id uuid not null,
  lead_id uuid,
  status text not null default 'draft'
    check (status in ('draft', 'edited', 'approved', 'sent', 'cancelled')),
  body text not null check (char_length(btrim(body)) > 0),
  ai_model text,
  prompt_inputs jsonb,
  discount_offered boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz,
  gmail_sent_message_id text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The replied-to message must be in the SAME business (composite FK). Deleting
-- the message cascades its replies.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_email_replies'::regclass and conname = 'ber_business_message_fkey'
  ) then
    alter table public.business_email_replies
      add constraint ber_business_message_fkey
      foreign key (business_id, message_id)
      references public.business_email_messages (business_id, id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_email_replies'::regclass and conname = 'ber_business_lead_fkey'
  ) then
    alter table public.business_email_replies
      add constraint ber_business_lead_fkey
      foreign key (business_id, lead_id)
      references public.leads (business_id, id) on delete set null (lead_id);
  end if;
end
$$;

create index if not exists ber_business_created_idx
  on public.business_email_replies (business_id, created_at desc);
create index if not exists ber_message_idx on public.business_email_replies (message_id);

drop trigger if exists business_email_replies_set_updated_at on public.business_email_replies;
create trigger business_email_replies_set_updated_at
  before update on public.business_email_replies
  for each row execute function public.set_updated_at();

revoke all on public.business_email_replies from anon, authenticated;
-- Users may create a draft and edit/approve it, but NEVER write the send fields
-- (sent_at, gmail_sent_message_id) or the approval stamp — those are set by the
-- trigger / service role. No DELETE grant: use status='cancelled'.
grant select on public.business_email_replies to authenticated;
grant insert (
  business_id, message_id, lead_id, status, body, ai_model, prompt_inputs,
  discount_offered, created_by
) on public.business_email_replies to authenticated;
grant update (status, body, lead_id) on public.business_email_replies to authenticated;

alter table public.business_email_replies enable row level security;

drop policy if exists "ber_select_member" on public.business_email_replies;
create policy "ber_select_member" on public.business_email_replies for select
  to authenticated using (public.is_business_member(business_id));
drop policy if exists "ber_insert_member" on public.business_email_replies;
create policy "ber_insert_member" on public.business_email_replies for insert
  to authenticated with check (public.is_business_member(business_id));
drop policy if exists "ber_update_member" on public.business_email_replies;
create policy "ber_update_member" on public.business_email_replies for update
  to authenticated using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
drop policy if exists "ber_delete_member" on public.business_email_replies;

-- Integrity trigger. SECURITY INVOKER (default) so current_user is the real
-- caller. Privileged backend/admin (service_role) is unrestricted and is the
-- ONLY path that may mark a reply sent (after Gmail confirms). For end users:
-- owner-only approval, approved-only (no direct send), sent fields immutable,
-- sent reply immutable, material edit invalidates approval.
create or replace function public.business_email_replies_enforce_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_privileged boolean := current_user not in ('authenticated', 'anon');
  v_uid uuid := auth.uid();
  v_material_changed boolean;
begin
  if v_privileged then
    return new;  -- trusted backend: marks sent, stamps sent_at, etc.
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'edited') then
      raise exception 'reply: new rows must start as draft or edited (got %)', new.status
        using errcode = 'check_violation';
    end if;
    new.approved_at := null;
    new.approved_by := null;
    new.sent_at := null;
    new.gmail_sent_message_id := null;
    return new;
  end if;

  -- UPDATE
  if old.status = 'sent' then
    raise exception 'reply: a sent reply is immutable' using errcode = 'check_violation';
  end if;

  -- Send fields are backend-only.
  if new.status = 'sent' and old.status is distinct from 'sent' then
    raise exception 'reply: sending is backend-only (status cannot be set to sent by a user)'
      using errcode = 'insufficient_privilege';
  end if;
  if new.sent_at is distinct from old.sent_at
     or new.gmail_sent_message_id is distinct from old.gmail_sent_message_id then
    raise exception 'reply: send fields are set by the backend only'
      using errcode = 'insufficient_privilege';
  end if;

  v_material_changed :=
         new.body       is distinct from old.body
      or new.message_id is distinct from old.message_id
      or new.lead_id    is distinct from old.lead_id
      or new.business_id is distinct from old.business_id;

  -- A material edit to an approved reply invalidates the approval.
  if old.status = 'approved' and v_material_changed and new.status <> 'cancelled' then
    new.status := 'edited';
    new.approved_at := null;
    new.approved_by := null;
    return new;
  end if;

  -- Approval: owner-only; server-stamped.
  if new.status = 'approved' and old.status is distinct from 'approved' then
    if not public.is_business_owner(new.business_id) then
      raise exception 'reply: only the business owner may approve' using errcode = 'insufficient_privilege';
    end if;
    new.approved_at := now();
    new.approved_by := v_uid;
  elsif new.status = 'approved' then
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
  else
    new.approved_at := null;
    new.approved_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists business_email_replies_integrity on public.business_email_replies;
create trigger business_email_replies_integrity
  before insert or update on public.business_email_replies
  for each row execute function public.business_email_replies_enforce_integrity();
