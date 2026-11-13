-- READ-ONLY. Run after 20261111000016, 20261111145500, 20261112000017, and 20261112000018.

select
  check_name,
  ok,
  detail
from (
  select
    'posts RLS enabled'::text as check_name,
    coalesce((select relrowsecurity from pg_class where oid = 'public.posts'::regclass), false) as ok,
    'public.posts must retain RLS'::text as detail
  union all
  select 'affected baseline policies are authenticated-only',
    count(*) = 27
      and bool_and(roles = array['authenticated'::name])
      and not bool_or(roles && array['anon'::name, 'public'::name]),
    'Every reviewed permissive baseline policy must target authenticated only; anon and PUBLIC must not be assigned'
  from pg_policies
  where permissive = 'PERMISSIVE'
    and (
      (schemaname = 'public' and tablename in (
        'posts', 'comments', 'community_members', 'post_media', 'post_likes', 'reposts'
      ) and policyname in (
        'posts_select', 'posts_insert', 'posts_update_own',
        'comments_select', 'comments_update_own', 'community_members_select',
        'post_media_select', 'post_media_insert', 'post_media_delete',
        'post_likes_select', 'reposts_select'
      ))
      or (schemaname = 'storage' and tablename = 'objects' and policyname in (
        'post_images_select', 'post_images_insert_own', 'post_images_update_own',
        'post_images_delete_own_or_mod',
        'community_covers_select_visible', 'community_covers_insert_manager',
        'community_covers_update_manager', 'community_covers_delete_manager',
        'avatars_select_own', 'avatars_insert_own', 'avatars_update_own',
        'avatars_delete_own_or_mod',
        'profile_covers_select_visible_profile', 'profile_covers_insert_own',
        'profile_covers_update_own', 'profile_covers_delete_own'
      ))
    )
  union all
  select 'no affected permissive policies target anon or PUBLIC',
    not exists (
      select 1
      from pg_policies
      where permissive = 'PERMISSIVE'
        and (
          (schemaname = 'public' and tablename in (
            'posts', 'comments', 'community_members', 'post_media', 'post_likes', 'reposts'
          ))
          or (schemaname = 'storage' and tablename = 'objects')
        )
        and roles && array['anon'::name, 'public'::name]
    ),
    'No permissive policy on affected relations may grant anonymous or PUBLIC access'
  union all
  select 'caller-bound post visibility guard',
    exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'posts'
        and policyname = 'campusconnect_posts_visibility_guard'
        and permissive = 'RESTRICTIVE'
        and qual ilike '%internal_current_post_visible%')
    and has_function_privilege('authenticated', 'campusconnect_private.internal_current_post_visible(uuid)', 'execute')
    and not has_function_privilege('anon', 'campusconnect_private.internal_current_post_visible(uuid)', 'execute'),
    'Direct post reads use a caller-bound helper in the non-API private schema'
  union all
  select 'repost visibility enforces two-way blocks',
    exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'reposts'
        and policyname = 'campusconnect_reposts_read_guard'
        and permissive = 'RESTRICTIVE'
        and qual ilike '%internal_current_repost_visible%'
        and qual ilike '%internal_profile_visible%'
        and qual ilike '%internal_blocked_either%')
    and exists (select 1 from pg_proc
      where oid = 'campusconnect_private.internal_current_repost_visible(uuid)'::regprocedure
        and lower(prosrc) like '%auth.uid%'
        and lower(prosrc) like '%internal_security_post_visible_to%')
    and has_function_privilege('authenticated', 'campusconnect_private.internal_current_repost_visible(uuid)', 'execute')
    and not has_function_privilege('anon', 'campusconnect_private.internal_current_repost_visible(uuid)', 'execute'),
    'Repost rows follow original-post visibility, reposter profile visibility, and either-direction blocks'
  union all
  select 'community membership restrictive guard',
    exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'community_members'
        and policyname = 'campusconnect_membership_visibility_guard'
        and permissive = 'RESTRICTIVE'
        and qual ilike '%internal_current_community_member%'
        and qual not ilike '%internal_profile_visible%'
    ),
    'The policy must be restrictive and include same-community membership; profile visibility is enforced by a profiles RLS subquery'
  union all
  select 'community settings RPC is restricted to the active owner',
    exists (select 1 from pg_proc
      where oid = 'public.community_manage_update(uuid,text,text,text,uuid,text)'::regprocedure
        and prosecdef
        and lower(prosrc) like '%auth.uid%'
        and lower(prosrc) like '%account_can_post%'
        and lower(prosrc) like '%community_members%'
        and lower(prosrc) like '%m.user_id = v_uid%'
        and lower(prosrc) like '%status = ''active''%'
        and lower(prosrc) like '%m.role%'
        and lower(prosrc) like '%owner%'
        and lower(prosrc) not like '%moderator%'
        and lower(prosrc) not like '%has_permission%'
        and lower(prosrc) like '%for update%')
    and has_function_privilege('authenticated', 'public.community_manage_update(uuid,text,text,text,uuid,text)', 'execute')
    and not has_function_privilege('anon', 'public.community_manage_update(uuid,text,text,text,uuid,text)', 'execute')
    and exists (select 1 from pg_proc
      where oid = 'campusconnect_private.internal_current_community_owner(uuid)'::regprocedure
        and prosecdef
        and lower(prosrc) like '%auth.uid%'
        and lower(prosrc) like '%account_can_post%'
        and lower(prosrc) like '%community_members%'
        and lower(prosrc) like '%status = ''active''%'
        and lower(prosrc) like '%role = ''owner''%'
        and lower(prosrc) not like '%moderator%')
    and has_function_privilege('authenticated', 'campusconnect_private.internal_current_community_owner(uuid)', 'execute')
    and not has_function_privilege('anon', 'campusconnect_private.internal_current_community_owner(uuid)', 'execute'),
    'SECURITY DEFINER settings RPC and RLS guard restrict settings writes to the authenticated active community owner'
  union all
  select 'legacy community settings RPC revoked',
    not has_function_privilege('authenticated', 'public.community_update(uuid,text)', 'execute')
    and not has_function_privilege('anon', 'public.community_update(uuid,text)', 'execute'),
    'Legacy community_update must not provide a second settings-write path'
  union all
  select 'direct community settings UPDATE denied',
    not has_table_privilege('authenticated', 'public.communities', 'update')
    and not has_table_privilege('anon', 'public.communities', 'update')
    and not exists (select 1
      from pg_attribute a
      cross join (values ('anon'), ('authenticated')) roles(role_name)
      where a.attrelid = 'public.communities'::regclass
        and a.attnum > 0
        and not a.attisdropped
        and has_column_privilege(roles.role_name, 'public.communities', a.attname, 'update'))
    and exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'communities'
        and policyname = 'campusconnect_communities_settings_update_guard'
        and permissive = 'RESTRICTIVE'
        and cmd = 'UPDATE'
        and roles = array['authenticated'::name]
        and qual ilike '%account_can_post%'
        and qual ilike '%internal_current_community_owner%'
        and qual not ilike '%internal_current_community_manager%'
        and qual not ilike '%communities.manage%'
        and with_check ilike '%account_can_post%'
        and with_check ilike '%internal_current_community_owner%'
        and with_check not ilike '%internal_current_community_manager%'
        and with_check not ilike '%communities.manage%')
    and not exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'communities'
        and permissive = 'PERMISSIVE'
        and cmd in ('UPDATE', 'ALL')
        and roles && array['anon'::name, 'public'::name]),
    'Direct UPDATE privileges are revoked and the restrictive guard admits only the current active owner'
  union all
  select 'other SECURITY DEFINER community writers remain authorized',
    exists (select 1 from pg_proc
      where oid = 'public.community_set_archived(uuid,boolean)'::regprocedure
        and prosecdef
        and lower(prosrc) like '%auth.uid%'
        and lower(prosrc) like '%account_can_post%'
        and lower(prosrc) like '%community_members%'
        and lower(prosrc) like '%status = ''active''%'
        and lower(prosrc) like '%owner%'
        and lower(prosrc) like '%for update%')
    and exists (select 1 from pg_proc
      where oid = 'public.admin_set_community_state(uuid,text,text)'::regprocedure
        and prosecdef
        and lower(prosrc) like '%auth.uid%'
        and lower(prosrc) like '%has_permission%'
        and lower(prosrc) like '%communities.manage%')
    and exists (select 1 from pg_proc
      where oid = 'public.community_members_count_trg()'::regprocedure
        and prosecdef
        and lower(prosrc) like '%member_count%'
        and lower(prosrc) like '%count(*)%')
    and not has_function_privilege('authenticated', 'public.community_members_count_trg()', 'execute')
    and not exists (select 1 from pg_proc
      where prosecdef
        and lower(prosrc) ~ 'update[[:space:]]+(only[[:space:]]+)?(public[.])?communities([[:space:]]|$)'
        and proname not in (
          'community_manage_update', 'community_update', 'community_set_archived',
          'admin_set_community_state', 'community_members_count_trg'
        )),
    'Archive/admin state RPCs enforce their own caller checks; member_count remains trigger-maintained; no unreviewed SECURITY DEFINER UPDATE path exists'
  union all
  select 'post read restrictive guard',
    exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'posts'
        and policyname = 'campusconnect_posts_community_guard'
        and permissive = 'RESTRICTIVE'
        and qual ilike '%internal_current_community_member%'
    ),
    'Only active community members may read community posts'
  union all
  select 'community post insert guard',
    exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'posts'
        and policyname = 'campusconnect_posts_insert_community_guard'
        and permissive = 'RESTRICTIVE'
        and with_check ilike '%internal_current_community_member%'
        and with_check ilike '%account_can_post%'),
    'Community post creation requires an active member and account posting eligibility'
  union all
  select 'post update restrictive guard',
    exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'posts'
        and policyname = 'campusconnect_posts_update_community_guard'
        and permissive = 'RESTRICTIVE'
        and qual ilike '%internal_current_community_member%'
        and with_check ilike '%internal_current_community_member%'
    ),
    'Authors must still be active members of active communities to update community posts'
  union all
  select 'post media insert guard',
    exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'post_media'
        and policyname = 'campusconnect_post_media_insert_guard'
        and permissive = 'RESTRICTIVE'
        and with_check ilike '%auth.uid%'
        and with_check ilike '%posts%'),
    'An image can only be attached by its post author from their own upload folder'
  union all
  select 'comments insert authorization guard',
    exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'comments'
        and policyname = 'campusconnect_comments_insert_guard'
        and permissive = 'RESTRICTIVE'
        and with_check ilike '%account_can_post%'
        and with_check ilike '%public.posts%'),
    'Direct comment inserts must follow account eligibility and parent-post RLS'
  union all
  select 'comments parent-post guard',
    exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'comments'
        and policyname = 'campusconnect_comments_read_guard'
        and permissive = 'RESTRICTIVE'
        and qual ilike '%internal_current_post_visible%'
        and qual ilike '%internal_current_post_row_visible%')
    and exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'comments'
        and policyname = 'campusconnect_comments_update_guard'
        and permissive = 'RESTRICTIVE'
        and qual ilike '%internal_current_post_row_visible%'
        and with_check ilike '%internal_current_post_row_visible%'),
    'Comments cannot be read or edited when their parent post is not visible'
  union all
  select 'likes follow parent-post visibility',
    exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'post_likes'
        and policyname = 'campusconnect_post_likes_read_guard'
        and permissive = 'RESTRICTIVE'
        and qual ilike '%internal_current_post_visible%'
        and qual ilike '%internal_current_post_row_visible%'),
    'A user cannot read a like row after losing access to its post'
  union all
  select 'post media parent-post guard',
    exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'post_media'
        and policyname = 'campusconnect_post_media_read_guard'
        and permissive = 'RESTRICTIVE'
        and qual ilike '%internal_current_post_visible%'
        and qual ilike '%internal_current_post_row_visible%'),
    'Media metadata must follow parent-post RLS'
  union all
  select 'storage guards are authenticated-only',
    exists (select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'campusconnect_post_images_read_guard'
        and permissive = 'RESTRICTIVE'
        and roles = array['authenticated'::name])
    and exists (select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'campusconnect_community_cover_read_guard'
        and permissive = 'RESTRICTIVE'
        and roles = array['authenticated'::name]),
    'Private buckets and authenticated restrictive guards protect image and cover reads'
  union all
  select 'post image bucket is private',
    exists (select 1 from storage.buckets where id = 'post-images' and public = false),
    'Storage SELECT must still require an authorized attached post'
  union all
  select 'community cover bucket is private',
    exists (select 1 from storage.buckets where id = 'community-covers' and public = false),
    'Cover object URLs must use authenticated Storage authorization or signed URLs'
  union all
  select 'post-image restrictive guard',
    exists (select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'campusconnect_post_images_read_guard'
        and permissive = 'RESTRICTIVE'
        and qual ilike '%post_media%'
        and qual ilike '%internal_current_post_visible%'
        and qual ilike '%internal_current_post_row_visible%'
        and qual not ilike '%foldername%'),
    'No uploader-folder SELECT exception; object path must be attached to a visible post'
  union all
  select 'cover path restrictive policies',
    (select count(*) = 4 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname in (
          'campusconnect_community_cover_read_guard',
          'campusconnect_community_cover_insert_guard',
          'campusconnect_community_cover_update_guard',
          'campusconnect_community_cover_delete_guard'
        )
        and permissive = 'RESTRICTIVE'),
    'Read/insert/update/delete guards validate community id through the Storage object name'
  union all
  select 'cover writes require current active owner and posting eligibility',
    exists (select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'campusconnect_community_cover_insert_guard'
        and permissive = 'RESTRICTIVE'
        and roles = array['authenticated'::name]
        and cmd = 'INSERT'
        and with_check ilike '%account_can_post%'
        and with_check ilike '%auth.uid%'
        and with_check ilike '%foldername%'
        and with_check ilike '%c.id%'
        and with_check ilike '%c.status%'
        and with_check ilike '%internal_current_community_owner%'
        and with_check not ilike '%internal_current_community_manager%'
        and with_check not ilike '%communities.manage%')
    and exists (select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'campusconnect_community_cover_update_guard'
        and permissive = 'RESTRICTIVE'
        and roles = array['authenticated'::name]
        and cmd = 'UPDATE'
        and qual ilike '%account_can_post%'
        and qual ilike '%foldername%'
        and qual ilike '%c.id%'
        and qual ilike '%c.status%'
        and qual ilike '%internal_current_community_owner%'
        and qual not ilike '%internal_current_community_manager%'
        and qual not ilike '%communities.manage%'
        and with_check ilike '%account_can_post%'
        and with_check ilike '%foldername%'
        and with_check ilike '%c.id%'
        and with_check ilike '%c.status%'
        and with_check ilike '%internal_current_community_owner%'
        and with_check not ilike '%internal_current_community_manager%'
        and with_check not ilike '%communities.manage%')
    and exists (select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'campusconnect_community_cover_delete_guard'
        and permissive = 'RESTRICTIVE'
        and roles = array['authenticated'::name]
        and cmd = 'DELETE'
        and qual ilike '%account_can_post%'
        and qual ilike '%foldername%'
        and qual ilike '%c.id%'
        and qual ilike '%c.status%'
        and qual ilike '%internal_current_community_owner%'
        and qual not ilike '%internal_current_community_manager%'
        and qual not ilike '%communities.manage%')
    and exists (select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'campusconnect_community_cover_read_guard'
        and permissive = 'RESTRICTIVE'
        and qual ilike '%foldername%'
        and qual ilike '%c.id%'
        and qual ilike '%cover_path%'
        and qual ilike '%status%')
    and exists (select 1 from storage.buckets where id = 'community-covers' and public = false),
    'Cover writes are caller-bound to the community id in the object path; reads expose only the current attached cover in a non-disabled community'
  union all
  select 'new policy helpers executable only as intended',
    has_function_privilege('authenticated', 'campusconnect_private.internal_current_community_member(uuid)', 'execute')
    and has_function_privilege('authenticated', 'campusconnect_private.internal_current_community_manager(uuid)', 'execute')
    and has_function_privilege('authenticated', 'campusconnect_private.internal_current_community_owner(uuid)', 'execute')
    and not has_function_privilege('anon', 'campusconnect_private.internal_current_community_member(uuid)', 'execute')
    and not has_function_privilege('anon', 'campusconnect_private.internal_current_community_manager(uuid)', 'execute')
    and not has_function_privilege('anon', 'campusconnect_private.internal_current_community_owner(uuid)', 'execute')
    and has_function_privilege('authenticated', 'campusconnect_private.internal_current_post_row_visible(uuid)', 'execute')
    and not has_function_privilege('anon', 'campusconnect_private.internal_current_post_row_visible(uuid)', 'execute')
    and has_function_privilege('authenticated', 'campusconnect_private.internal_current_repost_visible(uuid)', 'execute')
    and not has_function_privilege('anon', 'campusconnect_private.internal_current_repost_visible(uuid)', 'execute')
    and not has_function_privilege('anon', 'campusconnect_private.internal_security_post_visible_to(uuid,uuid)', 'execute')
    and not has_function_privilege('authenticated', 'campusconnect_private.internal_security_post_visible_to(uuid,uuid)', 'execute')
    and to_regprocedure('public.internal_current_community_member(uuid)') is null
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
      not like '%campusconnect_private%',
    'Only caller-bound helpers are executable by authenticated policy evaluation; caller identity is not a helper argument'
  union all
  select 'security-definer interaction RPCs remain executable for authenticated',
    has_function_privilege('authenticated', 'public.like_post(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.add_comment(uuid,text)', 'execute')
    and has_function_privilege('authenticated', 'public.repost_post(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.community_posts(uuid,timestamp with time zone,uuid,integer)', 'execute')
    and has_function_privilege('authenticated', 'public.submit_report(text,uuid,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.community_manage_update(uuid,text,text,text,uuid,text)', 'execute')
    and has_function_privilege('authenticated', 'public.community_set_archived(uuid,boolean)', 'execute')
    and has_function_privilege('authenticated', 'public.community_set_member(uuid,uuid,text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.community_set_post_state(uuid,boolean,text)', 'execute')
    and has_function_privilege('authenticated', 'public.community_banned_list(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.create_community(text,text,text,text,uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.join_community(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.leave_community(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.admin_set_community_state(uuid,text,text)', 'execute')
    and not has_function_privilege('anon', 'public.like_post(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.add_comment(uuid,text)', 'execute')
    and not has_function_privilege('anon', 'public.repost_post(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.community_posts(uuid,timestamp with time zone,uuid,integer)', 'execute')
    and not has_function_privilege('anon', 'public.submit_report(text,uuid,text,text)', 'execute')
    and not has_function_privilege('anon', 'public.community_manage_update(uuid,text,text,text,uuid,text)', 'execute')
    and not has_function_privilege('anon', 'public.community_set_archived(uuid,boolean)', 'execute')
    and not has_function_privilege('anon', 'public.community_set_member(uuid,uuid,text,text)', 'execute')
    and not has_function_privilege('anon', 'public.community_set_post_state(uuid,boolean,text)', 'execute')
    and not has_function_privilege('anon', 'public.community_banned_list(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.create_community(text,text,text,text,uuid)', 'execute')
    and not has_function_privilege('anon', 'public.join_community(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.leave_community(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.admin_set_community_state(uuid,text,text)', 'execute'),
    'Application RPCs remain available to authenticated while anonymous execute is revoked'
  union all
  select 'impression recorder retains authenticated-only execution',
    to_regprocedure('public.record_post_impressions(uuid[])') is null
    or (
      has_function_privilege('authenticated', to_regprocedure('public.record_post_impressions(uuid[])'), 'execute')
      and not has_function_privilege('anon', to_regprocedure('public.record_post_impressions(uuid[])'), 'execute')
      and not has_function_privilege('authenticated', to_regprocedure('public.internal_post_visible_to(uuid,uuid)'), 'execute')
      and not has_function_privilege('anon', to_regprocedure('public.internal_post_visible_to(uuid,uuid)'), 'execute')
      and exists (select 1 from pg_proc
        where oid = to_regprocedure('public.record_post_impressions(uuid[])')
          and lower(prosrc) like '%internal_post_visible_to%')
    ),
    'Installed impression recording uses its definer-owned visibility helper without exposing that helper as an RPC'
  union all
  select 'analytics readers retain minimum-viewer threshold',
    (
      to_regprocedure('public.post_impression_stats(uuid,integer)') is null
      or (
        exists (select 1 from pg_proc
          where oid = to_regprocedure('public.post_impression_stats(uuid,integer)')
            and lower(prosrc) like '%internal_min_viewers%')
        and has_function_privilege('authenticated', to_regprocedure('public.post_impression_stats(uuid,integer)'), 'execute')
        and not has_function_privilege('anon', to_regprocedure('public.post_impression_stats(uuid,integer)'), 'execute')
      )
    )
    and (
      to_regprocedure('public.post_reach(uuid,integer)') is null
      or (
        exists (select 1 from pg_proc
          where oid = to_regprocedure('public.post_reach(uuid,integer)')
            and lower(prosrc) like '%internal_min_viewers%')
        and has_function_privilege('authenticated', to_regprocedure('public.post_reach(uuid,integer)'), 'execute')
        and not has_function_privilege('anon', to_regprocedure('public.post_reach(uuid,integer)'), 'execute')
      )
    )
    and (
      to_regprocedure('public.my_posts_impression_totals(uuid[])') is null
      or (
        exists (select 1 from pg_proc
          where oid = to_regprocedure('public.my_posts_impression_totals(uuid[])')
            and lower(prosrc) like '%internal_min_viewers%')
        and has_function_privilege('authenticated', to_regprocedure('public.my_posts_impression_totals(uuid[])'), 'execute')
        and not has_function_privilege('anon', to_regprocedure('public.my_posts_impression_totals(uuid[])'), 'execute')
      )
    ),
    'Every installed optional analytics reader keeps the existing minimum-viewer threshold and authenticated-only execute'
  union all
  select 'shared visibility uses two-way block check',
    exists (select 1 from pg_proc
      where oid = 'campusconnect_private.internal_security_post_visible_to(uuid,uuid)'::regprocedure
        and lower(prosrc) like '%internal_blocked_either%'),
    'A block in either direction must deny shared visibility'
  union all
  select 'community feed restores reposted_by_me',
    exists (select 1 from pg_proc
      where oid = 'public.community_posts(uuid,timestamp with time zone,uuid,integer)'::regprocedure
        and lower(prosrc) like '%reposts%'
        and lower(prosrc) like '%auth.uid%'),
    'community_posts must derive reposted_by_me from the caller’s repost row'
  union all
  select 'hardening migration recorded',
    exists (select 1 from supabase_migrations.schema_migrations where version = '20261111145500'),
    'Manual SQL Editor execution does not automatically record this migration version'
  union all
  select 'active-member community posts migration recorded',
    exists (select 1 from supabase_migrations.schema_migrations where version = '20261112000017'),
    'Manual SQL Editor execution does not automatically record this migration version'
  union all
  select 'community settings authorization migration recorded',
    exists (select 1 from supabase_migrations.schema_migrations where version = '20261112000018'),
    'Manual SQL Editor execution does not automatically record this migration version'
) checks
order by check_name;

