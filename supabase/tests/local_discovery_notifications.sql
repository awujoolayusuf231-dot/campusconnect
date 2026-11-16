-- Local-only discovery and notification regression tests.
-- Run against a disposable database after the social visibility, notification,
-- Celebration Cards, and local discovery migrations. All fixture data rolls back.
begin;

create function pg_temp.act(p_uid uuid, p_role text, p_sql text)
returns text language plpgsql as $function$
declare
  v_rows integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
  exception when others then
    execute 'reset role';
    return 'err:' || sqlerrm;
  end;
  execute 'reset role';
  return 'ok:' || v_rows;
end
$function$;

create function pg_temp.assert_result(p_name text, p_got text, p_expected_prefix text)
returns void language plpgsql as $function$
begin
  if p_got not like p_expected_prefix || '%' then
    raise exception 'FAIL % -> % (expected %)', p_name, p_got, p_expected_prefix;
  end if;
  raise notice 'PASS %', p_name;
end
$function$;

do $tests$
declare
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_b uuid := '00000000-0000-0000-0000-0000000000b1';
  v_c uuid := '00000000-0000-0000-0000-0000000000c1';
  v_private uuid := '00000000-0000-0000-0000-0000000000d1';
  v_institution uuid;
  v_post uuid := '00000000-0000-0000-0000-0000000000e1';
  v_card uuid := '00000000-0000-0000-0000-0000000000f1';
  v_result text;
begin
  insert into public.institutions (name, type)
  values ('LOCAL DISCOVERY TEST INSTITUTION', 'university')
  returning id into v_institution;

  insert into auth.users (id, email, raw_user_meta_data)
  values
    (v_a, 'local-a@discovery.invalid', jsonb_build_object('username', 'local_a', 'institution_id', v_institution)),
    (v_b, 'local-b@discovery.invalid', jsonb_build_object('username', 'local_b', 'institution_id', v_institution)),
    (v_c, 'local-c@discovery.invalid', jsonb_build_object('username', 'local_c', 'institution_id', v_institution)),
    (v_private, 'local-private@discovery.invalid', jsonb_build_object('username', 'local_private', 'institution_id', v_institution));

  update public.profiles
  set location = 'Lagos, Nigeria', interests = array['Robotics', 'Design']
  where id = v_a;
  update public.profiles
  set location = '  lagos,   nigeria ', interests = array['robotics', 'Music']
  where id = v_b;
  update public.profiles
  set location = 'Lagos, Nigeria', interests = array['Robotics']
  where id = v_c;
  update public.profiles
  set location = 'Lagos, Nigeria', interests = array['Robotics'], visibility = 'private'
  where id = v_private;

  insert into public.user_preferences (user_id, notify_followed_posts, notify_celebrations)
  values
    (v_a, false, true),
    (v_b, true, true),
    (v_c, false, false),
    (v_private, false, true);

  insert into public.private_discovery_locations (user_id, city_state, location_key)
  values
    (v_a, 'Lagos, Nigeria', 'lagos, nigeria'),
    (v_private, 'Lagos, Nigeria', 'lagos, nigeria');

  v_result := pg_temp.act(v_b, 'authenticated',
    $$select public.set_my_discovery_location('  lagos, nigeria ', true)$$);
  perform pg_temp.assert_result('student can explicitly share a private city/state value', v_result, 'ok:1');

  v_result := pg_temp.act(v_b, 'authenticated', 'select * from public.private_discovery_locations');
  perform pg_temp.assert_result('students cannot read private location storage directly', v_result, 'err:permission denied');

  v_result := pg_temp.act(v_b, 'authenticated',
    format('select id from public.recommend_students(true, 24, 0) where id = %L and same_location', v_a));
  perform pg_temp.assert_result('opted-in city/state match is returned without exposing location text', v_result, 'ok:1');

  v_result := pg_temp.act(v_b, 'authenticated',
    format('select id from public.recommend_students(true, 24, 0) where id = %L', v_c));
  perform pg_temp.assert_result('students who have not opted in are absent from nearby discovery', v_result, 'ok:0');

  v_result := pg_temp.act(v_b, 'authenticated', 'select * from public.get_my_discovery_location()');
  perform pg_temp.assert_result('students can only read their own private discovery location', v_result, 'ok:1');

  v_result := pg_temp.act(v_b, 'authenticated',
    format('select id from public.recommend_students(true, 24, 0) where id = %L', v_private));
  perform pg_temp.assert_result('private profiles are excluded from nearby discovery', v_result, 'ok:0');

  v_result := pg_temp.act(v_b, 'authenticated',
    format('select id from public.recommend_students(false, 24, 0) where id = %L and shared_interests > 0', v_a));
  perform pg_temp.assert_result('local recommendations match interests', v_result, 'ok:1');

  v_result := pg_temp.act(v_b, 'authenticated', 'select public.set_my_discovery_location(null, false)');
  perform pg_temp.assert_result('opting out removes the stored discovery location', v_result, 'ok:1');

  v_result := pg_temp.act(null, 'anon', 'select * from public.recommend_students(false, 24, 0)');
  perform pg_temp.assert_result('anonymous users cannot call recommendations', v_result, 'err:permission denied');

  insert into public.follows (follower_id, followee_id)
  values (v_b, v_a), (v_c, v_a);

  execute format(
    'insert into public.posts (id, author_id, body, visibility) values (%L, %L, %L, %L)',
    v_post, v_a, 'Local notification test post', 'public'
  );
  v_result := pg_temp.act(v_b, 'authenticated',
    format('select id from public.notifications where user_id = %L and type = %L and entity_id = %L', v_b, 'followed_post', v_post));
  perform pg_temp.assert_result('opted-in follower receives visible post notification', v_result, 'ok:1');

  v_result := pg_temp.act(v_c, 'authenticated',
    format('select id from public.notifications where user_id = %L and type = %L and entity_id = %L', v_c, 'followed_post', v_post));
  perform pg_temp.assert_result('followed-post notification respects opt-out', v_result, 'ok:0');

  insert into public.celebration_cards (
    id, owner_id, title, category, celebrant_name, celebration_at, timezone, status, published_at
  ) values (
    v_card, v_a, 'Local test celebration', 'birthday', 'A Student',
    now() + interval '2 days', 'Africa/Lagos', 'published', now()
  );
  v_result := pg_temp.act(v_b, 'authenticated',
    format('select id from public.notifications where user_id = %L and type = %L and entity_id = %L', v_b, 'celebration_published', v_card));
  perform pg_temp.assert_result('followers receive published celebration notification', v_result, 'ok:1');

  v_result := pg_temp.act(v_c, 'authenticated',
    format('select id from public.notifications where user_id = %L and type = %L and entity_id = %L', v_c, 'celebration_published', v_card));
  perform pg_temp.assert_result('celebration notification respects opt-out', v_result, 'ok:0');

  v_result := pg_temp.act(v_b, 'authenticated', 'select * from public.admin_discovery_overview(30)');
  perform pg_temp.assert_result('students cannot access admin discovery aggregates', v_result, 'err:forbidden');
end
$tests$;

rollback;
