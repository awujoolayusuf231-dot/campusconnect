-- READ-ONLY verification after 01_post_visibility.sql and 02_ranked_feed.sql.
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'visibility'
  ) as visibility_column_exists,
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.posts'::regclass
      and conname = 'posts_community_visibility_check'
  ) as community_audience_is_constrained,
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.posts'::regclass and tgname = 'posts_set_visibility' and not tgisinternal
  ) as community_audience_trigger_exists,
  to_regprocedure('public.internal_post_visible_to(uuid,uuid)') is not null as shared_visibility_function_exists,
  to_regprocedure('public.feed_ranked_posts(double precision,timestamptz,uuid,timestamptz,integer)') is not null as ranked_feed_exists,
  to_regprocedure('public.record_post_impressions(uuid[])') is not null as impressions_rpc_exists,
  to_regprocedure('public.post_impression_stats(uuid,integer)') is not null as impression_stats_rpc_exists,
  to_regprocedure('public.post_reach(uuid,integer)') is not null as post_reach_rpc_exists,
  has_column_privilege('authenticated', 'public.posts', 'visibility', 'insert') as authenticated_can_insert_audience,
  has_column_privilege('authenticated', 'public.posts', 'visibility', 'update') as authenticated_can_update_audience;

select
  has_function_privilege(
    'authenticated',
    'public.feed_ranked_posts(double precision,timestamptz,uuid,timestamptz,integer)',
    'execute'
  ) as authenticated_can_use_ranked_feed,
  has_function_privilege(
    'anon',
    'public.feed_ranked_posts(double precision,timestamptz,uuid,timestamptz,integer)',
    'execute'
  ) as anon_cannot_use_ranked_feed,
  exists (
    select 1 from public.platform_settings
    where key = 'smart_feed_following_weight'
      and value_type = 'number'
      and is_public = false
  ) as ranking_settings_are_private;
