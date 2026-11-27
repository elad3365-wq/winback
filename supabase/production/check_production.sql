-- WinBack PRODUCTION read-only check. Changes nothing, reads no customer data.
-- Run in the PRODUCTION SQL Editor before pilot_upgrade.sql. Shows which
-- migrations are already there (present / MISSING) and row counts only.
with want(step, kind, name) as (values
  ('0004','table','beta_signups'),
  ('0005','column','profiles.onboarding_completed'),
  ('0005','table','business_ai_settings'),
  ('0006','table','ai_messages'),
  ('0007','column','ai_messages.approved_at'),
  ('0009','table','ai_audit_log'),
  ('0010','table','lead_activity'),
  ('0011 multi-business','function','create_business'),
  ('0011 gmail','table','business_gmail_connections'),
  ('0012 autopilot','table','business_knowledge'),
  ('0013 push','column','business_gmail_connections.watch_topic'),
  ('0014 security','table','ai_usage'),
  ('0014 security','function','consume_rate_limit'),
  ('test marker (must be MISSING)','schema','winback_test_marker')
)
select step, name, case when case kind
  when 'schema' then to_regnamespace(name) is not null
  when 'table' then to_regclass('public.' || name) is not null
  when 'column' then exists (select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = split_part(name,'.',1) and c.column_name = split_part(name,'.',2))
  when 'function' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = name)
end then 'present' else 'MISSING' end as status
from want
union all select 'rows', 'users', (select count(*) from auth.users)::text
union all select 'rows', 'businesses', (select count(*) from public.businesses)::text
union all select 'rows', 'leads', (select count(*) from public.leads)::text;
