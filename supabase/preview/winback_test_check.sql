-- WinBack-Test read-only check. Changes nothing. Shows only what is MISSING.
with want(kind, name) as (values
  ('schema','winback_test_marker'),
  ('table','profiles'),('table','businesses'),('table','business_members'),('table','leads'),
  ('table','beta_signups'),('table','business_ai_settings'),('table','ai_messages'),
  ('table','ai_audit_log'),('table','lead_notes'),('table','lead_activity'),
  ('table','business_gmail_connections'),('table','business_email_messages'),
  ('table','business_email_replies'),('table','business_ai_autonomy'),('table','ai_tasks'),
  ('table','business_knowledge'),
  ('column','profiles.onboarding_completed'),('column','businesses.business_type'),
  ('column','ai_messages.approved_at'),('column','business_ai_settings.ai_can_offer_discounts'),
  ('function','is_business_member'),('function','is_business_owner'),('function','set_updated_at'),
  ('function','handle_new_user'),('function','create_business'),('function','ensure_lead_in_business'),
  ('trigger','on_auth_user_created'),('trigger','lead_notes_lead_in_business'),
  ('trigger','lead_activity_lead_in_business'),('trigger','ai_messages_lead_in_business'),
  ('trigger','ai_audit_log_lead_in_business'),
  ('unique','business_members(business_id,user_id)')
)
select kind, name, 'MISSING' as status from want w where not case kind
  when 'schema' then to_regnamespace(name) is not null
  when 'table' then to_regclass('public.' || name) is not null
  when 'column' then exists (select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = split_part(name,'.',1) and c.column_name = split_part(name,'.',2))
  when 'function' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = name)
  when 'trigger' then exists (select 1 from pg_trigger t where t.tgname = name and not t.tgisinternal)
  when 'unique' then exists (select 1 from pg_index i where i.indisunique
    and i.indrelid = to_regclass('public.business_members')
    and (select array_agg(a.attname::text order by a.attname) from pg_attribute a
         where a.attrelid = i.indrelid and a.attnum = any(i.indkey)) = array['business_id','user_id'])
end
union all
select 'result', 'everything else is present', 'OK';
