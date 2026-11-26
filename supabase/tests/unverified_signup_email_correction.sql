-- Run after 20261126000051_unverified_signup_email_conflict.sql. All fixture data rolls back.
begin;

create function pg_temp.assert_true(p_name text, p_value boolean)
returns void language plpgsql as $function$
begin
  if not p_value then raise exception 'FAIL %', p_name; end if;
  raise notice 'PASS %', p_name;
end
$function$;

do $tests$
declare
  v_existing_user uuid := '00000000-0000-0000-0000-0000000000e1';
  v_other_user uuid := '00000000-0000-0000-0000-0000000000e2';
  v_sso_user uuid := '00000000-0000-0000-0000-0000000000e3';
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values
    (v_existing_user, 'correction-existing@resend.invalid', '{}'::jsonb),
    (v_other_user, 'correction-pending@resend.invalid', '{}'::jsonb);
  insert into auth.users (id, email, raw_user_meta_data, is_sso_user)
  values (v_sso_user, 'correction-sso@resend.invalid', '{}'::jsonb, true);

  perform pg_temp.assert_true(
    'detects an email owned by another active auth user',
    public.unverified_signup_email_in_use('CORRECTION-EXISTING@resend.invalid', v_other_user)
  );
  perform pg_temp.assert_true(
    'does not treat the current user as a conflict',
    not public.unverified_signup_email_in_use('correction-pending@resend.invalid', v_other_user)
  );
  perform pg_temp.assert_true(
    'matches the Auth email uniqueness rule for SSO users',
    not public.unverified_signup_email_in_use('correction-sso@resend.invalid', v_other_user)
  );
  perform pg_temp.assert_true(
    'email conflict lookup is restricted to the service role',
    has_function_privilege('service_role', 'public.unverified_signup_email_in_use(text,uuid)', 'execute')
      and not has_function_privilege('anon', 'public.unverified_signup_email_in_use(text,uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.unverified_signup_email_in_use(text,uuid)', 'execute')
  );
end
$tests$;

rollback;
