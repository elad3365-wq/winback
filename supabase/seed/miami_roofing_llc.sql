-- WinBack — fictional test business: Miami Roofing LLC
--
-- Run in the Supabase SQL Editor AFTER 0011_multi_business.sql.
-- Safe to run more than once: it only ever INSERTS, and only when the row is
-- missing. It never updates or deletes anything, so every existing business
-- (including FragraMood) and its leads, AI settings and activity stay as they
-- are.
--
-- Everything here is fictional. Phone numbers use the 555-01xx range, which is
-- reserved for fiction and never rings a real person.
--
-- Change v_email below if the test business should belong to another account.

do $$
declare
  v_email constant text := 'elad3365@gmail.com';
  v_name constant text := 'Miami Roofing LLC';
  v_user uuid;
  v_business uuid;
  v_has_profile_cols boolean;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email) limit 1;
  if v_user is null then
    raise exception 'No WinBack account with the email %. Sign up first, then run this again.', v_email;
  end if;

  select id into v_business
  from public.businesses
  where owner_id = v_user and name = v_name
  order by created_at
  limit 1;

  if v_business is null then
    insert into public.businesses (name, owner_id)
    values (v_name, v_user)
    returning id into v_business;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'businesses' and column_name = 'business_type'
    ) into v_has_profile_cols;

    -- Only the row created just above is filled in.
    if v_has_profile_cols then
      execute
        'update public.businesses set
           business_type = ''Roofing'', phone = ''+13055550142'',
           email = ''office@miamiroofing.example'', country = ''United States'',
           state = ''FL'', city = ''Miami'', currency = ''USD'',
           monthly_estimates = 40, average_estimate_value = 12000, employee_count = 12,
           current_follow_up_method = ''Sometimes''
         where id = $1'
      using v_business;
    end if;
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (v_business, v_user, 'owner')
  on conflict (business_id, user_id) do nothing;

  if to_regclass('public.business_ai_settings') is not null then
    execute
      'insert into public.business_ai_settings
         (business_id, financing_available, payment_plans_available,
          ai_can_offer_discounts, maximum_discount_percent, business_hours, additional_rules)
       values ($1, true, false, true, 3, ''Mon-Sat 7am-6pm ET'',
               ''Mention our 10-year workmanship warranty. Never promise a start date.'')
       on conflict (business_id) do nothing'
    using v_business;
  end if;

  -- Two fictional leads, added only while the business has none, so a second
  -- run never duplicates them.
  if not exists (select 1 from public.leads where business_id = v_business) then
    insert into public.leads (business_id, customer_name, phone, service, estimate_amount, status, created_by)
    values
      (v_business, 'Carlos Test-Rivera', '+13055550101', 'Full roof replacement (shingle)', 18500, 'new', v_user),
      (v_business, 'Dana Test-Brooks', '+13055550102', 'Hurricane damage repair', 6200, 'follow_up_needed', v_user);
  end if;

  raise notice 'Miami Roofing LLC is business % and belongs to %.', v_business, v_email;
end
$$;

-- Shows the result: every business this account belongs to, and how many leads
-- each one has. FragraMood should be listed unchanged next to Miami Roofing LLC.
select b.name, b.id, bm.role, b.created_at,
       (select count(*) from public.leads l where l.business_id = b.id) as leads
from public.business_members bm
join public.businesses b on b.id = bm.business_id
join auth.users u on u.id = bm.user_id
where lower(u.email) = lower('elad3365@gmail.com')
order by b.created_at;
