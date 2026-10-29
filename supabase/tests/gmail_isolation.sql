-- WinBack — Gmail integration isolation test (two separate businesses)
--
-- Run in the Supabase SQL Editor AFTER 0012_gmail_integration.sql, on the
-- Preview database first. Paste the whole file and press Run.
--
-- IT ALWAYS ENDS WITH AN ERROR, ON PURPOSE. The final RAISE carries the report
-- and rolls back everything this script created, so no test user, business,
-- connection, email or draft is left behind and no existing row is touched.
--   Pass:  ERROR: GMAIL ISOLATION PASSED: N of N checks ...
--   Fail:  ERROR: GMAIL ISOLATION FAILED: ... followed by the failed checks.
--
-- What it does, inside that one rolled-back transaction:
--   1. Creates two throwaway sign-ups, Alice and Bob, each with a business.
--   2. Gives each business a Gmail connection, an encrypted-token row (fake),
--      an incoming email from its own lead, and an AI reply draft.
--   3. Becomes Alice, then Bob, exactly as the app does, and checks what each
--      can read and write. Then checks, as the server's own role, that a row
--      can never point at another business's connection, email or lead.

do $$
declare
  v_alice uuid := gen_random_uuid();
  v_bob uuid := gen_random_uuid();
  v_a uuid;
  v_b uuid;
  v_lead_a uuid;
  v_lead_b uuid;
  v_conn_a uuid;
  v_conn_b uuid;
  v_msg_a uuid;
  v_msg_b uuid;
  v_draft_a uuid;
  v_draft_b uuid;

  v_labels text[] := '{}';
  v_users uuid[] := '{}';
  v_sqls text[] := '{}';
  v_expect text[] := '{}';

  v_i integer;
  v_got text;
  v_failed text[] := '{}';
  v_total integer;
  v_owner_checks integer := 0;
