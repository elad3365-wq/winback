-- WinBack — security hardening test (migration 0014)
--
-- WinBack-Test only (stops if winback_test_marker is missing). Run in the
-- Supabase SQL Editor AFTER 0014_security_hardening.sql. Paste the whole file
-- and press Run.
--
-- IT ALWAYS ENDS WITH AN ERROR, ON PURPOSE. The final RAISE carries the report
-- and rolls back everything the script created (test users, businesses, leads,
-- usage rows, rate-limit hits). No existing row is touched.
--   Pass:  ERROR: SECURITY HARDENING PASSED: 27 of 27 checks ...
--   Fail:  ERROR: SECURITY HARDENING FAILED: ... followed by the failed checks.
--
-- Every check is an attack the audit tried against 0001–0013, run again as a
-- real signed-in user (role authenticated) or a visitor (role anon).

do $$
begin
  if to_regnamespace('winback_test_marker') is null then
    raise exception 'STOPPED: winback_test_marker not found, this is not WinBack-Test. Nothing was changed.';
  end if;
  if to_regproc('public.ai_reserve_call') is null then
    raise exception 'STOPPED: run 0014_security_hardening.sql first. Nothing was changed.';
  end if;
end
$$;

-- Runs one statement as a user and returns 'ok', the statement's single text
-- value, or 'ERR: <message>'. Role and claims are undone afterwards.
create or replace function pg_temp.as_user(p_user uuid, p_role text, p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_user, 'role', p_role)::text, true);
    execute format('set local role %I', p_role);
    execute p_sql into v;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    return coalesce(v, 'ok');
  exception when others then
    return 'ERR: ' || sqlerrm;
  end;
end
$$;

do $$
declare
  v_alice uuid := gen_random_uuid();
  v_bob uuid := gen_random_uuid();
  v_a uuid;
  v_b uuid;
  v_lead uuid;
  v_msg uuid;
  v_usage uuid;
  v_got text;
  v_total integer := 0;
  v_failed text[] := '{}';
  v_bucket text := 'sign_in:' || repeat('e', 64);
  v_has_autonomy boolean := to_regclass('public.business_ai_autonomy') is not null;

begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_alice, 'authenticated', 'authenticated', 'alice.security-test@example.com', '{"full_name":"Alice Test"}', now(), now()),
    (v_bob, 'authenticated', 'authenticated', 'bob.security-test@example.com', '{"full_name":"Bob Test"}', now(), now());
  select id into v_a from public.businesses where owner_id = v_alice order by created_at limit 1;
  select id into v_b from public.businesses where owner_id = v_bob order by created_at limit 1;

  insert into public.leads (business_id, customer_name, phone, service, created_by)
  values (v_a, 'Carl Test', '+13055550199', 'Roof repair', v_alice) returning id into v_lead;
  insert into public.ai_messages (business_id, lead_id, message, status)
  values (v_a, v_lead, 'Hi Carl, following up on your estimate.', 'draft') returning id into v_msg;
  insert into public.lead_activity (business_id, lead_id, type) values (v_a, v_lead, 'test_entry');

  -- Each check: label, actual, expectation ('ERR' = must fail, else exact value).
  -- ---------------------------------------------------------------- drafts
  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'with d as (delete from public.ai_messages where id = %L returning 1) select count(*)::text from d', v_msg));
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || ('member deleted an AI draft: ' || v_got); end if;

  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'insert into public.ai_messages (business_id, lead_id, message, status) values (%L, %L, %L, %L)', v_a, v_lead, 'x', 'sent'));
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'inserted a draft already marked sent'; end if;

  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'with i as (insert into public.ai_messages (business_id, lead_id, message, approved_by, source) values (%L, %L, %L, %L, %L) returning approved_by, source) select coalesce(approved_by::text, ''null'') || '','' || source from i',
    v_a, v_lead, 'y', v_bob, 'autopilot'));
  v_total := v_total + 1; if v_got <> 'null,manual' then v_failed := v_failed || ('forged approver/source kept: ' || v_got); end if;

  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'update public.ai_messages set status = ''sent'' where id = %L', v_msg));
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'marked an unapproved draft sent'; end if;

  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'with u as (update public.ai_messages set status = ''approved'', approved_by = %L where id = %L returning approved_by) select approved_by::text from u', v_bob, v_msg));
  v_total := v_total + 1; if v_got is distinct from v_alice::text then v_failed := v_failed || ('approval not stamped with the real approver: ' || v_got); end if;

  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'with u as (update public.ai_messages set message = ''changed after approval'' where id = %L returning status) select status from u', v_msg));
  v_total := v_total + 1; if v_got <> 'edited' then v_failed := v_failed || ('editing an approved draft kept approval: ' || v_got); end if;

  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'update public.ai_messages set prompt_inputs = ''{"forged":true}'' where id = %L', v_msg));
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'rewrote the AI prompt snapshot'; end if;

  -- ---------------------------------------------------------------- audit trails
  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'insert into public.ai_audit_log (business_id, event) values (%L, ''forged'')', v_a));
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'member wrote to the AI audit log'; end if;

  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'with d as (delete from public.lead_activity where business_id = %L returning 1) select count(*)::text from d', v_a));
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || ('member deleted timeline entries: ' || v_got); end if;

  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'with i as (insert into public.lead_activity (business_id, lead_id, type, created_by) values (%L, %L, ''note'', %L) returning created_by) select created_by::text from i', v_a, v_lead, v_bob));
  v_total := v_total + 1; if v_got is distinct from v_alice::text then v_failed := v_failed || ('timeline entry attributed to someone else: ' || v_got); end if;

  -- ---------------------------------------------------------------- memberships, sizes, limits
  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'insert into public.business_members (business_id, user_id, role) values (%L, %L, ''owner'')', v_a, v_bob));
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'owner added another user without consent'; end if;

  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'insert into public.leads (business_id, customer_name, phone, service) values (%L, repeat(''A'', 100000), ''1'', ''s'')', v_a));
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'stored a 100,000-character lead name'; end if;

  if v_has_autonomy then
    v_got := pg_temp.as_user(v_alice, 'authenticated', format(
      'insert into public.business_ai_autonomy (business_id, daily_spend_limit_usd) values (%L, 1000000) on conflict (business_id) do update set daily_spend_limit_usd = 1000000', v_a));
    v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'set a $1,000,000 daily AI limit'; end if;
  end if;

  if to_regproc('public.create_business') is not null then
    v_got := pg_temp.as_user(v_alice, 'authenticated', format(
      'insert into public.businesses (name, owner_id) values (''bypass'', %L)', v_alice));
    v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'created a business without create_business()'; end if;
  end if;

  -- ---------------------------------------------------------------- AI budget
  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'select public.ai_reserve_call(%L, ''manual_followup'', ''claude-haiku-5-5'')::text', v_b));
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'spent AI budget of another business'; end if;

  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'select public.ai_reserve_call(%L, ''autopilot_followup'', ''claude-haiku-5-5'')::text', v_a));
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'user reserved as the autopilot'; end if;

  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'select public.ai_reserve_call(%L, ''manual_followup'', ''claude-haiku-5-5'')::text', v_a));
  v_total := v_total + 1;
  if v_got like 'ERR%' then v_failed := v_failed || ('a normal reservation failed: ' || v_got); else v_usage := v_got::uuid; end if;

  if v_usage is not null then
    perform pg_temp.as_user(v_alice, 'authenticated', format('select public.ai_finish_call(%L, 0, 0, true)::text', v_usage));
    v_total := v_total + 1;
    if not exists (select 1 from public.ai_usage where id = v_usage and cost_usd >= estimated_usd and status = 'ok') then
      v_failed := v_failed || 'zero-token finish recorded less than the estimate';
    end if;
  end if;

  v_got := pg_temp.as_user(v_alice, 'authenticated', 'with d as (delete from public.ai_usage returning 1) select count(*)::text from d');
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || ('member deleted usage rows: ' || v_got); end if;

  v_got := pg_temp.as_user(v_alice, 'authenticated', 'update public.ai_usage set cost_usd = 0');
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'member zeroed recorded spend'; end if;

  v_got := pg_temp.as_user(v_alice, 'authenticated', 'update public.platform_ai_limits set platform_daily_usd = 1000000');
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'member raised the platform AI limit'; end if;

  v_got := pg_temp.as_user(v_bob, 'authenticated', 'select count(*)::text from public.ai_usage');
  v_total := v_total + 1; if v_got <> '0' then v_failed := v_failed || ('Bob sees Alice''s AI usage: ' || v_got); end if;

  -- Per-minute cap: lower it for this transaction only (rolled back below).
  update public.platform_ai_limits set business_calls_per_minute = 1 where id;
  v_got := pg_temp.as_user(v_alice, 'authenticated', format(
    'select public.ai_reserve_call(%L, ''manual_followup'', ''claude-haiku-5-5'')::text', v_a));
  v_total := v_total + 1; if v_got not like '%AI_BUDGET:per_minute%' then v_failed := v_failed || ('per-minute cap not enforced: ' || v_got); end if;

  -- ---------------------------------------------------------------- visitors (anon)
  v_got := pg_temp.as_user(null, 'anon', format(
    'select public.ai_reserve_call(%L, ''manual_followup'', ''claude-haiku-5-5'')::text', v_a));
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'visitor reserved AI budget'; end if;

  v_got := pg_temp.as_user(null, 'anon', 'select public.consume_rate_limit(''sign_in:victim@example.com'', 5, 60)::text');
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'visitor used a readable (non-HMAC) bucket'; end if;

  v_got := '';
  for i in 1..4 loop
    v_got := v_got || pg_temp.as_user(null, 'anon', format('select public.consume_rate_limit(%L, 3, 60)::text', v_bucket)) || ',';
  end loop;
  v_total := v_total + 1; if v_got <> 'true,true,true,false,' then v_failed := v_failed || ('rate limit did not stop the 4th try: ' || v_got); end if;

  v_got := pg_temp.as_user(null, 'anon', 'select count(*)::text from public.security_events');
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'visitor read the security log'; end if;

  perform pg_temp.as_user(null, 'anon',
    'insert into public.beta_signups (name, business_name, email, business_type) values (''T'', ''T'', ''dup.security-test@example.com'', ''Roofing'')');
  v_got := pg_temp.as_user(null, 'anon',
    'insert into public.beta_signups (name, business_name, email, business_type) values (''T'', ''T'', ''DUP.security-test@example.com'', ''Roofing'')');
  v_total := v_total + 1; if v_got not like 'ERR%' then v_failed := v_failed || 'same email applied twice in a day'; end if;

  if array_length(v_failed, 1) is null then
    raise exception 'SECURITY HARDENING PASSED: % of % checks. (This error is expected: it rolls back the test data.)', v_total, v_total;
  else
    raise exception 'SECURITY HARDENING FAILED: % of % checks failed: %', array_length(v_failed, 1), v_total, array_to_string(v_failed, ' | ');
  end if;
end
$$;
