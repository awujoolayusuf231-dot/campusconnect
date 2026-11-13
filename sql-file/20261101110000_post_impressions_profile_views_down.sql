-- ROLLBACK for 20261101110000_post_impressions_profile_views.sql (v3). NEVER AUTO-RUN. Run BEFORE rolling back migration A.
--
-- WARNING: permanently deletes all impression and profile-view counts collected since migration B was applied.
-- To keep them, export first (SQL editor, "Download CSV" on each result):
--   select * from public.post_impression_daily;   select * from public.profile_view_daily;
--
-- SETTINGS OWNERSHIP (why this is safe)
--   Migration B inserted its 7 platform_settings rows with ON CONFLICT DO NOTHING and recorded, in
--   public.analytics_setting_ownership, exactly the keys it ACTUALLY INSERTED. A row that already existed under the same
--   key before B was skipped and is not in that ledger. This script deletes ONLY ledger keys, so a pre-existing setting
--   is never deleted, even if it has the same name. If the ledger table is missing (for example someone dropped it),
--   the DELETE below fails, the transaction aborts and NOTHING is rolled back: preserving data wins over finishing.
--   Rows B created whose VALUE you later edited are still B's rows and are deleted with the feature.
--   Note: platform_settings has an append-only audit trigger, so audit-log rows written when B inserted the settings,
--   and the ones written by this delete, remain by design.
begin;
-- 1. settings first (needs the ledger)
delete from public.platform_settings
 where key in (select key from public.analytics_setting_ownership);
-- 2. functions
drop function if exists public.purge_analytics_dedupe(int, int, int);
drop function if exists public.my_profile_unique_viewers(int);
drop function if exists public.my_profile_view_stats(int);
drop function if exists public.record_profile_view(uuid);
drop function if exists public.my_posts_impression_totals(uuid[]);
drop function if exists public.post_reach(uuid, int);
drop function if exists public.post_impression_stats(uuid, int);
drop function if exists public.record_post_impressions(uuid[]);
drop function if exists public.internal_min_viewers();
drop function if exists public.internal_setting_int(text, int, int, int);
drop function if exists public.internal_lagos_day(timestamptz);
-- 3. tables (analytics data, then the ledger last)
drop table if exists public.profile_view_daily;
drop table if exists public.profile_viewer_day;
drop table if exists public.profile_view_seen;
drop table if exists public.post_impression_daily;
drop table if exists public.post_viewer_day;
drop table if exists public.post_impression_seen;
drop table if exists public.analytics_setting_ownership;
commit;