begin
  if to_regclass('public.gmail_connections') is null then
    raise exception 'GMAIL ISOLATION NOT RUN: run 0012_gmail_integration.sql first.';
  end if;

  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_alice, 'authenticated', 'authenticated', 'alice.gmail-test@example.com',
     '{"full_name":"Alice Test","business_name":"Alice Plumbing (test)"}', now(), now()),
    (v_bob, 'authenticated', 'authenticated', 'bob.gmail-test@example.com',
     '{"full_name":"Bob Test","business_name":"Bob HVAC (test)"}', now(), now());

  select business_id into v_a from public.business_members where user_id = v_alice;
  select business_id into v_b from public.business_members where user_id = v_bob;
  if v_a is null or v_b is null then
    raise exception 'GMAIL ISOLATION NOT RUN: the signup trigger did not create a business for each test user.';
  end if;

  insert into public.leads (business_id, customer_name, phone, service, email)
  values (v_a, 'Lead of A', '+13055550111', 'Pipe repair', 'customer.a@example.com')
  returning id into v_lead_a;
  insert into public.leads (business_id, customer_name, phone, service, email)
  values (v_b, 'Lead of B', '+13055550122', 'AC install', 'customer.b@example.com')
  returning id into v_lead_b;

  insert into public.gmail_connections (business_id, email_address)
  values (v_a, 'alice-inbox@example.com') returning id into v_conn_a;
  insert into public.gmail_connections (business_id, email_address)
  values (v_b, 'bob-inbox@example.com') returning id into v_conn_b;

  insert into public.gmail_connection_secrets (connection_id, business_id, refresh_token_encrypted)
  values (v_conn_a, v_a, 'v1:fake-a'), (v_conn_b, v_b, 'v1:fake-b');

  insert into public.email_messages
    (business_id, connection_id, lead_id, direction, gmail_message_id, gmail_thread_id,
     from_address, subject, body_text, received_at)
  values (v_a, v_conn_a, v_lead_a, 'inbound', 'gm-a', 'gt-a', 'customer.a@example.com',
          'Question A', 'secret text of A', now())
  returning id into v_msg_a;
  insert into public.email_messages
    (business_id, connection_id, lead_id, direction, gmail_message_id, gmail_thread_id,
     from_address, subject, body_text, received_at)
  values (v_b, v_conn_b, v_lead_b, 'inbound', 'gm-b', 'gt-b', 'customer.b@example.com',
          'Question B', 'secret text of B', now())
  returning id into v_msg_b;

  insert into public.email_drafts (business_id, email_message_id, lead_id, to_address, subject, body)
  values (v_a, v_msg_a, v_lead_a, 'customer.a@example.com', 'Re: Question A', 'draft A')
  returning id into v_draft_a;
  insert into public.email_drafts (business_id, email_message_id, lead_id, to_address, subject, body)
  values (v_b, v_msg_b, v_lead_b, 'customer.b@example.com', 'Re: Question B', 'draft B')
  returning id into v_draft_b;

  -- Read checks ------------------------------------------------------------
  v_labels := v_labels || 'Alice sees exactly her 1 Gmail connection'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || 'select count(*) from public.gmail_connections'::text;
  v_expect := v_expect || '1'::text;

  v_labels := v_labels || 'Alice cannot see Bob''s connected address'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format('select count(*) from public.gmail_connections where business_id = %L', v_b);
  v_expect := v_expect || '0'::text;

  v_labels := v_labels || 'Bob sees exactly his 1 Gmail connection'::text;
  v_users := v_users || v_bob;
  v_sqls := v_sqls || 'select count(*) from public.gmail_connections'::text;
  v_expect := v_expect || '1'::text;

  v_labels := v_labels || 'Alice cannot read any token row, not even her own'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || 'select count(*) from public.gmail_connection_secrets'::text;
  v_expect := v_expect || 'error'::text;

  v_labels := v_labels || 'Bob cannot read any token row'::text;
  v_users := v_users || v_bob;
  v_sqls := v_sqls || format('select refresh_token_encrypted from public.gmail_connection_secrets where business_id = %L', v_a);
  v_expect := v_expect || 'error'::text;

  v_labels := v_labels || 'Alice sees her own incoming email'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format('select count(*) from public.email_messages where id = %L', v_msg_a);
  v_expect := v_expect || '1'::text;

  v_labels := v_labels || 'Alice sees no email of B'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format('select count(*) from public.email_messages where business_id = %L', v_b);
  v_expect := v_expect || '0'::text;

  v_labels := v_labels || 'Bob cannot find A''s email by its text'::text;
  v_users := v_users || v_bob;
  v_sqls := v_sqls || 'select count(*) from public.email_messages where body_text like ''%of A%'''::text;
  v_expect := v_expect || '0'::text;

  v_labels := v_labels || 'Bob sees exactly his 1 draft'::text;
  v_users := v_users || v_bob;
  v_sqls := v_sqls || 'select count(*) from public.email_drafts'::text;
  v_expect := v_expect || '1'::text;

  v_labels := v_labels || 'Bob sees no draft of A'::text;
  v_users := v_users || v_bob;
  v_sqls := v_sqls || format('select count(*) from public.email_drafts where id = %L', v_draft_a);
  v_expect := v_expect || '0'::text;

  -- Write checks: the browser can never write these tables directly ---------
  v_labels := v_labels || 'Alice cannot mark her own draft as sent from the browser'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format(
    'with x as (update public.email_drafts set status = ''sent'' where id = %L returning 1) select count(*) from x',
    v_draft_a);
  v_expect := v_expect || 'error'::text;

  v_labels := v_labels || 'Alice cannot edit B''s draft'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format(
    'with x as (update public.email_drafts set body = ''hacked'' where id = %L returning 1) select count(*) from x',
    v_draft_b);
  v_expect := v_expect || 'error'::text;

  v_labels := v_labels || 'Alice cannot insert a draft'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format(
    'insert into public.email_drafts (business_id, email_message_id, to_address, subject, body) values (%L, %L, ''x@example.com'', ''x'', ''x'') returning 1',
    v_a, v_msg_a);
  v_expect := v_expect || 'error'::text;

  v_labels := v_labels || 'Alice cannot plant a fake email in B'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format(
    'insert into public.email_messages (business_id, connection_id, direction, gmail_message_id, gmail_thread_id, from_address, received_at) values (%L, %L, ''inbound'', ''x'', ''x'', ''x@example.com'', now()) returning 1',
    v_b, v_conn_b);
  v_expect := v_expect || 'error'::text;

  v_labels := v_labels || 'Alice cannot point B''s connection at her own inbox'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format(
    'with x as (update public.gmail_connections set email_address = ''evil@example.com'' where business_id = %L returning 1) select count(*) from x',
    v_b);
  v_expect := v_expect || 'error'::text;

  v_labels := v_labels || 'Alice cannot delete B''s connection'::text;
  v_users := v_users || v_alice;
  v_sqls := v_sqls || format(
    'with x as (delete from public.gmail_connections where business_id = %L returning 1) select count(*) from x',
    v_b);
  v_expect := v_expect || 'error'::text;

  v_labels := v_labels || 'Anonymous visitor sees no connection'::text;
  v_users := v_users || null::uuid;
  v_sqls := v_sqls || 'select count(*) from public.gmail_connections'::text;
  v_expect := v_expect || '0'::text;

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

  -- Server-side integrity: even WinBack's own server (which bypasses RLS)
  -- cannot attach a row to another business's connection, email or lead.
  begin
    insert into public.email_messages
      (business_id, connection_id, direction, gmail_message_id, gmail_thread_id, from_address, received_at)
    values (v_a, v_conn_b, 'inbound', 'x1', 'x1', 'x@example.com', now());
    v_failed := v_failed || 'Server can file an email under A using B''s connection'::text;
  exception when others then null;
  end;
  v_owner_checks := v_owner_checks + 1;

  begin
    insert into public.email_messages
      (business_id, connection_id, lead_id, direction, gmail_message_id, gmail_thread_id, from_address, received_at)
    values (v_a, v_conn_a, v_lead_b, 'inbound', 'x2', 'x2', 'x@example.com', now());
    v_failed := v_failed || 'Server can match A''s email to B''s lead'::text;
  exception when others then null;
  end;
  v_owner_checks := v_owner_checks + 1;

  begin
    insert into public.email_drafts (business_id, email_message_id, to_address, subject, body)
    values (v_a, v_msg_b, 'x@example.com', 'x', 'x');
    v_failed := v_failed || 'Server can draft a reply in A to B''s email'::text;
  exception when others then null;
  end;
  v_owner_checks := v_owner_checks + 1;

  begin
    insert into public.gmail_connection_secrets (connection_id, business_id, refresh_token_encrypted)
    values (v_conn_b, v_a, 'v1:x')
    on conflict (connection_id) do update set business_id = excluded.business_id;
    v_failed := v_failed || 'Server can file B''s token under A'::text;
  exception when others then null;
  end;
  v_owner_checks := v_owner_checks + 1;

  begin
    insert into public.email_drafts (business_id, email_message_id, to_address, subject, body)
    values (v_a, v_msg_a, 'x@example.com', 'x', 'second open draft');
    v_failed := v_failed || 'Two open drafts for one email are allowed'::text;
  exception when others then null;
  end;
  v_owner_checks := v_owner_checks + 1;

  v_total := v_total + v_owner_checks;

  if coalesce(array_length(v_failed, 1), 0) = 0 then
    raise exception 'GMAIL ISOLATION PASSED: % of % checks. (This error is expected: it rolls back the test data.)',
      v_total, v_total;
  else
    raise exception 'GMAIL ISOLATION FAILED: % of % checks. Failed: %',
      array_length(v_failed, 1), v_total, array_to_string(v_failed, ' | ');
  end if;
end
$$;
