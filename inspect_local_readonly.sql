-- READ-ONLY INSPECTION of the LOCAL CampusConnect database (migrations 0001-0013, account deletion, A, B, C).
-- It runs inside `BEGIN READ ONLY ... ROLLBACK`: PostgreSQL itself rejects any write, and every statement below is a plain SELECT.
-- It changes nothing, applies nothing, resets nothing, and prints no emails, passwords, tokens or message text (only counts, names, definitions).
-- HOW TO RUN (local container only; see docs/LOCAL_VERIFICATION_STAGE_REPORT.md):
--   docker cp supabase/tests/inspect_local_readonly.sql supabase_db_<project_id>:/tmp/inspect.sql
--   docker exec supabase_db_<project_id> psql -U postgres -d postgres -f /tmp/inspect.sql > inspect_output.txt 2>&1
-- Then send me inspect_output.txt. Expected values are in the "expected" columns; any FALSE in a "matches"/"ok" column is a finding.
begin read only;

select '##### 0. environment' as section;
select current_database() as db, current_setting('server_version') as postgres_version, current_setting('transaction_read_only') as read_only_must_be_on,
       (select datcollate from pg_database where datname = current_database()) as collation,
       (select pg_encoding_to_char(encoding) from pg_database where datname = current_database()) as encoding;

select '##### 1. migration history: all 16 expected versions applied?' as section;
with expected(version, name) as (values
  ('20261016000001','foundation_identity_rbac'), ('20261016000003','fix_signup_fallback_username'), ('20261016000004','lock_down_function_execute_privileges'),
  ('20261016000005','storage_buckets'), ('20261016000006','admin_overview_and_user_search'), ('20261016000007','guard_account_status_visibility'),
  ('20261018000008','social_core_posts_reports_moderation'), ('20261022000009','phase5_communities_notifications_messaging'),
  ('20261023000010','phase6_opportunities_and_banned_list'), ('20261024000011','admin_institution_user_counts'),
  ('20261025000012','reposts_profile_stats_connections'), ('20261028104538','account_deletion_processing'),
  ('20261031000013','google_oauth_profile_usernames'), ('20261101100000','hashtags'), ('20261101110000','post_impressions_profile_views'),
  ('20261101120000','notification_outbox'))
select e.version, e.name as expected_name, (h.version is not null) as applied, h.name as recorded_name
from expected e left join supabase_migrations.schema_migrations h on h.version = e.version order by e.version;
select 'applied versions that are NOT in the expected list (should be none)' as section;
select h.version, h.name from supabase_migrations.schema_migrations h
 where h.version not in ('20261016000001','20261016000003','20261016000004','20261016000005','20261016000006','20261016000007','20261018000008','20261022000009',
                         '20261023000010','20261024000011','20261025000012','20261028104538','20261031000013','20261101100000','20261101110000','20261101120000') order by 1;
select count(*) as total_applied_versions_must_be_16 from supabase_migrations.schema_migrations;

select '##### 2. the 15 new tables: RLS on, zero policies, no client privileges (expected: rls=true, policies=0, anon_any=false, authenticated_any=false)' as section;
select c.relname as table_name, c.relrowsecurity as rls, (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
       has_table_privilege('anon', c.oid, 'select,insert,update,delete') as anon_any, has_table_privilege('authenticated', c.oid, 'select,insert,update,delete') as authenticated_any,
       (c.relrowsecurity and not has_table_privilege('anon', c.oid, 'select,insert,update,delete') and not has_table_privilege('authenticated', c.oid, 'select,insert,update,delete')
        and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)) as matches
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname in (
  'hashtags','post_hashtags','post_impression_seen','post_viewer_day','post_impression_daily','profile_view_seen','profile_viewer_day','profile_view_daily',
  'analytics_setting_ownership','notification_type_config','notification_limits','notification_channel_prefs','push_tokens','notification_outbox','notification_delivery_log')
order by 1;
select count(*) as new_tables_found_must_be_15 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname in (
  'hashtags','post_hashtags','post_impression_seen','post_viewer_day','post_impression_daily','profile_view_seen','profile_viewer_day','profile_view_daily',
  'analytics_setting_ownership','notification_type_config','notification_limits','notification_channel_prefs','push_tokens','notification_outbox','notification_delivery_log');

select '##### 3. the 32 new functions: exist, SECURITY DEFINER, search_path set, anon never, authenticated only where intended' as section;
with expected(sig, exp_authenticated) as (values
  ('public.internal_post_visible_to(uuid,uuid)', false), ('public.extract_hashtags(text)', false), ('public.normalize_hashtag(text)', false), ('public.sync_post_hashtags()', false),
  ('public.posts_by_hashtag(text,timestamptz,uuid,integer)', true), ('public.search_hashtags(text,integer)', true), ('public.trending_hashtags(integer,integer)', true),
  ('public.internal_lagos_day(timestamptz)', false), ('public.internal_setting_int(text,integer,integer,integer)', false), ('public.internal_min_viewers()', false),
  ('public.record_post_impressions(uuid[])', true), ('public.post_impression_stats(uuid,integer)', true), ('public.post_reach(uuid,integer)', true),
  ('public.my_posts_impression_totals(uuid[])', true), ('public.record_profile_view(uuid)', true), ('public.my_profile_view_stats(integer)', true),
  ('public.my_profile_unique_viewers(integer)', true), ('public.purge_analytics_dedupe(integer,integer,integer)', false),
  ('public.internal_channel_enabled(uuid,text,text)', false), ('public.internal_channel_available(uuid,text)', false), ('public.notifications_enqueue_outbox()', false),
  ('public.get_my_notification_settings()', true), ('public.get_my_notification_channels()', true), ('public.set_my_notification_pref(text,text,boolean)', true),
  ('public.register_push_token(text,text,text)', true), ('public.revoke_push_token(text)', true), ('public.list_my_devices()', true), ('public.remove_my_device(uuid)', true),
  ('public.claim_notification_outbox(text,integer)', false), ('public.complete_notification_outbox(bigint,text,text,integer)', false),
  ('public.invalidate_push_token(text)', false), ('public.purge_notification_outbox(integer,integer)', false))
