-- WinBack-Test — security tests for 0011 (per-business Gmail).
-- Run ONLY in WinBack-Test, AFTER applying 0011_business_gmail.sql.
--
-- Rollback-only: the whole script runs in ONE transaction ending in ROLLBACK,
-- so every fixture is undone and nothing persists. Each check prints NOTICE
-- "PASSED"; a "FAILED" aborts the (still rolled-back) transaction.
--
-- Covers: WinBack-Test guard present, tenant isolation (messages/replies),
-- server-only token access, approval integrity (owner-only + invalidation),
-- send restrictions (users cannot mark sent; backend can), and FK deletion
-- (deleting a lead nulls only lead_id, keeps business_id and the row).
--
-- Users: A = owner of business A, B = owner of business B, M = non-owner member of A.

do $$
begin
  if to_regnamespace('winback_test_marker') is null then
    raise exception 'STOPPED: not WinBack-Test (winback_test_marker missing).';
  end if;
  if to_regclass('public.business_gmail_connections') is null
     or to_regclass('public.business_email_messages') is null
     or to_regclass('public.business_email_replies') is null then
    raise exception 'STOPPED: 0011 has not been applied (tables missing).';
  end if;
end
$$;

begin;
set local client_min_messages = notice;

-- ---- Fixtures (as the privileged setup role) --------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tenant-a@winback.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'tenant-b@winback.test'),
  ('mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm', 'member-m@winback.test');

do $$
declare
  v_bus_a uuid; v_bus_b uuid; v_lead_a uuid; v_msg_a uuid; v_msg_b uuid;
