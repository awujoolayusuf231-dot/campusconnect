-- READ-ONLY. Run in Supabase SQL Editor before applying any manual feed SQL.
-- This reports repository prerequisites only; it does not change the database.
select
  to_regclass('public.posts') is not null as posts_table_exists,
  to_regclass('public.platform_settings') is not null as platform_settings_exists,
  to_regprocedure('public.posts_by_hashtag(text,timestamptz,uuid,integer)') is not null as hashtag_migration_a_present,
  to_regprocedure('public.record_post_impressions(uuid[])') is not null as impressions_migration_b_present,
  to_regprocedure('public.post_impression_stats(uuid,integer)') is not null as impression_stats_present,
  to_regprocedure('public.post_reach(uuid,integer)') is not null as post_reach_present,
  to_regprocedure('public.my_posts_impression_totals(uuid[])') is not null as impression_totals_present,
  to_regprocedure('public.internal_post_visible_to(uuid,uuid)') is not null as shared_visibility_helper_present,
  to_regprocedure('campusconnect_private.internal_security_post_visible_to(uuid,uuid)') is not null as hardened_visibility_helper_present,
  to_regprocedure('campusconnect_private.internal_current_post_visible(uuid)') is not null as current_post_rls_helper_present,
  to_regprocedure('public.feed_timeline(text,timestamptz,text,uuid,integer)') is not null as existing_timeline_present,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'visibility'
  ) as post_visibility_already_present,
  to_regprocedure('public.feed_ranked_posts(double precision,timestamptz,uuid,timestamptz,integer)') is not null as ranked_feed_already_present;
