-- WinBack — extend the lead_status enum for the autopilot follow-up lifecycle.
-- Adds the follow-up progression (followup_1..3, cold) and the interrupt states
-- (call_requested, paused, unsubscribed). Kept in its own migration because
-- ADD VALUE must not be used in the same transaction that references the value;
-- nothing here references them, so this is safe to apply on its own.
-- (interested, recovered, lost already exist from 0001.)

alter type public.lead_status add value if not exists 'followup_1';
alter type public.lead_status add value if not exists 'followup_2';
alter type public.lead_status add value if not exists 'followup_3';
alter type public.lead_status add value if not exists 'cold';
alter type public.lead_status add value if not exists 'call_requested';
alter type public.lead_status add value if not exists 'paused';
alter type public.lead_status add value if not exists 'unsubscribed';
