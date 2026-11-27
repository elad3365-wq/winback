-- WinBack free pilot — weekly metrics (READ-ONLY: SELECT statements only).
--
-- Run in the Supabase SQL editor of the environment the pilot uses. Change
-- pilot_start below to the day the first invite goes out. Nothing here writes,
-- and it reads only counts — no customer names, phones or message text.
--
-- Definitions (also in docs/pilot/PILOT_PLAN.md):
--   registration       a profile created on/after pilot_start
--   activated business a business (created on/after pilot_start) with >= 1 lead
--                      AND >= 1 AI draft (follow-up or email reply)
--   weekly active      a pilot business with any lead created/updated, lead
--                      activity, or AI draft in the last 7 days

with params as (
  select timestamptz '2026-11-23 00:00:00+02' as pilot_start   -- <-- edit
),
pilot_biz as (
  select b.id, b.created_at
  from public.businesses b, params p
  where b.created_at >= p.pilot_start
),
drafts as (
  select business_id, created_at, status::text as status, 'followup' as kind from public.ai_messages
  union all
  select business_id, created_at, status::text, 'email_reply' from public.business_email_replies
),
activity as (
  select business_id, created_at as at from public.leads
  union all select business_id, updated_at from public.leads
  union all select business_id, created_at from public.lead_activity
  union all select business_id, created_at from drafts
)
select 'registrations' as metric,
       (select count(*) from public.profiles pr, params p where pr.created_at >= p.pilot_start)::bigint as value
union all
select 'beta_signup_applications',
       (select count(*) from public.beta_signups s, params p where s.created_at >= p.pilot_start)
union all
select 'businesses_created', (select count(*) from pilot_biz)
union all
select 'onboarding_completed',
       (select count(*) from public.profiles pr, params p
         where pr.created_at >= p.pilot_start and pr.onboarding_completed)
union all
select 'activated_businesses',
       (select count(*) from pilot_biz pb
         where exists (select 1 from public.leads l where l.business_id = pb.id)
           and exists (select 1 from drafts d where d.business_id = pb.id))
union all
select 'leads_added',
       (select count(*) from public.leads l join pilot_biz pb on pb.id = l.business_id)
union all
select 'ai_drafts_created',
       (select count(*) from drafts d join pilot_biz pb on pb.id = d.business_id)
union all
select 'ai_drafts_approved_or_sent',
       (select count(*) from drafts d join pilot_biz pb on pb.id = d.business_id
         where d.status in ('approved', 'sent'))
union all
select 'messages_marked_sent',
       (select count(*) from drafts d join pilot_biz pb on pb.id = d.business_id
         where d.status = 'sent')
union all
select 'weekly_active_businesses',
       (select count(distinct a.business_id) from activity a join pilot_biz pb on pb.id = a.business_id
         where a.at >= now() - interval '7 days')
union all
select 'leads_recovered',
       (select count(*) from public.leads l join pilot_biz pb on pb.id = l.business_id
         where l.status = 'recovered');

-- Per-business breakdown (ids only — map ids to pilot names in your own notes).
-- select pb.id,
--        (select count(*) from public.leads l where l.business_id = pb.id) as leads,
--        (select count(*) from drafts d where d.business_id = pb.id) as drafts,
--        (select max(a.at) from activity a where a.business_id = pb.id) as last_active
-- from pilot_biz pb order by last_active desc nulls last;
