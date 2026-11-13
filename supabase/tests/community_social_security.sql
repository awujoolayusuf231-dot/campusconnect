-- Run against a local Supabase database after all prerequisites,
-- 20261111000016_community_management.sql,
-- 20261111145500_community_social_security_hardening.sql, and
-- 20261112000017_require_active_members_for_community_posts.sql and
-- 20261112000018_enforce_community_settings_managers.sql are applied.
-- The intentional final exception rolls back every fixture.
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
  v_moderator uuid := gen_random_uuid();
  v_former_moderator uuid := gen_random_uuid();
  v_private uuid := gen_random_uuid();
  v_banned uuid := gen_random_uuid();
  v_removed uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_institution_only uuid := gen_random_uuid();
  v_institution uuid;
  v_other_institution uuid;
  v_active_community uuid := gen_random_uuid();
  v_other_community uuid := gen_random_uuid();
  v_archived_community uuid := gen_random_uuid();
  v_disabled_community uuid := gen_random_uuid();
  v_post uuid;
  v_removed_post uuid;
  v_banned_post uuid;
  v_archived_post uuid;
  v_disabled_post uuid;
  v_plain_post uuid;
  v_outsider_post uuid;
  v_private_post uuid;
  v_institution_post uuid;
  v_comment uuid;
  v_plain_comment uuid;
  v_removed_comment uuid;
  v_path text;
  v_public_path text;
  v_archived_path text;
  v_cover_path text;
  v_other_cover_path text;
  v_unattached_cover_path text;
  v_result text := '';
  v_count integer;
