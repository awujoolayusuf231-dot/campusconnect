-- Run after 20261126000052_voice_presence_notification_preferences.sql on a local/test database.
-- The intentional final exception rolls back every fixture and feature-flag change.
begin;

create function pg_temp.act(p_uid uuid, p_role text, p_sql text)
returns text language plpgsql as $function$
declare
  v_count int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    get diagnostics v_count = row_count;
  exception when others then
    reset role;
    return 'err:' || sqlerrm;
  end;
  reset role;
  return 'ok:' || v_count;
end
$function$;

create function pg_temp.scalar(p_uid uuid, p_role text, p_sql text)
returns text language plpgsql as $function$
declare
  v_result text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
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
  select case when p_got like p_want || '%' then 'PASS ' else 'FAIL ' end
    || p_name || ' -> ' || p_got || E'\n'
$function$;

do $test$
declare
  v_owner uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_project uuid;
  v_private_project uuid;
  v_room uuid;
  v_result text := '';
  v_suffix text := left(replace(gen_random_uuid()::text, '-', ''), 8);
begin
  v_result := v_result || pg_temp.ex('notification check preserves and validates existing and new types',
    (select (convalidated
      and position('repost' in pg_get_constraintdef(oid)) > 0
      and position('discussion_reply' in pg_get_constraintdef(oid)) > 0
      and position('celebration_reminder' in pg_get_constraintdef(oid)) > 0
      and position('project_invitation' in pg_get_constraintdef(oid)) > 0
      and position('project_application' in pg_get_constraintdef(oid)) > 0
      and position('competition_update' in pg_get_constraintdef(oid)) > 0
      and position('voice_invitation' in pg_get_constraintdef(oid)) > 0)::text
      from pg_constraint
      where conrelid = 'public.notifications'::regclass
        and conname = 'notifications_type_check'),
    'true');

  insert into auth.users (id, email, raw_user_meta_data) values
    (v_owner, 'project-owner-' || v_suffix || '@test.invalid',
      jsonb_build_object('username', 'project_owner_' || v_suffix, 'display_name', 'Project Owner')),
    (v_member, 'project-member-' || v_suffix || '@test.invalid',
      jsonb_build_object('username', 'project_member_' || v_suffix, 'display_name', 'Project Member')),
    (v_outsider, 'project-outsider-' || v_suffix || '@test.invalid',
      jsonb_build_object('username', 'project_outside_' || v_suffix, 'display_name', 'Project Outsider'));
  insert into public.user_preferences(user_id, notify_voice)
  values(v_outsider, false);

  select pg_temp.scalar(v_owner, 'authenticated',
    $query$select public.create_project(
      'Test collaboration project',
      'A project description that satisfies the minimum length.',
      '', 'academic', 'academic', array[]::text[], null, 'public', 3::smallint, null, null
    )$query$)::uuid into v_project;
  insert into public.project_members(project_id,user_id) values(v_project,v_member);

  insert into public.voice_rooms(host_id,project_id,title,description,category,room_type,visibility)
  values(v_owner,v_project,'Project discussion','Talk with the team.','academic','group','public')
  returning id into v_room;
  insert into public.voice_room_invitations(room_id,inviter_id,invitee_id,requested_role,status)
  values(v_room,v_owner,v_outsider,'speaker','pending');
  v_result := v_result || pg_temp.ex('voice invitation category preference suppresses the invitation notification',
    (select count(*)::text from public.notifications where user_id=v_outsider and type='voice_invitation'),
    '0');
  update public.user_preferences set notify_voice=true where user_id=v_outsider;
  update public.voice_room_invitations set status='accepted' where room_id=v_room and invitee_id=v_outsider;
  update public.voice_room_invitations set status='pending' where room_id=v_room and invitee_id=v_outsider;
  v_result := v_result || pg_temp.ex('an enabled Voice Space invitation creates one actionable notification with the room title',
    (select count(*)::text || ':' || min(data->>'title')
      from public.notifications where user_id=v_outsider and type='voice_invitation'),
    '1:Project discussion');
  update public.user_preferences set notify_enabled=false where user_id=v_outsider;
  perform public.internal_notify(v_outsider,'voice_invitation',v_owner,'voice_room',v_room,'voice-master-off-test','{}'::jsonb);
  v_result := v_result || pg_temp.ex('master notification preference suppresses notification generation',
    (select count(*)::text from public.notifications where user_id=v_outsider and dedupe_key='voice-master-off-test'),
    '0');

  update public.voice_rooms set status='live' where id=v_room;
  v_result := v_result || pg_temp.ex('live transition stamps a persistent start timestamp',
    pg_temp.scalar(v_member,'authenticated',format(
      'select (live_started_at is not null)::text from public.voice_rooms where id=%L',v_room
    )), 'true');
  v_result := v_result || pg_temp.ex('active presence reveals room details only to eligible members',
    pg_temp.scalar(v_outsider,'authenticated',format(
      'select can_join::text || '':'' || title from public.voice_active_presence() where room_id=%L',v_room
    )), 'false:A restricted Voice Space is live');

  v_result := v_result || pg_temp.ex('project member can join a group Voice Space',
    pg_temp.scalar(v_member,'authenticated',format('select public.voice_can_join(%L)',v_room)), 'true');
  v_result := v_result || pg_temp.ex('non-member invitation cannot bypass group membership',
    pg_temp.scalar(v_outsider,'authenticated',format('select public.voice_can_join(%L)',v_room)), 'false');
  update public.voice_rooms set status='ended',ended_at=now() where id=v_room;
  v_result := v_result || pg_temp.ex('invited users can see ended state without gaining join access',
    pg_temp.scalar(v_outsider,'authenticated',format('select status from public.voice_rooms where id=%L',v_room)), 'ended');
  v_result := v_result || pg_temp.ex('public project is discoverable while enabled',
    pg_temp.scalar(v_outsider,'authenticated',format('select count(*) from public.projects where id=%L',v_project)), '1');
  v_result := v_result || pg_temp.ex('public member count is accurate without exposing membership rows',
    pg_temp.scalar(v_outsider,'authenticated',format('select public.project_member_count(%L)',v_project)), '2');

  select pg_temp.scalar(v_owner, 'authenticated',
    $query$select public.create_project(
      'Private collaboration project',
      'A private project description that satisfies the minimum length.',
      '', 'academic', 'academic', array[]::text[], null, 'private', 3::smallint, null, null
    )$query$)::uuid into v_private_project;
  v_result := v_result || pg_temp.ex('private project is hidden from other students',
    pg_temp.scalar(v_outsider,'authenticated',format('select count(*) from public.projects where id=%L',v_private_project)), '0');
  v_result := v_result || pg_temp.ex('private project rejects applications',
    pg_temp.act(v_outsider,'authenticated',format(
      'select public.apply_to_project(%L, %L)',v_private_project,'I would like to join this private project.'
    )), 'err:project_not_accepting_applications');

  update public.feature_flags set enabled=false where key='project_collaboration';
  v_result := v_result || pg_temp.ex('project feature flag blocks creation',
    pg_temp.act(v_owner,'authenticated',
      $query$select public.create_project(
        'Disabled feature project',
        'This description is long enough but must not be accepted.',
        '', 'academic', 'academic', array[]::text[], null, 'public', 3::smallint, null, null
      )$query$), 'err:feature_disabled');
  update public.feature_flags set enabled=true where key='project_collaboration';

  v_result := v_result || pg_temp.ex('anonymous users cannot query project rows',
    pg_temp.act(null,'anon','select * from public.projects'), 'err:permission denied');
  if position('FAIL ' in v_result) > 0 then raise exception E'FAILURES\n%',v_result; end if;
  raise exception E'RESULTS\n%',v_result; -- intentional rollback
end
$test$;
