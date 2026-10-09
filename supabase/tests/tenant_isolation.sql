-- WinBack — tenant isolation test (two separate businesses)
--
-- Run in the Supabase SQL Editor AFTER 0011_multi_business.sql. Paste the
-- whole file and press Run.
--
-- IT ALWAYS ENDS WITH AN ERROR, ON PURPOSE. The final RAISE carries the report
-- and also rolls back everything this script created, so no test user,
-- business, lead or setting is left behind and no existing row is touched.
--   Pass:  ERROR: TENANT ISOLATION PASSED: 32 of 32 checks ...
--   Fail:  ERROR: TENANT ISOLATION FAILED: 2 of 32 checks ... followed by the
--          names of the checks that failed.
--
-- What it does, inside that one rolled-back transaction:
--   1. Creates two throwaway sign-ups, Alice and Bob. The existing signup
--      trigger gives each one their own business (A and B).
--   2. Alice creates a second business, A2, through create_business(), the
--      same call the app's Create Business screen makes.
--   3. Gives A and B a lead, AI settings, an AI draft, a note, an activity
--      entry and an audit entry each (only for tables that exist).
--   4. Becomes Alice, then Bob, exactly as the app does (role authenticated,
--      JWT sub = their user id) and checks what each can read and write.

do $$
declare
  v_alice uuid := gen_random_uuid();
  v_bob uuid := gen_random_uuid();
  v_a uuid;
  v_a2 uuid;
  v_b uuid;
  v_lead_a uuid;
  v_lead_b uuid;
  v_msg_col text;

  v_labels text[] := '{}';
  v_users uuid[] := '{}';
  v_sqls text[] := '{}';
  v_expect text[] := '{}';

  v_i integer;
  v_got text;
  v_failed text[] := '{}';
  v_total integer;
  v_has_ai boolean := to_regclass('public.business_ai_settings') is not null;
  v_has_msgs boolean := to_regclass('public.ai_messages') is not null;
  v_has_audit boolean := to_regclass('public.ai_audit_log') is not null;
  v_has_notes boolean := to_regclass('public.lead_notes') is not null;
  v_has_activity boolean := to_regclass('public.lead_activity') is not null;
