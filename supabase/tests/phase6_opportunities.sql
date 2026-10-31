-- Phase 6a tests: banned-members list, opportunities (validation, URL safety, lifecycle, feature flag, saves, clicks, expiry,
-- featured cap, stats, reports, permissions). Paste into the Supabase SQL editor; ends with an intentional rollback.
-- Read the RESULTS block in the error message: every line must start with PASS.
-- LAST RUN (this exact file, as saved): 2026-10-26 on CampusConnect01: 88 assertions, all PASS, rolled back.
-- (The original inline run on 2026-10-23 had 93 assertions; this saved version is a cleaned-up retype with 88.)
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
  select case when p_got like p_want || '%' then 'PASS ' else 'FAIL ' end || p_name || ' -> ' || p_got || E'\n' $f$;
do $do$
declare
  r text := '';
  a uuid := '00000000-0000-0000-0000-0000000000a1'; b uuid := '00000000-0000-0000-0000-0000000000b1';
  c uuid := '00000000-0000-0000-0000-0000000000c1'; d uuid := '00000000-0000-0000-0000-0000000000d1';
  m uuid := '00000000-0000-0000-0000-000000000011'; ad uuid := '00000000-0000-0000-0000-000000000012'; o uuid := '00000000-0000-0000-0000-000000000013';
  cm uuid; op uuid; op2 uuid; opd uuid; n int; got text; rep uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a,'a@t.invalid','{"username":"user_a"}'), (b,'b@t.invalid','{"username":"user_b"}'), (c,'c@t.invalid','{"username":"user_c"}'), (d,'d@t.invalid','{"username":"user_d"}'),
    (m,'m@t.invalid','{"username":"mod_m"}'), (ad,'ad@t.invalid','{"username":"adm_x"}'), (o,'o@t.invalid','{"username":"own_o"}');
  insert into public.user_roles (user_id, role) values (m,'moderator'), (ad,'admin'), (o,'owner');

  r := r || pg_temp.ex('c creates community', pg_temp.act(c,'authenticated', $q$select public.create_community('Ban List Test','ban-list-test','x','other')$q$), 'ok:1');
  select id into cm from public.communities where slug = 'ban-list-test';
  r := r || pg_temp.ex('d joins', pg_temp.act(d,'authenticated', format($q$select public.join_community(%L)$q$, cm)), 'ok:1');
  r := r || pg_temp.ex('b joins', pg_temp.act(b,'authenticated', format($q$select public.join_community(%L)$q$, cm)), 'ok:1');
  r := r || pg_temp.ex('owner bans d', pg_temp.act(c,'authenticated', format($q$select public.community_set_member(%L,%L,'ban','repeated violations')$q$, cm, d)), 'ok:1');
  r := r || pg_temp.ex('owner sees banned list', pg_temp.act(c,'authenticated', format($q$select * from public.community_banned_list(%L)$q$, cm)), 'ok:1');
  r := r || pg_temp.ex('banned user cannot read banned list', pg_temp.act(d,'authenticated', format($q$select * from public.community_banned_list(%L)$q$, cm)), 'err:forbidden');
  r := r || pg_temp.ex('plain member cannot read banned list', pg_temp.act(b,'authenticated', format($q$select * from public.community_banned_list(%L)$q$, cm)), 'err:forbidden');
  r := r || pg_temp.ex('outsider cannot read banned list', pg_temp.act(a,'authenticated', format($q$select * from public.community_banned_list(%L)$q$, cm)), 'err:forbidden');
  r := r || pg_temp.ex('anon cannot read banned list', pg_temp.act(null,'anon', format($q$select * from public.community_banned_list(%L)$q$, cm)), 'err:permission denied');
  r := r || pg_temp.ex('owner unbans from the list', pg_temp.act(c,'authenticated', format($q$select public.community_set_member(%L,%L,'unban','appeal accepted')$q$, cm, d)), 'ok:1');
  r := r || pg_temp.ex('banned list now empty', pg_temp.act(c,'authenticated', format($q$select * from public.community_banned_list(%L)$q$, cm)), 'ok:0');

  r := r || pg_temp.ex('student cannot create opportunity', pg_temp.act(a,'authenticated', $q$select public.admin_save_opportunity(null,'Great Internship','Acme','A summary long enough','desc','internship','https://acme.example/apply',null)$q$), 'err:forbidden');
  r := r || pg_temp.ex('moderator cannot create opportunity', pg_temp.act(m,'authenticated', $q$select public.admin_save_opportunity(null,'Great Internship','Acme','A summary long enough','desc','internship','https://acme.example/apply',null)$q$), 'err:forbidden');
  r := r || pg_temp.ex('anon cannot create opportunity', pg_temp.act(null,'anon', $q$select public.admin_save_opportunity(null,'Great Internship','Acme','A summary long enough','desc','internship',null,null)$q$), 'err:permission denied');
  r := r || pg_temp.ex('student cannot insert directly', pg_temp.act(a,'authenticated', $q$insert into public.opportunities(title,summary,category) values ('Sneaky title','sneaky summary text','career')$q$), 'err:permission denied');
  r := r || pg_temp.ex('admin creates draft', pg_temp.act(ad,'authenticated', $q$select public.admin_save_opportunity(null,'Great Internship','Acme Ltd','A summary long enough','Full description','internship','https://whiteshirt.fun/jobs',current_date + 30)$q$), 'ok:1');
  select id into op from public.opportunities where title = 'Great Internship';

  r := r || pg_temp.ex('short title rejected', pg_temp.act(ad,'authenticated', $q$select public.admin_save_opportunity(null,'Hey','x','A summary long enough','d','internship',null,null)$q$), 'err:new row');
  r := r || pg_temp.ex('short summary rejected', pg_temp.act(ad,'authenticated', $q$select public.admin_save_opportunity(null,'Good title here','x','short','d','internship',null,null)$q$), 'err:new row');
  r := r || pg_temp.ex('bad category rejected', pg_temp.act(ad,'authenticated', $q$select public.admin_save_opportunity(null,'Good title here','x','A summary long enough','d','lottery',null,null)$q$), 'err:new row');
  r := r || pg_temp.ex('javascript: url rejected', pg_temp.act(ad,'authenticated', $q$select public.admin_save_opportunity(null,'Good title here','x','A summary long enough','d','career','javascript:alert(1)',null)$q$), 'err:new row');
  r := r || pg_temp.ex('http (non-https) url rejected', pg_temp.act(ad,'authenticated', $q$select public.admin_save_opportunity(null,'Good title here','x','A summary long enough','d','career','http://acme.example/x',null)$q$), 'err:new row');
  r := r || pg_temp.ex('userinfo trick url rejected', pg_temp.act(ad,'authenticated', $q$select public.admin_save_opportunity(null,'Good title here','x','A summary long enough','d','career','https://trusted.com@evil.com/x',null)$q$), 'err:new row');
  r := r || pg_temp.ex('url with spaces rejected', pg_temp.act(ad,'authenticated', $q$select public.admin_save_opportunity(null,'Good title here','x','A summary long enough','d','career','https://acme.example/a b',null)$q$), 'err:new row');
  r := r || pg_temp.ex('data: url rejected', pg_temp.act(ad,'authenticated', $q$select public.admin_save_opportunity(null,'Good title here','x','A summary long enough','d','career','data:text/html,hi',null)$q$), 'err:new row');
  r := r || pg_temp.ex('url over 500 chars rejected', pg_temp.act(ad,'authenticated', format($q$select public.admin_save_opportunity(null,'Good title here','x','A summary long enough','d','career',%L,null)$q$, 'https://acme.example/' || repeat('a', 500))), 'err:new row');
  r := r || pg_temp.ex('valid https url with path+query accepted', pg_temp.act(ad,'authenticated', $q$select public.admin_save_opportunity(null,'Second Opportunity','Org','Another long enough summary','d','scholarship','https://acme.example/apply?id=1&ref=cc',null)$q$), 'ok:1');
  select id into op2 from public.opportunities where title = 'Second Opportunity';

  r := r || pg_temp.ex('draft hidden from students', pg_temp.act(a,'authenticated', format($q$select * from public.opportunities where id=%L$q$, op)), 'ok:0');
  r := r || pg_temp.ex('draft visible to admin', pg_temp.act(ad,'authenticated', format($q$select * from public.opportunities where id=%L$q$, op)), 'ok:1');
  r := r || pg_temp.ex('moderator cannot see drafts', pg_temp.act(m,'authenticated', format($q$select * from public.opportunities where id=%L$q$, op)), 'ok:0');
  r := r || pg_temp.ex('state change needs reason', pg_temp.act(ad,'authenticated', format($q$select public.admin_set_opportunity_state(%L,'published',false,'x')$q$, op)), 'err:reason_required');
  r := r || pg_temp.ex('invalid status rejected', pg_temp.act(ad,'authenticated', format($q$select public.admin_set_opportunity_state(%L,'live',false,'invalid status')$q$, op)), 'err:invalid_status');
  r := r || pg_temp.ex('student cannot publish', pg_temp.act(a,'authenticated', format($q$select public.admin_set_opportunity_state(%L,'published',false,'student attempt')$q$, op)), 'err:forbidden');
  r := r || pg_temp.ex('admin publishes', pg_temp.act(ad,'authenticated', format($q$select public.admin_set_opportunity_state(%L,'published',false,'reviewed and approved')$q$, op)), 'ok:1');
  r := r || pg_temp.ex('published visible to students', pg_temp.act(a,'authenticated', format($q$select * from public.opportunities where id=%L$q$, op)), 'ok:1');
  r := r || pg_temp.ex('anon cannot read opportunities', pg_temp.act(null,'anon','select * from public.opportunities'), 'err:permission denied');
  r := r || pg_temp.ex('list shows external host', pg_temp.act(a,'authenticated', $q$select 1 from public.list_opportunities() where external_host = 'whiteshirt.fun'$q$), 'ok:1');
  r := r || pg_temp.ex('list category filter', pg_temp.act(a,'authenticated', $q$select 1 from public.list_opportunities('scholarship')$q$), 'ok:0');
  r := r || pg_temp.ex('list text filter', pg_temp.act(a,'authenticated', $q$select 1 from public.list_opportunities(null,'great')$q$), 'ok:1');
  r := r || pg_temp.ex('list wildcard literal', pg_temp.act(a,'authenticated', $q$select 1 from public.list_opportunities(null,'%')$q$), 'ok:0');
  r := r || pg_temp.ex('list limit clamp', pg_temp.act(a,'authenticated', 'select * from public.list_opportunities(null,null,false,100000,0)'), 'ok:');
  r := r || pg_temp.ex('anon cannot list', pg_temp.act(null,'anon','select * from public.list_opportunities()'), 'err:permission denied');
  update public.feature_flags set enabled = false where key = 'opportunities';
  r := r || pg_temp.ex('flag off hides opportunities from students', pg_temp.act(a,'authenticated', format($q$select * from public.opportunities where id=%L$q$, op)), 'ok:0');
  r := r || pg_temp.ex('flag off hides from list', pg_temp.act(a,'authenticated','select * from public.list_opportunities()'), 'ok:0');
  r := r || pg_temp.ex('flag off blocks clicks (backend)', pg_temp.act(a,'authenticated', format($q$select public.record_opportunity_click(%L)$q$, op)), 'err:feature_disabled');
  r := r || pg_temp.ex('admin still sees with flag off', pg_temp.act(ad,'authenticated', format($q$select * from public.opportunities where id=%L$q$, op)), 'ok:1');
  update public.feature_flags set enabled = true where key = 'opportunities';

  r := r || pg_temp.ex('student saves', pg_temp.act(a,'authenticated', format($q$insert into public.opportunity_saves(opportunity_id) values (%L)$q$, op)), 'ok:1');
  r := r || pg_temp.ex('duplicate save rejected', pg_temp.act(a,'authenticated', format($q$insert into public.opportunity_saves(opportunity_id) values (%L)$q$, op)), 'err:duplicate key');
  select save_count into n from public.opportunities where id = op;
  r := r || pg_temp.ex('save_count is 1', n::text, '1');
  r := r || pg_temp.ex('cannot save as someone else', pg_temp.act(a,'authenticated', format($q$insert into public.opportunity_saves(user_id,opportunity_id) values (%L,%L)$q$, b, op)), 'err:permission denied');
  r := r || pg_temp.ex('cannot save a draft', pg_temp.act(a,'authenticated', format($q$insert into public.opportunity_saves(opportunity_id) values (%L)$q$, op2)), 'err:new row violates row-level security');
  r := r || pg_temp.ex('saves are private', pg_temp.act(b,'authenticated','select * from public.opportunity_saves'), 'ok:0');
  r := r || pg_temp.ex('saved filter works', pg_temp.act(a,'authenticated', 'select 1 from public.list_opportunities(null,null,true)'), 'ok:1');
  r := r || pg_temp.ex('saved filter excludes unsaved for others', pg_temp.act(b,'authenticated', 'select 1 from public.list_opportunities(null,null,true)'), 'ok:0');
  r := r || pg_temp.ex('unsave', pg_temp.act(a,'authenticated', format($q$delete from public.opportunity_saves where opportunity_id=%L$q$, op)), 'ok:1');
  select save_count into n from public.opportunities where id = op;
  r := r || pg_temp.ex('save_count back to 0', n::text, '0');

  r := r || pg_temp.ex('record click', pg_temp.act(a,'authenticated', format($q$select public.record_opportunity_click(%L)$q$, op)), 'ok:1');
  r := r || pg_temp.ex('repeat click not double counted', pg_temp.act(a,'authenticated', format($q$select public.record_opportunity_click(%L)$q$, op)), 'ok:1');
  r := r || pg_temp.ex('second user click', pg_temp.act(b,'authenticated', format($q$select public.record_opportunity_click(%L)$q$, op)), 'ok:1');
  select click_count into n from public.opportunities where id = op;
  r := r || pg_temp.ex('click_count counts distinct users (2)', n::text, '2');
  r := r || pg_temp.ex('cannot click a draft', pg_temp.act(a,'authenticated', format($q$select public.record_opportunity_click(%L)$q$, op2)), 'err:not_found');
  r := r || pg_temp.ex('anon cannot click', pg_temp.act(null,'anon', format($q$select public.record_opportunity_click(%L)$q$, op)), 'err:permission denied');
  r := r || pg_temp.ex('clicks table not readable', pg_temp.act(a,'authenticated','select * from public.opportunity_clicks'), 'err:permission denied');

  r := r || pg_temp.ex('save a past deadline', pg_temp.act(ad,'authenticated', format($q$select public.admin_save_opportunity(%L,'Second Opportunity','Org','Another long enough summary','d','scholarship',null,current_date - 1)$q$, op2)), 'ok:1');
  r := r || pg_temp.ex('cannot publish expired', pg_temp.act(ad,'authenticated', format($q$select public.admin_set_opportunity_state(%L,'published',false,'trying to publish')$q$, op2)), 'err:deadline_passed');
  r := r || pg_temp.ex('only published can be featured', pg_temp.act(ad,'authenticated', format($q$select public.admin_set_opportunity_state(%L,'draft',true,'feature draft')$q$, op2)), 'err:only_published_can_be_featured');
  r := r || pg_temp.ex('feature a published opportunity', pg_temp.act(ad,'authenticated', format($q$select public.admin_set_opportunity_state(%L,'published',true,'feature this one')$q$, op)), 'ok:1');
  insert into public.opportunities (title, summary, category, status, featured, published_at) select 'Featured ' || g, 'summary for featured ' || g, 'career', 'published', true, now() from generate_series(1,4) g;
  insert into public.opportunities (title, summary, category, status, published_at) values ('Sixth candidate','summary for sixth one','career','published',now()) returning id into opd;
  r := r || pg_temp.ex('max 5 featured enforced', pg_temp.act(ad,'authenticated', format($q$select public.admin_set_opportunity_state(%L,'published',true,'one too many')$q$, opd)), 'err:too_many_featured');
  update public.opportunities set deadline = current_date - 1 where id = op;
  r := r || pg_temp.ex('expired hidden from students automatically', pg_temp.act(a,'authenticated', format($q$select * from public.opportunities where id=%L$q$, op)), 'ok:0');
  r := r || pg_temp.ex('expired still visible to admin', pg_temp.act(ad,'authenticated', format($q$select * from public.opportunities where id=%L$q$, op)), 'ok:1');
  r := r || pg_temp.ex('expired cannot be clicked', pg_temp.act(a,'authenticated', format($q$select public.record_opportunity_click(%L)$q$, op)), 'err:not_found');
  r := r || pg_temp.ex('student cannot run archive job', pg_temp.act(a,'authenticated','select public.admin_archive_expired_opportunities()'), 'err:forbidden');
  r := r || pg_temp.ex('moderator cannot run archive job', pg_temp.act(m,'authenticated','select public.admin_archive_expired_opportunities()'), 'err:forbidden');
  r := r || pg_temp.ex('admin archives expired', pg_temp.act(ad,'authenticated','select public.admin_archive_expired_opportunities()'), 'ok:1');
  select status || '/' || featured::text into got from public.opportunities where id = op;
  r := r || pg_temp.ex('expired became archived and unfeatured', got, 'archived/false');

  r := r || pg_temp.ex('student cannot read opportunity stats', pg_temp.act(a,'authenticated','select public.admin_opportunity_stats()'), 'err:forbidden');
  r := r || pg_temp.ex('moderator cannot read opportunity stats', pg_temp.act(m,'authenticated','select public.admin_opportunity_stats()'), 'err:forbidden');
  r := r || pg_temp.ex('admin reads opportunity stats', pg_temp.act(ad,'authenticated','select public.admin_opportunity_stats()'), 'ok:1');

  update public.opportunities set status = 'published', deadline = null where id = op;
  r := r || pg_temp.ex('student reports opportunity', pg_temp.act(a,'authenticated', format($q$select public.submit_report('opportunity',%L,'misinformation','looks like a scam')$q$, op)), 'ok:1');
  select id into rep from public.reports where target_type = 'opportunity' and target_id = op;
  r := r || pg_temp.ex('snapshot holds the title', (select (content_snapshot like 'Great Internship%')::text from public.reports where id = rep), 'true');
  r := r || pg_temp.ex('duplicate report is idempotent', pg_temp.act(a,'authenticated', format($q$select public.submit_report('opportunity',%L,'misinformation','again')$q$, op)), 'ok:1');
  select count(*) into n from public.reports where target_type = 'opportunity';
  r := r || pg_temp.ex('only one report row', n::text, '1');
  r := r || pg_temp.ex('cannot report a draft', pg_temp.act(b,'authenticated', format($q$select public.submit_report('opportunity',%L,'spam')$q$, op2)), 'err:not_found');
  r := r || pg_temp.ex('moderator sees opportunity report', pg_temp.act(m,'authenticated', $q$select * from public.reports where target_type='opportunity'$q$), 'ok:1');
  r := r || pg_temp.ex('admin unpublishes reported opportunity', pg_temp.act(ad,'authenticated', format($q$select public.admin_set_opportunity_state(%L,'draft',false,'report confirmed scam')$q$, op)), 'ok:1');
  r := r || pg_temp.ex('unpublished is gone for students', pg_temp.act(b,'authenticated', format($q$select * from public.opportunities where id=%L$q$, op)), 'ok:0');
  select count(*) into n from public.admin_audit_logs where action like 'opportunity.%';
  r := r || pg_temp.ex('opportunity actions audited (>=6)', (n >= 6)::text, 'true');
  r := r || pg_temp.ex('invalid report type still rejected', pg_temp.act(a,'authenticated', format($q$select public.submit_report('server',%L,'spam')$q$, op)), 'err:invalid_type');

  raise exception E'RESULTS\n%', r;   -- intentional: rolls back all test data
end $do$;
