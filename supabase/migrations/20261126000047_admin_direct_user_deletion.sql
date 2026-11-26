begin;

do $preflight$
begin
  if to_regclass('public.account_deletion_requests') is null
     or to_regclass('public.admin_audit_logs') is null
     or to_regprocedure('public.has_permission(text)') is null
     or to_regprocedure('public.role_rank(public.app_role)') is null
     or to_regprocedure('public.log_admin_action(uuid,text,text,text,text,jsonb)') is null then
    raise exception 'Direct account deletion requires identity, RBAC, deletion-request, and audit foundations';
  end if;
end
$preflight$;

create function public.admin_request_user_deletion(p_target uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor is null or not public.has_permission('users.moderate') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_target is null or p_target = v_actor then
    raise exception 'cannot_delete_self_or_missing_target' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) < 5 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_target) then
    raise exception 'target_not_found' using errcode = '22023';
  end if;
  if coalesce(
    (select ur.role from public.user_roles ur where ur.user_id = p_target),
    'student'::public.app_role
  ) <> 'student'::public.app_role then
    raise exception 'direct_deletion_only_available_for_student_accounts' using errcode = '42501';
  end if;

  insert into public.account_deletion_requests (user_id, status, requested_at, processed_by, processed_at)
  values (p_target, 'pending', now(), null, null)
  on conflict (user_id) do update
    set status = 'pending', requested_at = now(), processed_by = null, processed_at = null
    where public.account_deletion_requests.status in ('cancelled', 'completed');

  perform public.log_admin_action(
    v_actor, 'account.deletion_requested_by_admin', 'user', p_target::text,
    v_reason, jsonb_build_object('target_user_id', p_target, 'request_source', 'admin_users_dashboard')
  );
end
$function$;

create or replace function public.admin_begin_account_deletion(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_actor_rank integer;
  v_target_rank integer;
begin
  if v_actor is null or not public.has_permission('users.moderate') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_target = v_actor then
    raise exception 'another administrator must approve your deletion' using errcode = '42501';
  end if;

  v_actor_rank := public.role_rank(public.current_app_role());
  select public.role_rank(coalesce(
    (select ur.role from public.user_roles ur where ur.user_id = p_target),
    'student'::public.app_role
  )) into v_target_rank;
  if v_target_rank >= v_actor_rank then
    raise exception 'insufficient_rank' using errcode = '42501';
  end if;

  update public.account_deletion_requests
  set status = 'completed', processed_by = v_actor, processed_at = now()
  where user_id = p_target and status = 'pending';
  if not found then
    raise exception 'pending_deletion_request_not_found' using errcode = '22023';
  end if;

  perform public.log_admin_action(
    v_actor, 'account.deletion_approved', 'user', p_target::text,
    'Account deletion approved; auth user deletion requested',
    jsonb_build_object('target_user_id', p_target)
  );
end
$function$;

revoke all on function public.admin_request_user_deletion(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_request_user_deletion(uuid, text) to authenticated;

revoke all on function public.admin_begin_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.admin_begin_account_deletion(uuid) to authenticated;

commit;
