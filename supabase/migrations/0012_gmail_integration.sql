-- WinBack — per-business Gmail integration
--
-- Each business can connect its own Gmail inbox. Incoming customer emails are
-- copied in, matched to that business's leads by sender address, and get an AI
-- reply DRAFT. Nothing is ever sent automatically: a draft leaves WinBack only
-- when a member of the business clicks "Approve and send" on that one draft,
-- and only when the server has GMAIL_SENDING_ENABLED=true.
--
-- Additive and idempotent. It adds one nullable column to leads (email) and new
-- tables; it never updates or deletes an existing row and changes no existing
-- policy. Run after 0011_multi_business.sql.
--
-- Access model:
--   * Members of a business can READ its connection status, messages and
--     drafts (RLS on public.is_business_member, like every other table).
--   * Nobody signed in can WRITE these tables directly. Every write goes
--     through WinBack's server, which checks membership first and then writes
--     with the service-role key. So the browser can never mark a draft "sent",
--     attach a draft to another business, or plant a fake connection.
--   * OAuth tokens live in gmail_connection_secrets, encrypted by the server
--     (AES-256-GCM) before they get here. That table has no grants and no
--     policies for anon or authenticated: only the service role can touch it.

-- ---------------------------------------------------------------------------
-- 1. Leads get an optional email address, used to match incoming mail.
-- ---------------------------------------------------------------------------
alter table public.leads add column if not exists email text;

alter table public.leads drop constraint if exists leads_email_format;
alter table public.leads
  add constraint leads_email_format
  check (email is null or (char_length(email) <= 320 and position('@' in email) > 1));

create index if not exists leads_business_email_idx
  on public.leads (business_id, lower(email))
  where email is not null;

-- ---------------------------------------------------------------------------
-- 2. One Gmail connection per business (status only, no secrets).
-- ---------------------------------------------------------------------------
create table if not exists public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  email_address text not null,
  status text not null default 'connected'
    check (status in ('connected', 'needs_reconnect', 'disconnected')),
  scopes text,
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists gmail_connections_set_updated_at on public.gmail_connections;
create trigger gmail_connections_set_updated_at
  before update on public.gmail_connections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Encrypted OAuth refresh tokens. Service role only.
-- ---------------------------------------------------------------------------
create table if not exists public.gmail_connection_secrets (
  connection_id uuid primary key references public.gmail_connections (id) on delete cascade,
  -- The business is repeated here so a secret can never be read back for the
  -- wrong business by a join mistake in server code.
  business_id uuid not null references public.businesses (id) on delete cascade,
  refresh_token_encrypted text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Emails copied in from (and sent out through) the business's inbox.
-- ---------------------------------------------------------------------------
create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  connection_id uuid not null references public.gmail_connections (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  gmail_message_id text not null,
  gmail_thread_id text not null,
  -- The RFC 5322 Message-ID header, for In-Reply-To/References on replies.
  rfc822_message_id text,
  from_address text not null,
  from_name text,
  to_address text,
  subject text,
  snippet text,
  body_text text,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (connection_id, gmail_message_id)
);

create index if not exists email_messages_business_received_idx
  on public.email_messages (business_id, received_at desc);
create index if not exists email_messages_lead_idx
  on public.email_messages (lead_id, received_at desc)
  where lead_id is not null;

-- ---------------------------------------------------------------------------
-- 5. AI reply drafts. 'sending' is a short claim so a double click cannot send
--    twice; 'failed' keeps the error and can be retried by a person.
-- ---------------------------------------------------------------------------
create table if not exists public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email_message_id uuid not null references public.email_messages (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  to_address text not null,
  subject text not null,
  body text not null check (char_length(btrim(body)) > 0),
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'sent', 'failed', 'discarded')),
  ai_model text,
  discount_offered boolean not null default false,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  sent_gmail_message_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one open draft per incoming email, so repeated syncs never pile up.
create unique index if not exists email_drafts_one_open_per_message
  on public.email_drafts (email_message_id)
  where status in ('draft', 'sending', 'failed');

create index if not exists email_drafts_business_created_idx
  on public.email_drafts (business_id, created_at desc);

drop trigger if exists email_drafts_set_updated_at on public.email_drafts;
create trigger email_drafts_set_updated_at
  before update on public.email_drafts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Cross-business integrity. Every row must point only at its own
--    business's connection, message and lead, even when written by the server.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_email_rows_in_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'gmail_connection_secrets' then
    if not exists (
      select 1 from public.gmail_connections c
      where c.id = new.connection_id and c.business_id = new.business_id
    ) then
      raise exception 'That Gmail connection does not belong to this business.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'email_messages' then
    if not exists (
      select 1 from public.gmail_connections c
      where c.id = new.connection_id and c.business_id = new.business_id
    ) then
      raise exception 'That Gmail connection does not belong to this business.' using errcode = '42501';
    end if;
  end if;

  if tg_table_name = 'email_drafts' then
    if not exists (
      select 1 from public.email_messages m
      where m.id = new.email_message_id and m.business_id = new.business_id
    ) then
      raise exception 'That email does not belong to this business.' using errcode = '42501';
    end if;
  end if;

  if new.lead_id is not null and not exists (
    select 1 from public.leads l
    where l.id = new.lead_id and l.business_id = new.business_id
  ) then
    raise exception 'That lead does not belong to this business.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.ensure_email_rows_in_business() from public;

drop trigger if exists gmail_connection_secrets_in_business on public.gmail_connection_secrets;
create trigger gmail_connection_secrets_in_business
  before insert or update on public.gmail_connection_secrets
  for each row execute function public.ensure_email_rows_in_business();

drop trigger if exists email_messages_in_business on public.email_messages;
create trigger email_messages_in_business
  before insert or update on public.email_messages
  for each row execute function public.ensure_email_rows_in_business();

drop trigger if exists email_drafts_in_business on public.email_drafts;
create trigger email_drafts_in_business
  before insert or update on public.email_drafts
  for each row execute function public.ensure_email_rows_in_business();

-- ---------------------------------------------------------------------------
-- 7. Grants and Row Level Security.
-- ---------------------------------------------------------------------------
revoke all on public.gmail_connections from anon, authenticated;
revoke all on public.gmail_connection_secrets from anon, authenticated;
revoke all on public.email_messages from anon, authenticated;
revoke all on public.email_drafts from anon, authenticated;

grant select on public.gmail_connections to authenticated;
grant select on public.email_messages to authenticated;
grant select on public.email_drafts to authenticated;

alter table public.gmail_connections enable row level security;
alter table public.gmail_connection_secrets enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_drafts enable row level security;

drop policy if exists "gmail_connections_select_member" on public.gmail_connections;
create policy "gmail_connections_select_member"
  on public.gmail_connections for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "email_messages_select_member" on public.email_messages;
create policy "email_messages_select_member"
  on public.email_messages for select
  to authenticated
  using (public.is_business_member(business_id));

drop policy if exists "email_drafts_select_member" on public.email_drafts;
create policy "email_drafts_select_member"
  on public.email_drafts for select
  to authenticated
  using (public.is_business_member(business_id));

-- gmail_connection_secrets: RLS on, no policies, no grants. Deliberately empty.
