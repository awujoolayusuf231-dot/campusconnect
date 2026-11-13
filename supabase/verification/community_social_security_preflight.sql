-- READ-ONLY. Run before the hardening migration. No production connection is made by this file.

select version, name
from supabase_migrations.schema_migrations
order by version;

select
  c.oid::regclass as relation,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
where c.oid in (
  to_regclass('public.posts'),
  to_regclass('public.comments'),
  to_regclass('public.community_members'),
  to_regclass('public.communities'),
  to_regclass('public.post_media'),
  to_regclass('public.reposts'),
  to_regclass('storage.objects')
)
order by c.oid::regclass::text;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where (schemaname = 'public' and tablename in (
         'posts', 'comments', 'community_members', 'post_media', 'reposts'
       ))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select
  p.oid::regprocedure as function_signature,
  pg_get_functiondef(p.oid) as definition,
  p.prosecdef as security_definer,
  p.proconfig as configuration,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'like_post', 'add_comment', 'repost_post', 'community_posts',
    'community_manage_update', 'community_set_member', 'community_set_post_state',
    'community_set_archived', 'internal_post_visible_to'
  )
order by p.oid::regprocedure::text;

select
  bucket_id,
  privilege,
  has_table_privilege('anon', 'storage.objects', privilege) as anon_has_table_privilege,
  has_table_privilege('authenticated', 'storage.objects', privilege) as authenticated_has_table_privilege
from (values ('select'), ('insert'), ('update'), ('delete')) as p(privilege)
cross join (select id as bucket_id from storage.buckets
            where id in ('post-images', 'community-covers', 'profile-covers', 'avatars')) b
order by bucket_id, privilege;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('post-images', 'community-covers', 'profile-covers', 'avatars')
order by id;

select
  table_name,
  has_table_privilege('anon', format('public.%I', table_name), 'select') as anon_can_select,
  has_table_privilege('authenticated', format('public.%I', table_name), 'select') as authenticated_can_select,
  has_table_privilege('authenticated', format('public.%I', table_name), 'insert') as authenticated_can_insert,
  has_table_privilege('authenticated', format('public.%I', table_name), 'update') as authenticated_can_update,
  has_table_privilege('authenticated', format('public.%I', table_name), 'delete') as authenticated_can_delete
from (values ('posts'), ('comments'), ('community_members'), ('post_media'), ('reposts')) t(table_name)
order by table_name;
