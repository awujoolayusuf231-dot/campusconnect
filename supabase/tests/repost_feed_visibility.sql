-- Run after 20261118000045_repost_feed_visibility.sql.
-- The intentional final exception rolls back every fixture.
begin;

create function pg_temp.scalar(p_uid uuid, p_sql text)
returns text language plpgsql as $function$
declare
  v_result text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v_result;
  exception when others then
    reset role;
    return 'err:' || sqlerrm;
  end;
  reset role;
  return coalesce(v_result, 'NULL');
end
$function$;

create function pg_temp.ex(p_name text, p_got text, p_want text)
returns text language sql as $function$
  select case when p_got = p_want then 'PASS ' else 'FAIL ' end
    || p_name || ' -> ' || p_got || E'\n'
$function$;

do $test$
declare
  v_owner uuid := gen_random_uuid();
  v_reposter uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_post uuid;
  v_result text := '';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_owner, 'repost-owner-' || v_owner || '@t.invalid', jsonb_build_object('username', 'repost_owner_' || left(v_owner::text, 8))),
    (v_reposter, 'repost-user-' || v_reposter || '@t.invalid', jsonb_build_object('username', 'repost_user_' || left(v_reposter::text, 8))),
    (v_other, 'repost-other-' || v_other || '@t.invalid', jsonb_build_object('username', 'repost_other_' || left(v_other::text, 8)));

  insert into public.posts (author_id, body, created_at)
  values (v_owner, 'A post that gets reshared', now() - interval '2 hours')
  returning id into v_post;
  insert into public.reposts (user_id, post_id, created_at)
  values (v_reposter, v_post, now() - interval '1 minute');
  insert into public.post_views (user_id, post_id, seen_at)
  values (v_reposter, v_post, now() - interval '2 minutes');
  insert into public.post_views (user_id, post_id, seen_at)
  values (v_other, v_post, now());

  v_result := v_result || pg_temp.ex('reposter sees a new reshare in For you',
    pg_temp.scalar(v_reposter, format('select count(*)::text from public.get_ranked_feed() where id = %L', v_post)), '1');
  v_result := v_result || pg_temp.ex('original author sees the reshare in For you',
    pg_temp.scalar(v_owner, format('select count(*)::text from public.get_ranked_feed() where id = %L', v_post)), '1');
  v_result := v_result || pg_temp.ex('unrelated user does not see an unfollowed reshare in For you',
    pg_temp.scalar(v_other, format('select count(*)::text from public.get_ranked_feed() where id = %L', v_post)), '0');

  v_result := v_result || pg_temp.ex('reposter sees own activity in Following',
    pg_temp.scalar(v_reposter, format('select count(*)::text from public.feed_timeline(''following'') where item_id = %L', v_post)), '1');
  v_result := v_result || pg_temp.ex('original author sees reshare activity in Following',
    pg_temp.scalar(v_owner, format('select count(*)::text from public.feed_timeline(''following'') where item_id = %L', v_post)), '1');
  v_result := v_result || pg_temp.ex('unrelated user does not see unfollowed activity in Following',
    pg_temp.scalar(v_other, format('select count(*)::text from public.feed_timeline(''following'') where item_id = %L', v_post)), '0');

  update public.post_views set seen_at = now()
  where user_id = v_reposter and post_id = v_post;
  v_result := v_result || pg_temp.ex('seen reshare is hidden again after it is viewed',
    pg_temp.scalar(v_reposter, format('select count(*)::text from public.get_ranked_feed() where id = %L', v_post)), '0');

  raise exception 'RESULTS:%', E'\n' || v_result;
end
$test$;

rollback;
