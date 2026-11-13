-- Tests for migration A v2 (hashtags + internal_post_visible_to). Every line of the RESULTS block must start with PASS.
-- HOW TO RUN: only on a LOCAL database AFTER migration A is applied (docs/LOCAL_TESTING_GUIDE.md). Fully independent of the
-- other suites: it creates its own users/posts and the final intentional exception rolls everything back.
-- SAFETY GUARD: refuses to run if the database holds any account whose email does not end in '@t.invalid'.
-- The script ends with an intentional exception, which rolls back all test data.
-- STATUS: WRITTEN BUT NEVER EXECUTED (no Postgres in the authoring environment). The 29 extraction cases in the
-- first loop were separately verified as plain SELECT expressions on a live PostgreSQL 17 engine.
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
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'ok'; exception when others then return 'err:' || sqlerrm; end $f$;
create or replace function pg_temp.ex(p_name text, p_got text, p_want text) returns text language sql as $f$
  select case when p_got like p_want || '%' then 'PASS ' else 'FAIL ' end || p_name || ' -> ' || p_got || E'\n' $f$;
create or replace function pg_temp.eq(p_name text, p_got text, p_want text) returns text language sql as $f$
  select case when p_got is not distinct from p_want then 'PASS ' else 'FAIL ' end || p_name || ' -> ' || coalesce(p_got, 'NULL') || E'\n' $f$;
do $do$
declare
  r text := '';
  rec record;
  a uuid := '00000000-0000-0000-0000-0000000000a1'; b uuid := '00000000-0000-0000-0000-0000000000b1';
  c uuid := '00000000-0000-0000-0000-0000000000c1'; e uuid := '00000000-0000-0000-0000-0000000000e1';
  f uuid := '00000000-0000-0000-0000-0000000000f1'; s uuid := '00000000-0000-0000-0000-000000000051';
  i1 uuid; i2 uuid; comm uuid; p1 uuid; p2 uuid; p3 uuid; pc uuid; n int; v1 text; v2 text; ts timestamptz;
