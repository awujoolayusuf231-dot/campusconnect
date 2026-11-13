-- READ-ONLY. Run AFTER attempting A's rollback while B is applied (it must have been REFUSED). Every row must be true (t): migration A is fully intact.
select 'table hashtags exists' as check_name, (to_regclass('public.hashtags') is not null) as ok
union all select 'table post_hashtags exists', (to_regclass('public.post_hashtags') is not null)
union all select 'trigger posts_sync_hashtags exists on posts', exists (select 1 from pg_trigger t where t.tgname = 'posts_sync_hashtags' and t.tgrelid = 'public.posts'::regclass and not t.tgisinternal)
union all select 'internal_post_visible_to exists', (to_regprocedure('public.internal_post_visible_to(uuid,uuid)') is not null)
union all select 'extract_hashtags exists', (to_regprocedure('public.extract_hashtags(text)') is not null)
union all select 'normalize_hashtag exists', (to_regprocedure('public.normalize_hashtag(text)') is not null)
union all select 'sync_post_hashtags exists', (to_regprocedure('public.sync_post_hashtags()') is not null)
union all select 'posts_by_hashtag exists', (to_regprocedure('public.posts_by_hashtag(text,timestamptz,uuid,integer)') is not null)
union all select 'search_hashtags exists', (to_regprocedure('public.search_hashtags(text,integer)') is not null)
union all select 'trending_hashtags exists', (to_regprocedure('public.trending_hashtags(integer,integer)') is not null)
union all select 'migration B is still applied (the reason for the refusal)', (to_regprocedure('public.record_post_impressions(uuid[])') is not null);