select e.sig, (p.oid is not null) as exists_, p.prosecdef as security_definer,
       coalesce((select bool_or(c like 'search_path=%') from unnest(coalesce(p.proconfig, '{}')) c), false) as search_path_set,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec, has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec, e.exp_authenticated as expected_authenticated,
       has_function_privilege('service_role', p.oid, 'execute') as service_role_exec_informational,
       (p.oid is not null and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute') = e.exp_authenticated) as matches
from expected e left join pg_proc p on p.oid = to_regprocedure(e.sig) order by e.sig;
select count(*) as new_functions_found_must_be_32 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
  'internal_post_visible_to','extract_hashtags','normalize_hashtag','sync_post_hashtags','posts_by_hashtag','search_hashtags','trending_hashtags',
  'internal_lagos_day','internal_setting_int','internal_min_viewers','record_post_impressions','post_impression_stats','post_reach','my_posts_impression_totals',
  'record_profile_view','my_profile_view_stats','my_profile_unique_viewers','purge_analytics_dedupe','internal_channel_enabled','internal_channel_available',
  'notifications_enqueue_outbox','get_my_notification_settings','get_my_notification_channels','set_my_notification_pref','register_push_token','revoke_push_token',
  'list_my_devices','remove_my_device','claim_notification_outbox','complete_notification_outbox','invalidate_push_token','purge_notification_outbox');

select '##### 4. fingerprints of the new function bodies (compare across machines or with later runs; no content is exposed beyond a hash)' as section;
select p.oid::regprocedure::text as function, md5(p.prosrc) as md5_of_source
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('internal_post_visible_to','posts_by_hashtag','record_post_impressions','record_profile_view','notifications_enqueue_outbox','claim_notification_outbox') order by 1;

select '##### 5. triggers on posts and notifications (expected: posts_sync_hashtags on posts, notifications_enqueue_outbox on notifications)' as section;
select t.tgrelid::regclass as on_table, t.tgname as trigger_name, pg_get_triggerdef(t.oid) as definition
from pg_trigger t where not t.tgisinternal and t.tgrelid in ('public.posts'::regclass, 'public.notifications'::regclass) order by 1, 2;

select '##### 6. indexes on the new tables' as section;
select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in (
  'hashtags','post_hashtags','post_impression_seen','post_viewer_day','post_impression_daily','profile_view_seen','profile_viewer_day','profile_view_daily',
  'notification_channel_prefs','push_tokens','notification_outbox','notification_delivery_log') order by 1, 2;

select '##### 7. RLS everywhere: public tables WITHOUT row level security (expected: none)' as section;
select c.relname as table_without_rls from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity order by 1;

select '##### 8. SECURITY DEFINER functions in public with NO search_path setting (expected: none)' as section;
select p.oid::regprocedure::text as function from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosecdef
   and not coalesce((select bool_or(c like 'search_path=%') from unnest(coalesce(p.proconfig, '{}')) c), false) order by 1;

select '##### 9. public functions the ANON role can execute (expected: only is_username_available, plus nothing from A, B, C)' as section;
select p.oid::regprocedure::text as function from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute') order by 1;

select '##### 10. the policies that decide who can read posts, profiles and related content (full text, for review)' as section;
select tablename, policyname, cmd, roles::text, qual as using_expression, with_check from pg_policies
 where schemaname = 'public' and tablename in ('posts','profiles','comments','post_media','post_likes','reposts','follows','blocks','communities','community_members','notifications','reports')
 order by tablename, policyname;

select '##### 11. storage policies for the post-images / avatars buckets, and the buckets themselves' as section;
select policyname, cmd, roles::text, qual as using_expression, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;
select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;

select '##### 12. realtime publication (which tables are broadcast; new tables must NOT appear)' as section;
select pubname, schemaname, tablename from pg_publication_tables order by 1, 2, 3;

select '##### 13. settings rows created by migration B and the ownership ledger' as section;
select s.key, s.value_type, s.is_public from public.platform_settings s where s.key in (select key from public.analytics_setting_ownership) order by 1;
select count(*) as ledger_rows_must_be_7_on_a_fresh_database from public.analytics_setting_ownership;

select '##### 14. row counts only (no content is printed)' as section;
select (select count(*) from auth.users) as auth_users, (select count(*) from public.profiles) as profiles, (select count(*) from public.posts) as posts,
       (select count(*) from public.institutions) as institutions, (select count(*) from public.notifications) as notifications,
       (select count(*) from public.hashtags) as hashtags, (select count(*) from public.notification_outbox) as outbox_rows;

rollback;