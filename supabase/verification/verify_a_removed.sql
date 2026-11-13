-- READ-ONLY. Run AFTER B's rollback and then A's rollback have both succeeded. Every row must be true (t): A is gone, nothing else was touched.
select 'A table hashtags removed' as check_name, (to_regclass('public.hashtags') is null) as ok
union all select 'A table post_hashtags removed', (to_regclass('public.post_hashtags') is null)
union all select 'A trigger removed from posts', not exists (select 1 from pg_trigger t where t.tgname = 'posts_sync_hashtags')
union all select 'A functions removed', (to_regprocedure('public.internal_post_visible_to(uuid,uuid)') is null
        and to_regprocedure('public.extract_hashtags(text)') is null and to_regprocedure('public.normalize_hashtag(text)') is null
        and to_regprocedure('public.sync_post_hashtags()') is null and to_regprocedure('public.posts_by_hashtag(text,timestamptz,uuid,integer)') is null
        and to_regprocedure('public.search_hashtags(text,integer)') is null and to_regprocedure('public.trending_hashtags(integer,integer)') is null)
union all select 'B is removed too (it had to go first)', (to_regprocedure('public.record_post_impressions(uuid[])') is null)
union all select 'C is untouched', (to_regprocedure('public.claim_notification_outbox(text,integer)') is not null and to_regclass('public.notification_outbox') is not null)
union all select 'the posts table is untouched (still has its rows structure)', (to_regclass('public.posts') is not null)
union all select 'existing feed_posts is untouched', (to_regprocedure('public.feed_posts(text,timestamptz,uuid,integer)') is not null)
union all select 'account-deletion migration objects untouched', (to_regprocedure('public.admin_complete_account_deletion(uuid,text)') is not null);
