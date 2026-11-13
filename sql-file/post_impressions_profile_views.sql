-- Tests for migration B (v3): post impressions + profile views.
-- REQUIRES migrations A and B applied, on a LOCAL database only. Run AFTER hashtags.sql if you like, but it is fully
-- independent: it creates its own users/posts with fixed ids, and the final intentional exception rolls everything back.
-- Every line of the RESULTS block must start with PASS.
-- SAFETY GUARD: the script refuses to run if the database contains any account whose email does not end in
-- '@t.invalid' (a real database such as production). A fresh local `supabase db reset` database passes.
-- STATUS: WRITTEN BUT NEVER EXECUTED (the authoring environment has no Postgres/Docker).
-- Concurrency is not covered here (one session cannot race itself): see supabase/tests/concurrency/.
--
-- PRIVACY RULE UNDER TEST: no figure derived from fewer than 3 distinct viewers is ever returned (exact counts AND
-- unique-viewer counts hidden); totals are sums of qualifying daily cells only; the threshold cannot be set below 3.
-- Internal counters are inspected directly (as the database owner) to prove counting is exact; what an AUTHOR can see is
-- tested only through the RPCs.
create or replace function pg_temp.act(p_uid uuid, p_role text, p_sql text) returns text language plpgsql as $f$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; get diagnostics n = row_count;
  exception when others then reset role; return 'err:' || sqlerrm; end;
  reset role; return 'ok:' || n;
