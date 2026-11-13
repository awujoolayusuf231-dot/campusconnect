-- Run right AFTER a pgbench run. Every row must say true.
-- one_viewer.pgbench: run verify within 60 seconds so the per-minute window still applies (check 2).
-- To repeat a run on clean counters: run cleanup.sql then setup.sql (dedupe windows last 30 minutes).
with consts as (select public.internal_lagos_day(now()) as today),
     cp as (select p.id from public.posts p join public.profiles pr on pr.id = p.author_id where pr.username like 'conc\_a%')
select '1. no unexpected errors (deadlock detected, etc.); only rate_limited is allowed' as check_name,
       not exists (select 1 from public.conc_test_errors where msg <> 'rate_limited') as ok
union all
select '2. viewer conc_v1: rows added in the last minute <= 120 (exact per-minute limit)',
       (select count(*) from public.post_impression_seen
         where viewer_id = '00000000-0000-0000-0000-c0b100000001' and first_seen_at > now() - interval '1 minute') <= 120
union all
select '3. daily impressions == dedupe-ledger rows today (no lost or double counts)',
       (select coalesce(sum(d.impressions), 0) from public.post_impression_daily d, consts c where d.post_id in (select id from cp) and d.day = c.today)
     = (select count(*) from public.post_impression_seen s, consts c where s.post_id in (select id from cp) and s.day = c.today)
union all
select '4. daily unique_viewers == viewer-day ledger rows today',
       (select coalesce(sum(d.unique_viewers), 0) from public.post_impression_daily d, consts c where d.post_id in (select id from cp) and d.day = c.today)
     = (select count(*) from public.post_viewer_day s, consts c where s.post_id in (select id from cp) and s.day = c.today)
union all
select '5. unique_viewers <= impressions on every daily row',
       not exists (select 1 from public.post_impression_daily where unique_viewers > impressions)
union all
select '6. the test touched only concurrency-test posts (no analytics rows for any other post)',
       not exists (select 1 from public.post_impression_daily d where d.post_id not in (select id from cp))
union all
select '7. no viewer has two counted rows for the same (post, window)',
       not exists (select 1 from public.post_impression_seen group by viewer_id, post_id, window_start having count(*) > 1);

-- informational (not pass/fail):
select count(*) filter (where msg = 'rate_limited') as rate_limited_calls, count(*) filter (where msg <> 'rate_limited') as unexpected_errors,
       (select count(*) from public.post_impression_seen where viewer_id = '00000000-0000-0000-0000-c0b100000001') as conc_v1_rows
from public.conc_test_errors;
