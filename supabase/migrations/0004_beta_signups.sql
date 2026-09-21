-- WinBack — beta interest signups
-- Captures submissions from the public landing page's "Join the Beta" form.
-- Anonymous visitors may INSERT only; nobody can read rows through the anon or
-- authenticated roles (read them from the Supabase dashboard / service role).

create table if not exists public.beta_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  business_name text not null check (char_length(btrim(business_name)) > 0),
  email text not null check (position('@' in email) > 1),
  business_type text not null check (char_length(btrim(business_type)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists beta_signups_created_at_idx on public.beta_signups (created_at desc);

-- The landing page is public, so the anon role needs INSERT.
grant insert on public.beta_signups to anon, authenticated;

alter table public.beta_signups enable row level security;

-- Allow inserts from anyone hitting the public form, but never expose the rows
-- back to the anon/authenticated roles (no SELECT policy on purpose).
drop policy if exists "beta_signups_insert_public" on public.beta_signups;
create policy "beta_signups_insert_public"
  on public.beta_signups for insert
  to anon, authenticated
  with check (true);