end $f$;
create or replace function pg_temp.val(p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin execute p_sql into v; exception when others then reset role; return 'err:' || sqlerrm; end;
  reset role; return coalesce(v, 'null');
end $f$;
create or replace function pg_temp.ex(p_name text, p_got text, p_want text) returns text language sql as $f$
  select case when p_got like p_want || '%' then 'PASS ' else 'FAIL ' end || p_name || ' -> ' || p_got || E'\n' $f$;
create or replace function pg_temp.eq(p_name text, p_got text, p_want text) returns text language sql as $f$
  select case when p_got is not distinct from p_want then 'PASS ' else 'FAIL ' end || p_name || ' -> ' || coalesce(p_got, 'NULL') || E'\n' $f$;
create or replace function pg_temp.imp(p_uid uuid, p_ids uuid[]) returns text language sql as $f$
  select pg_temp.act(p_uid, 'authenticated', format('select public.record_post_impressions(%L::uuid[])', p_ids)) $f$;
create or replace function pg_temp.pv(p_uid uuid, p_target uuid) returns text language sql as $f$
  select pg_temp.act(p_uid, 'authenticated', format('select public.record_profile_view(%L)', p_target)) $f$;
create or replace function pg_temp.d(p_post uuid) returns text language sql as $f$      -- raw daily row today: "impressions/unique" or "none"
  select coalesce((select impressions || '/' || unique_viewers from public.post_impression_daily
                    where post_id = p_post and day = public.internal_lagos_day(now())), 'none') $f$;
create or replace function pg_temp.pd(p_profile uuid) returns text language sql as $f$  -- raw profile row today
  select coalesce((select views || '/' || unique_viewers from public.profile_view_daily
                    where profile_id = p_profile and day = public.internal_lagos_day(now())), 'none') $f$;
-- what an AUTHOR sees through the RPCs
create or replace function pg_temp.stats_rows(p_uid uuid, p_post uuid, p_days int default 28) returns text language sql as $f$
  select pg_temp.act(p_uid, 'authenticated', format('select * from public.post_impression_stats(%L, %s)', p_post, p_days)) $f$;
create or replace function pg_temp.stats_first(p_uid uuid, p_post uuid, p_col text) returns text language sql as $f$
  select pg_temp.val(p_uid, format('select %I::text from public.post_impression_stats(%L, 28) order by day desc limit 1', p_col, p_post)) $f$;
create or replace function pg_temp.reach(p_uid uuid, p_post uuid) returns text language sql as $f$
  select pg_temp.val(p_uid, format($q$select coalesce(public.post_reach(%L, 28)::text, 'hidden')$q$, p_post)) $f$;
create or replace function pg_temp.totals_rows(p_uid uuid, p_ids uuid[]) returns text language sql as $f$
  select pg_temp.act(p_uid, 'authenticated', format('select * from public.my_posts_impression_totals(%L::uuid[])', p_ids)) $f$;
create or replace function pg_temp.totals_first(p_uid uuid, p_post uuid, p_col text) returns text language sql as $f$
  select pg_temp.val(p_uid, format('select %I::text from public.my_posts_impression_totals(array[%L]::uuid[]) limit 1', p_col, p_post)) $f$;
create or replace function pg_temp.prof_rows(p_uid uuid) returns text language sql as $f$
  select pg_temp.act(p_uid, 'authenticated', 'select * from public.my_profile_view_stats(28)') $f$;
create or replace function pg_temp.prof_first(p_uid uuid, p_col text) returns text language sql as $f$
  select pg_temp.val(p_uid, format('select %I::text from public.my_profile_view_stats(28) order by day desc limit 1', p_col)) $f$;
create or replace function pg_temp.prof_unique(p_uid uuid) returns text language sql as $f$
  select pg_temp.val(p_uid, $q$select coalesce(public.my_profile_unique_viewers(28)::text, 'hidden')$q$) $f$;

do $do$
declare
  r text := '';
  a uuid := '00000000-0000-0000-0000-0000000000a1'; b uuid := '00000000-0000-0000-0000-0000000000b1';
  c uuid := '00000000-0000-0000-0000-0000000000c1'; d uuid := '00000000-0000-0000-0000-0000000000d1';
  e uuid := '00000000-0000-0000-0000-0000000000e1'; f uuid := '00000000-0000-0000-0000-0000000000f1';
  g uuid := '00000000-0000-0000-0000-000000000071'; s uuid := '00000000-0000-0000-0000-000000000051';
  v uuid := '00000000-0000-0000-0000-000000000061';
  i1 uuid; i2 uuid; cm_a uuid; cm_d uuid; cm_r uuid;
  p1 uuid; pb uuid; pd uuid; pe uuid; ps uuid; phid uuid; pdel uuid; pab uuid; pba uuid; pca uuid; pcd uuid; pcr uuid;
  p_two uuid; p_hist uuid;
  n int; today date := public.internal_lagos_day(now()); res jsonb; i int;
begin
  if exists (select 1 from auth.users where email is distinct from null and email not like '%@t.invalid') then
    raise exception 'REFUSING TO RUN: this database contains real accounts. Run only on a fresh LOCAL database (supabase db reset).';
  end if;

  insert into public.institutions (name, type) values ('Test Institution One', 'university') returning id into i1;
  insert into public.institutions (name, type) values ('Test Institution Two', 'university') returning id into i2;
  insert into auth.users (id, email, raw_user_meta_data) values
    (a,'a@t.invalid','{"username":"user_a"}'), (b,'b@t.invalid','{"username":"user_b"}'), (c,'c@t.invalid','{"username":"user_c"}'),
    (d,'d@t.invalid','{"username":"user_d"}'), (e,'e@t.invalid','{"username":"user_e"}'), (f,'f@t.invalid','{"username":"user_f"}'),
    (g,'g@t.invalid','{"username":"user_g"}'), (s,'s@t.invalid','{"username":"user_s"}'), (v,'v@t.invalid','{"username":"user_v"}');
  update public.profiles set visibility = 'public' where id in (a, b, c, f, g, s, v);
  update public.profiles set visibility = 'private' where id = d;
  update public.profiles set visibility = 'institution', institution_id = i1 where id = e;
  update public.profiles set institution_id = i1 where id in (a, b);
  update public.profiles set institution_id = i2 where id = f;

  -- author a posts 11 times (limit is 20 per hour per author)
  insert into public.posts (author_id, body) values (a, 'p1 public post by a') returning id into p1;
  insert into public.posts (author_id, body) values (b, 'post by b') returning id into pb;
  insert into public.posts (author_id, body) values (d, 'private author') returning id into pd;
  insert into public.posts (author_id, body) values (e, 'institution-only author') returning id into pe;
  insert into public.posts (author_id, body) values (s, 'author to be suspended') returning id into ps;
  insert into public.posts (author_id, body, status) values (a, 'hidden by moderation', 'hidden') returning id into phid;
  insert into public.posts (author_id, body, status) values (a, 'deleted', 'deleted') returning id into pdel;
  insert into public.posts (author_id, body) values (a, 'case: viewer blocks author') returning id into pba;
  insert into public.posts (author_id, body) values (a, 'case: author blocks viewer') returning id into pab;
  insert into public.posts (author_id, body) values (a, 'p_two: exactly two viewers') returning id into p_two;
  insert into public.posts (author_id, body) values (a, 'p_hist: seeded history') returning id into p_hist;
  insert into public.communities (name, slug, category, status, created_by) values ('Active Comm', 'active-comm', 'other', 'active', a) returning id into cm_a;
  insert into public.communities (name, slug, category, status, created_by) values ('Disabled Comm', 'disabled-comm', 'other', 'disabled', a) returning id into cm_d;
  insert into public.communities (name, slug, category, status, created_by) values ('Archived Comm', 'archived-comm', 'other', 'archived', a) returning id into cm_r;
  insert into public.community_members (community_id, user_id, role, status) values
    (cm_a, a, 'owner', 'active'), (cm_a, b, 'member', 'active'),
    (cm_d, a, 'owner', 'active'), (cm_d, b, 'member', 'active'),
    (cm_r, a, 'owner', 'active'), (cm_r, b, 'member', 'active');
  insert into public.posts (author_id, body, community_id) values (a, 'in active community', cm_a) returning id into pca;
  insert into public.posts (author_id, body, community_id) values (a, 'in disabled community', cm_d) returning id into pcd;
  insert into public.posts (author_id, body, community_id) values (a, 'in archived community', cm_r) returning id into pcr;

  -- ===== S1. closed to clients; every analytics function denied to anon =====
  r := r || pg_temp.ex('student cannot read post_impression_daily', pg_temp.act(b,'authenticated','select * from public.post_impression_daily'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot read post_impression_seen', pg_temp.act(b,'authenticated','select * from public.post_impression_seen'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot read post_viewer_day', pg_temp.act(b,'authenticated','select * from public.post_viewer_day'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot read profile_view_seen', pg_temp.act(b,'authenticated','select * from public.profile_view_seen'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot read profile_viewer_day', pg_temp.act(b,'authenticated','select * from public.profile_viewer_day'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot read profile_view_daily', pg_temp.act(a,'authenticated','select * from public.profile_view_daily'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot read the settings-ownership ledger', pg_temp.act(a,'authenticated','select * from public.analytics_setting_ownership'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot insert daily counts', pg_temp.act(b,'authenticated', format($q$insert into public.post_impression_daily (post_id, day, impressions) values (%L, current_date, 999)$q$, p1)), 'err:permission denied');
  r := r || pg_temp.ex('student cannot update daily counts', pg_temp.act(a,'authenticated', $q$update public.post_impression_daily set impressions = impressions + 1000$q$), 'err:permission denied');
  r := r || pg_temp.ex('student cannot delete daily counts', pg_temp.act(a,'authenticated', $q$delete from public.post_impression_daily$q$), 'err:permission denied');
  r := r || pg_temp.ex('student cannot insert profile views', pg_temp.act(b,'authenticated', format($q$insert into public.profile_view_daily (profile_id, day, views) values (%L, current_date, 999)$q$, a)), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot record impressions', pg_temp.act(null,'anon', format($q$select public.record_post_impressions(array[%L]::uuid[])$q$, p1)), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot record profile views', pg_temp.act(null,'anon', format($q$select public.record_profile_view(%L)$q$, a)), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot read post_impression_stats', pg_temp.act(null,'anon', format($q$select * from public.post_impression_stats(%L, 7)$q$, p1)), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot read post_reach', pg_temp.act(null,'anon', format($q$select public.post_reach(%L, 7)$q$, p1)), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot read my_posts_impression_totals', pg_temp.act(null,'anon', format($q$select * from public.my_posts_impression_totals(array[%L]::uuid[])$q$, p1)), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot read my_profile_view_stats', pg_temp.act(null,'anon', 'select * from public.my_profile_view_stats(7)'), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot read my_profile_unique_viewers', pg_temp.act(null,'anon', 'select public.my_profile_unique_viewers(7)'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot call purge', pg_temp.act(a,'authenticated','select public.purge_analytics_dedupe()'), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot call purge', pg_temp.act(null,'anon','select public.purge_analytics_dedupe()'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot call settings helper', pg_temp.act(a,'authenticated', $q$select public.internal_setting_int('impression_batch_max', 1, 1, 1)$q$), 'err:permission denied');
  r := r || pg_temp.ex('student cannot call threshold helper', pg_temp.act(a,'authenticated', 'select public.internal_min_viewers()'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot call day helper', pg_temp.act(a,'authenticated', 'select public.internal_lagos_day()'), 'err:permission denied');

  -- ===== S2. settings, ownership ledger, threshold floor (fresh local database assumed) =====
  r := r || pg_temp.eq('ledger holds the 7 keys this migration inserted', (select count(*)::text from public.analytics_setting_ownership), '7');
  r := r || pg_temp.eq('every ledger key exists in platform_settings', (select count(*)::text from public.analytics_setting_ownership o left join public.platform_settings s on s.key = o.key where s.key is null), '0');
  r := r || pg_temp.eq('threshold defaults to 3', public.internal_min_viewers()::text, '3');
  update public.platform_settings set value = '1'::jsonb where key = 'analytics_min_unique_viewers';
  r := r || pg_temp.eq('threshold cannot be configured below 3 (setting 1 -> still 3)', public.internal_min_viewers()::text, '3');
  update public.platform_settings set value = '5'::jsonb where key = 'analytics_min_unique_viewers';
  r := r || pg_temp.eq('threshold can be raised (setting 5 -> 5)', public.internal_min_viewers()::text, '5');
  update public.platform_settings set value = '3'::jsonb where key = 'analytics_min_unique_viewers';

  -- ===== S3. counting rules, window dedupe, unique viewers (raw counters, owner view) =====
  r := r || pg_temp.eq('b views a''s post', pg_temp.imp(b, array[p1]), 'ok:1');
  r := r || pg_temp.eq('raw daily row 1/1', pg_temp.d(p1), '1/1');
  perform pg_temp.imp(b, array[p1, p1]);
  r := r || pg_temp.eq('replay inside window adds nothing', pg_temp.d(p1), '1/1');
  perform pg_temp.imp(a, array[p1]);
  r := r || pg_temp.eq('own post never counts', pg_temp.d(p1), '1/1');
  perform pg_temp.imp(c, array[p1]);
  r := r || pg_temp.eq('second viewer: 2 impressions / 2 unique', pg_temp.d(p1), '2/2');
  update public.post_impression_seen set window_start = window_start - interval '2 hours', first_seen_at = first_seen_at - interval '2 hours' where viewer_id = b and post_id = p1;
  perform pg_temp.imp(b, array[p1]);
  r := r || pg_temp.eq('same viewer, new window: 3 impressions but still 2 unique', pg_temp.d(p1), '3/2');
  r := r || pg_temp.eq('viewer-day ledger has exactly 2 rows for p1', (select count(*)::text from public.post_viewer_day where post_id = p1), '2');
  r := r || pg_temp.eq('advisory lock taken for the viewer (serialisation in place)', (select (count(*) >= 1)::text from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()), 'true');

  -- ===== S4. PRIVACY THRESHOLD, post side: p1 has 3 impressions from only 2 viewers =====
  r := r || pg_temp.eq('P1 below threshold: series returns NO rows (no exact counts)', pg_temp.stats_rows(a, p1), 'ok:0');
  r := r || pg_temp.eq('P1 below threshold: reach hidden', pg_temp.reach(a, p1), 'hidden');
  r := r || pg_temp.eq('P1 below threshold: totals return NO row (exact total hidden)', pg_temp.totals_rows(a, array[p1]), 'ok:0');
  update public.platform_settings set value = '1'::jsonb where key = 'analytics_min_unique_viewers';
  r := r || pg_temp.eq('P1 threshold set to 1 in settings: series STILL hidden (floor 3)', pg_temp.stats_rows(a, p1), 'ok:0');
  r := r || pg_temp.eq('P1 threshold set to 1: totals STILL hidden', pg_temp.totals_rows(a, array[p1]), 'ok:0');
  r := r || pg_temp.eq('P1 threshold set to 1: reach STILL hidden', pg_temp.reach(a, p1), 'hidden');
  update public.platform_settings set value = '3'::jsonb where key = 'analytics_min_unique_viewers';
  -- a post with exactly 2 viewers
  perform pg_temp.imp(b, array[p_two]); perform pg_temp.imp(c, array[p_two]);
  r := r || pg_temp.eq('p_two raw 2/2 (two viewers)', pg_temp.d(p_two), '2/2');
  r := r || pg_temp.eq('p_two: series hidden', pg_temp.stats_rows(a, p_two), 'ok:0');
  r := r || pg_temp.eq('p_two: totals hidden', pg_temp.totals_rows(a, array[p_two]), 'ok:0');
  r := r || pg_temp.eq('p_two: reach hidden', pg_temp.reach(a, p_two), 'hidden');
  -- third distinct viewer arrives
  r := r || pg_temp.eq('f views p1 (third distinct viewer)', pg_temp.imp(f, array[p1]), 'ok:1');
  r := r || pg_temp.eq('p1 raw now 4 impressions / 3 unique', pg_temp.d(p1), '4/3');
  r := r || pg_temp.eq('P1 at threshold: series returns the day', pg_temp.stats_rows(a, p1), 'ok:1');
  r := r || pg_temp.eq('P1 at threshold: exact impressions shown', pg_temp.stats_first(a, p1, 'impressions'), '4');
  r := r || pg_temp.eq('P1 at threshold: unique viewers shown', pg_temp.stats_first(a, p1, 'unique_viewers'), '3');
  r := r || pg_temp.eq('P1 at threshold: reach = 3', pg_temp.reach(a, p1), '3');
  r := r || pg_temp.eq('P1 at threshold: totals impressions = 4', pg_temp.totals_first(a, p1, 'impressions'), '4');
  r := r || pg_temp.eq('P1 at threshold: totals days_counted = 1', pg_temp.totals_first(a, p1, 'days_counted'), '1');
  -- daily CELLS: hidden days never leak through series or totals
  insert into public.post_impression_daily (post_id, day, impressions, unique_viewers) values
    (p_hist, today - 1, 7, 2), (p_hist, today - 2, 9, 3), (p_hist, today - 3, 5, 1);
  r := r || pg_temp.eq('cells: only the qualifying day is returned (1 of 3 days)', pg_temp.stats_rows(a, p_hist), 'ok:1');
  r := r || pg_temp.eq('cells: the returned day is the 3-viewer day (9 impressions)', pg_temp.stats_first(a, p_hist, 'impressions'), '9');
  r := r || pg_temp.eq('cells: totals = sum of qualifying cells only (9, NOT 21)', pg_temp.totals_first(a, p_hist, 'impressions'), '9');
  r := r || pg_temp.eq('cells: totals days_counted = 1', pg_temp.totals_first(a, p_hist, 'days_counted'), '1');
  r := r || pg_temp.eq('cells: no ledger rows so reach is hidden', pg_temp.reach(a, p_hist), 'hidden');
  r := r || pg_temp.eq('batch totals list only posts that qualify (p1, p_hist; not p_two)', pg_temp.totals_rows(a, array[p1, p_hist, p_two]), 'ok:2');
  r := r || pg_temp.eq('window clamp: huge p_days does not error', pg_temp.stats_rows(a, p1, 100000), 'ok:1');
  r := r || pg_temp.eq('window of 1 day still honours the cell rule', pg_temp.stats_rows(a, p_hist, 1), 'ok:0');
  r := r || pg_temp.ex('totals batch limit', pg_temp.act(a,'authenticated', $q$select * from public.my_posts_impression_totals(array(select gen_random_uuid() from generate_series(1, 101)))$q$), 'err:too_many');
  -- ownership and probing
  r := r || pg_temp.ex('non-author cannot read series', pg_temp.stats_rows(b, p1), 'err:forbidden');
  r := r || pg_temp.ex('non-author cannot read reach', pg_temp.reach(b, p1), 'err:forbidden');
  r := r || pg_temp.eq('non-author totals: other people''s posts are ignored', pg_temp.totals_rows(b, array[p1]), 'ok:0');
  r := r || pg_temp.ex('nonexistent post gives the same error (no probing)', pg_temp.stats_rows(b, gen_random_uuid()), 'err:forbidden');
  insert into public.post_impression_daily (post_id, day, impressions, unique_viewers) values (pdel, today, 5, 5);
  r := r || pg_temp.ex('deleted post: author cannot read series any more', pg_temp.stats_rows(a, pdel), 'err:forbidden');
  r := r || pg_temp.ex('deleted post: author cannot read reach', pg_temp.reach(a, pdel), 'err:forbidden');
  r := r || pg_temp.eq('deleted post: excluded from totals even above threshold', pg_temp.totals_rows(a, array[pdel]), 'ok:0');
  delete from public.post_impression_daily where post_id = pdel;

  -- ===== S5. no oracle: eligible and ineligible input look identical =====
  update public.account_standing set status = 'suspended' where user_id = s;
  r := r || pg_temp.eq('void result: private author == eligible post', pg_temp.val(b, format('select public.record_post_impressions(%L::uuid[])::text', array[pd])), pg_temp.val(b, format('select public.record_post_impressions(%L::uuid[])::text', array[pca])));
  r := r || pg_temp.eq('void result: random id == eligible post', pg_temp.val(b, $q$select public.record_post_impressions(array[gen_random_uuid()])::text$q$), pg_temp.val(b, format('select public.record_post_impressions(%L::uuid[])::text', array[pca])));
  r := r || pg_temp.eq('profile-view result: private profile == public profile (both void)', pg_temp.val(b, format('select public.record_profile_view(%L)::text', d)), pg_temp.val(b, format('select public.record_profile_view(%L)::text', c)));

  -- ===== S6. audiences and visibility (mirrors posts_select + profile visibility + communities) =====
  r := r || pg_temp.eq('private-profile author: not counted', pg_temp.d(pd), 'none');
  perform pg_temp.imp(b, array[pe]);
  r := r || pg_temp.eq('institution-only: same institution counted', pg_temp.d(pe), '1/1');
  perform pg_temp.imp(f, array[pe]);
  r := r || pg_temp.eq('institution-only: other institution NOT counted', pg_temp.d(pe), '1/1');
  perform pg_temp.imp(c, array[pe]);
  r := r || pg_temp.eq('institution-only: viewer with no institution NOT counted', pg_temp.d(pe), '1/1');
  perform pg_temp.imp(b, array[ps]);
  r := r || pg_temp.eq('suspended author: not counted', pg_temp.d(ps), 'none');
  perform pg_temp.imp(b, array[phid]);
  r := r || pg_temp.eq('hidden post: not counted', pg_temp.d(phid), 'none');
  perform pg_temp.imp(b, array[pdel]);
  r := r || pg_temp.eq('deleted post: not counted', pg_temp.d(pdel), 'none');
  r := r || pg_temp.eq('active-community post counted for active member', pg_temp.d(pca), '1/1');
  r := r || pg_temp.eq('active community author can query own analytics while still a member',
    pg_temp.stats_rows(a, pca), 'ok:0');
  perform pg_temp.imp(f, array[pca]);
  r := r || pg_temp.eq('active-community post NOT counted for non-member', pg_temp.d(pca), '1/1');
  delete from public.community_members where community_id = cm_a and user_id = a;
  r := r || pg_temp.ex('community author loses analytics after membership removal',
    pg_temp.stats_rows(a, pca), 'err:forbidden');
  perform pg_temp.imp(b, array[pcd]);
  r := r || pg_temp.eq('disabled-community post NOT counted', pg_temp.d(pcd), 'none');
  perform pg_temp.imp(b, array[pcr]);
  r := r || pg_temp.eq('archived-community post NOT counted even for a former member', pg_temp.d(pcr), 'none');
  insert into public.blocks (blocker_id, blocked_id) values (b, a);
  perform pg_temp.imp(b, array[pba]);
  r := r || pg_temp.eq('author blocked by the viewer: not counted', pg_temp.d(pba), 'none');
  delete from public.blocks where blocker_id = b and blocked_id = a;
  insert into public.blocks (blocker_id, blocked_id) values (a, g);
  perform pg_temp.imp(g, array[pab]);
  r := r || pg_temp.eq('BY DESIGN: a viewer blocked BY the author can still read and is counted', pg_temp.d(pab), '1/1');
  delete from public.blocks where blocker_id = a and blocked_id = g;
  update public.account_standing set status = 'suspended' where user_id = v;
  perform pg_temp.imp(v, array[pab]);
  r := r || pg_temp.eq('suspended VIEWER is ignored', pg_temp.d(pab), '1/1');
  update public.account_standing set status = 'active' where user_id in (s, v);

  -- ===== S7. batch limit, empty batch, rate limits =====
  r := r || pg_temp.ex('batch over limit rejected', pg_temp.act(b,'authenticated', $q$select public.record_post_impressions(array(select gen_random_uuid() from generate_series(1, 101)))$q$), 'err:too_many');
  r := r || pg_temp.eq('empty batch is a no-op', pg_temp.act(b,'authenticated', $q$select public.record_post_impressions('{}'::uuid[])$q$), 'ok:1');
  -- viewer g already has rows from S6 (pab); clear them so the allowance arithmetic below starts from zero
  delete from public.post_impression_seen where viewer_id = g;
  delete from public.post_viewer_day where viewer_id = g;
  -- per-minute limit: 120 fresh rows for viewer g (filler rows sit on the deleted post, 30 days back in window terms)
  insert into public.post_impression_seen (viewer_id, post_id, window_start, day, first_seen_at)
    select g, pdel, now() - make_interval(secs => k) - interval '30 days', today, now() from generate_series(1, 120) k;
  r := r || pg_temp.ex('per-minute limit trips', pg_temp.imp(g, array[pca]), 'err:rate_limited');
  delete from public.post_impression_seen where viewer_id = g and post_id = pdel;
  -- exact allowance: 118 recent rows leave room for exactly 2 more, even in one batch of 3 eligible posts
  insert into public.post_impression_seen (viewer_id, post_id, window_start, day, first_seen_at)
    select g, pdel, now() - make_interval(secs => k) - interval '30 days', today, now() from generate_series(1, 118) k;
  perform pg_temp.imp(g, array[pca, pcr, pb]);
  r := r || pg_temp.eq('limit is exact inside one batch (3 ids, allowance 2 -> exactly 2 counted)', (select count(*)::text from public.post_impression_seen where viewer_id = g and post_id in (pca, pcr, pb)), '2');
  delete from public.post_impression_seen where viewer_id = g and post_id in (pdel, pca, pcr, pb);
  delete from public.post_viewer_day where viewer_id = g and post_id in (pca, pcr, pb);
  -- daily cap (configurable; clamped to a minimum of 10)
  update public.platform_settings set value = '10'::jsonb where key = 'impression_daily_cap_per_viewer';
  insert into public.post_impression_seen (viewer_id, post_id, window_start, day, first_seen_at)
    select g, pdel, now() - make_interval(secs => k) - interval '30 days', today, now() - interval '2 minutes' from generate_series(1, 10) k;
  r := r || pg_temp.ex('daily cap trips (setting is configurable)', pg_temp.imp(g, array[pca]), 'err:rate_limited');
  delete from public.post_impression_seen where viewer_id = g and post_id = pdel;
  update public.platform_settings set value = '3000'::jsonb where key = 'impression_daily_cap_per_viewer';

  -- ===== S8. profile views (raw counters) =====
  perform pg_temp.pv(b, a);
  r := r || pg_temp.eq('b views a: 1/1', pg_temp.pd(a), '1/1');
  perform pg_temp.pv(b, a);
  r := r || pg_temp.eq('repeat inside window not counted', pg_temp.pd(a), '1/1');
  perform pg_temp.pv(a, a);
  r := r || pg_temp.eq('own profile not counted', pg_temp.pd(a), '1/1');
  perform pg_temp.pv(b, d);
  r := r || pg_temp.eq('private profile not counted', pg_temp.pd(d), 'none');
  perform pg_temp.pv(b, e);
  r := r || pg_temp.eq('institution-only profile: same institution counted', pg_temp.pd(e), '1/1');
  perform pg_temp.pv(f, e);
  r := r || pg_temp.eq('institution-only profile: other institution NOT counted', pg_temp.pd(e), '1/1');
  update public.account_standing set status = 'suspended' where user_id in (s, v);
  perform pg_temp.pv(b, s);
  r := r || pg_temp.eq('suspended profile not counted', pg_temp.pd(s), 'none');
  perform pg_temp.pv(v, a);
  r := r || pg_temp.eq('suspended viewer ignored', pg_temp.pd(a), '1/1');
  update public.account_standing set status = 'active' where user_id in (s, v);
  insert into public.blocks (blocker_id, blocked_id) values (a, g);       -- profile owner blocked the viewer
  perform pg_temp.pv(g, a);
  r := r || pg_temp.eq('blocked by the profile owner: not counted (direction 1)', pg_temp.pd(a), '1/1');
  delete from public.blocks where blocker_id = a and blocked_id = g;
  insert into public.blocks (blocker_id, blocked_id) values (g, a);       -- viewer blocked the profile owner
  perform pg_temp.pv(g, a);
  r := r || pg_temp.eq('viewer blocked the owner: not counted (direction 2)', pg_temp.pd(a), '1/1');
  delete from public.blocks where blocker_id = g and blocked_id = a;
  perform pg_temp.pv(c, a);
  r := r || pg_temp.eq('second viewer: 2 views / 2 unique', pg_temp.pd(a), '2/2');

  -- ===== S9. PRIVACY THRESHOLD, profile side =====
  r := r || pg_temp.eq('PV below threshold: series returns NO rows', pg_temp.prof_rows(a), 'ok:0');
  r := r || pg_temp.eq('PV below threshold: unique viewers hidden', pg_temp.prof_unique(a), 'hidden');
  update public.profile_view_seen set window_start = window_start - interval '2 hours', first_seen_at = first_seen_at - interval '2 hours' where viewer_id = b and profile_id = a;
  perform pg_temp.pv(b, a);
  r := r || pg_temp.eq('same viewer, new window: 3 views / 2 unique', pg_temp.pd(a), '3/2');
  r := r || pg_temp.eq('PV 3 views but only 2 viewers: STILL hidden', pg_temp.prof_rows(a), 'ok:0');
  perform pg_temp.pv(f, a);
  r := r || pg_temp.eq('third distinct viewer: 4 views / 3 unique', pg_temp.pd(a), '4/3');
  r := r || pg_temp.eq('PV at threshold: series returns the day', pg_temp.prof_rows(a), 'ok:1');
  r := r || pg_temp.eq('PV at threshold: exact views shown', pg_temp.prof_first(a, 'views'), '4');
  r := r || pg_temp.eq('PV at threshold: unique viewers shown', pg_temp.prof_first(a, 'unique_viewers'), '3');
  r := r || pg_temp.eq('PV at threshold: unique-viewer total = 3', pg_temp.prof_unique(a), '3');
  insert into public.profile_view_daily (profile_id, day, views, unique_viewers) values (a, today - 1, 9, 2), (a, today - 2, 6, 3);
  r := r || pg_temp.eq('PV cells: hidden day (2 viewers) omitted, qualifying day included -> 2 rows', pg_temp.prof_rows(a), 'ok:2');
  r := r || pg_temp.eq('a user only ever sees their own stats (d has none)', pg_temp.prof_rows(d), 'ok:0');
  r := r || pg_temp.eq('a user only ever sees their own unique viewers', pg_temp.prof_unique(d), 'hidden');

  -- ===== S10. retention and purge =====
  insert into public.post_impression_seen (viewer_id, post_id, window_start, day) values (c, p1, now() - interval '60 days', today - 60);
  insert into public.post_viewer_day (viewer_id, post_id, day) values (c, p1, today - 60);
  insert into public.profile_view_seen (viewer_id, profile_id, window_start, day) values (c, a, now() - interval '60 days', today - 60);
  insert into public.profile_viewer_day (viewer_id, profile_id, day) values (c, a, today - 60);
  insert into public.post_impression_daily (post_id, day, impressions, unique_viewers) values (p1, today - 500, 1, 1);
  insert into public.profile_view_daily (profile_id, day, views, unique_viewers) values (a, today - 500, 1, 1);
  insert into public.post_impression_seen (viewer_id, post_id, window_start, day) values (c, p1, now() - interval '3 days', today - 3);
  res := public.purge_analytics_dedupe(100, 1, 400);     -- p_dedupe_days = 1 must be clamped up to 7
  r := r || pg_temp.eq('retention clamp: a 3-day-old row survives p_dedupe_days=1', (select count(*)::text from public.post_impression_seen where day = today - 3), '1');
  r := r || pg_temp.eq('purge removed 60-day-old post dedupe rows', (select count(*)::text from public.post_impression_seen where day = today - 60), '0');
  r := r || pg_temp.eq('purge removed 60-day-old viewer-day rows', (select count(*)::text from public.post_viewer_day where day = today - 60), '0');
  r := r || pg_temp.eq('purge removed 60-day-old profile dedupe rows', (select ((select count(*) from public.profile_view_seen where day = today - 60) + (select count(*) from public.profile_viewer_day where day = today - 60))::text), '0');
  r := r || pg_temp.eq('purge removed 500-day-old post aggregate', (select count(*)::text from public.post_impression_daily where post_id = p1 and day = today - 500), '0');
  r := r || pg_temp.eq('purge removed 500-day-old profile aggregate', (select count(*)::text from public.profile_view_daily where profile_id = a and day = today - 500), '0');
  r := r || pg_temp.eq('purge kept today''s aggregates', pg_temp.d(p1) || '|' || pg_temp.pd(a), '4/3|4/3');
  r := r || pg_temp.eq('purge kept qualifying-and-hidden recent cells (history intact)', (select count(*)::text from public.post_impression_daily where post_id = p_hist), '3');
  insert into public.post_impression_seen (viewer_id, post_id, window_start, day) values (c, pdel, now(), today);
  insert into public.post_viewer_day (viewer_id, post_id, day) values (c, pdel, today);
  insert into public.post_impression_daily (post_id, day, impressions, unique_viewers) values (pdel, today, 5, 5);
  perform public.purge_analytics_dedupe(100, null, 400);
  r := r || pg_temp.eq('deleted post: per-viewer rows and counts purged', (select ((select count(*) from public.post_impression_seen where post_id = pdel) + (select count(*) from public.post_viewer_day where post_id = pdel) + (select count(*) from public.post_impression_daily where post_id = pdel))::text), '0');
  insert into public.post_impression_seen (viewer_id, post_id, window_start, day)
    select c, p1, now() - interval '80 days' - make_interval(secs => k), today - 80 from generate_series(1, 250) k;
  res := public.purge_analytics_dedupe(100, null, 400);
  r := r || pg_temp.eq('batched purge reports more work (250 rows, batch 100)', res ->> 'more', 'true');
  i := 0;
  while (public.purge_analytics_dedupe(100, null, 400) ->> 'more')::boolean and i < 20 loop i := i + 1; end loop;
  r := r || pg_temp.eq('repeated calls drain everything', (select count(*)::text from public.post_impression_seen where day = today - 80), '0');

  -- ===== S11. cascades =====
  delete from auth.users where id = e;
  r := r || pg_temp.eq('deleting a profile removes views OF it', (select ((select count(*) from public.profile_view_daily where profile_id = e) + (select count(*) from public.profile_view_seen where profile_id = e))::text), '0');
  delete from auth.users where id = c;
  r := r || pg_temp.eq('deleting a viewer removes every per-viewer row', (select ((select count(*) from public.post_impression_seen where viewer_id = c) + (select count(*) from public.post_viewer_day where viewer_id = c) + (select count(*) from public.profile_view_seen where viewer_id = c) + (select count(*) from public.profile_viewer_day where viewer_id = c))::text), '0');
  delete from auth.users where id = a;
  r := r || pg_temp.eq('deleting an author removes post analytics', (select ((select count(*) from public.post_impression_daily where post_id = p1) + (select count(*) from public.post_impression_seen where post_id = p1) + (select count(*) from public.post_viewer_day where post_id = p1))::text), '0');
  r := r || pg_temp.eq('deleting a profile removes its own profile-view history', (select count(*)::text from public.profile_view_daily where profile_id = a), '0');

  raise exception E'RESULTS\n%', r;   -- intentional: rolls back all test data
end $do$;
