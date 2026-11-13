begin;

do $preflight$
declare
  v_rel text;
  v_source text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null
     and exists (
       select 1 from supabase_migrations.schema_migrations
       where version = '20261111145500'
     ) then
    raise exception 'Migration 20261111145500 is already recorded';
  end if;

  foreach v_rel in array array[
    'public.posts',
    'public.comments',
    'public.community_members',
    'public.communities',
    'public.post_media',
    'public.post_likes',
    'public.reposts',
    'storage.objects',
    'storage.buckets'
  ] loop
    if to_regclass(v_rel) is null then
      raise exception 'Security migration preflight failed: missing relation %', v_rel;
    end if;
  end loop;

  if not (select relrowsecurity from pg_class where oid = 'public.posts'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.comments'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.community_members'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.post_media'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.post_likes'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.reposts'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) then
    raise exception 'Security migration preflight failed: RLS is disabled on an affected table';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'community_id'
  ) then
    raise exception 'Security migration preflight failed: posts.community_id is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'community_members' and column_name = 'status'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'communities' and column_name = 'status'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'communities' and column_name = 'cover_path'
  ) then
    raise exception 'Security migration preflight failed: expected community status or cover_path columns are missing';
  end if;

  if to_regprocedure('public.account_can_post()') is null
     or to_regprocedure('public.account_is_listed(uuid)') is null
     or to_regprocedure('public.has_permission(text)') is null
     or to_regprocedure('public.internal_profile_visible(uuid,uuid)') is null
     or to_regprocedure('public.internal_blocked_either(uuid,uuid)') is null
     or to_regprocedure('public.effective_status_internal(uuid)') is null
     or to_regprocedure('public.like_post(uuid)') is null
     or to_regprocedure('public.add_comment(uuid,text)') is null
     or to_regprocedure('public.repost_post(uuid)') is null
     or to_regprocedure('public.community_posts(uuid,timestamp with time zone,uuid,integer)') is null
     or to_regprocedure('public.community_manage_update(uuid,text,text,text,uuid,text)') is null
     or to_regprocedure('public.community_set_archived(uuid,boolean)') is null
     or to_regprocedure('public.community_set_member(uuid,uuid,text,text)') is null
     or to_regprocedure('public.community_set_post_state(uuid,boolean,text)') is null
     or to_regprocedure('public.my_community_role(uuid)') is null
     or to_regprocedure('public.create_community(text,text,text,text,uuid)') is null
     or to_regprocedure('public.join_community(uuid)') is null
     or to_regprocedure('public.leave_community(uuid)') is null
     or to_regprocedure('public.community_update(uuid,text)') is null
     or to_regprocedure('public.community_banned_list(uuid)') is null
     or to_regprocedure('public.admin_set_community_state(uuid,text,text)') is null
     or to_regprocedure('public.submit_report(text,uuid,text,text)') is null then
    raise exception 'Security migration preflight failed: one or more expected helpers or RPC signatures are missing';
  end if;

  if (
    to_regprocedure('public.post_impression_stats(uuid,integer)') is not null
    or to_regprocedure('public.post_reach(uuid,integer)') is not null
    or to_regprocedure('public.my_posts_impression_totals(uuid[])') is not null
  ) and (
    to_regprocedure('public.internal_min_viewers()') is null
    or to_regprocedure('public.internal_lagos_day(timestamp with time zone)') is null
  ) then
    raise exception 'Security migration preflight failed: installed analytics readers are missing their reviewed threshold or date/setting helpers';
  end if;

  if to_regprocedure('public.post_reach(uuid,integer)') is not null
     and to_regprocedure('public.internal_setting_int(text,integer,integer,integer)') is null then
    raise exception 'Security migration preflight failed: post_reach is missing its reviewed settings helper';
  end if;

  if to_regprocedure('public.record_post_impressions(uuid[])') is not null then
    select lower(prosrc) into v_source
    from pg_proc
    where oid = 'public.record_post_impressions(uuid[])'::regprocedure;
    if to_regprocedure('public.internal_post_visible_to(uuid,uuid)') is null
       or position('internal_post_visible_to' in v_source) = 0 then
      raise exception 'Security migration preflight failed: record_post_impressions does not use the reviewed post-visibility helper';
    end if;
  end if;

  if to_regnamespace('campusconnect_private') is not null then
    raise exception 'Security migration preflight failed: a caller-bound visibility helper already exists';
  end if;

  if coalesce(current_setting('pgrst.db_schemas', true), 'public, graphql_public')
       like '%campusconnect_private%' then
    raise exception 'Security migration preflight failed: campusconnect_private must not be exposed through PostgREST';
  end if;

  if exists (
    select 1 from pg_policy
    where polname in (
      'campusconnect_posts_community_guard',
      'campusconnect_posts_visibility_guard',
      'campusconnect_posts_insert_community_guard',
      'campusconnect_posts_update_community_guard',
      'campusconnect_comments_read_guard',
      'campusconnect_comments_insert_guard',
      'campusconnect_comments_update_guard',
      'campusconnect_post_likes_read_guard',
      'campusconnect_membership_visibility_guard',
      'campusconnect_post_media_read_guard',
      'campusconnect_post_media_insert_guard',
      'campusconnect_reposts_read_guard',
      'campusconnect_post_images_read_guard',
      'campusconnect_community_cover_read_guard',
      'campusconnect_community_cover_insert_guard',
      'campusconnect_community_cover_update_guard',
      'campusconnect_community_cover_delete_guard'
    )
  ) then
    raise exception 'Security migration preflight failed: a guard policy name already exists';
  end if;

  -- Keep the known permissive policies; the restrictive guards below constrain their OR-combined result.
  if exists (
    select 1
    from (values
      ('public', 'posts', 'posts_select', 'SELECT'),
      ('public', 'posts', 'posts_insert', 'INSERT'),
      ('public', 'posts', 'posts_update_own', 'UPDATE'),
      ('public', 'comments', 'comments_select', 'SELECT'),
      ('public', 'comments', 'comments_update_own', 'UPDATE'),
      ('public', 'community_members', 'community_members_select', 'SELECT'),
      ('public', 'post_media', 'post_media_select', 'SELECT'),
      ('public', 'post_media', 'post_media_insert', 'INSERT'),
      ('public', 'post_media', 'post_media_delete', 'DELETE'),
      ('public', 'post_likes', 'post_likes_select', 'SELECT'),
      ('public', 'reposts', 'reposts_select', 'SELECT'),
      ('storage', 'objects', 'post_images_select', 'SELECT'),
      ('storage', 'objects', 'post_images_insert_own', 'INSERT'),
      ('storage', 'objects', 'post_images_update_own', 'UPDATE'),
      ('storage', 'objects', 'post_images_delete_own_or_mod', 'DELETE'),
      ('storage', 'objects', 'community_covers_select_visible', 'SELECT'),
      ('storage', 'objects', 'community_covers_insert_manager', 'INSERT'),
      ('storage', 'objects', 'community_covers_update_manager', 'UPDATE'),
      ('storage', 'objects', 'community_covers_delete_manager', 'DELETE'),
      ('storage', 'objects', 'avatars_select_own', 'SELECT'),
      ('storage', 'objects', 'avatars_insert_own', 'INSERT'),
      ('storage', 'objects', 'avatars_update_own', 'UPDATE'),
      ('storage', 'objects', 'avatars_delete_own_or_mod', 'DELETE'),
      ('storage', 'objects', 'profile_covers_select_visible_profile', 'SELECT'),
      ('storage', 'objects', 'profile_covers_insert_own', 'INSERT'),
      ('storage', 'objects', 'profile_covers_update_own', 'UPDATE'),
      ('storage', 'objects', 'profile_covers_delete_own', 'DELETE')
    ) expected(schemaname, tablename, policyname, cmd)
    where not exists (
      select 1 from pg_policies p
      where p.schemaname = expected.schemaname
        and p.tablename = expected.tablename
        and p.policyname = expected.policyname
        and p.cmd = expected.cmd
        and p.permissive = 'PERMISSIVE'
        and p.roles = array['authenticated'::name]
    )
  ) then
    raise exception 'Security migration preflight failed: an expected baseline permissive policy is missing, has changed, or is not restricted to authenticated; inspect pg_policies before proceeding';
  end if;

  if exists (
    select 1
    from pg_policies p
    where p.permissive = 'PERMISSIVE'
      and (
        (p.schemaname = 'public' and p.tablename in (
          'posts', 'comments', 'community_members', 'post_media', 'post_likes', 'reposts'
        ))
        or (p.schemaname = 'storage' and p.tablename = 'objects')
      )
      and p.roles && array['anon'::name, 'public'::name]
  ) then
    raise exception 'Security migration preflight failed: an affected permissive policy grants anon or PUBLIC access';
  end if;

  if exists (
    select 1
    from pg_policies p
    where p.permissive = 'PERMISSIVE'
      and (
        (p.schemaname = 'public' and p.tablename in (
          'posts', 'comments', 'community_members', 'post_media', 'post_likes', 'reposts'
        ))
        or (p.schemaname = 'storage' and p.tablename = 'objects')
      )
      and not exists (
        select 1
        from (values
          ('public', 'posts', 'posts_select', 'SELECT'),
          ('public', 'posts', 'posts_insert', 'INSERT'),
          ('public', 'posts', 'posts_update_own', 'UPDATE'),
          ('public', 'comments', 'comments_select', 'SELECT'),
          ('public', 'comments', 'comments_update_own', 'UPDATE'),
          ('public', 'community_members', 'community_members_select', 'SELECT'),
          ('public', 'post_media', 'post_media_select', 'SELECT'),
          ('public', 'post_media', 'post_media_insert', 'INSERT'),
          ('public', 'post_media', 'post_media_delete', 'DELETE'),
          ('public', 'post_likes', 'post_likes_select', 'SELECT'),
          ('public', 'reposts', 'reposts_select', 'SELECT'),
          ('storage', 'objects', 'post_images_select', 'SELECT'),
          ('storage', 'objects', 'post_images_insert_own', 'INSERT'),
          ('storage', 'objects', 'post_images_update_own', 'UPDATE'),
          ('storage', 'objects', 'post_images_delete_own_or_mod', 'DELETE'),
          ('storage', 'objects', 'community_covers_select_visible', 'SELECT'),
          ('storage', 'objects', 'community_covers_insert_manager', 'INSERT'),
          ('storage', 'objects', 'community_covers_update_manager', 'UPDATE'),
          ('storage', 'objects', 'community_covers_delete_manager', 'DELETE'),
          ('storage', 'objects', 'avatars_select_own', 'SELECT'),
          ('storage', 'objects', 'avatars_insert_own', 'INSERT'),
          ('storage', 'objects', 'avatars_update_own', 'UPDATE'),
          ('storage', 'objects', 'avatars_delete_own_or_mod', 'DELETE'),
          ('storage', 'objects', 'profile_covers_select_visible_profile', 'SELECT'),
          ('storage', 'objects', 'profile_covers_insert_own', 'INSERT'),
          ('storage', 'objects', 'profile_covers_update_own', 'UPDATE'),
          ('storage', 'objects', 'profile_covers_delete_own', 'DELETE')
        ) expected(schemaname, tablename, policyname, cmd)
        where p.schemaname = expected.schemaname
          and p.tablename = expected.tablename
          and p.policyname = expected.policyname
          and p.cmd = expected.cmd
      )
  ) then
    raise exception 'Security migration preflight failed: an unreviewed permissive policy exists on an affected table';
  end if;

  if not exists (select 1 from storage.buckets where id = 'post-images')
     or not exists (select 1 from storage.buckets where id = 'community-covers') then
    raise exception 'Security migration preflight failed: expected Storage buckets are missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'post_images_select' and cmd = 'SELECT'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'post_images_insert_own' and cmd = 'INSERT'
  ) then
    raise exception 'Security migration preflight failed: expected post-image read/upload policies are missing';
  end if;

  if exists (
    select 1
    from (values
      ('community_covers_select_visible', 'SELECT'),
      ('community_covers_insert_manager', 'INSERT'),
      ('community_covers_update_manager', 'UPDATE'),
      ('community_covers_delete_manager', 'DELETE')
    ) expected(policyname, cmd)
    where not exists (
      select 1 from pg_policies p
      where p.schemaname = 'storage' and p.tablename = 'objects'
        and p.policyname = expected.policyname and p.cmd = expected.cmd
    )
  ) then
    raise exception 'Security migration preflight failed: expected community-cover policies are missing';
  end if;

  if to_regclass('public.post_media_storage_path_idx') is not null
     and not exists (
       select 1 from pg_indexes
       where schemaname = 'public'
         and tablename = 'post_media'
         and indexname = 'post_media_storage_path_idx'
         and indexdef ilike '%(storage_path)%'
     ) then
    raise exception 'Security migration preflight failed: post_media_storage_path_idx exists with a different definition';
  end if;

  select lower(prosrc) into v_source
  from pg_proc where oid = 'public.like_post(uuid)'::regprocedure;
  if position('internal_profile_visible' in v_source) = 0
     or position('internal_blocked_either' in v_source) = 0 then
    raise exception 'Security migration preflight failed: like_post differs from the reviewed local definition';
  end if;

  select lower(prosrc) into v_source
  from pg_proc where oid = 'public.add_comment(uuid,text)'::regprocedure;
  if position('internal_profile_visible' in v_source) = 0
     or position('internal_blocked_either' in v_source) = 0 then
    raise exception 'Security migration preflight failed: add_comment differs from the reviewed local definition';
  end if;

  select lower(prosrc) into v_source
  from pg_proc where oid = 'public.repost_post(uuid)'::regprocedure;
  if position('cannot_repost_community_post' in v_source) = 0 then
    raise exception 'Security migration preflight failed: repost_post differs from the reviewed local definition';
  end if;

  select lower(prosrc) into v_source
  from pg_proc where oid = 'public.community_manage_update(uuid,text,text,text,uuid,text)'::regprocedure;
  if position('invalid_cover_path' in v_source) = 0
     or position('my_community_role' in v_source) = 0 then
    raise exception 'Security migration preflight failed: community_manage_update differs from the reviewed local definition';
  end if;

  select lower(prosrc) into v_source
  from pg_proc where oid = 'public.community_set_member(uuid,uuid,text,text)'::regprocedure;
  if position('v_caller' in v_source) = 0
     or position('community_mod_actions' in v_source) = 0 then
    raise exception 'Security migration preflight failed: community_set_member differs from the reviewed local definition';
  end if;

  select lower(prosrc) into v_source
  from pg_proc where oid = 'public.community_set_archived(uuid,boolean)'::regprocedure;
  if position('community_mod_actions' in v_source) = 0 then
    raise exception 'Security migration preflight failed: community_set_archived differs from the reviewed local definition';
  end if;

  select lower(prosrc) into v_source
  from pg_proc where oid = 'public.community_set_post_state(uuid,boolean,text)'::regprocedure;
  if position('hidden_scope' in v_source) = 0
     or position('community_mod_actions' in v_source) = 0 then
    raise exception 'Security migration preflight failed: community_set_post_state differs from the reviewed local definition';
  end if;
