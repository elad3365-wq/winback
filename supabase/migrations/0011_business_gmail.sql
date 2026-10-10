-- WinBack — per-business Gmail integration (customer app)
--
-- FOR REVIEW. Apply manually to WinBack-Test (onydgglobiouuusdiuhu) ONLY for
-- now; do not run against production without explicit approval.
--
-- Additive and idempotent. Adds three member-scoped, tenant-isolated tables:
--   business_gmail_connections — one connected Google mailbox per business
--     (ENCRYPTED tokens only — AES-256-GCM, app-side, GMAIL_TOKEN_ENCRYPTION_KEY;
--      no plaintext token is ever stored). Owner-only writes.
--   business_email_messages    — stored inbound/outbound emails, idempotent on
--     (business_id, gmail_message_id); may link to a lead in the SAME business.
--   business_email_replies     — AI-drafted replies with a draft→approved→sent
--     lifecycle. Owner-only approval & send; send only from 'approved'; a sent
--     reply is immutable; approval is invalidated by a material edit. These are
--     enforced by a trigger, independently of the application.
--
-- Does not touch any existing table or data. RLS reuses public.is_business_member
-- and public.is_business_owner; updated_at reuses public.set_updated_at.

-- A superkey on leads so (business_id, id) can be a composite-FK target — this
-- lets the email tables guarantee a linked lead belongs to the SAME business.
-- `id` is already the PK, so this unique constraint restricts nothing new.
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
-- 1. business_gmail_connections (one row per business; owner-managed)
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

grant select, insert, update, delete on public.business_gmail_connections to authenticated;
alter table public.business_gmail_connections enable row level security;

-- Members may SEE whether their business is connected; only the OWNER may
-- connect, update, or disconnect the mailbox.
drop policy if exists "bgc_select_member" on public.business_gmail_connections;
create policy "bgc_select_member" on public.business_gmail_connections for select
  to authenticated using (public.is_business_member(business_id));

drop policy if exists "bgc_insert_owner" on public.business_gmail_connections;
create policy "bgc_insert_owner" on public.business_gmail_connections for insert
  to authenticated with check (public.is_business_owner(business_id));

drop policy if exists "bgc_update_owner" on public.business_gmail_connections;
create policy "bgc_update_owner" on public.business_gmail_connections for update
  to authenticated using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

drop policy if exists "bgc_delete_owner" on public.business_gmail_connections;
create policy "bgc_delete_owner" on public.business_gmail_connections for delete
  to authenticated using (public.is_business_owner(business_id));

-- ---------------------------------------------------------------------------
-- 2. business_email_messages (inbound/outbound store; idempotent)
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
  -- Idempotency: a given Gmail message is stored at most once per business.
  unique (business_id, gmail_message_id)
);

-- A linked lead must belong to the same business (tenant isolation at the DB).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_email_messages'::regclass
      and conname = 'bem_business_lead_fkey'
  ) then
    alter table public.business_email_messages
      add constraint bem_business_lead_fkey
      foreign key (business_id, lead_id)
      references public.leads (business_id, id) on delete set null;
  end if;
end
$$;

create index if not exists bem_business_created_idx
  on public.business_email_messages (business_id, created_at desc);
create index if not exists bem_lead_idx
  on public.business_email_messages (lead_id) where lead_id is not null;

grant select, insert, update, delete on public.business_email_messages to authenticated;
alter table public.business_email_messages enable row level security;

drop policy if exists "bem_select_member" on public.business_email_messages;
create policy "bem_select_member" on public.business_email_messages for select
  to authenticated using (public.is_business_member(business_id));
drop policy if exists "bem_insert_member" on public.business_email_messages;
create policy "bem_insert_member" on public.business_email_messages for insert
  to authenticated with check (public.is_business_member(business_id));
drop policy if exists "bem_update_member" on public.business_email_messages;
create policy "bem_update_member" on public.business_email_messages for update
  to authenticated using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));
drop policy if exists "bem_delete_member" on public.business_email_messages;
create policy "bem_delete_member" on public.business_email_messages for delete
  to authenticated using (public.is_business_member(business_id));

-- ---------------------------------------------------------------------------
-- 3. business_email_replies (AI reply lifecycle: draft → approved → sent)
-- ---------------------------------------------------------------------------
create table if not exists public.business_email_replies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  message_id uuid not null references public.business_email_messages (id) on delete cascade,
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

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_email_replies'::regclass
      and conname = 'ber_business_lead_fkey'
  ) then
    alter table public.business_email_replies
      add constraint ber_business_lead_fkey
      foreign key (business_id, lead_id)
      references public.leads (business_id, id) on delete set null;
  end if;
end
$$;

create index if not exists ber_business_created_idx
  on public.business_email_replies (business_id, created_at desc);
create index if not exists ber_message_idx
  on public.business_email_replies (message_id);

drop trigger if exists business_email_replies_set_updated_at on public.business_email_replies;
create trigger business_email_replies_set_updated_at
  before update on public.business_email_replies
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.business_email_replies to authenticated;
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
create policy "ber_delete_member" on public.business_email_replies for delete
  to authenticated using (public.is_business_member(business_id));

-- Integrity trigger: approval & sending are owner-only; a reply can only be
-- sent from 'approved'; a sent reply is immutable; a material edit invalidates
-- approval; approval/sent stamps are server-controlled (no client forgery).
-- SECURITY INVOKER (default) so current_user is the real caller; privileged
-- backend/admin roles are unrestricted.
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
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'edited') then
      raise exception 'reply: new rows must start as draft or edited (got %)', new.status
        using errcode = 'check_violation';
    end if;
    new.approved_at := null;
    new.approved_by := null;
    new.sent_at := null;
    return new;
  end if;

  -- UPDATE
  if old.status = 'sent' then
    raise exception 'reply: a sent reply is immutable' using errcode = 'check_violation';
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
    new.sent_at := null;
    return new;
  end if;

  -- Sending: owner-only, and only from an approved reply.
  if new.status = 'sent' and old.status is distinct from 'sent' then
    if old.status <> 'approved' then
      raise exception 'reply: only an approved reply can be sent' using errcode = 'check_violation';
    end if;
    if not public.is_business_owner(new.business_id) then
      raise exception 'reply: only the business owner may send' using errcode = 'insufficient_privilege';
    end if;
    new.sent_at := now();
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    return new;
  end if;

  -- Approval: owner-only; server-stamped.
  if new.status = 'approved' and old.status is distinct from 'approved' then
    if not public.is_business_owner(new.business_id) then
      raise exception 'reply: only the business owner may approve' using errcode = 'insufficient_privilege';
    end if;
    new.approved_at := now();
    new.approved_by := v_uid;
    new.sent_at := null;
  elsif new.status = 'approved' then
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    new.sent_at := null;
  else
    new.approved_at := null;
    new.approved_by := null;
    new.sent_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists business_email_replies_integrity on public.business_email_replies;
create trigger business_email_replies_integrity
  before insert or update on public.business_email_replies
  for each row execute function public.business_email_replies_enforce_integrity();
