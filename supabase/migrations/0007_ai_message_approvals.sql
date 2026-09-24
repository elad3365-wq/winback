-- WinBack — AI follow-up approval workflow
-- Adds the audit columns for the draft -> approved -> sent lifecycle. The
-- status column and its allowed values already exist from 0006; this only adds
-- the timestamps and the approver. Sending is still disabled — sent_at stays
-- null until a later phase actually sends. Safe to run on top of 0001–0006.

alter table public.ai_messages
  add column if not exists approved_at timestamptz;

alter table public.ai_messages
  add column if not exists approved_by uuid references auth.users (id) on delete set null;

alter table public.ai_messages
  add column if not exists sent_at timestamptz;
