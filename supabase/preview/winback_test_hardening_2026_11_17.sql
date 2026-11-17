-- WinBack-Test only — security-advisor hardening (PROPOSED, NOT YET APPLIED)
-- Prepared 2026-11-17 during the beta sprint. Review, then run in the
-- WinBack-Test SQL editor. Touches no rows; only privileges/settings.
--
-- 1. public.handle_new_user() is a trigger function but is exposed as
--    /rest/v1/rpc/handle_new_user to anon + authenticated (advisor 0028/0029).
--    Triggers do not need EXECUTE at fire time, so revoking is safe.
-- 2. public.set_updated_at() has a mutable search_path (advisor 0011).
begin;

do $$
begin
  if to_regnamespace('winback_test_marker') is null then
    raise exception 'STOPPED: not WinBack-Test. Nothing was changed.';
  end if;
end
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
alter function public.set_updated_at() set search_path = '';

commit;
