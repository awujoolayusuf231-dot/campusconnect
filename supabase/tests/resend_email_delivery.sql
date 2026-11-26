-- Run after 20261126000049_resend_email_delivery.sql. All fixture data rolls back.
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
  v_user uuid := '00000000-0000-0000-0000-0000000000e1';
  v_actor uuid := '00000000-0000-0000-0000-0000000000e2';
  v_notification bigint;
  v_outbox_id bigint;
  v_result text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values
    (v_user, 'email-outbox-user@resend.invalid', jsonb_build_object(
      'username', 'email_outbox_user',
      'display_name', 'Email Outbox User'
    )),
    (v_actor, 'email-outbox-actor@resend.invalid', jsonb_build_object(
      'username', 'email_outbox_actor',
      'display_name', 'Email Outbox Actor'
    ));

  insert into public.user_preferences (user_id) values (v_user);
  perform pg_temp.assert_true(
    'activity emails are opt-in by default',
    (select notify_email is false from public.user_preferences where user_id = v_user)
  );
  perform pg_temp.assert_true(
    'unverified registrations do not enqueue a welcome message',
    not exists (select 1 from public.email_outbox where user_id = v_user and message_type = 'welcome')
  );

  update auth.users set email_confirmed_at = now() where id = v_user;
  perform pg_temp.assert_true(
    'welcome message is queued after email confirmation',
    (select count(*) = 1 from public.email_outbox where user_id = v_user and message_type = 'welcome')
  );
  update auth.users set email_confirmed_at = now() + interval '1 second' where id = v_user;
  perform pg_temp.assert_true(
    'welcome email is deduplicated across later Auth updates',
    (select count(*) = 1 from public.email_outbox where user_id = v_user and message_type = 'welcome')
  );

  insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, dedupe_key)
  values (v_user, 'message', v_actor, 'conversation', gen_random_uuid(), 'email-outbox-opted-out')
  returning id into v_notification;
  perform pg_temp.assert_true(
    'regular activity is not emailed without opt-in',
    not exists (select 1 from public.email_outbox where notification_id = v_notification)
  );

  update public.user_preferences set notify_email = true where user_id = v_user;
  insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, dedupe_key)
  values (v_user, 'message', v_actor, 'conversation', gen_random_uuid(), 'email-outbox-opted-in')
  returning id into v_notification;
  perform pg_temp.assert_true(
    'opted-in activity is queued once',
    (select count(*) = 1 from public.email_outbox where notification_id = v_notification and status = 'pending')
  );

  update public.user_preferences set notify_email = false where user_id = v_user;
  insert into public.notifications (user_id, type, dedupe_key)
  values (v_user, 'moderation_warning', 'email-outbox-moderation-warning')
  returning id into v_notification;
  perform pg_temp.assert_true(
    'important moderation notices bypass the activity email opt-out',
    exists (select 1 from public.email_outbox where notification_id = v_notification)
  );

  select id into v_outbox_id
  from public.email_outbox
  where notification_id = v_notification;
  v_result := pg_temp.act(v_user, 'service_role', 'select * from public.claim_email_outbox(100)');
  perform pg_temp.assert_true('service role claims pending email jobs', v_result = 'ok');
  v_result := pg_temp.act(v_user, 'service_role', format(
    'select public.finish_email_outbox(%s, %L, null, %L)',
    v_outbox_id, 'accepted', 'resend_test_email_id'
  ));
  perform pg_temp.assert_true('worker records provider acceptance', v_result = 'ok');
  v_result := pg_temp.act(v_user, 'service_role', format(
    'select public.record_resend_email_event(%L, %L, %L, %L::timestamptz)',
    'resend-test-event', 'resend_test_email_id', 'email.delivered', now()
  ));
  perform pg_temp.assert_true('webhook records delivery status', v_result = 'ok');
  perform pg_temp.assert_true(
    'provider delivery updates outbox status',
    (select status = 'delivered' from public.email_outbox where id = v_outbox_id)
  );
  v_result := pg_temp.act(v_user, 'service_role', format(
    'select public.record_resend_email_event(%L, null, %L, %L::timestamptz, %s)',
    'resend-tag-only-event', 'email.suppressed', now(), v_outbox_id
  ));
  perform pg_temp.assert_true('webhook correlates events through the outbox tag', v_result = 'ok');
  perform pg_temp.assert_true(
    'tag-correlated suppression events update outbox status',
    (select status = 'suppressed' from public.email_outbox where id = v_outbox_id)
  );
  v_result := pg_temp.act(v_user, 'service_role', format(
    'select public.record_resend_email_event(%L, null, %L, %L::timestamptz, %s)',
    'resend-tag-only-event', 'email.suppressed', now(), v_outbox_id
  ));
  perform pg_temp.assert_true('webhook retries are idempotent', v_result = 'ok');

  perform pg_temp.assert_true(
    'authenticated users cannot read the email outbox',
    not has_table_privilege('authenticated', 'public.email_outbox', 'select')
  );
  perform pg_temp.assert_true(
    'authenticated users cannot read provider events',
    not has_table_privilege('authenticated', 'public.email_delivery_events', 'select')
  );
  v_result := pg_temp.act(v_user, 'authenticated', 'select * from public.claim_email_outbox(1)');
  perform pg_temp.assert_true('only the service role can claim email jobs', v_result like 'err:%');
end
$tests$;

rollback;
