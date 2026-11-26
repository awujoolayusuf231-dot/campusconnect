begin;

create function public.unverified_signup_email_in_use(p_email text, p_exclude_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from auth.users
    where is_sso_user = false
      and id <> p_exclude_user_id
      and lower(email) = lower(p_email)
  )
$function$;

revoke all on function public.unverified_signup_email_in_use(text, uuid)
  from public, anon, authenticated;
grant execute on function public.unverified_signup_email_in_use(text, uuid)
  to service_role;

commit;
