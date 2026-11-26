-- Run after 20261126000050_resend_audience_contact_sync.sql. All fixture data rolls back.
begin;

create function pg_temp.act(p_uid uuid, p_role text, p_sql text)
returns text language plpgsql as $function$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
  exception when others then
    execute 'reset role';
    return 'err:' || sqlerrm;
  end;
  execute 'reset role';
  return 'ok';
end
$function$;

create function pg_temp.assert_true(p_name text, p_value boolean)
returns void language plpgsql as $function$
begin
  if not p_value then raise exception 'FAIL %', p_name; end if;
  raise notice 'PASS %', p_name;
end
$function$;

do $tests$
declare
  v_consented_user uuid := '00000000-0000-0000-0000-0000000000f1';
  v_nonconsented_user uuid := '00000000-0000-0000-0000-0000000000f2';
  v_result text;
  v_status jsonb;
begin
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values
    (v_consented_user, 'resend-consented@resend.invalid', now() - interval '1 day',
      jsonb_build_object('username', 'resend_consented', 'display_name', 'Resend Consented', 'marketing_email_consent', true)),
    (v_nonconsented_user, 'resend-nonconsented@resend.invalid', now() - interval '1 day',
      jsonb_build_object('username', 'resend_nonconsent', 'display_name', 'Resend Nonconsent', 'marketing_email_consent', false));

  perform pg_temp.assert_true(
    'signup records explicit consent separately from notification preferences',
    (select marketing_email_consent and marketing_email_consent_at is not null
     from public.user_preferences where user_id = v_consented_user)
    and (select not marketing_email_consent and marketing_email_consent_at is null
         from public.user_preferences where user_id = v_nonconsented_user)
  );
  perform pg_temp.assert_true(
    'new registrations enter the private sync queue',
    (select count(*) = 2 from public.resend_contact_sync_state where user_id in (v_consented_user, v_nonconsented_user))
  );
  perform pg_temp.assert_true(
    'sync state is not readable by authenticated users',
    not has_table_privilege('authenticated', 'public.resend_contact_sync_state', 'select')
  );

  insert into public.user_roles (user_id, role) values (v_consented_user, 'owner');
  v_result := pg_temp.act(v_consented_user, 'authenticated', 'select public.admin_queue_resend_contact_backfill()');
  perform pg_temp.assert_true('authorized admin can queue the backfill', v_result = 'ok');
  v_result := pg_temp.act(v_consented_user, 'authenticated', 'select public.admin_resend_contact_sync_stats()');
  perform pg_temp.assert_true('authorized admin can retrieve aggregate sync status', v_result = 'ok');

  select public.admin_resend_contact_sync_stats() into v_status;
  perform pg_temp.assert_true(
    'sync status reports eligible users and skips users without consent',
    (v_status ->> 'total_eligible')::integer >= 1
      and (v_status ->> 'skipped_consent')::integer >= 1
  );

  v_result := pg_temp.act(v_consented_user, 'service_role', format(
    'select public.record_resend_contact_unsubscribe(%L, %L, %L, %L, %L::timestamptz)',
    'contact-unsubscribe-event-1', 'resend-contact-1', 'test-audience',
    'resend-consented@resend.invalid', now() + interval '1 minute'
  ));
  perform pg_temp.assert_true('service webhook can record an unsubscribe event', v_result = 'ok');
  perform pg_temp.assert_true(
    'unsubscribe is persisted for future synchronisations',
    (select provider_unsubscribed
     from public.resend_contact_sync_state where user_id = v_consented_user)
  );
  v_result := pg_temp.act(v_consented_user, 'service_role', format(
    'select public.record_resend_contact_unsubscribe(%L, %L, %L, %L, %L::timestamptz)',
    'contact-unsubscribe-event-1', 'resend-contact-1', 'test-audience',
    'resend-consented@resend.invalid', now() + interval '1 minute'
  ));
  perform pg_temp.assert_true('duplicate contact webhook events are idempotent', v_result = 'ok');

  v_result := pg_temp.act(v_nonconsented_user, 'authenticated', 'select * from public.claim_resend_contact_sync(1)');
  perform pg_temp.assert_true('only the service role can claim contact sync jobs', v_result like 'err:%');
end
$tests$;

rollback;
