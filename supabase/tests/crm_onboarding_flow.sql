-- WinBack — onboarding + CRM flow test (two fictional businesses)
--
-- WinBack-Test only (stops if winback_test_marker is missing). Complements
-- tenant_isolation.sql: that file checks who can READ what; this one walks the
-- write paths the app uses for onboarding and the leads CRM, as each user.
--
-- IT ALWAYS ENDS WITH AN ERROR, ON PURPOSE. The final RAISE carries the report
-- and rolls back everything, so no test user, business or lead is left behind.
--   Pass:  ERROR: CRM FLOW PASSED: N of N checks
--   Fail:  ERROR: CRM FLOW FAILED: k of N checks: <names>
--
-- Several checks pin down that RLS-blocked UPDATE/DELETE return 0 rows with
-- NO error. The app must therefore check the affected row count itself, or it
-- reports success for a change that never happened (fixed in the app on
-- 2026-11-18: leads actions, lead detail actions, onboarding).

do $$
begin
  if to_regnamespace('winback_test_marker') is null then
    raise exception 'STOPPED: winback_test_marker not found, this is not WinBack-Test. Nothing was changed.';
  end if;
end
$$;

do $$
declare
  v_alice uuid := gen_random_uuid();
  v_bob uuid := gen_random_uuid();
  v_a uuid;
  v_a2 uuid;
  v_b uuid;
  v_lead uuid;
  v_lead2 uuid;
  v_note uuid;
  v_n integer;
  v_txt text;
  v_ok boolean;
  v_total integer := 0;
  v_failed text[] := '{}';
