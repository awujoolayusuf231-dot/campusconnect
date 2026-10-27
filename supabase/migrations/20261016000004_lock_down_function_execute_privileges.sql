-- 0004 SECURITY FIX: functions created in 0001 were executable by PUBLIC/anon (incl. log_admin_action,
-- which would let anyone forge audit entries). Revoke everything, re-grant only what the app needs.
-- RULE FOR ALL FUTURE MIGRATIONS: end every migration that creates functions with an explicit
-- "revoke execute ... from public, anon, authenticated" + targeted grants. Do not rely on default privileges.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.has_permission(text), public.current_app_role(), public.is_staff(),
  public.current_institution_id(), public.account_is_listed(uuid), public.account_effective_status(uuid),
  public.role_rank(public.app_role),
  public.admin_set_role(uuid, public.app_role, text),
  public.admin_set_staff_permission(uuid, text, boolean, text),
  public.admin_set_account_status(uuid, public.account_status, text, boolean, boolean, timestamptz),
  public.request_account_deletion(), public.cancel_account_deletion()
  to authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