end;
$preflight$;

create schema campusconnect_private;
revoke all on schema campusconnect_private from public, anon, authenticated;
grant usage on schema campusconnect_private to authenticated;

create function campusconnect_private.internal_current_community_member(p_community uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select coalesce(
    (select public.account_is_listed((select auth.uid()))
       and c.status = 'active'
       and exists (
         select 1
         from public.community_members m
         where m.community_id = c.id
           and m.user_id = (select auth.uid())
           and m.status = 'active'
       )
     from public.communities c
     where c.id = p_community),
    false
  )
$function$;

create function campusconnect_private.internal_current_community_manager(p_community uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select coalesce(
    (select public.account_can_post()
       and c.status <> 'disabled'
       and exists (
         select 1
         from public.community_members m
         where m.community_id = c.id
           and m.user_id = (select auth.uid())
           and m.status = 'active'
           and m.role in ('owner', 'moderator')
       )
     from public.communities c
     where c.id = p_community),
    false
  )
$function$;

revoke all on function campusconnect_private.internal_current_community_member(uuid) from public, anon, authenticated;
revoke all on function campusconnect_private.internal_current_community_manager(uuid) from public, anon, authenticated;
grant execute on function campusconnect_private.internal_current_community_member(uuid) to authenticated;
grant execute on function campusconnect_private.internal_current_community_manager(uuid) to authenticated;

create function campusconnect_private.internal_security_post_visible_to(p_post uuid, p_viewer uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select coalesce((
    select p.status = 'visible'
      and public.account_is_listed(p.author_id)
      and public.internal_profile_visible(p.author_id, p_viewer)
      and not public.internal_blocked_either(p_viewer, p.author_id)
      and (
        p.community_id is null
        or (
          c.status = 'active'
          and exists (
            select 1 from public.community_members m
            where m.community_id = p.community_id
              and m.user_id = p_viewer
              and m.status = 'active'
          )
        )
      )
    from public.posts p
    left join public.communities c on c.id = p.community_id
    where p.id = p_post
  ), false)
$function$;

revoke all on function campusconnect_private.internal_security_post_visible_to(uuid,uuid) from public, anon, authenticated;

create function campusconnect_private.internal_current_post_visible(p_post uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select campusconnect_private.internal_security_post_visible_to(p_post, (select auth.uid()))
$function$;

create function campusconnect_private.internal_current_post_row_visible(p_post uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select coalesce((
    select (
      (p.status = 'visible'
       and campusconnect_private.internal_current_post_visible(p.id))
      or (
        p.author_id = (select auth.uid())
        and (
          p.community_id is null
          or campusconnect_private.internal_current_community_member(p.community_id)
        )
      )
      or public.has_permission('content.moderate')
      or (
        p.status = 'hidden'
        and p.community_id is not null
        and campusconnect_private.internal_current_community_manager(p.community_id)
        and exists (
          select 1 from public.communities c
          where c.id = p.community_id and c.status = 'active'
        )
      )
    )
    from public.posts p
    where p.id = p_post
  ), false)
$function$;

create function campusconnect_private.internal_current_repost_visible(p_post uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select campusconnect_private.internal_security_post_visible_to(p_post, (select auth.uid()))
$function$;

revoke all on function campusconnect_private.internal_current_post_visible(uuid) from public, anon, authenticated;
revoke all on function campusconnect_private.internal_current_post_row_visible(uuid) from public, anon, authenticated;
revoke all on function campusconnect_private.internal_current_repost_visible(uuid) from public, anon, authenticated;
grant execute on function campusconnect_private.internal_current_post_visible(uuid) to authenticated;
grant execute on function campusconnect_private.internal_current_post_row_visible(uuid) to authenticated;
grant execute on function campusconnect_private.internal_current_repost_visible(uuid) to authenticated;

do $optional_analytics_helper$
begin
  if to_regprocedure('public.internal_post_visible_to(uuid,uuid)') is not null then
    execute $replace$
      create or replace function public.internal_post_visible_to(p_post uuid, p_viewer uuid)
      returns boolean
      language sql stable security definer set search_path = ''
      as $body$
        select campusconnect_private.internal_security_post_visible_to(p_post, p_viewer)
      $body$
    $replace$;
    revoke all on function public.internal_post_visible_to(uuid,uuid) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.record_post_impressions(uuid[])') is not null then
    execute 'revoke all on function public.record_post_impressions(uuid[]) from public, anon, authenticated';
    execute 'grant execute on function public.record_post_impressions(uuid[]) to authenticated';
  end if;
end;
$optional_analytics_helper$;

do $optional_analytics_readers$
begin
  if to_regprocedure('public.post_impression_stats(uuid,integer)') is not null then
    execute $replace$
      create or replace function public.post_impression_stats(p_post uuid, p_days integer default 28)
      returns table (day date, impressions integer, unique_viewers integer)
      language plpgsql stable security definer set search_path = ''
      as $body$
      #variable_conflict use_column
      declare
        v_uid uuid := (select auth.uid());
        v_days integer := least(greatest(coalesce(p_days, 28), 1), 365);
        v_k integer := public.internal_min_viewers();
      begin
        if v_uid is null or not exists (
          select 1 from public.posts p
          where p.id = p_post
            and p.author_id = v_uid
            and p.status <> 'deleted'
            and (
              p.community_id is null
              or (p.status = 'visible' and campusconnect_private.internal_current_community_member(p.community_id))
            )
        ) then
          raise exception 'forbidden' using errcode = '42501';
        end if;
        return query
        select d.day, d.impressions, d.unique_viewers
        from public.post_impression_daily d
        where d.post_id = p_post
          and d.day > public.internal_lagos_day(now()) - v_days
          and d.unique_viewers >= v_k
        order by d.day;
      end;
      $body$
    $replace$;
    execute 'revoke all on function public.post_impression_stats(uuid, integer) from public, anon, authenticated';
    execute 'grant execute on function public.post_impression_stats(uuid, integer) to authenticated';
  end if;

  if to_regprocedure('public.post_reach(uuid,integer)') is not null then
    execute $replace$
      create or replace function public.post_reach(p_post uuid, p_days integer default 28)
      returns bigint
      language plpgsql stable security definer set search_path = ''
      as $body$
      declare
        v_uid uuid := (select auth.uid());
        v_days integer := least(greatest(coalesce(p_days, 28), 1),
          public.internal_setting_int('analytics_dedupe_retention_days', 35, 7, 90));
        v_k integer := public.internal_min_viewers();
        v_n bigint;
      begin
        if v_uid is null or not exists (
          select 1 from public.posts p
          where p.id = p_post
            and p.author_id = v_uid
            and p.status <> 'deleted'
            and (
              p.community_id is null
              or (p.status = 'visible' and campusconnect_private.internal_current_community_member(p.community_id))
            )
        ) then
          raise exception 'forbidden' using errcode = '42501';
        end if;
        select count(distinct s.viewer_id) into v_n
        from public.post_viewer_day s
        where s.post_id = p_post
          and s.day > public.internal_lagos_day(now()) - v_days;
        return case when v_n >= v_k then v_n end;
      end;
      $body$
    $replace$;
    execute 'revoke all on function public.post_reach(uuid, integer) from public, anon, authenticated';
    execute 'grant execute on function public.post_reach(uuid, integer) to authenticated';
  end if;

  if to_regprocedure('public.my_posts_impression_totals(uuid[])') is not null then
    execute $replace$
      create or replace function public.my_posts_impression_totals(p_post_ids uuid[])
      returns table (post_id uuid, impressions bigint, days_counted integer)
      language plpgsql stable security definer set search_path = ''
      as $body$
      #variable_conflict use_column
      declare
        v_uid uuid := (select auth.uid());
        v_k integer := public.internal_min_viewers();
      begin
        if v_uid is null then
          raise exception 'forbidden' using errcode = '42501';
        end if;
        if p_post_ids is null or cardinality(p_post_ids) = 0 then return; end if;
        if cardinality(p_post_ids) > 100 then
          raise exception 'too_many' using errcode = '22023';
        end if;
        return query
        select d.post_id, sum(d.impressions)::bigint, count(*)::integer
        from public.post_impression_daily d
        join public.posts p
          on p.id = d.post_id
         and p.author_id = v_uid
         and p.status <> 'deleted'
        where d.post_id = any (p_post_ids)
          and d.unique_viewers >= v_k
          and (
            p.community_id is null
            or (p.status = 'visible' and campusconnect_private.internal_current_community_member(p.community_id))
          )
        group by d.post_id;
      end;
      $body$
    $replace$;
    execute 'revoke all on function public.my_posts_impression_totals(uuid[]) from public, anon, authenticated';
    execute 'grant execute on function public.my_posts_impression_totals(uuid[]) to authenticated';
  end if;
end;
$optional_analytics_readers$;

create policy campusconnect_posts_community_guard on public.posts
  as restrictive for select to authenticated
  using (
    community_id is null
    or campusconnect_private.internal_current_community_member(community_id)
    or public.has_permission('content.moderate')
  );

create policy campusconnect_posts_visibility_guard on public.posts
  as restrictive for select to authenticated
  using (
    (
      author_id = (select auth.uid())
      and (
        community_id is null
        or campusconnect_private.internal_current_community_member(community_id)
      )
    )
    or public.has_permission('content.moderate')
    or (
      status = 'visible'
      and campusconnect_private.internal_current_post_visible(id)
    )
    or (
      status = 'hidden'
      and community_id is not null
      and campusconnect_private.internal_current_community_manager(community_id)
      and exists (
        select 1 from public.communities c
        where c.id = posts.community_id and c.status = 'active'
      )
    )
  );

create policy campusconnect_posts_insert_community_guard on public.posts
  as restrictive for insert to authenticated
  with check (
    public.account_can_post()
    and (
      community_id is null
      or campusconnect_private.internal_current_community_member(community_id)
    )
  );

create policy campusconnect_posts_update_community_guard on public.posts
  as restrictive for update to authenticated
  using (
    community_id is null
    or campusconnect_private.internal_current_community_member(community_id)
    or public.has_permission('content.moderate')
  )
  with check (
    community_id is null
    or campusconnect_private.internal_current_community_member(community_id)
    or public.has_permission('content.moderate')
  );

create policy campusconnect_membership_visibility_guard on public.community_members
  as restrictive for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_permission('communities.manage')
    or campusconnect_private.internal_current_community_manager(community_id)
    or (
      status = 'active'
      and campusconnect_private.internal_current_community_member(community_id)
      and exists (select 1 from public.profiles pr where pr.id = community_members.user_id)
    )
  );

create policy campusconnect_comments_read_guard on public.comments
  as restrictive for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = comments.post_id
        and (
          campusconnect_private.internal_current_post_visible(p.id)
          or campusconnect_private.internal_current_post_row_visible(p.id)
        )
    )
  );

create policy campusconnect_comments_insert_guard on public.comments
  as restrictive for insert to authenticated
  with check (
    public.account_can_post()
    and author_id = (select auth.uid())
    and exists (
      select 1 from public.posts p
      where p.id = comments.post_id
        and p.status = 'visible'
        and campusconnect_private.internal_current_post_visible(p.id)
    )
  );

create policy campusconnect_comments_update_guard on public.comments
  as restrictive for update to authenticated
  using (
    campusconnect_private.internal_current_post_row_visible(post_id)
  )
  with check (
    campusconnect_private.internal_current_post_row_visible(post_id)
  );

create policy campusconnect_post_media_read_guard on public.post_media
  as restrictive for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_media.post_id
        and (
          campusconnect_private.internal_current_post_visible(p.id)
          or campusconnect_private.internal_current_post_row_visible(p.id)
        )
    )
  );

create policy campusconnect_post_media_insert_guard on public.post_media
  as restrictive for insert to authenticated
  with check (
    public.account_can_post()
    and exists (
      select 1 from public.posts p
      where p.id = post_media.post_id
        and p.author_id = (select auth.uid())
        and p.status = 'visible'
        and (
          p.community_id is null
          or campusconnect_private.internal_current_community_member(p.community_id)
        )
    )
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
  );

create policy campusconnect_post_likes_read_guard on public.post_likes
  as restrictive for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_likes.post_id
        and (
          campusconnect_private.internal_current_post_visible(p.id)
          or campusconnect_private.internal_current_post_row_visible(p.id)
        )
    )
  );