begin
  v_result := v_result || pg_temp.ex('visibility helpers are not exposed as public RPCs',
    (
      to_regprocedure('public.internal_current_community_member(uuid)') is null
      and to_regprocedure('public.internal_current_community_manager(uuid)') is null
      and to_regprocedure('public.internal_security_post_visible_to(uuid,uuid)') is null
      and to_regprocedure('public.internal_current_post_visible(uuid)') is null
      and to_regprocedure('public.internal_current_post_row_visible(uuid)') is null
      and to_regprocedure('public.internal_current_repost_visible(uuid)') is null
      and to_regprocedure('campusconnect_private.internal_current_repost_visible(uuid,uuid)') is null
      and (
        to_regprocedure('public.internal_post_visible_to(uuid,uuid)') is null
        or (
          not has_function_privilege('authenticated', to_regprocedure('public.internal_post_visible_to(uuid,uuid)'), 'execute')
          and not has_function_privilege('anon', to_regprocedure('public.internal_post_visible_to(uuid,uuid)'), 'execute')
        )
      )
      and coalesce(current_setting('pgrst.db_schemas', true), 'public, graphql_public')
        not like '%campusconnect_private%'
    )::text,
    'true');
  v_result := v_result || pg_temp.ex('repost visibility helper is caller-bound and authenticated-only',
    (
      to_regprocedure('campusconnect_private.internal_current_repost_visible(uuid)') is not null
      and to_regprocedure('campusconnect_private.internal_current_repost_visible(uuid,uuid)') is null
      and exists (select 1 from pg_proc
        where oid = 'campusconnect_private.internal_current_repost_visible(uuid)'::regprocedure
          and lower(prosrc) like '%auth.uid%'
          and prosecdef)
      and has_function_privilege('authenticated',
        'campusconnect_private.internal_current_repost_visible(uuid)', 'execute')
      and not has_function_privilege('anon',
        'campusconnect_private.internal_current_repost_visible(uuid)', 'execute')
    )::text,
    'true');

  insert into public.institutions (name, type)
  values ('Security Test ' || substr(v_active_community::text, 1, 8), 'university')
  returning id into v_institution;
  insert into public.institutions (name, type)
  values ('Security Other ' || substr(v_active_community::text, 1, 8), 'university')
  returning id into v_other_institution;

  insert into auth.users (id, email, raw_user_meta_data)
  select uid, uid::text || '@security-test.invalid',
    jsonb_build_object('username', uname || '_' || substr(uid::text, 1, 8))
  from (values
    (v_owner, 'sec_owner'),
    (v_member, 'sec_member'),
    (v_moderator, 'sec_moderator'),
    (v_former_moderator, 'sec_former_moderator'),
    (v_private, 'sec_private'),
    (v_banned, 'sec_banned'),
    (v_removed, 'sec_removed'),
    (v_outsider, 'sec_outsider'),
    (v_admin, 'sec_admin'),
    (v_institution_only, 'sec_institution')
  ) as users(uid, uname);

  update public.profiles set institution_id = v_institution
  where id in (v_owner, v_member, v_moderator, v_former_moderator, v_private, v_banned, v_removed, v_admin, v_institution_only);
  update public.profiles set institution_id = v_other_institution where id = v_outsider;
  update public.profiles set visibility = 'private' where id = v_private;
  update public.profiles set visibility = 'institution' where id = v_institution_only;
  insert into public.user_roles (user_id, role) values (v_admin, 'admin');

  insert into public.communities (id, name, slug, category, institution_id, created_by, status)
  values
    (v_active_community, 'Security Test Active ' || substr(v_active_community::text, 1, 8),
      'sec-active-' || substr(v_active_community::text, 1, 8),
      'interest', v_institution, v_owner, 'active'),
    (v_other_community, 'Security Test Other ' || substr(v_other_community::text, 1, 8),
      'sec-other-' || substr(v_other_community::text, 1, 8),
      'interest', v_other_institution, v_outsider, 'active'),
    (v_archived_community, 'Security Test Archived ' || substr(v_archived_community::text, 1, 8),
      'sec-archived-' || substr(v_archived_community::text, 1, 8),
      'interest', v_institution, v_owner, 'archived'),
    (v_disabled_community, 'Security Test Disabled ' || substr(v_disabled_community::text, 1, 8),
      'sec-disabled-' || substr(v_disabled_community::text, 1, 8),
      'interest', v_institution, v_owner, 'disabled');

  insert into public.community_members (community_id, user_id, role, status)
  values
    (v_active_community, v_owner, 'owner', 'active'),
    (v_active_community, v_member, 'member', 'active'),
    (v_active_community, v_moderator, 'moderator', 'active'),
    (v_active_community, v_former_moderator, 'moderator', 'active'),
    (v_active_community, v_private, 'member', 'active'),
    (v_active_community, v_banned, 'member', 'banned'),
    (v_active_community, v_removed, 'member', 'active'),
    (v_other_community, v_outsider, 'owner', 'active'),
    (v_archived_community, v_owner, 'owner', 'active'),
    (v_archived_community, v_member, 'member', 'active'),
    (v_disabled_community, v_owner, 'owner', 'active'),
    (v_disabled_community, v_member, 'member', 'active');
  update public.community_members
  set role = 'member'
  where community_id = v_active_community and user_id = v_former_moderator;

  insert into public.posts (author_id, body, community_id)
  values (v_member, 'active community post #securityonly', v_active_community)
  returning id into v_post;
  insert into public.posts (author_id, body, community_id)
  values (v_removed, 'removed author community post', v_active_community)
  returning id into v_removed_post;
  insert into public.posts (author_id, body, community_id)
  values (v_banned, 'banned author community post', v_active_community)
  returning id into v_banned_post;
  insert into public.posts (author_id, body, community_id)
  values (v_owner, 'archived community post', v_archived_community)
  returning id into v_archived_post;
  insert into public.posts (author_id, body, community_id)
  values (v_owner, 'disabled community post', v_disabled_community)
  returning id into v_disabled_post;
  insert into public.posts (author_id, body)
  values (v_owner, 'ordinary public post')
  returning id into v_plain_post;
  insert into public.posts (author_id, body)
  values (v_outsider, 'outsider ordinary public post')
  returning id into v_outsider_post;
  insert into public.posts (author_id, body)
  values (v_private, 'private profile post')
  returning id into v_private_post;
  insert into public.posts (author_id, body)
  values (v_institution_only, 'institution-only profile post')
  returning id into v_institution_post;
  insert into public.reposts (user_id, post_id) values (v_outsider, v_post);
  insert into public.reposts (user_id, post_id) values (v_member, v_post);
  insert into public.reposts (user_id, post_id) values (v_outsider, v_plain_post);
  v_result := v_result || pg_temp.ex('removed user can comment while active',
    pg_temp.act(v_removed, 'authenticated',
      format('select public.add_comment(%L,%L)', v_removed_post, 'before removal')), 'ok:1');
  v_result := v_result || pg_temp.ex('member can like community post before removal',
    pg_temp.act(v_removed, 'authenticated',
      format('select public.like_post(%L)', v_removed_post)), 'ok:1');
  select id into v_removed_comment
  from public.comments where post_id = v_removed_post and author_id = v_removed limit 1;
  delete from public.community_members
  where community_id = v_active_community and user_id = v_removed;

  v_result := v_result || pg_temp.ex('active member reads community post',
    pg_temp.scalar(v_member, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_post)), '1');
  v_result := v_result || pg_temp.ex('non-member cannot read community post',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_post)), '0');
  v_result := v_result || pg_temp.ex('anonymous role cannot bypass community post restriction',
    (
      pg_temp.scalar(null, 'anon',
        format('select count(*)::text from public.posts where id=%L', v_post)) = '0'
      or pg_temp.scalar(null, 'anon',
        format('select count(*)::text from public.posts where id=%L', v_post)) like 'err:%'
    )::text,
    'true');
  v_result := v_result || pg_temp.ex('removed member cannot read own old post',
    pg_temp.scalar(v_removed, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_removed_post)), '0');
  v_result := v_result || pg_temp.ex('banned member cannot read own old post',
    pg_temp.scalar(v_banned, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_banned_post)), '0');
  v_result := v_result || pg_temp.ex('removed member cannot read own old like row',
    pg_temp.scalar(v_removed, 'authenticated',
      format('select count(*)::text from public.post_likes where post_id=%L', v_removed_post)), '0');
  v_result := v_result || pg_temp.ex('active community owner retains access',
    pg_temp.scalar(v_owner, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_post)), '1');
  v_result := v_result || pg_temp.ex('active community moderator retains access',
    pg_temp.scalar(v_moderator, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_post)), '1');
  v_result := v_result || pg_temp.ex('global administrator cannot read community post without membership',
    pg_temp.scalar(v_admin, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_post)), '0');
  v_result := v_result || pg_temp.ex('global administrator cannot read disabled-community post without membership',
    pg_temp.scalar(v_admin, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_disabled_post)), '0');
  v_result := v_result || pg_temp.ex('archived community post is hidden',
    pg_temp.scalar(v_member, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_archived_post)), '0');
  v_result := v_result || pg_temp.ex('disabled community post is hidden',
    pg_temp.scalar(v_member, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_disabled_post)), '0');
  v_result := v_result || pg_temp.ex('ordinary public post remains visible',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_plain_post)), '1');
  v_result := v_result || pg_temp.ex('private profile post is hidden from another user',
    pg_temp.scalar(v_member, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_private_post)), '0');
  v_result := v_result || pg_temp.ex('institution-only post is visible within institution',
    pg_temp.scalar(v_member, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_institution_post)), '1');
  v_result := v_result || pg_temp.ex('institution-only post is hidden across institutions',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_institution_post)), '0');
  v_result := v_result || pg_temp.ex('non-member cannot create community post',
    pg_temp.act(v_outsider, 'authenticated',
      format('insert into public.posts (body, community_id) values (%L, %L)',
        'unauthorized community post', v_active_community)),
    'err:new row violates row-level security');
  v_result := v_result || pg_temp.ex('active member can edit own community post',
    pg_temp.act(v_member, 'authenticated',
      format('update public.posts set body=%L where id=%L', 'edited by active member', v_post)),
    'ok:1');
  v_result := v_result || pg_temp.ex('removed author cannot edit old community post',
    pg_temp.act(v_removed, 'authenticated',
      format('update public.posts set body=%L where id=%L', 'unauthorized edit', v_removed_post)),
    'ok:0');

  v_result := v_result || pg_temp.ex('community feed returns active-member rows',
    pg_temp.scalar(v_member, 'authenticated',
      format('select count(*)::text from public.community_posts(%L)', v_active_community)), '1');
  v_result := v_result || pg_temp.ex('community feed restores reposted_by_me state',
    pg_temp.scalar(v_member, 'authenticated',
      format('select reposted_by_me::text from public.community_posts(%L) where id=%L',
        v_active_community, v_post)), 'true');
  v_result := v_result || pg_temp.ex('community feed denies non-member',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from public.community_posts(%L)', v_active_community)), '0');
  v_result := v_result || pg_temp.ex('community feed denies global administrator without membership',
    pg_temp.scalar(v_admin, 'authenticated',
      format('select count(*)::text from public.community_posts(%L)', v_active_community)), '0');
  v_result := v_result || pg_temp.ex('community feed denies archived posts',
    pg_temp.scalar(v_member, 'authenticated',
      format('select count(*)::text from public.community_posts(%L)', v_archived_community)), '0');
  v_result := v_result || pg_temp.ex('private profile membership hidden from another member',
    pg_temp.scalar(v_member, 'authenticated',
      format('select count(*)::text from public.community_members where community_id=%L and user_id=%L',
        v_active_community, v_private)), '0');
  v_result := v_result || pg_temp.ex('community manager can see private member row',
    pg_temp.scalar(v_owner, 'authenticated',
      format('select count(*)::text from public.community_members where community_id=%L and user_id=%L',
        v_active_community, v_private)), '1');
  v_result := v_result || pg_temp.ex('community moderator can manage private member row',
    pg_temp.scalar(v_moderator, 'authenticated',
      format('select count(*)::text from public.community_members where community_id=%L and user_id=%L',
        v_active_community, v_private)), '1');
  v_result := v_result || pg_temp.ex('non-member cannot enumerate members',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from public.community_members where community_id=%L',
        v_active_community)), '0');
  v_result := v_result || pg_temp.ex('active member can see public-profile member row',
    pg_temp.scalar(v_member, 'authenticated',
      format('select count(*)::text from public.community_members where community_id=%L and user_id=%L',
        v_active_community, v_moderator)), '1');
  v_result := v_result || pg_temp.ex('member retains access to own banned row',
    pg_temp.scalar(v_banned, 'authenticated',
      format('select count(*)::text from public.community_members where community_id=%L and user_id=%L',
        v_active_community, v_banned)), '1');
  v_result := v_result || pg_temp.ex('removed author cannot read own old comment',
    pg_temp.scalar(v_removed, 'authenticated',
      format('select count(*)::text from public.comments where id=%L', v_removed_comment)), '0');
  v_result := v_result || pg_temp.ex('removed author cannot edit old comment',
    pg_temp.act(v_removed, 'authenticated',
      format('update public.comments set body=%L where id=%L', 'after removal', v_removed_comment)),
    'ok:0');

  v_result := v_result || pg_temp.ex('non-member like RPC denied',
    pg_temp.act(v_outsider, 'authenticated', format('select public.like_post(%L)', v_post)), 'err:not_found');
  v_result := v_result || pg_temp.ex('banned member like RPC denied',
    pg_temp.act(v_banned, 'authenticated', format('select public.like_post(%L)', v_post)), 'err:not_found');
  v_result := v_result || pg_temp.ex('removed member like RPC denied',
    pg_temp.act(v_removed, 'authenticated', format('select public.like_post(%L)', v_post)), 'err:not_found');
  v_result := v_result || pg_temp.ex('archived community like RPC denied',
    pg_temp.act(v_member, 'authenticated', format('select public.like_post(%L)', v_archived_post)), 'err:not_found');
  v_result := v_result || pg_temp.ex('disabled community comment RPC denied',
    pg_temp.act(v_member, 'authenticated',
      format('select public.add_comment(%L,%L)', v_disabled_post, 'blocked')), 'err:not_found');
  v_result := v_result || pg_temp.ex('ordinary public like RPC works',
    pg_temp.act(v_outsider, 'authenticated', format('select public.like_post(%L)', v_plain_post)), 'ok:1');
  v_plain_comment := pg_temp.scalar(v_outsider, 'authenticated',
    format('select public.add_comment(%L,%L)', v_plain_post, 'ordinary public comment'))::uuid;
  v_public_path := v_owner::text || '/' || gen_random_uuid()::text || '.png';
  insert into storage.objects (bucket_id, name) values ('post-images', v_public_path);
  insert into public.post_media (post_id, storage_path, position)
  values (v_plain_post, v_public_path, 0);
  v_result := v_result || pg_temp.ex('public post image is readable before block',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from storage.objects where bucket_id=%L and name=%L',
        'post-images', v_public_path)), '1');
  v_result := v_result || pg_temp.ex('attached public media metadata is readable',
    pg_temp.scalar(v_member, 'authenticated',
      format('select count(*)::text from public.post_media where post_id=%L', v_plain_post)), '1');
  v_result := v_result || pg_temp.ex('public comment is readable before block',
    pg_temp.scalar(v_member, 'authenticated',
      format('select count(*)::text from public.comments where id=%L', v_plain_comment)), '1');
  v_result := v_result || pg_temp.ex('non-member comment RPC denied',
    pg_temp.act(v_outsider, 'authenticated', format('select public.add_comment(%L,%L)', v_post, 'blocked')),
    'err:not_found');
  v_result := v_result || pg_temp.ex('active member comment RPC works',
    pg_temp.act(v_member, 'authenticated', format('select public.add_comment(%L,%L)', v_post, 'allowed')),
    'ok:1');
  select id into v_comment from public.comments where post_id = v_post and author_id = v_member limit 1;
  v_result := v_result || pg_temp.ex('non-member cannot read community comment',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from public.comments where id=%L', v_comment)), '0');
  v_result := v_result || pg_temp.ex('global administrator cannot read community comment without membership',
    pg_temp.scalar(v_admin, 'authenticated',
      format('select count(*)::text from public.comments where id=%L', v_comment)), '0');
  v_result := v_result || pg_temp.ex('active member can read community comment',
    pg_temp.scalar(v_member, 'authenticated',
      format('select count(*)::text from public.comments where id=%L', v_comment)), '1');
  v_result := v_result || pg_temp.ex('non-member cannot see legacy community repost row',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from public.reposts where post_id=%L', v_post)), '0');
  v_result := v_result || pg_temp.ex('active member still cannot repost community post',
    pg_temp.act(v_member, 'authenticated', format('select public.repost_post(%L)', v_post)),
    'err:cannot_repost_community_post');
  v_result := v_result || pg_temp.ex('non-member cannot probe repost RPC with community post',
    pg_temp.act(v_outsider, 'authenticated', format('select public.repost_post(%L)', v_post)),
    'err:not_found');
  v_result := v_result || pg_temp.ex('ordinary public repost still works',
    pg_temp.act(v_member, 'authenticated', format('select public.repost_post(%L)', v_plain_post)), 'ok:1');
  insert into public.blocks (blocker_id, blocked_id) values (v_outsider, v_owner);
  v_result := v_result || pg_temp.ex('blocked viewer cannot read ordinary public post',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_plain_post)), '0');
  v_result := v_result || pg_temp.ex('blocked viewer cannot like ordinary public post',
    pg_temp.act(v_outsider, 'authenticated', format('select public.like_post(%L)', v_plain_post)),
    'err:not_found');
  v_result := v_result || pg_temp.ex('blocked viewer cannot read public post image',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from storage.objects where bucket_id=%L and name=%L',
        'post-images', v_public_path)), '0');
  v_result := v_result || pg_temp.ex('blocked viewer cannot read public post media metadata',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from public.post_media where post_id=%L', v_plain_post)), '0');
  v_result := v_result || pg_temp.ex('blocked viewer cannot read own like on inaccessible post',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from public.post_likes where post_id=%L and user_id=%L',
        v_plain_post, v_outsider)), '0');
  v_result := v_result || pg_temp.ex('blocked viewer cannot read comment on inaccessible post',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from public.comments where id=%L', v_plain_comment)), '0');
  v_result := v_result || pg_temp.ex('reverse block hides repost by blocker',
    pg_temp.scalar(v_owner, 'authenticated',
      format('select count(*)::text from public.reposts where user_id=%L and post_id=%L',
        v_outsider, v_plain_post)), '0');
  delete from public.blocks where blocker_id = v_outsider and blocked_id = v_owner;
  insert into public.blocks (blocker_id, blocked_id) values (v_outsider, v_owner);
  v_result := v_result || pg_temp.ex('reverse block hides public post from blocked viewer',
    pg_temp.scalar(v_owner, 'authenticated',
      format('select count(*)::text from public.posts where id=%L', v_outsider_post)), '0');
  v_result := v_result || pg_temp.ex('reverse block prevents like RPC',
    pg_temp.act(v_owner, 'authenticated', format('select public.like_post(%L)', v_outsider_post)),
    'err:not_found');
  v_result := v_result || pg_temp.ex('reverse block prevents comment RPC',
    pg_temp.act(v_owner, 'authenticated',
      format('select public.add_comment(%L,%L)', v_outsider_post, 'blocked by reverse block')),
    'err:not_found');
  delete from public.blocks where blocker_id = v_outsider and blocked_id = v_owner;

  v_path := v_member::text || '/' || gen_random_uuid()::text || '.png';
  v_result := v_result || pg_temp.ex('uploader can upload before media attachment',
    pg_temp.act(v_member, 'authenticated',
      format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'post-images', v_path)), 'ok:1');
  v_result := v_result || pg_temp.ex('unlinked upload is not readable by its uploader',
    pg_temp.scalar(v_member, 'authenticated',
      format('select count(*)::text from storage.objects where bucket_id=%L and name=%L', 'post-images', v_path)), '0');
  v_result := v_result || pg_temp.ex('unlinked upload is not readable by another user',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from storage.objects where bucket_id=%L and name=%L', 'post-images', v_path)), '0');
  v_result := v_result || pg_temp.ex('author attaches uploaded image',
    pg_temp.act(v_member, 'authenticated',
      format('insert into public.post_media (post_id, storage_path, position) values (%L, %L, 0)',
        v_post, v_path)),
    'ok:1');
  v_result := v_result || pg_temp.ex('attached image is readable by active member',
    pg_temp.scalar(v_member, 'authenticated',
      format('select count(*)::text from storage.objects where bucket_id=%L and name=%L', 'post-images', v_path)), '1');
  v_result := v_result || pg_temp.ex('global administrator cannot read community image without membership',
    pg_temp.scalar(v_admin, 'authenticated',
      format('select count(*)::text from storage.objects where bucket_id=%L and name=%L',
        'post-images', v_path)), '0');
  v_result := v_result || pg_temp.ex('banned member immediately loses attached image access',
    pg_temp.scalar(v_banned, 'authenticated',
      format('select count(*)::text from storage.objects where bucket_id=%L and name=%L',
        'post-images', v_path)), '0');
  v_result := v_result || pg_temp.ex('removed member immediately loses attached image access',
    pg_temp.scalar(v_removed, 'authenticated',
      format('select count(*)::text from storage.objects where bucket_id=%L and name=%L',
        'post-images', v_path)), '0');
  v_result := v_result || pg_temp.ex('attached image is hidden from non-member',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from storage.objects where bucket_id=%L and name=%L', 'post-images', v_path)), '0');
  v_result := v_result || pg_temp.ex('post media metadata is hidden from non-member',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from public.post_media where post_id=%L', v_post)), '0');
  v_archived_path := v_owner::text || '/' || gen_random_uuid()::text || '.png';
  insert into storage.objects (bucket_id, name) values ('post-images', v_archived_path);
  insert into public.post_media (post_id, storage_path, position)
  values (v_archived_post, v_archived_path, 0);
  v_result := v_result || pg_temp.ex('archived-community image is unreadable',
    pg_temp.scalar(v_member, 'authenticated',
      format('select count(*)::text from storage.objects where bucket_id=%L and name=%L',
        'post-images', v_archived_path)), '0');

  v_cover_path := v_active_community::text || '/community-cover-' || gen_random_uuid()::text || '.png';
  v_result := v_result || pg_temp.ex('active owner may upload community cover',
    pg_temp.act(v_owner, 'authenticated',
      format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'community-covers', v_cover_path)),
    'ok:1');
  update public.communities set cover_path = v_cover_path where id = v_active_community;
  v_result := v_result || pg_temp.ex('authenticated community visitor can read active cover',
    pg_temp.scalar(v_outsider, 'authenticated',
      format('select count(*)::text from storage.objects where bucket_id=%L and name=%L',
        'community-covers', v_cover_path)), '1');
  v_result := v_result || pg_temp.ex('non-manager cannot upload community cover',
    pg_temp.act(v_outsider, 'authenticated',
      format('insert into storage.objects (bucket_id, name) values (%L, %L)',
        'community-covers',
        v_active_community::text || '/community-cover-' || gen_random_uuid()::text || '.png')),
    'err:new row violates row-level security');
  v_result := v_result || pg_temp.ex('ordinary member cannot upload community cover',
    pg_temp.act(v_member, 'authenticated',
      format('insert into storage.objects (bucket_id, name) values (%L, %L)',
        'community-covers',
        v_active_community::text || '/community-cover-' || gen_random_uuid()::text || '.png')),
    'err:new row violates row-level security');
  v_result := v_result || pg_temp.ex('community moderator cannot upload community cover',
    pg_temp.act(v_moderator, 'authenticated',
      format('insert into storage.objects (bucket_id, name) values (%L, %L)',
        'community-covers',
        v_active_community::text || '/community-cover-' || gen_random_uuid()::text || '.png')),
    'err:new row violates row-level security');
  v_result := v_result || pg_temp.ex('platform community manager cannot upload community cover',
    pg_temp.act(v_admin, 'authenticated',
      format('insert into storage.objects (bucket_id, name) values (%L, %L)',
        'community-covers',
        v_active_community::text || '/community-cover-' || gen_random_uuid()::text || '.png')),
    'err:new row violates row-level security');
  v_result := v_result || pg_temp.ex('manager cannot upload cover into another community folder',
    pg_temp.act(v_owner, 'authenticated',
      format('insert into storage.objects (bucket_id, name) values (%L, %L)',
        'community-covers',
        v_other_community::text || '/community-cover-' || gen_random_uuid()::text || '.png')),
    'err:new row violates row-level security');
  v_other_cover_path := v_other_community::text || '/community-cover-' || gen_random_uuid()::text || '.png';
  v_result := v_result || pg_temp.ex('other community owner can upload its cover',
    pg_temp.act(v_outsider, 'authenticated',
      format('insert into storage.objects (bucket_id, name) values (%L, %L)',
        'community-covers', v_other_cover_path)),
    'ok:1');
  update public.communities set cover_path = v_other_cover_path where id = v_other_community;
  v_result := v_result || pg_temp.ex('manager cannot set another community cover path',
    pg_temp.act(v_owner, 'authenticated',
      format('select public.community_manage_update(%L,%L,%L,%L,%L,%L)',
        v_active_community, 'Cross Community Cover', '', 'interest', v_institution, v_other_cover_path)),
    'err:invalid_cover_path');
  v_result := v_result || pg_temp.ex('manager cannot update another community cover object',
    pg_temp.act(v_owner, 'authenticated',
      format('update storage.objects set metadata=coalesce(metadata,''{}''::jsonb) where bucket_id=%L and name=%L',
        'community-covers', v_other_cover_path)),
    'ok:0');
  v_result := v_result || pg_temp.ex('manager cannot move cover into another community folder',
    pg_temp.act(v_owner, 'authenticated',
      format('update storage.objects set name=%L where bucket_id=%L and name=%L',
        v_other_cover_path, 'community-covers', v_cover_path)),
    'err:new row violates row-level security');
  v_unattached_cover_path := v_other_community::text || '/community-cover-' || gen_random_uuid()::text || '.png';
  v_result := v_result || pg_temp.ex('other community owner can upload an unattached cover',
    pg_temp.act(v_outsider, 'authenticated',
      format('insert into storage.objects (bucket_id, name) values (%L, %L)',
        'community-covers', v_unattached_cover_path)),
    'ok:1');
  v_result := v_result || pg_temp.ex('unattached cover path is not readable',
    pg_temp.scalar(v_owner, 'authenticated',
      format('select count(*)::text from storage.objects where bucket_id=%L and name=%L',
        'community-covers', v_unattached_cover_path)),
    '0');
  v_result := v_result || pg_temp.ex('community owner update RPC remains available',
    pg_temp.act(v_owner, 'authenticated',
      format('select public.community_manage_update(%L,%L,%L,%L,%L,%L)',
        v_active_community, 'Security Updated ' || substr(v_active_community::text, 1, 8), '', 'interest', v_institution, v_cover_path)),
    'ok:1');
  v_result := v_result || pg_temp.ex('ordinary member cannot update community settings through RPC',
    pg_temp.act(v_member, 'authenticated',
      format('select public.community_manage_update(%L,%L,%L,%L,%L,%L)',
        v_active_community, 'Unauthorized Update', '', 'interest', v_institution, v_cover_path)),
    'err:forbidden');
  v_result := v_result || pg_temp.ex('former member cannot update community settings through RPC',
    pg_temp.act(v_removed, 'authenticated',
      format('select public.community_manage_update(%L,%L,%L,%L,%L,%L)',
        v_active_community, 'Former Member Update', '', 'interest', v_institution, v_cover_path)),
    'err:forbidden');
  v_result := v_result || pg_temp.ex('former moderator cannot update community settings through RPC',
    pg_temp.act(v_former_moderator, 'authenticated',
      format('select public.community_manage_update(%L,%L,%L,%L,%L,%L)',
        v_active_community, 'Demoted Moderator Update', '', 'interest', v_institution, v_cover_path)),
    'err:forbidden');
  v_result := v_result || pg_temp.ex('banned member cannot update community settings through RPC',
    pg_temp.act(v_banned, 'authenticated',
      format('select public.community_manage_update(%L,%L,%L,%L,%L,%L)',
        v_active_community, 'Banned Member Update', '', 'interest', v_institution, v_cover_path)),
    'err:forbidden');
  v_result := v_result || pg_temp.ex('non-member cannot update community settings through RPC',
    pg_temp.act(v_outsider, 'authenticated',
      format('select public.community_manage_update(%L,%L,%L,%L,%L,%L)',
        v_active_community, 'Non-member Update', '', 'interest', v_institution, v_cover_path)),
    'err:forbidden');
  v_result := v_result || pg_temp.ex('ordinary member cannot update communities table directly',
    pg_temp.act(v_member, 'authenticated',
      format('update public.communities set description=%L where id=%L',
        'Unauthorized direct update', v_active_community)),
    'err:permission denied');
  v_result := v_result || pg_temp.ex('former member cannot update communities table directly',
    pg_temp.act(v_removed, 'authenticated',
      format('update public.communities set name=%L where id=%L',
        'Former Member Direct Update', v_active_community)),
    'err:permission denied');
  v_result := v_result || pg_temp.ex('former moderator cannot update communities table directly',
    pg_temp.act(v_former_moderator, 'authenticated',
      format('update public.communities set description=%L where id=%L',
        'Demoted Moderator Direct Update', v_active_community)),
    'err:permission denied');
  v_result := v_result || pg_temp.ex('banned member cannot update communities table directly',
    pg_temp.act(v_banned, 'authenticated',
      format('update public.communities set status=%L where id=%L',
        'archived', v_active_community)),
    'err:permission denied');
  v_result := v_result || pg_temp.ex('non-member cannot update communities table directly',
    pg_temp.act(v_outsider, 'authenticated',
      format('update public.communities set cover_path=%L where id=%L',
        v_cover_path, v_active_community)),
    'err:permission denied');
  v_result := v_result || pg_temp.ex('owner cannot bypass RPC through direct table UPDATE',
    pg_temp.act(v_owner, 'authenticated',
      format('update public.communities set name=%L where id=%L',
        'Owner Direct Update', v_active_community)),
    'err:permission denied');
  v_result := v_result || pg_temp.ex('community moderator cannot update communities table directly',
    pg_temp.act(v_moderator, 'authenticated',
      format('update public.communities set name=%L where id=%L',
        'Moderator Direct Update', v_active_community)),
    'err:permission denied');
  v_result := v_result || pg_temp.ex('platform manager cannot bypass RPC through direct table UPDATE',
    pg_temp.act(v_admin, 'authenticated',
      format('update public.communities set name=%L where id=%L',
        'Platform Manager Direct Update', v_active_community)),
    'err:permission denied');
  v_result := v_result || pg_temp.ex('legacy community settings RPC is revoked',
    has_function_privilege('authenticated', 'public.community_update(uuid,text)', 'execute')::text,
    'false');
  v_result := v_result || pg_temp.ex('ordinary member cannot call legacy community settings RPC',
    pg_temp.act(v_member, 'authenticated',
      format('select public.community_update(%L,%L)',
        v_active_community, 'Legacy RPC Update')),
    'err:permission denied for function community_update');
  v_result := v_result || pg_temp.ex('community moderator cannot update settings',
    pg_temp.act(v_moderator, 'authenticated',
      format('select public.community_manage_update(%L,%L,%L,%L,%L,%L)',
        v_active_community, 'Moderator Update ' || substr(v_active_community::text, 1, 8), '', 'interest', v_institution, v_cover_path)),
    'err:forbidden');
  v_result := v_result || pg_temp.ex('platform community manager cannot update community settings',
    pg_temp.act(v_admin, 'authenticated',
      format('select public.community_manage_update(%L,%L,%L,%L,%L,%L)',
        v_active_community, 'Security Admin ' || substr(v_active_community::text, 1, 8), '', 'interest', v_institution, v_cover_path)),
    'err:forbidden');
  v_result := v_result || pg_temp.ex('community owner can update cover object',
    pg_temp.act(v_owner, 'authenticated',
      format('update storage.objects set metadata=coalesce(metadata,''{}''::jsonb) where bucket_id=%L and name=%L',
        'community-covers', v_cover_path)),
    'ok:1');
  v_result := v_result || pg_temp.ex('non-manager cannot update cover object',
    pg_temp.act(v_outsider, 'authenticated',
      format('update storage.objects set metadata=coalesce(metadata,''{}''::jsonb) where bucket_id=%L and name=%L',
        'community-covers', v_cover_path)),
    'ok:0');
  v_result := v_result || pg_temp.ex('ordinary member cannot update cover object',
    pg_temp.act(v_member, 'authenticated',
      format('update storage.objects set metadata=coalesce(metadata,''{}''::jsonb) where bucket_id=%L and name=%L',
        'community-covers', v_cover_path)),
    'ok:0');
  v_result := v_result || pg_temp.ex('community moderator cannot update cover object',
    pg_temp.act(v_moderator, 'authenticated',
      format('update storage.objects set metadata=coalesce(metadata,''{}''::jsonb) where bucket_id=%L and name=%L',
        'community-covers', v_cover_path)),
    'ok:0');
  v_result := v_result || pg_temp.ex('platform community manager cannot update cover object',
    pg_temp.act(v_admin, 'authenticated',
      format('update storage.objects set metadata=coalesce(metadata,''{}''::jsonb) where bucket_id=%L and name=%L',
        'community-covers', v_cover_path)),
    'ok:0');
  v_result := v_result || pg_temp.ex('former member cannot update cover object',
    pg_temp.act(v_removed, 'authenticated',
      format('update storage.objects set metadata=coalesce(metadata,''{}''::jsonb) where bucket_id=%L and name=%L',
        'community-covers', v_cover_path)),
    'ok:0');
  v_result := v_result || pg_temp.ex('banned member cannot update cover object',
    pg_temp.act(v_banned, 'authenticated',
      format('update storage.objects set metadata=coalesce(metadata,''{}''::jsonb) where bucket_id=%L and name=%L',
        'community-covers', v_cover_path)),
    'ok:0');
  v_result := v_result || pg_temp.ex('community moderator cannot delete cover object',
    pg_temp.act(v_moderator, 'authenticated',
      format('delete from storage.objects where bucket_id=%L and name=%L', 'community-covers', v_cover_path)),
    'ok:0');
  v_result := v_result || pg_temp.ex('platform community manager cannot delete cover object',
    pg_temp.act(v_admin, 'authenticated',
      format('delete from storage.objects where bucket_id=%L and name=%L', 'community-covers', v_cover_path)),
    'ok:0');
  v_result := v_result || pg_temp.ex('community owner can delete cover object',
    pg_temp.act(v_owner, 'authenticated',
      format('delete from storage.objects where bucket_id=%L and name=%L', 'community-covers', v_cover_path)),
    'ok:1');
  v_result := v_result || pg_temp.ex('non-manager cannot change community cover',
    pg_temp.act(v_outsider, 'authenticated',
      format('select public.community_manage_update(%L,%L,%L,%L,%L,%L)',
        v_active_community, 'Security Test Attack', '', 'interest', v_institution, v_cover_path)),
    'err:forbidden');

  v_result := v_result || pg_temp.ex('admin suspends community owner for standing test',
    pg_temp.act(v_admin, 'authenticated',
      format('select public.admin_set_account_status(%L,%L,%L)', v_owner, 'suspended', 'security test suspension')),
    'ok:1');
  v_result := v_result || pg_temp.ex('suspended owner cannot manage community cover',
    pg_temp.act(v_owner, 'authenticated',
      format('select public.community_manage_update(%L,%L,%L,%L,%L,%L)',
        v_active_community, 'Suspended Update', '', 'interest', v_institution, v_cover_path)),
    'err:forbidden');
  v_result := v_result || pg_temp.ex('suspended owner cannot upload community cover',
    pg_temp.act(v_owner, 'authenticated',
      format('insert into storage.objects (bucket_id, name) values (%L, %L)',
        'community-covers',
        v_active_community::text || '/community-cover-' || gen_random_uuid()::text || '.png')),
    'err:new row violates row-level security');
  v_result := v_result || pg_temp.ex('suspended owner cannot enumerate banned members',
    pg_temp.act(v_owner, 'authenticated',
      format('select count(*) from public.community_banned_list(%L)', v_active_community)),
    'err:forbidden');
  v_result := v_result || pg_temp.ex('admin restores community owner standing',
    pg_temp.act(v_admin, 'authenticated',
      format('select public.admin_set_account_status(%L,%L,%L)', v_owner, 'active', 'security test restore')),
    'ok:1');
  v_result := v_result || pg_temp.ex('ordinary moderator cannot use owner-only archive RPC',
    pg_temp.act(v_moderator, 'authenticated',
      format('select public.community_set_archived(%L,%L)', v_active_community, true)),
    'err:forbidden');
  v_result := v_result || pg_temp.ex('demoted former moderator cannot use archive RPC',
    pg_temp.act(v_former_moderator, 'authenticated',
      format('select public.community_set_archived(%L,%L)', v_active_community, true)),
    'err:forbidden');
  v_result := v_result || pg_temp.ex('current owner can archive community',
    pg_temp.act(v_owner, 'authenticated',
      format('select public.community_set_archived(%L,%L)', v_active_community, true)),
    'ok:1');
  v_result := v_result || pg_temp.ex('current owner can unarchive community',
    pg_temp.act(v_owner, 'authenticated',
      format('select public.community_set_archived(%L,%L)', v_active_community, false)),
    'ok:1');

  if to_regprocedure('public.posts_by_hashtag(text,timestamp with time zone,uuid,integer)') is not null then
    v_result := v_result || pg_temp.ex('hashtag RPC does not return community post',
      pg_temp.scalar(v_member, 'authenticated',
        format('select count(*)::text from public.posts_by_hashtag(%L) where id=%L',
          'securityonly', v_post)), '0');
  else
    v_result := v_result || 'SKIP prepared hashtag RPC is not installed' || E'\n';
  end if;
  if to_regprocedure('public.search_hashtags(text,integer)') is not null then
    v_result := v_result || pg_temp.ex('hashtag search hides community-only tag',
      pg_temp.scalar(v_member, 'authenticated',
        'select count(*)::text from public.search_hashtags(''securityonly'')'), '0');
  end if;
  if to_regprocedure('public.trending_hashtags(integer,integer)') is not null then
    v_result := v_result || pg_temp.ex('trending hashtags hide community-only tag',
      pg_temp.scalar(v_member, 'authenticated',
        'select count(*)::text from public.trending_hashtags(7,25) where tag=''securityonly'''), '0');
  end if;

  if to_regprocedure('public.record_post_impressions(uuid[])') is not null then
    v_result := v_result || pg_temp.ex('analytics RPC ignores community post for non-member',
      pg_temp.act(v_outsider, 'authenticated',
        format('select public.record_post_impressions(array[%L]::uuid[])', v_post)), 'ok:1');
    select count(*) into v_count
    from public.post_impression_seen
    where viewer_id = v_outsider and post_id = v_post;
    v_result := v_result || pg_temp.ex('analytics does not record unauthorized viewer',
      v_count::text, '0');
    v_result := v_result || pg_temp.ex('analytics records active community member',
      pg_temp.act(v_owner, 'authenticated',
        format('select public.record_post_impressions(array[%L]::uuid[])', v_post)), 'ok:1');
    select count(*) into v_count
    from public.post_impression_seen
    where viewer_id = v_owner and post_id = v_post;
    v_result := v_result || pg_temp.ex('authorized analytics row recorded',
      v_count::text, '1');
  else
    v_result := v_result || 'SKIP prepared analytics RPC is not installed' || E'\n';
  end if;

  select count(*) into v_count from regexp_split_to_table(v_result, E'\n') s
  where s like 'FAIL %';
  if v_count > 0 then
    raise exception E'RESULTS\n%', v_result;
  end if;
  raise notice E'RESULTS\n%', v_result;
end
$test$;

rollback;
