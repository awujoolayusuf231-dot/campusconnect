-- Admin actions for processing account deletion requests.
begin;

do $preflight$
begin
  if to_regclass('public.account_deletion_requests') is null
     or to_regprocedure('public.has_permission(text)') is null
     or to_regprocedure('public.log_admin_action(uuid,text,text,text,text,jsonb)') is null then
    raise exception 'Account deletion actions require the identity and audit foundations';
  end if;
end
$preflight$;

create function public.admin_reject_account_deletion(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.has_permission('users.moderate') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.account_deletion_requests
  set status = 'cancelled', processed_by = v_actor, processed_at = now()
  where user_id = p_target and status = 'pending';
  if not found then
    raise exception 'pending_deletion_request_not_found' using errcode = '22023';
  end if;

  perform public.log_admin_action(
    v_actor, 'account.deletion_rejected', 'user', p_target::text,
    'Account deletion request rejected', '{}'::jsonb
  );
end
$function$;

create function public.admin_begin_account_deletion(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.has_permission('users.moderate') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_target = v_actor then
    raise exception 'another administrator must approve your deletion' using errcode = '22023';
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

create function public.admin_restore_account_deletion(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.has_permission('users.moderate') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.account_deletion_requests
  set status = 'pending', processed_by = null, processed_at = null
  where user_id = p_target
    and status = 'completed'
    and processed_by = v_actor;
  if not found then
    raise exception 'deletion_request_cannot_be_restored' using errcode = '22023';
  end if;

  perform public.log_admin_action(
    v_actor, 'account.deletion_failed', 'user', p_target::text,
    'Account deletion failed; request restored to pending',
    '{}'::jsonb
  );
end
$function$;

revoke all on function public.admin_reject_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.admin_begin_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.admin_restore_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.admin_reject_account_deletion(uuid) to authenticated;
grant execute on function public.admin_begin_account_deletion(uuid) to authenticated;
grant execute on function public.admin_restore_account_deletion(uuid) to authenticated;

commit;
