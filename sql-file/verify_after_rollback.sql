-- Run AFTER: seed_preexisting.sql -> apply migration B -> apply B's rollback. Every row must say true.
select 'pre-existing setting still present with its own value and description' as check_name,
       exists (select 1 from public.platform_settings where key = 'impression_window_minutes'
                 and value = '45'::jsonb and description = 'PRE-EXISTING (must survive rollback)') as ok
union all
select 'the 6 settings B created were removed',
       not exists (select 1 from public.platform_settings where key in (
         'impression_batch_max','impression_rate_per_minute','impression_daily_cap_per_viewer',
         'profile_view_rate_per_hour','analytics_dedupe_retention_days','analytics_min_unique_viewers'))
union all
select 'ownership ledger dropped', to_regclass('public.analytics_setting_ownership') is null
union all
select 'B functions dropped', to_regprocedure('public.record_post_impressions(uuid[])') is null
                           and to_regprocedure('public.purge_analytics_dedupe(integer,integer,integer)') is null
union all
select 'B tables dropped', to_regclass('public.post_impression_daily') is null and to_regclass('public.profile_view_daily') is null
union all
select 'migration A untouched', to_regprocedure('public.posts_by_hashtag(text,timestamptz,uuid,integer)') is not null
                            and to_regclass('public.hashtags') is not null
union all
select 'other platform settings untouched', (select count(*) from public.platform_settings where key in ('platform_name','registration_open','deletion_grace_days')) = 3;
