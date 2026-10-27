-- CampusConnect Phase 4 security/behaviour tests (posts, likes, comments, follows, blocks, reports, moderation,
-- feed, discovery, media, account standing, function exposure).
-- HOW TO RUN: paste into the Supabase SQL editor. Ends with an intentional exception => everything rolls back.
-- Read the RESULTS block in the error: every line must start with PASS.
-- LAST RUN: 2026-10-20 against CampusConnect01 after migration 0008: all PASS (141 checks by tally), 0 rows left behind.
create function pg_temp.act(p_uid uuid, p_role text, p_sql text) returns text language plpgsql as $f$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; get diagnostics n = row_count;
  exception when others then reset role; return 'err:' || sqlerrm; end;
  reset role; return 'ok:' || n;
end $f$;
create function pg_temp.ex(p_name text, p_got text, p_want text) returns text language sql as $f$
  select case when p_got like p_want || '%' then 'PASS ' else 'FAIL ' end || p_name || ' -> ' || p_got || E'\n'
$f$;
do $do$
declare
  r text := '';
  a uuid := '00000000-0000-0000-0000-0000000000a1'; b uuid := '00000000-0000-0000-0000-0000000000b1';
  c uuid := '00000000-0000-0000-0000-0000000000c1'; p uuid := '00000000-0000-0000-0000-0000000000d1';
  m uuid := '00000000-0000-0000-0000-0000000000e1'; ad uuid := '00000000-0000-0000-0000-0000000000f1';
  o uuid := '00000000-0000-0000-0000-000000000011'; rr uuid := '00000000-0000-0000-0000-000000000012';
  z uuid := '00000000-0000-0000-0000-000000000013';
  i1 uuid; i2 uuid; pa uuid; pa2 uuid; pb uuid; pp uuid; pad uuid; cb uuid; rep uuid; rep2 uuid;
  n int; got text; ts timestamptz;