create policy campusconnect_reposts_read_guard on public.reposts
  as restrictive for select to authenticated
  using (
    campusconnect_private.internal_current_repost_visible(post_id)
    and public.internal_profile_visible(user_id, (select auth.uid()))
    and not public.internal_blocked_either((select auth.uid()), user_id)
  );

create policy campusconnect_post_images_read_guard on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id <> 'post-images'
    or exists (
      select 1
      from public.post_media pm
      join public.posts p on p.id = pm.post_id
      where pm.storage_path = objects.name
        and (
          campusconnect_private.internal_current_post_visible(p.id)
          or public.has_permission('content.moderate')
          or campusconnect_private.internal_current_post_row_visible(p.id)
        )
    )
  );

create policy campusconnect_community_cover_read_guard on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id <> 'community-covers'
    or (
      (select auth.uid()) is not null
      and exists (
        select 1 from public.communities c
        where c.id::text = (storage.foldername(objects.name))[1]
          and c.cover_path = objects.name
          and c.status <> 'disabled'
      )
    )
  );

create policy campusconnect_community_cover_insert_guard on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'community-covers'
    or (
      (select auth.uid()) is not null
      and name ~ ('^' || (storage.foldername(objects.name))[1] || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$')
      and exists (
        select 1 from public.communities c
        where c.id::text = (storage.foldername(objects.name))[1]
          and c.status <> 'disabled'
          and (
            campusconnect_private.internal_current_community_manager(c.id)
            or public.has_permission('communities.manage')
          )
      )
    )
  );