begin
  -- 1. Two sign-ups. The on_auth_user_created trigger creates their businesses.
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_alice, 'authenticated', 'authenticated', 'alice.isolation-test@example.com',
     '{"full_name":"Alice Test","business_name":"Alice Plumbing (test)"}', now(), now()),
    (v_bob, 'authenticated', 'authenticated', 'bob.isolation-test@example.com',
     '{"full_name":"Bob Test","business_name":"Bob HVAC (test)"}', now(), now());

  select business_id into v_a from public.business_members where user_id = v_alice;
  select business_id into v_b from public.business_members where user_id = v_bob;
  if v_a is null or v_b is null then
    raise exception 'TENANT ISOLATION NOT RUN: the signup trigger did not create a business for each test user.';
  end if;

  -- 2. Alice creates a second business through the app's own function.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_alice, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_a2 := public.create_business('Alice Roofing (test)', 'Roofing', null, '+13055550199');
  execute 'reset role';

  -- 3. Data in A and B, written as the database owner.
  insert into public.leads (business_id, customer_name, phone, service, estimate_amount)
  values (v_a, 'Lead of A', '+13055550111', 'Pipe repair', 900)
  returning id into v_lead_a;
  insert into public.leads (business_id, customer_name, phone, service, estimate_amount)
  values (v_b, 'Lead of B', '+13055550122', 'AC install', 7000)
  returning id into v_lead_b;

  if v_has_ai then
    insert into public.business_ai_settings (business_id, additional_rules)
    values (v_a, 'A rules'), (v_b, 'B rules')
    on conflict (business_id) do nothing;
  end if;

  if v_has_msgs then
    select case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'ai_messages' and column_name = 'message'
    ) then 'message' else 'content' end into v_msg_col;
    execute format(
      'insert into public.ai_messages (business_id, lead_id, %I) values ($1, $2, ''draft A''), ($3, $4, ''draft B'')',
      v_msg_col)
    using v_a, v_lead_a, v_b, v_lead_b;
  end if;

  if v_has_audit then
    insert into public.ai_audit_log (business_id, lead_id, event)
    values (v_a, v_lead_a, 'test'), (v_b, v_lead_b, 'test');
  end if;
  if v_has_notes then
    insert into public.lead_notes (business_id, lead_id, body)
    values (v_a, v_lead_a, 'note A'), (v_b, v_lead_b, 'note B');
  end if;
  if v_has_activity then
    insert into public.lead_activity (business_id, lead_id, type)
    values (v_a, v_lead_a, 'test'), (v_b, v_lead_b, 'test');
  end if;

  -- 4. The checks. Each one runs as the named user. 'error' means the
  --    statement must be refused; anything else is the expected single value.
  --    Read checks
  v_labels := v_labels || 'Alice sees exactly her 2 businesses (A, A2)'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || 'select count(*) from public.businesses'::text;
  v_expect := v_expect || '2'::text;

  v_labels := v_labels || 'Alice cannot see business B'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format('select count(*) from public.businesses where id = %L', v_b);
  v_expect := v_expect || '0'::text;

  v_labels := v_labels || 'Bob sees exactly his 1 business (B)'::text;
  v_users := v_users || v_bob;
  v_sqls := v_sqls || 'select count(*) from public.businesses'::text;
  v_expect := v_expect || '1'::text;

  v_labels := v_labels || 'Bob cannot see Alice''s new business A2'::text;
  v_users := v_users || v_bob;
  v_sqls := v_sqls || format('select count(*) from public.businesses where id = %L', v_a2);
  v_expect := v_expect || '0'::text;

  v_labels := v_labels || 'Alice sees only her own memberships'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format('select count(*) from public.business_members where user_id <> %L', v_alice);
  v_expect := v_expect || '0'::text;

  v_labels := v_labels || 'Alice sees A''s lead'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format('select count(*) from public.leads where id = %L', v_lead_a);
  v_expect := v_expect || '1'::text;

  v_labels := v_labels || 'Alice sees no lead of B'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format('select count(*) from public.leads where business_id = %L', v_b);
  v_expect := v_expect || '0'::text;

  v_labels := v_labels || 'Alice sees no lead at all in A2 (new business starts empty)'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format('select count(*) from public.leads where business_id = %L', v_a2);
  v_expect := v_expect || '0'::text;

  v_labels := v_labels || 'Bob sees no lead of A'::text;
  v_users := v_users || v_bob;
  v_sqls := v_sqls || format('select count(*) from public.leads where business_id = %L', v_a);
  v_expect := v_expect || '0'::text;

  v_labels := v_labels || 'Bob sees exactly 1 lead in total'::text;
  v_users := v_users || v_bob;
  v_sqls := v_sqls || 'select count(*) from public.leads'::text;
  v_expect := v_expect || '1'::text;

  -- Write checks
  v_labels := v_labels || 'Alice cannot edit B''s lead'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format(
    'with x as (update public.leads set service = ''hacked'' where id = %L returning 1) select count(*) from x',
    v_lead_b);
  v_expect := v_expect || '0'::text;

  v_labels := v_labels || 'Alice cannot delete B''s lead'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format(
    'with x as (delete from public.leads where id = %L returning 1) select count(*) from x', v_lead_b);
  v_expect := v_expect || '0'::text;

  v_labels := v_labels || 'Alice cannot add a lead to B'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format(
    'insert into public.leads (business_id, customer_name, phone, service) values (%L, ''x'', ''+13055550133'', ''x'') returning 1',
    v_b);
  v_expect := v_expect || 'error'::text;

  v_labels := v_labels || 'Alice cannot move her lead into B'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format(
    'with x as (update public.leads set business_id = %L where id = %L returning 1) select count(*) from x',
    v_b, v_lead_a);
  v_expect := v_expect || 'error'::text;

  v_labels := v_labels || 'Alice cannot join B as a member'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format(
    'insert into public.business_members (business_id, user_id, role) values (%L, %L, ''member'') returning 1',
    v_b, v_alice);
  v_expect := v_expect || 'error'::text;

  v_labels := v_labels || 'Alice cannot rename B'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format(
    'with x as (update public.businesses set name = ''hacked'' where id = %L returning 1) select count(*) from x',
    v_b);
  v_expect := v_expect || '0'::text;

  v_labels := v_labels || 'Alice cannot create a business owned by Bob'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format(
    'insert into public.businesses (name, owner_id) values (''x'', %L) returning 1', v_bob);
  v_expect := v_expect || 'error'::text;

  v_labels := v_labels || 'Bob can still edit his own lead'::text;
  v_users := v_users || v_bob;
  v_sqls := v_sqls || format(
    'with x as (update public.leads set service = ''AC install (edited)'' where id = %L returning 1) select count(*) from x',
    v_lead_b);
  v_expect := v_expect || '1'::text;

  v_labels := v_labels || 'create_business refuses a caller with no session'::text;
  v_users := v_users || null::uuid;
  v_sqls := v_sqls || 'select public.create_business(''Nobody Inc'')'::text;
  v_expect := v_expect || 'error'::text;

  if v_has_ai then
    v_labels := v_labels || 'Alice sees AI settings for A and A2 only'::text;
    v_users := v_users || v_alice;
    v_sqls := v_sqls || 'select count(*) from public.business_ai_settings'::text;
    v_expect := v_expect || '2'::text;

    v_labels := v_labels || 'A2 starts with discounts off'::text;
    v_users := v_users || v_alice;
    v_sqls := v_sqls || format(
      'select ai_can_offer_discounts::text from public.business_ai_settings where business_id = %L', v_a2);
    v_expect := v_expect || 'false'::text;

    v_labels := v_labels || 'Bob cannot see A''s AI settings'::text;
    v_users := v_users || v_bob;
    v_sqls := v_sqls || format('select count(*) from public.business_ai_settings where business_id = %L', v_a);
    v_expect := v_expect || '0'::text;

    v_labels := v_labels || 'Bob cannot change A''s AI settings'::text;
    v_users := v_users || v_bob;
    v_sqls := v_sqls || format(
      'with x as (update public.business_ai_settings set additional_rules = ''hacked'' where business_id = %L returning 1) select count(*) from x',
      v_a);
    v_expect := v_expect || '0'::text;
  end if;

  if v_has_msgs then
    v_labels := v_labels || 'Alice sees no AI draft of B'::text;
    v_users := v_users || v_alice;
    v_sqls := v_sqls || format('select count(*) from public.ai_messages where business_id = %L', v_b);
    v_expect := v_expect || '0'::text;

    v_labels := v_labels || 'Bob sees exactly his 1 AI draft'::text;
    v_users := v_users || v_bob;
    v_sqls := v_sqls || 'select count(*) from public.ai_messages'::text;
    v_expect := v_expect || '1'::text;
  end if;

  if v_has_audit then
    v_labels := v_labels || 'Alice sees no audit entry of B'::text;
    v_users := v_users || v_alice;
    v_sqls := v_sqls || format('select count(*) from public.ai_audit_log where business_id = %L', v_b);
    v_expect := v_expect || '0'::text;
  end if;

  if v_has_notes then
    v_labels := v_labels || 'Bob sees no note of A'::text;
    v_users := v_users || v_bob;
    v_sqls := v_sqls || format('select count(*) from public.lead_notes where business_id = %L', v_a);
    v_expect := v_expect || '0'::text;

    v_labels := v_labels || 'Alice cannot attach a note to B''s lead (under her own business)'::text;
    v_users := v_users || v_alice;
    v_sqls := v_sqls || format(
      'insert into public.lead_notes (business_id, lead_id, body) values (%L, %L, ''x'') returning 1',
      v_a, v_lead_b);
    v_expect := v_expect || 'error'::text;

    v_labels := v_labels || 'Alice cannot file A''s lead note under A2'::text;
    v_users := v_users || v_alice;
    v_sqls := v_sqls || format(
      'insert into public.lead_notes (business_id, lead_id, body) values (%L, %L, ''x'') returning 1',
      v_a2, v_lead_a);
    v_expect := v_expect || 'error'::text;

    v_labels := v_labels || 'Alice can still add a note to her own lead'::text;
    v_users := v_users || v_alice;
    v_sqls := v_sqls || format(
      'insert into public.lead_notes (business_id, lead_id, body) values (%L, %L, ''ok'') returning 1',
      v_a, v_lead_a);
    v_expect := v_expect || '1'::text;
  end if;

  if v_has_activity then
    v_labels := v_labels || 'Bob sees no activity of A'::text;
    v_users := v_users || v_bob;
    v_sqls := v_sqls || format('select count(*) from public.lead_activity where business_id = %L', v_a);
    v_expect := v_expect || '0'::text;

    v_labels := v_labels || 'Alice sees no activity of B'::text;
    v_users := v_users || v_alice;
    v_sqls := v_sqls || format('select count(*) from public.lead_activity where business_id = %L', v_b);
    v_expect := v_expect || '0'::text;

    v_labels := v_labels || 'Alice cannot log activity on B''s lead'::text;
    v_users := v_users || v_alice;
    v_sqls := v_sqls || format(
      'insert into public.lead_activity (business_id, lead_id, type) values (%L, %L, ''x'') returning 1',
      v_a, v_lead_b);
    v_expect := v_expect || 'error'::text;
  end if;

  if v_has_msgs then
    v_labels := v_labels || 'Alice cannot attach an AI draft to B''s lead'::text;
    v_users := v_users || v_alice;
    v_sqls := v_sqls || format(
      'insert into public.ai_messages (business_id, lead_id, %I) values (%L, %L, ''x'') returning 1',
      v_msg_col, v_a, v_lead_b);
    v_expect := v_expect || 'error'::text;
  end if;

  v_total := coalesce(array_length(v_labels, 1), 0);

  for v_i in 1 .. v_total loop
    perform set_config('request.jwt.claims',
      case when v_users[v_i] is null then ''
           else json_build_object('sub', v_users[v_i], 'role', 'authenticated')::text end,
      true);
    execute 'set local role authenticated';
    begin
      execute v_sqls[v_i] into v_got;
      v_got := coalesce(v_got, 'null');
    exception when others then
      v_got := 'error';
    end;
    execute 'reset role';

    if v_got is distinct from v_expect[v_i] then
      v_failed := v_failed || format('%s (expected %s, got %s)', v_labels[v_i], v_expect[v_i], v_got);
    end if;
  end loop;

  perform set_config('request.jwt.claims', '', true);

  if coalesce(array_length(v_failed, 1), 0) = 0 then
    raise exception 'TENANT ISOLATION PASSED: % of % checks. (This error is expected: it rolls back the test data.)',
      v_total, v_total;
  else
    raise exception 'TENANT ISOLATION FAILED: % of % checks. Failed: %',
      array_length(v_failed, 1), v_total, array_to_string(v_failed, ' | ');
  end if;
end
$$;
