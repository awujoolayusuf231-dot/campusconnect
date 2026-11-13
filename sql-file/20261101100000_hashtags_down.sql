-- ROLLBACK for 20261101100000_hashtags.sql (v2). NEVER AUTO-RUN. Review, then run by hand only if you decide to undo migration A.
-- ORDER: if migration B is applied, run B's rollback FIRST (B depends on internal_post_visible_to, which this file drops).
-- Effect: removes the trigger, the 7 functions and the 2 new tables. Existing posts are NOT touched.
-- Data lost: only derived data (hashtags, post_hashtags); it can be rebuilt by re-applying migration A's backfill.
-- Do NOT run this if later migrations (ranked feed, etc.) already depend on post_hashtags or internal_post_visible_to.
begin;
drop trigger if exists posts_sync_hashtags on public.posts;
drop function if exists public.trending_hashtags(int, int);
drop function if exists public.search_hashtags(text, int);
drop function if exists public.posts_by_hashtag(text, timestamptz, uuid, int);
drop function if exists public.sync_post_hashtags();
drop function if exists public.normalize_hashtag(text);
drop function if exists public.extract_hashtags(text);
drop table if exists public.post_hashtags;
drop table if exists public.hashtags;
drop function if exists public.internal_post_visible_to(uuid, uuid);
commit;