begin
  select id into v_bus_a from public.businesses where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select id into v_bus_b from public.businesses where owner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  insert into public.business_members (business_id, user_id, role)
    values (v_bus_a, 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm', 'member')
    on conflict (business_id, user_id) do nothing;

  insert into public.leads (business_id, customer_name, phone, service)
    values (v_bus_a, 'Lead A', '+13050000001', 'Roof') returning id into v_lead_a;

  -- Messages are written by the backend (service role); here the setup role.
  insert into public.business_email_messages (business_id, gmail_message_id, direction, lead_id, subject, body_text)
    values (v_bus_a, 'gmail-A-1', 'inbound', v_lead_a, 'A subject', 'A body') returning id into v_msg_a;
  insert into public.business_email_messages (business_id, gmail_message_id, direction, subject, body_text)
    values (v_bus_b, 'gmail-B-1', 'inbound', 'B subject', 'B body') returning id into v_msg_b;

  -- A connection row with (dummy) encrypted tokens for business A.
  insert into public.business_gmail_connections (business_id, google_account_email, access_token_encrypted, refresh_token_encrypted)
    values (v_bus_a, 'shop-a@gmail.test', 'v1:enc:access', 'v1:enc:refresh');

  perform set_config('wt.bus_a', v_bus_a::text, true);
  perform set_config('wt.bus_b', v_bus_b::text, true);
  perform set_config('wt.lead_a', v_lead_a::text, true);
  perform set_config('wt.msg_a', v_msg_a::text, true);
  perform set_config('wt.msg_b', v_msg_b::text, true);
end
$$;

-- =============================================================================
-- TEST 1 — FK DELETION: deleting a lead nulls ONLY lead_id; business_id and the
-- message/reply rows survive. (Runs privileged; FK behavior is role-independent.)
-- =============================================================================
do $$
declare v_bus_a uuid; v_lead_a uuid; v_msg_a uuid; v_reply uuid;
        v_biz_after uuid; v_lead_after uuid; v_exists boolean;
begin
  v_bus_a := current_setting('wt.bus_a')::uuid;
  v_lead_a := current_setting('wt.lead_a')::uuid;
  v_msg_a := current_setting('wt.msg_a')::uuid;

  insert into public.business_email_replies (business_id, message_id, lead_id, status, body)
    values (v_bus_a, v_msg_a, v_lead_a, 'draft', 'draft body') returning id into v_reply;

  delete from public.leads where id = v_lead_a;

  select business_id, lead_id into v_biz_after, v_lead_after
    from public.business_email_messages where id = v_msg_a;
  select exists(select 1 from public.business_email_replies where id = v_reply) into v_exists;

  if v_biz_after = v_bus_a and v_lead_after is null and v_exists then
    raise notice 'TEST 1 PASSED: lead delete cleared only lead_id; business_id + rows intact';
  else
    raise exception 'TEST 1 FAILED: biz=% lead=% replyExists=%', v_biz_after, v_lead_after, v_exists;
  end if;
end
$$;

-- =============================================================================
-- TEST 2 — TENANT ISOLATION on replies: business A + message of business B is
-- rejected by the composite FK (runs as authenticated owner A).
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    insert into public.business_email_replies (business_id, message_id, status, body)
      values (current_setting('wt.bus_a')::uuid, current_setting('wt.msg_b')::uuid, 'draft', 'cross-tenant');
    raise exception 'TEST 2 FAILED: cross-tenant reply insert allowed';
  exception
    when foreign_key_violation then raise notice 'TEST 2 PASSED: cross-tenant reply rejected by composite FK';
  end;
end
$$;

-- =============================================================================
-- TEST 3 — TOKEN COLUMNS ARE SERVER-ONLY: authenticated cannot SELECT the
-- encrypted token columns, but may read status columns.
-- =============================================================================
do $$
declare v_email text;
begin
  -- Safe column: allowed.
  select google_account_email into v_email from public.business_gmail_connections
    where business_id = current_setting('wt.bus_a')::uuid;
  if v_email is null then raise exception 'TEST 3 FAILED: could not read status column'; end if;

  -- Token column: must be denied.
  begin
    perform access_token_encrypted from public.business_gmail_connections
      where business_id = current_setting('wt.bus_a')::uuid;
    raise exception 'TEST 3 FAILED: authenticated read an encrypted token column';
  exception
    when insufficient_privilege then raise notice 'TEST 3 PASSED: token columns not readable; status column readable';
  end;
end
$$;

-- =============================================================================
-- TEST 4 — MESSAGES: authenticated cannot forge (INSERT) or delete; may link a lead.
-- =============================================================================
do $$
begin
  begin
    insert into public.business_email_messages (business_id, gmail_message_id, direction)
      values (current_setting('wt.bus_a')::uuid, 'forged-1', 'inbound');
    raise exception 'TEST 4 FAILED: authenticated inserted a message';
  exception
    when insufficient_privilege then raise notice 'TEST 4a PASSED: message INSERT denied to users';
  end;

  begin
    delete from public.business_email_messages where id = current_setting('wt.msg_a')::uuid;
    raise exception 'TEST 4 FAILED: authenticated deleted a message';
  exception
    when insufficient_privilege then raise notice 'TEST 4b PASSED: message DELETE denied to users';
  end;
end
$$;

-- =============================================================================
-- TEST 5 — SEND IS BACKEND-ONLY: an authenticated user cannot set status='sent'.
-- =============================================================================
do $$
declare v_reply uuid;
begin
  insert into public.business_email_replies (business_id, message_id, status, body)
    values (current_setting('wt.bus_a')::uuid, current_setting('wt.msg_a')::uuid, 'draft', 'to send')
    returning id into v_reply;
  -- Owner approves first (allowed).
  update public.business_email_replies set status = 'approved' where id = v_reply;
  begin
    update public.business_email_replies set status = 'sent' where id = v_reply;
    raise exception 'TEST 5 FAILED: user marked a reply sent';
  exception
    when insufficient_privilege then raise notice 'TEST 5 PASSED: user cannot mark sent';
  end;
  perform set_config('wt.reply_approved', v_reply::text, true);
end
$$;

-- =============================================================================
-- TEST 6 — APPROVAL INTEGRITY: forged approver is ignored; a material edit
-- invalidates approval.
-- =============================================================================
do $$
declare v_reply uuid; v_by uuid; v_status text;
begin
  insert into public.business_email_replies (business_id, message_id, status, body)
    values (current_setting('wt.bus_a')::uuid, current_setting('wt.msg_a')::uuid, 'draft', 'original')
    returning id into v_reply;

  update public.business_email_replies set status = 'approved' where id = v_reply;
  select approved_by into v_by from public.business_email_replies where id = v_reply;
  if v_by <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' then
    raise exception 'TEST 6 FAILED: approver not server-stamped (got %)', v_by;
  end if;

  update public.business_email_replies set body = 'EDITED AFTER APPROVAL' where id = v_reply;
  select status into v_status from public.business_email_replies where id = v_reply;
  if v_status = 'edited' then
    raise notice 'TEST 6 PASSED: owner-stamped approval; material edit invalidated it';
  else
    raise exception 'TEST 6 FAILED: approval survived edit (status=%)', v_status;
  end if;
end
$$;

-- =============================================================================
-- TEST 7 — OWNER-ONLY APPROVAL: a non-owner member cannot approve.
-- =============================================================================
select set_config('request.jwt.claims', '{"sub":"mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm","role":"authenticated"}', true);

do $$
declare v_reply uuid;
begin
  insert into public.business_email_replies (business_id, message_id, status, body)
    values (current_setting('wt.bus_a')::uuid, current_setting('wt.msg_a')::uuid, 'draft', 'member draft')
    returning id into v_reply;
  begin
    update public.business_email_replies set status = 'approved' where id = v_reply;
    raise exception 'TEST 7 FAILED: non-owner member approved';
  exception
    when insufficient_privilege then raise notice 'TEST 7 PASSED: non-owner approval blocked';
  end;
end
$$;

-- =============================================================================
-- TEST 8 — BACKEND CAN SEND, then the sent reply is immutable to users.
-- =============================================================================
reset role;  -- back to the privileged setup role (service-role equivalent)

do $$
declare v_reply uuid;
begin
  v_reply := current_setting('wt.reply_approved')::uuid;  -- approved in TEST 5
  update public.business_email_replies
    set status = 'sent', sent_at = now(), gmail_sent_message_id = 'gmail-sent-1'
    where id = v_reply;
  raise notice 'TEST 8a PASSED: backend marked reply sent';

  -- Now a user must not be able to touch it.
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  set local role authenticated;
  begin
    update public.business_email_replies set body = 'tamper' where id = v_reply;
    raise exception 'TEST 8 FAILED: user modified a sent reply';
  exception
    when check_violation then raise notice 'TEST 8b PASSED: sent reply is immutable to users';
  end;
end
$$;

reset role;
rollback;