begin
  -- Sign-ups: the on_auth_user_created trigger creates profile + business.
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (v_alice, 'authenticated', 'authenticated', 'alice.crm-test@example.com',
     '{"full_name":"Alice Test","business_name":"Alice Plumbing (test)"}', now(), now()),
    (v_bob, 'authenticated', 'authenticated', 'bob.crm-test@example.com',
     '{"full_name":"Bob Test","business_name":"Bob HVAC (test)"}', now(), now());

  select business_id into v_a from public.business_members where user_id = v_alice and role = 'owner';
  select business_id into v_b from public.business_members where user_id = v_bob and role = 'owner';

  v_total := v_total + 1;
  if v_a is null or v_b is null or v_a = v_b then v_failed := v_failed || 'signup creates one business each'; end if;

  v_total := v_total + 1;
  select count(*) into v_n from public.profiles where id in (v_alice, v_bob) and onboarding_completed = false;
  if v_n <> 2 then v_failed := v_failed || 'signup profile starts not-onboarded'; end if;

  -- ---------------------------------------------------------------- Alice
  perform set_config('request.jwt.claims', json_build_object('sub', v_alice, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- Onboarding (completeOnboardingAction)
  update public.businesses set name = 'Alice Plumbing LLC (test)', business_type = 'Plumbing',
    phone = '+13055550100', country = 'US', state = 'FL', city = 'Miami' where id = v_a;
  get diagnostics v_n = row_count;
  v_total := v_total + 1;
  if v_n <> 1 then v_failed := v_failed || 'owner onboarding updates own business'; end if;

  begin
    insert into public.business_ai_settings (business_id, financing_available, business_hours)
    values (v_a, true, 'Mon-Fri 8-5')
    on conflict (business_id) do update set financing_available = excluded.financing_available,
      business_hours = excluded.business_hours;
    v_ok := true;
  exception when others then v_ok := false; v_txt := sqlerrm;
  end;
  v_total := v_total + 1;
  if not v_ok then v_failed := v_failed || ('owner upserts AI settings: ' || v_txt); end if;

  update public.profiles set onboarding_completed = true where id = v_alice;
  get diagnostics v_n = row_count;
  v_total := v_total + 1;
  if v_n <> 1 then v_failed := v_failed || 'owner marks onboarding complete'; end if;

  -- Second business (createBusinessAction)
  v_a2 := public.create_business('Alice Roofing (test)', 'Roofing', null, '+13055550199');
  v_total := v_total + 1;
  select count(*) into v_n from public.business_members where business_id = v_a2 and user_id = v_alice and role = 'owner';
  if v_a2 is null or v_n <> 1 then v_failed := v_failed || 'create_business makes caller owner'; end if;
  v_total := v_total + 1;
  select count(*) into v_n from public.business_ai_settings where business_id = v_a2;
  if v_n <> 1 then v_failed := v_failed || 'create_business gives own AI settings'; end if;

  -- Leads CRUD (createLeadAction / updateLeadAction / updateLeadStatusAction)
  insert into public.leads (business_id, customer_name, phone, service, estimate_amount, status, created_by)
  values (v_a, 'Dana Test', '+13055550111', 'Water heater', 1850, 'new', v_alice) returning id into v_lead;
  insert into public.leads (business_id, customer_name, phone, service, estimate_amount, status, created_by)
  values (v_a2, 'Roof Lead Test', '+13055550112', 'Roof repair', 9000, 'contacted', v_alice) returning id into v_lead2;
  v_total := v_total + 1;
  if v_lead is null or v_lead2 is null then v_failed := v_failed || 'owner adds leads'; end if;

  insert into public.lead_activity (business_id, lead_id, type, metadata, created_by)
  values (v_a, v_lead, 'lead_created', '{"status":"new"}', v_alice);

  update public.leads set customer_name = 'Dana Whitfield (test)', estimate_amount = 2100
   where id = v_lead and business_id = v_a;
  get diagnostics v_n = row_count;
  v_total := v_total + 1;
  if v_n <> 1 then v_failed := v_failed || 'owner edits lead'; end if;

  update public.leads set status = 'interested' where id = v_lead and business_id = v_a;
  get diagnostics v_n = row_count;
  insert into public.lead_activity (business_id, lead_id, type, metadata, created_by)
  values (v_a, v_lead, 'status_changed', '{"from":"new","to":"interested"}', v_alice);
  v_total := v_total + 1;
  if v_n <> 1 then v_failed := v_failed || 'owner changes status'; end if;

  v_total := v_total + 1;
  select count(*) into v_n from public.lead_activity where lead_id = v_lead;
  if v_n <> 2 then v_failed := v_failed || 'activity history readable'; end if;

  -- Filtering stays inside the active business (the app filters by business_id).
  v_total := v_total + 1;
  select count(*) into v_n from public.leads where business_id = v_a and status = 'interested';
  if v_n <> 1 then v_failed := v_failed || 'status filter in business A'; end if;
  v_total := v_total + 1;
  select count(*) into v_n from public.leads where business_id = v_a2;
  if v_n <> 1 then v_failed := v_failed || 'business switch shows only A2 leads'; end if;

  -- Wrong-business filter on a real lead id: 0 rows, no error (what the
  -- switcher produces if a stale tab edits a lead after switching).
  update public.leads set status = 'lost' where id = v_lead and business_id = v_a2;
  get diagnostics v_n = row_count;
  v_total := v_total + 1;
  if v_n <> 0 then v_failed := v_failed || 'stale business filter changes nothing'; end if;

  -- Notes
  insert into public.lead_notes (business_id, lead_id, body, created_by)
  values (v_a, v_lead, 'Called, wants a quote by Friday', v_alice) returning id into v_note;
  update public.lead_notes set body = 'Called, wants quote by Fri' where id = v_note and business_id = v_a;
  get diagnostics v_n = row_count;
  v_total := v_total + 1;
  if v_n <> 1 then v_failed := v_failed || 'owner edits note'; end if;

  -- Note pointing at a lead of another business is rejected by trigger.
  begin
    insert into public.lead_notes (business_id, lead_id, body, created_by) values (v_a2, v_lead, 'x', v_alice);
    v_ok := true;
  exception when others then v_ok := false;
  end;
  v_total := v_total + 1;
  if v_ok then v_failed := v_failed || 'note with mismatched business rejected'; end if;

  execute 'reset role';

  -- ---------------------------------------------------------------- Bob
  perform set_config('request.jwt.claims', json_build_object('sub', v_bob, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  update public.leads set status = 'lost' where id = v_lead;
  get diagnostics v_n = row_count;
  v_total := v_total + 1;
  if v_n <> 0 then v_failed := v_failed || 'Bob cannot update Alice lead (0 rows, no error)'; end if;

  delete from public.leads where id = v_lead;
  get diagnostics v_n = row_count;
  v_total := v_total + 1;
  if v_n <> 0 then v_failed := v_failed || 'Bob cannot delete Alice lead (0 rows, no error)'; end if;

  update public.businesses set name = 'pwned' where id = v_a;
  get diagnostics v_n = row_count;
  v_total := v_total + 1;
  if v_n <> 0 then v_failed := v_failed || 'Bob cannot rename Alice business'; end if;

  begin
    insert into public.leads (business_id, customer_name, phone, service) values (v_a, 'x', '1', 'x');
    v_ok := true;
  exception when others then v_ok := false;
  end;
  v_total := v_total + 1;
  if v_ok then v_failed := v_failed || 'Bob cannot insert lead into A'; end if;

  begin
    insert into public.lead_activity (business_id, lead_id, type) values (v_b, v_lead, 'x');
    v_ok := true;
  exception when others then v_ok := false;
  end;
  v_total := v_total + 1;
  if v_ok then v_failed := v_failed || 'Bob cannot log activity on Alice lead'; end if;

  v_total := v_total + 1;
  select count(*) into v_n from public.leads;
  if v_n <> 0 then v_failed := v_failed || 'Bob sees no leads (empty account)'; end if;

  execute 'reset role';

  -- Bob joins A as a plain member (owner action, done as db owner here).
  insert into public.business_members (business_id, user_id, role) values (v_a, v_bob, 'member');

  perform set_config('request.jwt.claims', json_build_object('sub', v_bob, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  update public.businesses set name = 'member rename' where id = v_a;
  get diagnostics v_n = row_count;
  v_total := v_total + 1;
  if v_n <> 0 then v_failed := v_failed || 'member cannot edit business profile (0 rows)'; end if;

  update public.leads set status = 'call_requested' where id = v_lead and business_id = v_a;
  get diagnostics v_n = row_count;
  v_total := v_total + 1;
  if v_n <> 1 then v_failed := v_failed || 'member can work leads'; end if;

  execute 'reset role';

  -- ---------------------------------------------------------------- Alice deletes
  perform set_config('request.jwt.claims', json_build_object('sub', v_alice, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  delete from public.leads where id = v_lead and business_id = v_a;
  get diagnostics v_n = row_count;
  v_total := v_total + 1;
  if v_n <> 1 then v_failed := v_failed || 'owner deletes lead'; end if;

  delete from public.leads where id = v_lead and business_id = v_a;
  get diagnostics v_n = row_count;
  v_total := v_total + 1;
  if v_n <> 0 then v_failed := v_failed || 'second delete affects 0 rows'; end if;

  execute 'reset role';

  v_total := v_total + 1;
  select count(*) into v_n from public.lead_notes where lead_id = v_lead;
  select v_n + count(*) into v_n from public.lead_activity where lead_id = v_lead;
  if v_n <> 0 then v_failed := v_failed || 'lead delete cascades notes + activity'; end if;

  if cardinality(v_failed) = 0 then
    raise exception 'CRM FLOW PASSED: % of % checks', v_total, v_total;
  else
    raise exception 'CRM FLOW FAILED: % of % checks: %', cardinality(v_failed), v_total,
      array_to_string(v_failed, '; ');
  end if;
end
$$;