create policy campusconnect_community_cover_update_guard on storage.objects
  as restrictive for update to authenticated
  using (
    bucket_id <> 'community-covers'
    or (
      (select auth.uid()) is not null
      and name ~ ('^' || (storage.foldername(objects.name))[1] || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$')
      and exists (
        select 1 from public.communities c
        where c.id::text = (storage.foldername(objects.name))[1]
          and c.status <> 'disabled'
          and (
            campusconnect_private.internal_current_community_manager(c.id)
            or public.has_permission('communities.manage')
          )
      )
    )
  )
  with check (
    bucket_id <> 'community-covers'
    or (
      (select auth.uid()) is not null
      and name ~ ('^' || (storage.foldername(objects.name))[1] || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$')
      and exists (
        select 1 from public.communities c
        where c.id::text = (storage.foldername(objects.name))[1]
          and c.status <> 'disabled'
          and (
            campusconnect_private.internal_current_community_manager(c.id)
            or public.has_permission('communities.manage')
          )
      )
    )
  );

create policy campusconnect_community_cover_delete_guard on storage.objects
  as restrictive for delete to authenticated
  using (
    bucket_id <> 'community-covers'
    or (
      (select auth.uid()) is not null
      and name ~ ('^' || (storage.foldername(objects.name))[1] || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$')
      and exists (
        select 1 from public.communities c
        where c.id::text = (storage.foldername(objects.name))[1]
          and c.status <> 'disabled'
          and (
            campusconnect_private.internal_current_community_manager(c.id)
            or public.has_permission('communities.manage')
          )
      )
    )
  );

create index if not exists post_media_storage_path_idx
  on public.post_media (storage_path);

update storage.buckets
set public = false
where id in ('post-images', 'community-covers');

create or replace function public.community_posts(
  p_comm uuid,
  p_before timestamp with time zone default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid, author_id uuid, body text, created_at timestamp with time zone, edited_at timestamp with time zone,
  like_count integer, comment_count integer, repost_count integer,
  liked_by_me boolean, reposted_by_me boolean,
  username text, display_name text, avatar_path text,
  activity_at timestamp with time zone, reposter_username text, reposter_name text
)
language sql stable security invoker set search_path = ''
as $function$
  select p.id, p.author_id, p.body, p.created_at, p.edited_at,
    p.like_count, p.comment_count, p.repost_count,
    exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
    exists (select 1 from public.reposts r where r.post_id = p.id and r.user_id = (select auth.uid())),
    pr.username, pr.display_name, pr.avatar_path,
    p.created_at, null::text, null::text
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where p.community_id = p_comm
    and p.status = 'visible'
    and (
      campusconnect_private.internal_current_community_member(p_comm)
      or public.has_permission('content.moderate')
    )
    and (p_before is null or (p.created_at, p.id) < (
      p_before,
      coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
    ))
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$function$;

create or replace function public.like_post(p_post uuid)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_author uuid;
begin
  if v_uid is null or not public.account_is_listed(v_uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select p.author_id into v_author
  from public.posts p
  where p.id = p_post and p.status = 'visible';

  if v_author is null
     or not campusconnect_private.internal_security_post_visible_to(p_post, v_uid)
     or public.internal_blocked_either(v_uid, v_author) then
    raise exception 'not_found' using errcode = '22023';
  end if;

  insert into public.post_likes (post_id, user_id)
  values (p_post, v_uid)
  on conflict do nothing;
end;
$function$;

create or replace function public.add_comment(p_post uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_author uuid;
  v_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_uid is null or not public.account_can_post() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 1000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;
  if (select count(*) from public.comments
      where author_id = v_uid and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  select p.author_id into v_author
  from public.posts p
  where p.id = p_post and p.status = 'visible';

  if v_author is null
     or not campusconnect_private.internal_security_post_visible_to(p_post, v_uid)
     or public.internal_blocked_either(v_uid, v_author) then
    raise exception 'not_found' using errcode = '22023';
  end if;

  insert into public.comments (post_id, author_id, body)
  values (p_post, v_uid, v_body)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.repost_post(p_post uuid)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_author uuid;
  v_community uuid;
begin
  if v_uid is null or not public.account_can_post() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (select count(*) from public.reposts
      where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  select p.author_id, p.community_id into v_author, v_community
  from public.posts p
  where p.id = p_post and p.status = 'visible';

  if v_author is null
     or not campusconnect_private.internal_security_post_visible_to(p_post, v_uid)
     or public.internal_blocked_either(v_uid, v_author) then
    raise exception 'not_found' using errcode = '22023';
  end if;
  if v_author = v_uid then
    raise exception 'cannot_repost_own' using errcode = '22023';
  end if;
  if v_community is not null then
    raise exception 'cannot_repost_community_post' using errcode = '22023';
  end if;

  insert into public.reposts (user_id, post_id)
  values (v_uid, p_post)
  on conflict do nothing;
end;
$function$;

create or replace function public.submit_report(
  p_type text,
  p_target uuid,
  p_category text,
  p_explanation text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_user uuid;
  v_snapshot text;
  v_id uuid;
  v_post uuid;
  v_found boolean := false;
begin
  if v_uid is null or not public.account_is_listed(v_uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (select count(*) from public.reports
      where reporter_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if p_type = 'post' then
    select p.author_id, left(p.body, 500)
    into v_user, v_snapshot
    from public.posts p
    where p.id = p_target and p.status = 'visible';
    v_found := v_user is not null
      and campusconnect_private.internal_security_post_visible_to(p_target, v_uid);
  elsif p_type = 'comment' then
    select c.author_id, left(c.body, 500), c.post_id
    into v_user, v_snapshot, v_post
    from public.comments c
    where c.id = p_target and c.status = 'visible';
    v_found := v_user is not null
      and public.internal_profile_visible(v_user, v_uid)
      and not public.internal_blocked_either(v_uid, v_user)
      and campusconnect_private.internal_security_post_visible_to(v_post, v_uid);
  elsif p_type = 'user' then
    select p.id, left(p.display_name || ' @' || p.username || ': ' || coalesce(p.bio, ''), 500)
    into v_user, v_snapshot
    from public.profiles p where p.id = p_target;
    v_found := v_user is not null and public.internal_profile_visible(v_user, v_uid);
  elsif p_type = 'community' then
    select c.created_by, left(c.name || ': ' || coalesce(c.description, ''), 500)
    into v_user, v_snapshot
    from public.communities c
    where c.id = p_target and c.status in ('active', 'archived');
    v_found := v_snapshot is not null;
  elsif p_type = 'message' then
    select m.sender_id, left(m.body, 500)
    into v_user, v_snapshot
    from public.messages m
    where m.id = p_target
      and m.status = 'visible'
      and m.sender_id <> v_uid
      and exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = m.conversation_id and cm.user_id = v_uid
      );
    v_found := v_user is not null;
  elsif p_type = 'opportunity' then
    select left(o.title || ' (' || coalesce(o.organization, 'unknown organisation') || '): ' || o.summary, 500)
    into v_snapshot
    from public.opportunities o
    where o.id = p_target
      and o.status = 'published'
      and (o.deadline is null or o.deadline >= current_date);
    v_found := v_snapshot is not null;
  else
    raise exception 'invalid_type' using errcode = '22023';
  end if;

  if not v_found then
    raise exception 'not_found' using errcode = '22023';
  end if;
  if v_user = v_uid then
    raise exception 'cannot_report_self' using errcode = '22023';
  end if;

  insert into public.reports (
    reporter_id, target_type, target_id, reported_user_id, category, explanation, content_snapshot
  )
  values (
    v_uid, p_type, p_target, v_user, p_category,
    nullif(btrim(coalesce(p_explanation, '')), ''), v_snapshot
  )
  on conflict (reporter_id, target_type, target_id) do nothing
  returning id into v_id;

  if v_id is null then
    select r.id into v_id
    from public.reports r
    where r.reporter_id = v_uid and r.target_type = p_type and r.target_id = p_target;
  end if;
  return v_id;
end;
$function$;

create or replace function public.community_manage_update(
  p_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_institution uuid,
  p_cover_path text
)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
begin
  if v_uid is null or (
    (not campusconnect_private.internal_current_community_manager(p_id)
     and not public.has_permission('communities.manage'))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_status
  from public.communities
  where id = p_id
  for update;
  if v_status is null then raise exception 'not_found' using errcode = '22023'; end if;
  if v_status = 'disabled' then raise exception 'disabled_by_platform' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 3 and 60 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 500 then
    raise exception 'invalid_description' using errcode = '22023';
  end if;
  if p_category not in ('institution','department','course','interest','activity','other') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if p_institution is not null and not exists (
    select 1 from public.institutions where id = p_institution and is_active
  ) then
    raise exception 'invalid_institution' using errcode = '22023';
  end if;
  if p_cover_path is not null and p_cover_path !~ (
    '^' || p_id::text || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$'
  ) then
    raise exception 'invalid_cover_path' using errcode = '22023';
  end if;
  if p_cover_path is not null and not exists (
    select 1 from storage.objects
    where bucket_id = 'community-covers' and name = p_cover_path
  ) then
    raise exception 'cover_not_found' using errcode = '22023';
  end if;

  update public.communities
  set name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      category = p_category,
      institution_id = p_institution,
      cover_path = p_cover_path
  where id = p_id;
exception
  when unique_violation then
    raise exception 'name_taken' using errcode = '23505';
end;
$function$;

create or replace function public.community_set_archived(p_id uuid, p_archived boolean)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
begin
  if not public.account_can_post()
     or (select public.my_community_role(p_id)) is distinct from 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_status
  from public.communities
  where id = p_id
  for update;
  if v_status = 'disabled' then
    raise exception 'disabled_by_platform' using errcode = '42501';
  end if;

  update public.communities
  set status = case when p_archived then 'archived' else 'active' end
  where id = p_id;
  insert into public.community_mod_actions (community_id, actor_id, action)
  values (p_id, v_uid, case when p_archived then 'archive' else 'unarchive' end);
end;
$function$;

create or replace function public.community_set_member(
  p_comm uuid,
  p_user uuid,
  p_action text,
  p_reason text default null
)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_caller text := coalesce((select public.my_community_role(p_comm)), '');
  v_trole text;
  v_tstatus text;
begin
  if v_uid is null or not public.account_can_post()
     or v_caller not in ('owner', 'moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action not in ('ban', 'unban', 'remove', 'make_moderator', 'remove_moderator') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  if p_user = v_uid then
    raise exception 'cannot_target_self' using errcode = '42501';
  end if;
  if p_action in ('ban', 'unban', 'remove')
     and (p_reason is null or char_length(btrim(p_reason)) < 5) then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select role, status into v_trole, v_tstatus
  from public.community_members
  where community_id = p_comm and user_id = p_user
  for update;
  if v_trole is null then
    raise exception 'not_found' using errcode = '22023';
  end if;
  if v_trole = 'owner' then
    raise exception 'owner_protected' using errcode = '42501';
  end if;
  if v_caller = 'moderator'
     and (v_trole <> 'member' or p_action in ('make_moderator', 'remove_moderator')) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  if p_action = 'ban' then
    update public.community_members
    set status = 'banned', role = 'member'
    where community_id = p_comm and user_id = p_user;
  elsif p_action = 'unban' then
    if v_tstatus <> 'banned' then
      raise exception 'invalid_state' using errcode = '22023';
    end if;
    delete from public.community_members
    where community_id = p_comm and user_id = p_user;
  elsif p_action = 'remove' then
    delete from public.community_members
    where community_id = p_comm and user_id = p_user;
  elsif p_action = 'make_moderator' then
    if v_tstatus <> 'active' then
      raise exception 'invalid_state' using errcode = '22023';
    end if;
    update public.community_members set role = 'moderator'
    where community_id = p_comm and user_id = p_user;
  else
    update public.community_members set role = 'member'
    where community_id = p_comm and user_id = p_user;
  end if;

  insert into public.community_mod_actions (community_id, actor_id, action, target_user_id, reason)
  values (p_comm, v_uid, p_action, p_user, nullif(btrim(coalesce(p_reason, '')), ''));
end;
$function$;

create or replace function public.community_set_post_state(
  p_post uuid,
  p_hide boolean,
  p_reason text
)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_comm uuid;
  v_author uuid;
  v_status text;
  v_scope text;
  v_caller text;
  v_author_role text;
begin
  if v_uid is null or not public.account_can_post() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select community_id, author_id, status::text, hidden_scope
  into v_comm, v_author, v_status, v_scope
  from public.posts where id = p_post for update;
  if v_comm is null then
    raise exception 'not_found' using errcode = '22023';
  end if;

  v_caller := coalesce((select public.my_community_role(v_comm)), '');
  if v_caller not in ('owner', 'moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select role into v_author_role
  from public.community_members
  where community_id = v_comm and user_id = v_author;
  if v_caller = 'moderator' and v_author_role in ('owner', 'moderator') then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  if p_hide then
    if v_status <> 'visible' then
      raise exception 'invalid_state' using errcode = '22023';
    end if;
    perform set_config('app.hide_scope', 'community', true);
    update public.posts set status = 'hidden' where id = p_post;
    perform set_config('app.hide_scope', '', true);
  else
    if v_status <> 'hidden' or v_scope is distinct from 'community' then
      raise exception 'not_restorable' using errcode = '42501';
    end if;
    update public.posts set status = 'visible' where id = p_post;
  end if;

  insert into public.community_mod_actions (
    community_id, actor_id, action, target_user_id, target_post_id, reason
  ) values (
    v_comm, v_uid,
    case when p_hide then 'hide_post' else 'restore_post' end,
    v_author, p_post, btrim(p_reason)
  );
end;
$function$;

create or replace function public.community_banned_list(p_comm uuid)
returns table (user_id uuid, username text, display_name text, joined_at timestamp with time zone)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not public.account_can_post()
     or coalesce((select public.my_community_role(p_comm)), '') not in ('owner', 'moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select m.user_id, p.username, p.display_name, m.joined_at
  from public.community_members m
  join public.profiles p on p.id = m.user_id
  where m.community_id = p_comm
    and m.status = 'banned'
  order by m.joined_at desc
  limit 200;
end;
$function$;

revoke all on function
  public.community_posts(uuid, timestamp with time zone, uuid, integer),
  public.like_post(uuid),
  public.add_comment(uuid, text),
  public.repost_post(uuid),
  public.submit_report(text, uuid, text, text),
  public.community_manage_update(uuid, text, text, text, uuid, text),
  public.community_set_archived(uuid, boolean),
  public.community_set_member(uuid, uuid, text, text),
  public.community_set_post_state(uuid, boolean, text),
  public.my_community_role(uuid),
  public.create_community(text, text, text, text, uuid),
  public.join_community(uuid),
  public.leave_community(uuid),
  public.community_update(uuid, text),
  public.community_banned_list(uuid),
  public.admin_set_community_state(uuid, text, text)
  from public, anon, authenticated;
grant execute on function
  public.community_posts(uuid, timestamp with time zone, uuid, integer),
  public.like_post(uuid),
  public.add_comment(uuid, text),
  public.repost_post(uuid),
  public.submit_report(text, uuid, text, text),
  public.community_manage_update(uuid, text, text, text, uuid, text),
  public.community_set_archived(uuid, boolean),
  public.community_set_member(uuid, uuid, text, text),
  public.community_set_post_state(uuid, boolean, text),
  public.my_community_role(uuid),
  public.create_community(text, text, text, text, uuid),
  public.join_community(uuid),
  public.leave_community(uuid),
  public.community_update(uuid, text),
  public.community_banned_list(uuid),
  public.admin_set_community_state(uuid, text, text)
  to authenticated;

commit;