begin
  if exists (select 1 from auth.users where email is distinct from null and email not like '%@t.invalid') then
    raise exception 'REFUSING TO RUN: this database contains real accounts. Run only on a fresh LOCAL database (supabase db reset).';
  end if;
  insert into public.institutions (name, type) values ('Test Institution One', 'university') returning id into i1;
  insert into public.institutions (name, type) values ('Test Institution Two', 'university') returning id into i2;
  insert into auth.users (id, email, raw_user_meta_data) values
    (a,'a@t.invalid','{"username":"user_a"}'), (b,'b@t.invalid','{"username":"user_b"}'), (c,'c@t.invalid','{"username":"user_c"}'),
    (e,'e@t.invalid','{"username":"user_e"}'), (f,'f@t.invalid','{"username":"user_f"}'), (s,'s@t.invalid','{"username":"user_s"}');
  update public.profiles set visibility = 'public' where id in (a, b, s);
  update public.profiles set visibility = 'private' where id = c;
  update public.profiles set visibility = 'institution', institution_id = i1 where id = e;
  update public.profiles set institution_id = i1 where id = b;     -- b shares institution I1 with e
  update public.profiles set institution_id = i2 where id = f;     -- f is in a different institution

  -- ===== extraction: 29 cases (also verified on a live PG17 engine as plain expressions) =====
  for rec in select * from (values
   (1,  'Hi #CampusConnect and #ComputerScience', '{campusconnect,computerscience}'),
   (2,  '#Tag #TAG #tag', '{tag}'),
   (3,  'see https://x.com/#top and abc#def', '{}'),
   (4,  '#a', '{}'),
   (5,  '#123', '{}'),
   (6,  '#2fast', '{2fast}'),
   (7,  '#web_dev', '{web_dev}'),
   (8,  '#hello, #world! (#paren)', '{hello,world,paren}'),
   (9,  '#'||repeat('a',51), '{}'),
   (10, '#'||repeat('a',50), '{'||repeat('a',50)||'}'),
   (11, U&'#\1ECC\006C\00E1', U&'{\1ECD\006C\00E1}'),
   (12, U&'#\1E62\1ECDla', U&'{\1E63\1ECDla}'),
   (13, U&'#O\0323la', U&'{\1ECDla}'),
   (14, U&'#o\0323\0301k', U&'{\1ECD\0301k}'),
   (15, U&'#\0430bc', '{}'),
   (16, U&'#abc\0430', '{}'),
   (17, U&'#party\+01F389', '{party}'),
   (18, '#Chinedu-Okafor', '{chinedu}'),
   (19, 'C# and F#sharp', '{}'),
   (20, '#t01 #t02 #t03 #t04 #t05 #t06 #t07 #t08 #t09 #t10 #t11 #t12', '{t01,t02,t03,t04,t05,t06,t07,t08,t09,t10}'),
   (21, '#zeta #alpha', '{zeta,alpha}'),
   (22, null::text, '{}'),
   (23, '#tag_', '{tag_}'),
   (24, U&'x #\+01F389', '{}'),
   (25, U&'#\0301ab', '{}'),
   (26, '#_ #__ #a_', '{a_}'),
   (27, '##double #ok', '{ok}'),
   (28, U&'caf\00E9#au', '{}'),
   (29, U&'#\1ECCl\00E1m\1ECDd\00E9 and #\1ECA\1E63\1ECDl\1EE5', U&'{\1ECDl\00E1m\1ECDd\00E9,\1ECB\1E63\1ECDl\1EE5}')
  ) as v(id, body, want) loop
    r := r || pg_temp.eq('extract case ' || rec.id, public.extract_hashtags(rec.body)::text, rec.want);
  end loop;

  -- ===== normalize_hashtag (input side of search) =====
  r := r || pg_temp.eq('normalize: upper-case Yoruba with #', public.normalize_hashtag(U&'#\1ECC\006C\00C1'), U&'\1ECD\006C\00E1');
  r := r || pg_temp.eq('normalize: decomposed == composed', public.normalize_hashtag(U&'O\0323la'), U&'\1ECDla');
  r := r || pg_temp.eq('normalize: trims space and #', public.normalize_hashtag('  #Ola '), 'ola');
  r := r || pg_temp.eq('normalize: too short -> null', public.normalize_hashtag('x'), null);
  r := r || pg_temp.eq('normalize: space inside -> null', public.normalize_hashtag('a b'), null);
  r := r || pg_temp.eq('normalize: Cyrillic look-alike -> null', public.normalize_hashtag(U&'\0430bc'), null);
  r := r || pg_temp.eq('normalize: injection-ish -> null', public.normalize_hashtag($t$a'; drop table x; --$t$), null);

  -- ===== table CHECK constraint (defence in depth) =====
  r := r || pg_temp.ex('check: upper-case rejected', pg_temp.try($q$insert into public.hashtags (tag) values ('Upper')$q$), 'err:');
  r := r || pg_temp.ex('check: 1 char rejected', pg_temp.try($q$insert into public.hashtags (tag) values ('a')$q$), 'err:');
  r := r || pg_temp.ex('check: digits only rejected', pg_temp.try($q$insert into public.hashtags (tag) values ('123')$q$), 'err:');
  r := r || pg_temp.ex('check: decomposed (non-NFC) rejected', pg_temp.try(format('insert into public.hashtags (tag) values (%L)', U&'o\0323la')), 'err:');
  r := r || pg_temp.ex('check: Cyrillic rejected', pg_temp.try(format('insert into public.hashtags (tag) values (%L)', U&'\0430bc')), 'err:');
  r := r || pg_temp.eq('check: valid composed Yoruba accepted', pg_temp.try(format('insert into public.hashtags (tag) values (%L)', U&'\1ECDl\00E1')), 'ok');
  delete from public.hashtags where tag = U&'\1ECDl\00E1';

  -- ===== trigger: insert through the real client path =====
  r := r || pg_temp.ex('author posts with tags', pg_temp.act(a,'authenticated', $q$insert into public.posts (body) values ('Learning #WebDevelopment with #CampusConnect #web_dev')$q$), 'ok:1');
  select id into p1 from public.posts where author_id = a order by created_at desc, id desc limit 1;
  r := r || pg_temp.eq('3 links created', (select count(*)::text from public.post_hashtags where post_id = p1), '3');
  r := r || pg_temp.eq('all stored tags lower-case', (select count(*)::text from public.hashtags where tag <> lower(tag)), '0');

  -- ===== trigger: edit =====
  r := r || pg_temp.ex('author edits post', pg_temp.act(a,'authenticated', format($q$update public.posts set body = 'Now only #Scholarships and #CampusConnect' where id = %L$q$, p1)), 'ok:1');
  r := r || pg_temp.eq('edit replaced the tag set', (select string_agg(h.tag, ',' order by h.tag) from public.post_hashtags ph join public.hashtags h on h.id = ph.hashtag_id where ph.post_id = p1), 'campusconnect,scholarships');
  update public.posts set body = body || U&' #\1ECDl\00E1' where id = p1;        -- superuser edit also fires the trigger
  r := r || pg_temp.eq('Nigerian tag linked after edit', (select count(*)::text from public.post_hashtags ph join public.hashtags h on h.id = ph.hashtag_id where ph.post_id = p1 and h.tag = U&'\1ECDl\00E1'), '1');
  update public.posts set body = 'no tags at all' where id = p1;
  r := r || pg_temp.eq('removing all tags removes all links', (select count(*)::text from public.post_hashtags where post_id = p1), '0');
  update public.posts set body = 'Back with #Scholarships #CampusConnect' where id = p1;

  -- ===== trigger: moderation hide/restore and delete =====
  update public.posts set status = 'hidden' where id = p1;
  r := r || pg_temp.ex('hidden post is not returned', pg_temp.act(b,'authenticated', $q$select * from public.posts_by_hashtag('scholarships')$q$), 'ok:0');
  update public.posts set status = 'visible' where id = p1;
  r := r || pg_temp.ex('restored post is returned again', pg_temp.act(b,'authenticated', $q$select * from public.posts_by_hashtag('scholarships')$q$), 'ok:1');
  insert into public.posts (author_id, body) values (a, 'temp #deleteme') returning id into p2;
  r := r || pg_temp.eq('link exists before delete', (select count(*)::text from public.post_hashtags where post_id = p2), '1');
  r := r || pg_temp.ex('author deletes post via RPC', pg_temp.act(a,'authenticated', format($q$select public.delete_own_post(%L)$q$, p2)), 'ok:1');
  r := r || pg_temp.eq('links removed after delete', (select count(*)::text from public.post_hashtags where post_id = p2), '0');
  r := r || pg_temp.ex('deleted post never returned', pg_temp.act(b,'authenticated', $q$select * from public.posts_by_hashtag('deleteme')$q$), 'ok:0');

  -- ===== direct table / function access is closed =====
  r := r || pg_temp.ex('student cannot read hashtags', pg_temp.act(b,'authenticated', 'select * from public.hashtags'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot read post_hashtags', pg_temp.act(b,'authenticated', 'select * from public.post_hashtags'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot insert hashtags', pg_temp.act(b,'authenticated', $q$insert into public.hashtags (tag) values ('hack')$q$), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot read hashtags', pg_temp.act(null,'anon', 'select * from public.hashtags'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot call extract_hashtags', pg_temp.act(b,'authenticated', $q$select public.extract_hashtags('#abc')$q$), 'err:permission denied');
  r := r || pg_temp.ex('student cannot call visibility helper', pg_temp.act(b,'authenticated', format($q$select public.internal_post_visible_to(%L, %L)$q$, p1, b)), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot search', pg_temp.act(null,'anon', $q$select * from public.posts_by_hashtag('campusconnect')$q$), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot trend', pg_temp.act(null,'anon', 'select * from public.trending_hashtags()'), 'err:permission denied');

  r := r || pg_temp.ex('student cannot call sync trigger function directly', pg_temp.act(b,'authenticated', 'select public.sync_post_hashtags()'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot call normalize_hashtag', pg_temp.act(b,'authenticated', $q$select public.normalize_hashtag('abc')$q$), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot call the visibility helper', pg_temp.act(null,'anon', format($q$select public.internal_post_visible_to(%L, %L)$q$, p1, b)), 'err:permission denied');
  r := r || pg_temp.ex('student cannot update hashtags', pg_temp.act(b,'authenticated', $q$update public.hashtags set tag = 'zzz'$q$), 'err:permission denied');
  r := r || pg_temp.ex('student cannot delete post_hashtags', pg_temp.act(b,'authenticated', 'delete from public.post_hashtags'), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot autocomplete', pg_temp.act(null,'anon', $q$select * from public.search_hashtags('camp')$q$), 'err:permission denied');
  -- the result shape must stay identical to the feed's, or PostCard / the FeedPage cursor break
  r := r || pg_temp.eq('posts_by_hashtag returns exactly the same columns as feed_posts',
    pg_get_function_result('public.posts_by_hashtag(text, timestamptz, uuid, integer)'::regprocedure),
    pg_get_function_result('public.feed_posts(text, timestamptz, uuid, integer)'::regprocedure));

  -- ===== posts_by_hashtag: result shape, input handling, pagination =====
  r := r || pg_temp.ex('finds post (mixed case, with #)', pg_temp.act(b,'authenticated', $q$select * from public.posts_by_hashtag('#CampusConnect')$q$), 'ok:1');
  r := r || pg_temp.ex('FeedPost columns present (activity_at, reposter_*)', pg_temp.act(b,'authenticated', $q$select activity_at, reposter_username, reposter_name, repost_count, reposted_by_me from public.posts_by_hashtag('campusconnect')$q$), 'ok:1');
  r := r || pg_temp.eq('activity_at equals created_at (feed cursor compatibility)', pg_temp.val(b, $q$select (activity_at = created_at)::text from public.posts_by_hashtag('campusconnect') limit 1$q$), 'true');
  r := r || pg_temp.ex('malformed tag: empty, no error', pg_temp.act(b,'authenticated', $q$select * from public.posts_by_hashtag('x')$q$), 'ok:0');
  r := r || pg_temp.ex('injection-ish tag: empty, no error', pg_temp.act(b,'authenticated', $q$select * from public.posts_by_hashtag($t$a'; drop table public.posts; --$t$)$q$), 'ok:0');
  r := r || pg_temp.ex('limit is clamped, huge limit ok', pg_temp.act(b,'authenticated', $q$select * from public.posts_by_hashtag('campusconnect', null, null, 100000)$q$), 'ok:1');
  insert into public.posts (author_id, body) values (a, 'p #pagtag'), (a, 'q #pagtag'), (a, 'r #pagtag');   -- same created_at: id is the tie-breaker
  v1 := pg_temp.val(b, $q$select id::text from public.posts_by_hashtag('pagtag', null, null, 1)$q$);
  select created_at into ts from public.posts where id = v1::uuid;
  v2 := pg_temp.val(b, format($q$select id::text from public.posts_by_hashtag('pagtag', %L, %L, 1)$q$, ts, v1));
  r := r || pg_temp.eq('page 2 differs from page 1 (keyset with tied timestamps)', (v1 <> v2 and v2 <> 'null')::text, 'true');

  -- ===== Nigerian-language tags end to end =====
  r := r || pg_temp.ex('author posts a Yoruba tag', pg_temp.act(a,'authenticated', format($q$insert into public.posts (body) values (%L)$q$, U&'Ekun #\1ECCl\00E1')), 'ok:1');
  r := r || pg_temp.ex('search by upper-case Yoruba input', pg_temp.act(b,'authenticated', format($q$select * from public.posts_by_hashtag(%L)$q$, U&'#\1ECCL\00C1')), 'ok:1');
  r := r || pg_temp.ex('search by DECOMPOSED input (O + dot-below + l + a + acute) finds the composed tag', pg_temp.act(b,'authenticated', format($q$select * from public.posts_by_hashtag(%L)$q$, U&'O\0323la\0301')), 'ok:1');
  r := r || pg_temp.ex('autocomplete prefix with Yoruba letters', pg_temp.act(b,'authenticated', format($q$select * from public.search_hashtags(%L)$q$, U&'\1ECCl')), 'ok:1');

  -- ===== visibility: private, institution-only, suspended, blocked, community =====
  insert into public.posts (author_id, body) values (c, 'private person #hiddenthing');
  r := r || pg_temp.ex('private-profile author hidden from others', pg_temp.act(b,'authenticated', $q$select * from public.posts_by_hashtag('hiddenthing')$q$), 'ok:0');
  r := r || pg_temp.ex('private-profile author sees own', pg_temp.act(c,'authenticated', $q$select * from public.posts_by_hashtag('hiddenthing')$q$), 'ok:1');
  r := r || pg_temp.ex('private authors never appear in autocomplete', pg_temp.act(b,'authenticated', $q$select * from public.search_hashtags('hiddenth')$q$), 'ok:0');
  insert into public.posts (author_id, body) values (e, 'institution only #campusonly');
  r := r || pg_temp.ex('institution-only: same institution sees', pg_temp.act(b,'authenticated', $q$select * from public.posts_by_hashtag('campusonly')$q$), 'ok:1');
  r := r || pg_temp.ex('institution-only: other institution blocked', pg_temp.act(f,'authenticated', $q$select * from public.posts_by_hashtag('campusonly')$q$), 'ok:0');
  r := r || pg_temp.ex('institution-only: viewer with no institution blocked', pg_temp.act(a,'authenticated', $q$select * from public.posts_by_hashtag('campusonly')$q$), 'ok:0');
  r := r || pg_temp.ex('institution-only authors never in autocomplete', pg_temp.act(b,'authenticated', $q$select * from public.search_hashtags('campusonl')$q$), 'ok:0');
  insert into public.posts (author_id, body) values (s, 'suspended soon #suspendedtag');
  r := r || pg_temp.ex('active author visible before suspension', pg_temp.act(b,'authenticated', $q$select * from public.posts_by_hashtag('suspendedtag')$q$), 'ok:1');
  update public.account_standing set status = 'suspended' where user_id = s;
  r := r || pg_temp.ex('suspended author hidden from tag search', pg_temp.act(b,'authenticated', $q$select * from public.posts_by_hashtag('suspendedtag')$q$), 'ok:0');
  r := r || pg_temp.ex('suspended author hidden from autocomplete', pg_temp.act(b,'authenticated', $q$select * from public.search_hashtags('suspendedt')$q$), 'ok:0');
  r := r || pg_temp.ex('suspended author not trending', pg_temp.act(b,'authenticated', $q$select * from public.trending_hashtags(7, 25) where tag = 'suspendedtag'$q$), 'ok:0');
  insert into public.blocks (blocker_id, blocked_id) values (b, a);
  r := r || pg_temp.ex('author blocked by viewer is hidden', pg_temp.act(b,'authenticated', $q$select * from public.posts_by_hashtag('scholarships')$q$), 'ok:0');
  delete from public.blocks where blocker_id = b and blocked_id = a;
  insert into public.blocks (blocker_id, blocked_id) values (a, b);
  r := r || pg_temp.ex('BY DESIGN: a blocked person can still read the blocker''s public posts', pg_temp.act(b,'authenticated', $q$select * from public.posts_by_hashtag('scholarships')$q$), 'ok:1');
  delete from public.blocks where blocker_id = a and blocked_id = b;
  insert into public.communities (name, slug, category, status, created_by) values ('Test Community', 'test-community', 'other', 'active', a) returning id into comm;
  insert into public.posts (author_id, body, community_id) values (a, 'in a community #commtag', comm);
  r := r || pg_temp.ex('community posts are not in main-feed tag search', pg_temp.act(b,'authenticated', $q$select * from public.posts_by_hashtag('commtag')$q$), 'ok:0');

  -- ===== autocomplete and trending =====
  insert into public.posts (author_id, body) values (a, 'x #webxdev');
  r := r || pg_temp.ex('underscore is not a LIKE wildcard (web_ must not match webxdev)', pg_temp.act(b,'authenticated', $q$select * from public.search_hashtags('web_')$q$), 'ok:0');
  insert into public.posts (author_id, body) values (a, 'again #web_dev');
  r := r || pg_temp.ex('web_ now matches exactly one tag', pg_temp.act(b,'authenticated', $q$select * from public.search_hashtags('web_')$q$), 'ok:1');
  insert into public.posts (author_id, body) values (a, '#spam'), (a, '#spam'), (a, '#spam'), (b, '#popular'), (a, '#popular');
  r := r || pg_temp.eq('trending ranks by distinct authors first', (select tag from public.trending_hashtags(7, 10) limit 1), 'popular');

  -- ===== account deletion cascade =====
  delete from auth.users where id = c;
  r := r || pg_temp.eq('deleting an account removes its post links', (select count(*)::text from public.post_hashtags ph join public.hashtags h on h.id = ph.hashtag_id where h.tag = 'hiddenthing'), '0');

  -- ===== TRIPWIRE: update internal_post_visible_to when posts gets an audience concept =====
  r := r || pg_temp.eq('TRIPWIRE posts has no audience/visibility column (if this FAILS, update internal_post_visible_to in the same migration)',
    (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'posts' and column_name in ('audience', 'visibility', 'audience_kind')), '0');

  raise exception E'RESULTS\n%', r;   -- intentional: rolls back all test data
end $do$;