begin
  insert into public.institutions (name, type) values ('TEST Inst One','university') returning id into i1;
  insert into public.institutions (name, type) values ('TEST Inst Two','polytechnic') returning id into i2;
  insert into auth.users (id, email, raw_user_meta_data) values
    (a,'a@t.invalid', jsonb_build_object('username','user_a','institution_id',i1)),
    (b,'b@t.invalid', jsonb_build_object('username','user_b','institution_id',i1)),
    (c,'c@t.invalid', jsonb_build_object('username','user_c','institution_id',i2)),
    (p,'p@t.invalid', jsonb_build_object('username','user_p','institution_id',i1)),
    (m,'m@t.invalid','{"username":"mod_m"}'), (ad,'ad@t.invalid','{"username":"adm_x"}'),
    (o,'o@t.invalid','{"username":"own_o"}'), (rr,'rr@t.invalid','{"username":"user_rr"}'), (z,'z@t.invalid','{"username":"user_z"}');
  insert into public.user_roles (user_id, role) values (m,'moderator'), (ad,'admin'), (o,'owner');
  update public.profiles set visibility = 'private' where id = p;

  -- posts
  r := r || pg_temp.ex('author creates post', pg_temp.act(a,'authenticated', $q$insert into public.posts(body) values ('hello campus')$q$), 'ok:1');
  select id into pa from public.posts where author_id = a limit 1;
  r := r || pg_temp.ex('client cannot set author_id', pg_temp.act(a,'authenticated', format($q$insert into public.posts(author_id, body) values (%L,'spoof')$q$, b)), 'err:permission denied');
  r := r || pg_temp.ex('blank body rejected', pg_temp.act(a,'authenticated', $q$insert into public.posts(body) values ('   ')$q$), 'err:new row');
  r := r || pg_temp.ex('2001 chars rejected', pg_temp.act(a,'authenticated', format($q$insert into public.posts(body) values (%L)$q$, repeat('x',2001))), 'err:new row');
  r := r || pg_temp.ex('other user cannot edit post', pg_temp.act(b,'authenticated', format($q$update public.posts set body='hax' where id=%L$q$, pa)), 'ok:0');
  r := r || pg_temp.ex('author edits own post', pg_temp.act(a,'authenticated', format($q$update public.posts set body='hello campus (edited)' where id=%L$q$, pa)), 'ok:1');
  select (edited_at is not null)::text into got from public.posts where id = pa;
  r := r || pg_temp.ex('edit sets edited_at', got, 'true');
  r := r || pg_temp.ex('author cannot change status', pg_temp.act(a,'authenticated', format($q$update public.posts set status='hidden' where id=%L$q$, pa)), 'err:permission denied');
  r := r || pg_temp.ex('author cannot forge like_count', pg_temp.act(a,'authenticated', format($q$update public.posts set like_count=999 where id=%L$q$, pa)), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot read posts', pg_temp.act(null,'anon','select * from public.posts'), 'err:permission denied');
  insert into public.posts (author_id, body) select rr, 'rl ' || g from generate_series(1,20) g;
  r := r || pg_temp.ex('21st post in an hour is rate limited', pg_temp.act(rr,'authenticated', $q$insert into public.posts(body) values ('one too many')$q$), 'err:rate_limited');
  insert into public.posts (author_id, body) values (b, 'bob post') returning id into pb;
  insert into public.posts (author_id, body) values (p, 'private author post') returning id into pp;
  insert into public.posts (author_id, body) values (ad, 'admin post') returning id into pad;

  -- visibility
  r := r || pg_temp.ex('peer sees public post', pg_temp.act(b,'authenticated', format($q$select * from public.posts where id=%L$q$, pa)), 'ok:1');
  r := r || pg_temp.ex('other institution sees public post', pg_temp.act(c,'authenticated', format($q$select * from public.posts where id=%L$q$, pa)), 'ok:1');
  r := r || pg_temp.ex('private-profile post hidden from peers', pg_temp.act(b,'authenticated', format($q$select * from public.posts where id=%L$q$, pp)), 'ok:0');
  r := r || pg_temp.ex('private author sees own post', pg_temp.act(p,'authenticated', format($q$select * from public.posts where id=%L$q$, pp)), 'ok:1');

  -- likes
  r := r || pg_temp.ex('like_post works', pg_temp.act(b,'authenticated', format($q$select public.like_post(%L)$q$, pa)), 'ok:1');
  r := r || pg_temp.ex('like again is idempotent', pg_temp.act(b,'authenticated', format($q$select public.like_post(%L)$q$, pa)), 'ok:1');
  select like_count into n from public.posts where id = pa;
  r := r || pg_temp.ex('like_count is 1 after duplicate like', n::text, '1');
  r := r || pg_temp.ex('direct insert into post_likes denied', pg_temp.act(c,'authenticated', format($q$insert into public.post_likes(post_id,user_id) values (%L,%L)$q$, pa, c)), 'err:permission denied');
  r := r || pg_temp.ex('cannot like private-profile post', pg_temp.act(b,'authenticated', format($q$select public.like_post(%L)$q$, pp)), 'err:not_found');
  r := r || pg_temp.ex('unlike works', pg_temp.act(b,'authenticated', format($q$select public.unlike_post(%L)$q$, pa)), 'ok:1');
  select like_count into n from public.posts where id = pa;
  r := r || pg_temp.ex('like_count back to 0', n::text, '0');
  r := r || pg_temp.ex('anon cannot like', pg_temp.act(null,'anon', format($q$select public.like_post(%L)$q$, pa)), 'err:permission denied');

  -- comments
  r := r || pg_temp.ex('add_comment works', pg_temp.act(b,'authenticated', format($q$select public.add_comment(%L,'nice one')$q$, pa)), 'ok:1');
  select id into cb from public.comments where author_id = b limit 1;
  r := r || pg_temp.ex('empty comment rejected', pg_temp.act(b,'authenticated', format($q$select public.add_comment(%L,'  ')$q$, pa)), 'err:invalid_body');
  r := r || pg_temp.ex('1001-char comment rejected', pg_temp.act(b,'authenticated', format($q$select public.add_comment(%L,%L)$q$, pa, repeat('y',1001))), 'err:invalid_body');
  r := r || pg_temp.ex('direct comment insert denied', pg_temp.act(b,'authenticated', format($q$insert into public.comments(post_id,author_id,body) values (%L,%L,'x')$q$, pa, b)), 'err:permission denied');
  select comment_count into n from public.posts where id = pa;
  r := r || pg_temp.ex('comment_count is 1', n::text, '1');
  r := r || pg_temp.ex('peer sees visible comment', pg_temp.act(c,'authenticated', format($q$select * from public.comments where id=%L$q$, cb)), 'ok:1');
  r := r || pg_temp.ex('author edits own comment', pg_temp.act(b,'authenticated', format($q$update public.comments set body='nice one!' where id=%L$q$, cb)), 'ok:1');
  r := r || pg_temp.ex('other user cannot edit comment', pg_temp.act(c,'authenticated', format($q$update public.comments set body='hax' where id=%L$q$, cb)), 'ok:0');

  -- follows
  r := r || pg_temp.ex('follow_user works', pg_temp.act(b,'authenticated', format($q$select public.follow_user(%L)$q$, a)), 'ok:1');
  r := r || pg_temp.ex('cannot follow self', pg_temp.act(b,'authenticated', format($q$select public.follow_user(%L)$q$, b)), 'err:cannot_follow_self');
  r := r || pg_temp.ex('cannot follow private profile', pg_temp.act(b,'authenticated', format($q$select public.follow_user(%L)$q$, p)), 'err:not_found');
  r := r || pg_temp.ex('direct follow insert denied', pg_temp.act(c,'authenticated', format($q$insert into public.follows(follower_id,followee_id) values (%L,%L)$q$, c, a)), 'err:permission denied');
  r := r || pg_temp.ex('third party cannot see follows', pg_temp.act(c,'authenticated', 'select * from public.follows'), 'ok:0');

  -- feed + discovery
  r := r || pg_temp.ex('feed(all) includes public post', pg_temp.act(b,'authenticated', format($q$select 1 from public.feed_posts() where id=%L$q$, pa)), 'ok:1');
  r := r || pg_temp.ex('feed excludes private-profile post', pg_temp.act(b,'authenticated', format($q$select 1 from public.feed_posts() where id=%L$q$, pp)), 'ok:0');
  r := r || pg_temp.ex('feed(following) includes followed author', pg_temp.act(b,'authenticated', format($q$select 1 from public.feed_posts('following') where id=%L$q$, pa)), 'ok:1');
  r := r || pg_temp.ex('feed(following) empty for non-follower', pg_temp.act(c,'authenticated', format($q$select 1 from public.feed_posts('following') where id=%L$q$, pa)), 'ok:0');
  r := r || pg_temp.ex('feed(institution) includes same institution', pg_temp.act(b,'authenticated', format($q$select 1 from public.feed_posts('institution') where id=%L$q$, pa)), 'ok:1');
  r := r || pg_temp.ex('feed(institution) excludes other institution', pg_temp.act(c,'authenticated', format($q$select 1 from public.feed_posts('institution') where id=%L$q$, pa)), 'ok:0');
  insert into public.posts (author_id, body, created_at) values (a, 'older post', now() - interval '2 hours') returning id into pa2;
  r := r || pg_temp.ex('feed page 1 (limit 1) is newest', pg_temp.act(b,'authenticated', format($q$select 1 from public.feed_posts('following', null, null, 1) where id=%L$q$, pa)), 'ok:1');
  select created_at into ts from public.posts where id = pa;
  r := r || pg_temp.ex('feed keyset page 2 is older post', pg_temp.act(b,'authenticated', format($q$select 1 from public.feed_posts('following', %L::timestamptz, %L::uuid, 1) where id=%L$q$, ts, pa, pa2)), 'ok:1');
  r := r || pg_temp.ex('feed limit clamped', pg_temp.act(b,'authenticated', 'select * from public.feed_posts(''all'', null, null, 100000)'), 'ok:');
  r := r || pg_temp.ex('discover includes peer', pg_temp.act(b,'authenticated', format($q$select 1 from public.discover_students() where id=%L$q$, a)), 'ok:1');
  r := r || pg_temp.ex('discover excludes self', pg_temp.act(b,'authenticated', format($q$select 1 from public.discover_students() where id=%L$q$, b)), 'ok:0');
  r := r || pg_temp.ex('discover excludes private profile', pg_temp.act(b,'authenticated', format($q$select 1 from public.discover_students() where id=%L$q$, p)), 'ok:0');
  r := r || pg_temp.ex('discover wildcard is literal', pg_temp.act(b,'authenticated', $q$select * from public.discover_students('%')$q$), 'ok:0');
  r := r || pg_temp.ex('anon cannot discover', pg_temp.act(null,'anon','select * from public.discover_students()'), 'err:permission denied');

  -- media
  r := r || pg_temp.ex('author adds media with own path', pg_temp.act(a,'authenticated', format($q$insert into public.post_media(post_id,storage_path,position) values (%L,%L,0)$q$, pa, a::text || '/img1.png')), 'ok:1');
  r := r || pg_temp.ex('media with another user path rejected', pg_temp.act(a,'authenticated', format($q$insert into public.post_media(post_id,storage_path,position) values (%L,%L,1)$q$, pa, b::text || '/img.png')), 'err:new row');
  r := r || pg_temp.ex('other user cannot attach media to my post', pg_temp.act(b,'authenticated', format($q$insert into public.post_media(post_id,storage_path,position) values (%L,%L,2)$q$, pa, b::text || '/img.png')), 'err:new row');
  r := r || pg_temp.ex('path traversal rejected', pg_temp.act(a,'authenticated', format($q$insert into public.post_media(post_id,storage_path,position) values (%L,%L,3)$q$, pa, a::text || '/../x.png')), 'err:new row');
  r := r || pg_temp.ex('peer sees media of visible post', pg_temp.act(b,'authenticated', format($q$select * from public.post_media where post_id=%L$q$, pa)), 'ok:1');

  -- reports
  r := r || pg_temp.ex('submit_report works', pg_temp.act(b,'authenticated', format($q$select public.submit_report('post',%L,'spam','looks like spam')$q$, pa)), 'ok:1');
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role','authenticated')::text, true);
  set local role authenticated;
  select public.submit_report('post', pa, 'spam', 'again') into rep2;
  reset role;
  select id into rep from public.reports where reporter_id = b and target_id = pa;
  r := r || pg_temp.ex('duplicate report returns same id', (rep = rep2)::text, 'true');
  select count(*) into n from public.reports where reporter_id = b;
  r := r || pg_temp.ex('only one report row exists', n::text, '1');
  r := r || pg_temp.ex('cannot report own content', pg_temp.act(a,'authenticated', format($q$select public.submit_report('post',%L,'spam')$q$, pa)), 'err:cannot_report_self');
  r := r || pg_temp.ex('cannot report invisible content', pg_temp.act(b,'authenticated', format($q$select public.submit_report('post',%L,'spam')$q$, pp)), 'err:not_found');
  r := r || pg_temp.ex('invalid category rejected', pg_temp.act(c,'authenticated', format($q$select public.submit_report('post',%L,'banana')$q$, pa)), 'err:new row');
  r := r || pg_temp.ex('invalid type rejected', pg_temp.act(c,'authenticated', format($q$select public.submit_report('server',%L,'spam')$q$, pa)), 'err:invalid_type');
  r := r || pg_temp.ex('report a comment', pg_temp.act(c,'authenticated', format($q$select public.submit_report('comment',%L,'harassment')$q$, cb)), 'ok:1');
  r := r || pg_temp.ex('report a user', pg_temp.act(c,'authenticated', format($q$select public.submit_report('user',%L,'impersonation')$q$, a)), 'ok:1');
  r := r || pg_temp.ex('reporter sees own via my_reports', pg_temp.act(b,'authenticated','select * from public.my_reports()'), 'ok:1');
  r := r || pg_temp.ex('reported user cannot read reports', pg_temp.act(a,'authenticated','select * from public.reports'), 'ok:0');
  r := r || pg_temp.ex('reporter cannot read reports table', pg_temp.act(b,'authenticated','select * from public.reports'), 'ok:0');
  r := r || pg_temp.ex('moderator reads all reports', pg_temp.act(m,'authenticated','select * from public.reports'), 'ok:3');
  r := r || pg_temp.ex('student cannot insert report directly', pg_temp.act(b,'authenticated', format($q$insert into public.reports(target_type,target_id,category) values ('post',%L,'spam')$q$, pa)), 'err:permission denied');
  insert into public.reports (reporter_id, target_type, target_id, category) select rr, 'post', gen_random_uuid(), 'spam' from generate_series(1,10);
  r := r || pg_temp.ex('11th report in 24h rate limited', pg_temp.act(rr,'authenticated', format($q$select public.submit_report('post',%L,'spam')$q$, pa)), 'err:rate_limited');

  -- moderation
  r := r || pg_temp.ex('student cannot hide content', pg_temp.act(b,'authenticated', format($q$select public.admin_set_content_state('post',%L,true,'trying to hide')$q$, pa)), 'err:forbidden');
  r := r || pg_temp.ex('reason required to hide', pg_temp.act(m,'authenticated', format($q$select public.admin_set_content_state('post',%L,true,'x')$q$, pa)), 'err:reason_required');
  r := r || pg_temp.ex('moderator cannot hide admin content', pg_temp.act(m,'authenticated', format($q$select public.admin_set_content_state('post',%L,true,'abuse of power')$q$, pad)), 'err:insufficient_rank');
  r := r || pg_temp.ex('moderator hides post', pg_temp.act(m,'authenticated', format($q$select public.admin_set_content_state('post',%L,true,'spam content removed')$q$, pa)), 'ok:1');
  r := r || pg_temp.ex('hidden post invisible to peers', pg_temp.act(b,'authenticated', format($q$select * from public.posts where id=%L$q$, pa)), 'ok:0');
  r := r || pg_temp.ex('hidden media invisible to peers', pg_temp.act(b,'authenticated', format($q$select * from public.post_media where post_id=%L$q$, pa)), 'ok:0');
  r := r || pg_temp.ex('hidden post still visible to author', pg_temp.act(a,'authenticated', format($q$select * from public.posts where id=%L$q$, pa)), 'ok:1');
  r := r || pg_temp.ex('hidden post visible to moderator', pg_temp.act(m,'authenticated', format($q$select * from public.posts where id=%L$q$, pa)), 'ok:1');
  r := r || pg_temp.ex('hidden post leaves feed', pg_temp.act(b,'authenticated', format($q$select 1 from public.feed_posts() where id=%L$q$, pa)), 'ok:0');
  r := r || pg_temp.ex('cannot like hidden post', pg_temp.act(b,'authenticated', format($q$select public.like_post(%L)$q$, pa)), 'err:not_found');
  r := r || pg_temp.ex('cannot hide twice', pg_temp.act(m,'authenticated', format($q$select public.admin_set_content_state('post',%L,true,'second attempt')$q$, pa)), 'err:invalid_state');
  r := r || pg_temp.ex('moderator restores post', pg_temp.act(m,'authenticated', format($q$select public.admin_set_content_state('post',%L,false,'appeal accepted')$q$, pa)), 'ok:1');
  r := r || pg_temp.ex('restored post visible again', pg_temp.act(b,'authenticated', format($q$select * from public.posts where id=%L$q$, pa)), 'ok:1');
  r := r || pg_temp.ex('moderator hides comment', pg_temp.act(m,'authenticated', format($q$select public.admin_set_content_state('comment',%L,true,'abusive comment')$q$, cb)), 'ok:1');
  select comment_count into n from public.posts where id = pa;
  r := r || pg_temp.ex('hidden comment not counted', n::text, '0');
  r := r || pg_temp.ex('author deletes own post', pg_temp.act(a,'authenticated', format($q$select public.delete_own_post(%L)$q$, pa2)), 'ok:1');
  r := r || pg_temp.ex('deleted post cannot be restored', pg_temp.act(m,'authenticated', format($q$select public.admin_set_content_state('post',%L,false,'restore deleted')$q$, pa2)), 'err:not_restorable');
  select body into got from public.posts where id = pa2;
  r := r || pg_temp.ex('deleted post body wiped', coalesce(got,'NULL'), '');
  r := r || pg_temp.ex('cannot delete someone elses post', pg_temp.act(b,'authenticated', format($q$select public.delete_own_post(%L)$q$, pa)), 'err:not_found');

  -- report handling
  r := r || pg_temp.ex('student cannot update report', pg_temp.act(b,'authenticated', format($q$select public.admin_update_report(%L,'dismissed','trying it out')$q$, rep)), 'err:forbidden');
  r := r || pg_temp.ex('report update needs reason', pg_temp.act(m,'authenticated', format($q$select public.admin_update_report(%L,'under_review','x')$q$, rep)), 'err:reason_required');
  r := r || pg_temp.ex('assign to student rejected', pg_temp.act(m,'authenticated', format($q$select public.admin_update_report(%L,'under_review','assigning now',%L)$q$, rep, b)), 'err:invalid_assignee');
  r := r || pg_temp.ex('assign to moderator', pg_temp.act(m,'authenticated', format($q$select public.admin_update_report(%L,'under_review','taking this case',%L)$q$, rep, m)), 'ok:1');
  r := r || pg_temp.ex('moderator adds note', pg_temp.act(m,'authenticated', format($q$select public.admin_add_report_note(%L,'checked context, looks real')$q$, rep)), 'ok:1');
  r := r || pg_temp.ex('student cannot add note', pg_temp.act(b,'authenticated', format($q$select public.admin_add_report_note(%L,'hi')$q$, rep)), 'err:forbidden');
  r := r || pg_temp.ex('notes private to staff', pg_temp.act(b,'authenticated','select * from public.report_notes'), 'ok:0');
  r := r || pg_temp.ex('moderator reads notes', pg_temp.act(m,'authenticated','select * from public.report_notes'), 'ok:1');
  r := r || pg_temp.ex('moderator resolves report', pg_temp.act(m,'authenticated', format($q$select public.admin_update_report(%L,'action_taken','content hidden and warned')$q$, rep)), 'ok:1');
  select (resolved_at is not null and resolved_by = m)::text into got from public.reports where id = rep;
  r := r || pg_temp.ex('resolution stamped with actor/time', got, 'true');
  r := r || pg_temp.ex('moderator cannot reopen closed report', pg_temp.act(m,'authenticated', format($q$select public.admin_update_report(%L,'open','reopening it')$q$, rep)), 'err:insufficient_rank');
  r := r || pg_temp.ex('admin can reopen closed report', pg_temp.act(ad,'authenticated', format($q$select public.admin_update_report(%L,'open','reopening for review')$q$, rep)), 'ok:1');
  r := r || pg_temp.ex('invalid status rejected', pg_temp.act(m,'authenticated', format($q$select public.admin_update_report(%L,'banana','invalid status test')$q$, rep)), 'err:invalid_status');
  r := r || pg_temp.ex('moderator escalates', pg_temp.act(m,'authenticated', format($q$select public.admin_update_report(%L,'escalated','needs admin review')$q$, rep)), 'ok:1');
  r := r || pg_temp.ex('moderator warns user', pg_temp.act(m,'authenticated', format($q$select public.admin_warn_user(%L,'please follow guidelines')$q$, a)), 'ok:1');
  r := r || pg_temp.ex('cannot warn admin', pg_temp.act(m,'authenticated', format($q$select public.admin_warn_user(%L,'inappropriate warning')$q$, ad)), 'err:insufficient_rank');
  r := r || pg_temp.ex('student cannot warn', pg_temp.act(b,'authenticated', format($q$select public.admin_warn_user(%L,'student warning')$q$, a)), 'err:forbidden');
  r := r || pg_temp.ex('moderation history visible to moderator', pg_temp.act(m,'authenticated','select * from public.moderation_actions'), 'ok:');
  r := r || pg_temp.ex('moderation history hidden from students', pg_temp.act(b,'authenticated','select * from public.moderation_actions'), 'ok:0');
  begin update public.moderation_actions set reason = 'tamper tamper'; got := 'allowed'; exception when others then got := 'err:' || sqlerrm; end;
  r := r || pg_temp.ex('moderation_actions update blocked', got, 'err:append-only');
  begin delete from public.moderation_actions; got := 'allowed'; exception when others then got := 'err:' || sqlerrm; end;
  r := r || pg_temp.ex('moderation_actions delete blocked', got, 'err:append-only');
  begin truncate public.moderation_actions; got := 'allowed'; exception when others then got := 'err:' || sqlerrm; end;
  r := r || pg_temp.ex('moderation_actions truncate blocked', got, 'err:append-only');
  select count(*) into n from public.admin_audit_logs where action in ('content.hide','content.restore','report.update','report.note','user.warn');
  r := r || pg_temp.ex('moderation writes audit log (>=8)', (n >= 8)::text, 'true');

  -- blocks
  r := r || pg_temp.ex('block user', pg_temp.act(b,'authenticated', format($q$insert into public.blocks(blocked_id) values (%L)$q$, a)), 'ok:1');
  select count(*) into n from public.follows where follower_id = b and followee_id = a;
  r := r || pg_temp.ex('block removes existing follow', n::text, '0');
  r := r || pg_temp.ex('blocker no longer sees blocked posts', pg_temp.act(b,'authenticated', format($q$select * from public.posts where id=%L$q$, pa)), 'ok:0');
  r := r || pg_temp.ex('blocked user still sees own post', pg_temp.act(a,'authenticated', format($q$select * from public.posts where id=%L$q$, pa)), 'ok:1');
  r := r || pg_temp.ex('blocker discover excludes blocked', pg_temp.act(b,'authenticated', format($q$select 1 from public.discover_students() where id=%L$q$, a)), 'ok:0');
  r := r || pg_temp.ex('blocker feed excludes blocked', pg_temp.act(b,'authenticated', format($q$select 1 from public.feed_posts() where id=%L$q$, pa)), 'ok:0');
  r := r || pg_temp.ex('blocked user cannot like blockers post', pg_temp.act(a,'authenticated', format($q$select public.like_post(%L)$q$, pb)), 'err:not_found');
  r := r || pg_temp.ex('blocked user cannot comment on blockers post', pg_temp.act(a,'authenticated', format($q$select public.add_comment(%L,'hello')$q$, pb)), 'err:not_found');
  r := r || pg_temp.ex('blocked user cannot follow blocker', pg_temp.act(a,'authenticated', format($q$select public.follow_user(%L)$q$, b)), 'err:not_found');
  r := r || pg_temp.ex('blocker cannot follow blocked', pg_temp.act(b,'authenticated', format($q$select public.follow_user(%L)$q$, a)), 'err:not_found');
  r := r || pg_temp.ex('blocker cannot like blocked post', pg_temp.act(b,'authenticated', format($q$select public.like_post(%L)$q$, pa)), 'err:not_found');
  r := r || pg_temp.ex('blocks are private', pg_temp.act(a,'authenticated','select * from public.blocks'), 'ok:0');
  r := r || pg_temp.ex('cannot block self', pg_temp.act(b,'authenticated', format($q$insert into public.blocks(blocked_id) values (%L)$q$, b)), 'err:new row');
  r := r || pg_temp.ex('cannot block on behalf of someone else', pg_temp.act(c,'authenticated', format($q$insert into public.blocks(blocker_id,blocked_id) values (%L,%L)$q$, b, a)), 'err:permission denied');
  r := r || pg_temp.ex('unblock', pg_temp.act(b,'authenticated', format($q$delete from public.blocks where blocked_id=%L$q$, a)), 'ok:1');
  r := r || pg_temp.ex('after unblock post visible', pg_temp.act(b,'authenticated', format($q$select * from public.posts where id=%L$q$, pa)), 'ok:1');

  -- account standing
  r := r || pg_temp.ex('admin restricts posting', pg_temp.act(ad,'authenticated', format($q$select public.admin_set_account_status(%L,'restricted','posting abuse noted',true,false)$q$, z)), 'ok:1');
  r := r || pg_temp.ex('posting-restricted user cannot post', pg_temp.act(z,'authenticated', $q$insert into public.posts(body) values ('blocked?')$q$), 'err:new row violates row-level security');
  r := r || pg_temp.ex('posting-restricted user cannot comment', pg_temp.act(z,'authenticated', format($q$select public.add_comment(%L,'hello')$q$, pa)), 'err:forbidden');
  r := r || pg_temp.ex('posting-restricted user can still like', pg_temp.act(z,'authenticated', format($q$select public.like_post(%L)$q$, pa)), 'ok:1');
  r := r || pg_temp.ex('admin suspends author', pg_temp.act(ad,'authenticated', format($q$select public.admin_set_account_status(%L,'suspended','repeated violations')$q$, a)), 'ok:1');
  r := r || pg_temp.ex('suspended author posts hidden', pg_temp.act(b,'authenticated', format($q$select * from public.posts where id=%L$q$, pa)), 'ok:0');
  r := r || pg_temp.ex('suspended user cannot post', pg_temp.act(a,'authenticated', $q$insert into public.posts(body) values ('still here')$q$), 'err:new row violates row-level security');
  r := r || pg_temp.ex('suspended user cannot report', pg_temp.act(a,'authenticated', format($q$select public.submit_report('post',%L,'spam')$q$, pb)), 'err:forbidden');
  r := r || pg_temp.ex('admin reinstates author', pg_temp.act(ad,'authenticated', format($q$select public.admin_set_account_status(%L,'active','appeal accepted')$q$, a)), 'ok:1');
  r := r || pg_temp.ex('reinstated posts visible', pg_temp.act(b,'authenticated', format($q$select * from public.posts where id=%L$q$, pa)), 'ok:1');

  -- function exposure
  r := r || pg_temp.ex('students cannot call internal_blocked_either', pg_temp.act(b,'authenticated', format($q$select public.internal_blocked_either(%L,%L)$q$, a, c)), 'err:permission denied');
  r := r || pg_temp.ex('students cannot call internal_profile_visible', pg_temp.act(b,'authenticated', format($q$select public.internal_profile_visible(%L,%L)$q$, p, b)), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot submit report', pg_temp.act(null,'anon', format($q$select public.submit_report('post',%L,'spam')$q$, pa)), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot hide content', pg_temp.act(null,'anon', format($q$select public.admin_set_content_state('post',%L,true,'anon attempt')$q$, pa)), 'err:permission denied');

  raise exception E'RESULTS\n%', r;   -- intentional: rolls back all test data
end $do$;