select
  p.oid::regprocedure as function_signature,
  pg_get_functiondef(p.oid) as definition,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'campusconnect_private')
  and p.proname in (
    'like_post', 'add_comment', 'repost_post', 'community_posts',
    'community_manage_update', 'community_members_count_trg', 'internal_current_community_member',
    'internal_current_community_manager', 'internal_security_post_visible_to',
    'internal_current_post_visible', 'internal_current_post_row_visible',
    'internal_current_repost_visible', 'internal_post_visible_to',
    'post_impression_stats', 'post_reach', 'my_posts_impression_totals',
    'record_post_impressions', 'internal_min_viewers', 'internal_lagos_day',
    'internal_setting_int', 'community_banned_list', 'my_community_role',
    'community_update', 'admin_set_community_state', 'create_community',
    'join_community', 'leave_community', 'community_set_archived',
    'community_set_member', 'community_set_post_state', 'admin_set_community_state'
  )
order by p.oid::regprocedure::text;

select
  schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where policyname like 'campusconnect\_%' escape '\'
order by schemaname, tablename, policyname;

select
  schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in (
         'posts', 'comments', 'community_members', 'post_media', 'post_likes', 'reposts'
       ))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, permissive, policyname;

select
  c.oid::regclass as relation,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
where c.oid in (
  to_regclass('public.posts'),
  to_regclass('public.comments'),
  to_regclass('public.community_members'),
  to_regclass('public.post_media'),
  to_regclass('public.post_likes'),
  to_regclass('public.reposts'),
  to_regclass('storage.objects')
)
order by relation::text;

select
  table_name,
  has_table_privilege('anon', format('public.%I', table_name), 'select') as anon_can_select,
  has_table_privilege('authenticated', format('public.%I', table_name), 'select') as authenticated_can_select,
  has_table_privilege('authenticated', format('public.%I', table_name), 'insert') as authenticated_can_insert,
  has_table_privilege('authenticated', format('public.%I', table_name), 'update') as authenticated_can_update,
  has_table_privilege('authenticated', format('public.%I', table_name), 'delete') as authenticated_can_delete
from (values ('posts'), ('comments'), ('community_members'), ('post_media'), ('post_likes'), ('reposts')) t(table_name)
order by table_name;

select
  id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('post-images', 'community-covers', 'profile-covers', 'avatars')
order by id;
