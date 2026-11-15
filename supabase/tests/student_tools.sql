-- Student portfolio, CV, and timetable RLS/behavior checks.
-- Apply migration 20261115000032 before running this file. This test is intentionally NOT run by the app.
-- It ends with an intentional exception so every inserted row is rolled back.
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
  a uuid := '00000000-0000-0000-0000-0000000000a2';
  b uuid := '00000000-0000-0000-0000-0000000000b2';
  portfolio_id uuid;
  cv_id uuid;
  timetable_id uuid;
  image_path text;
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'student-tools-a@test.invalid', '{"username":"student_tools_a"}'),
    (b, 'student-tools-b@test.invalid', '{"username":"student_tools_b"}');

  r := r || pg_temp.ex('owner creates private portfolio', pg_temp.act(a, 'authenticated',
    $q$insert into public.student_portfolios (owner_id,slug,display_name) values ('00000000-0000-0000-0000-0000000000a2','portfolio-a','Student A')$q$), 'ok:1');
  select id into portfolio_id from public.student_portfolios where slug = 'portfolio-a';
  image_path := a::text || '/' || portfolio_id::text || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg';

  r := r || pg_temp.ex('owner adds public project', pg_temp.act(a, 'authenticated', format(
    $q$insert into public.student_portfolio_items (portfolio_id,item_type,content,image_path,is_public) values (%L,'project','{"title":"Public project","secret_note":"never expose"}'::jsonb,%L,true)$q$,
    portfolio_id, image_path)), 'ok:1');
  r := r || pg_temp.ex('owner adds private item', pg_temp.act(a, 'authenticated', format(
    $q$insert into public.student_portfolio_items (portfolio_id,item_type,content,is_public) values (%L,'achievement','{"title":"Private milestone"}'::jsonb,false)$q$,
    portfolio_id)), 'ok:1');
  r := r || pg_temp.ex('owner publishes selected portfolio', pg_temp.act(a, 'authenticated',
    $q$update public.student_portfolios set is_public=true where slug='portfolio-a'$q$), 'ok:1');
  r := r || pg_temp.ex('portfolio owner can read own data', pg_temp.act(a, 'authenticated',
    $q$select * from public.student_portfolios where slug='portfolio-a'$q$), 'ok:1');
  r := r || pg_temp.ex('other student cannot read portfolio table row', pg_temp.act(b, 'authenticated',
    $q$select * from public.student_portfolios where slug='portfolio-a'$q$), 'ok:0');
  r := r || pg_temp.ex('other student cannot read portfolio items', pg_temp.act(b, 'authenticated',
    format($q$select * from public.student_portfolio_items where portfolio_id=%L$q$, portfolio_id)), 'ok:0');
  r := r || pg_temp.ex('anonymous cannot read portfolio tables', pg_temp.act(null, 'anon',
    'select * from public.student_portfolios'), 'err:permission denied');
  r := r || pg_temp.ex('anonymous public RPC returns sanitized portfolio', pg_temp.act(null, 'anon',
    $q$select case when public.get_public_student_portfolio('portfolio-a') is null then 1/0 else 1 end$q$), 'ok:1');
  r := r || pg_temp.ex('public RPC omits non-allowlisted content', pg_temp.act(null, 'anon',
    $q$select case when (public.get_public_student_portfolio('portfolio-a')->'items'->0->'content') ? 'secret_note' then 1/0 else 1 end$q$), 'ok:1');
  r := r || pg_temp.ex('public asset read is scoped to a public project', pg_temp.act(null, 'anon', format(
    $q$select case when public.student_portfolio_asset_read_allowed(%L) then 1 else 1/0 end$q$, image_path)), 'ok:1');
  r := r || pg_temp.ex('private project asset denied to anonymous read', pg_temp.act(null, 'anon', format(
    $q$select case when not public.student_portfolio_asset_read_allowed(%L) then 1 else 1/0 end$q$,
    a::text || '/' || portfolio_id::text || '/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg')), 'ok:1');

  r := r || pg_temp.ex('owner creates private CV', pg_temp.act(a, 'authenticated',
    $q$insert into public.student_cvs (owner_id,title,content) values ('00000000-0000-0000-0000-0000000000a2','Private CV','{"full_name":"Student A"}'::jsonb)$q$), 'ok:1');
  select id into cv_id from public.student_cvs where owner_id = a;
  r := r || pg_temp.ex('CV owner reads own record', pg_temp.act(a, 'authenticated',
    format($q$select * from public.student_cvs where id=%L$q$, cv_id)), 'ok:1');
  r := r || pg_temp.ex('other student cannot read CV', pg_temp.act(b, 'authenticated',
    format($q$select * from public.student_cvs where id=%L$q$, cv_id)), 'ok:0');
  r := r || pg_temp.ex('anonymous cannot read CV table', pg_temp.act(null, 'anon',
    'select * from public.student_cvs'), 'err:permission denied');
  r := r || pg_temp.ex('owner sets default CV atomically', pg_temp.act(a, 'authenticated',
    format($q$select public.set_default_student_cv(%L)$q$, cv_id)), 'ok:1');
  r := r || pg_temp.ex('another student cannot set owner CV as default', pg_temp.act(b, 'authenticated',
    format($q$select public.set_default_student_cv(%L)$q$, cv_id)), 'err:cv_not_found');
  select count(*) into n from public.student_cvs where owner_id = a and is_default;
  r := r || pg_temp.ex('only owner CV becomes default', n::text, '1');

  r := r || pg_temp.ex('owner creates private timetable event', pg_temp.act(a, 'authenticated',
    $q$insert into public.student_timetable_events (owner_id,title,event_type,event_date,start_time,end_time,timezone) values ('00000000-0000-0000-0000-0000000000a2','Private lecture','lecture','2030-01-07','09:00','10:00','Africa/Lagos')$q$), 'ok:1');
  select id into timetable_id from public.student_timetable_events where owner_id = a;
  r := r || pg_temp.ex('timetable owner reads own event', pg_temp.act(a, 'authenticated',
    format($q$select * from public.student_timetable_events where id=%L$q$, timetable_id)), 'ok:1');
  r := r || pg_temp.ex('other student cannot read timetable event', pg_temp.act(b, 'authenticated',
    format($q$select * from public.student_timetable_events where id=%L$q$, timetable_id)), 'ok:0');
  r := r || pg_temp.ex('anonymous cannot read timetable table', pg_temp.act(null, 'anon',
    'select * from public.student_timetable_events'), 'err:permission denied');

  update public.feature_flags set enabled = false where key = 'student_portfolio';
  r := r || pg_temp.ex('feature flag off hides public portfolio', pg_temp.act(null, 'anon',
    $q$select case when public.get_public_student_portfolio('portfolio-a') is null then 1 else 1/0 end$q$), 'ok:1');
  r := r || pg_temp.ex('feature flag off blocks owner portfolio edits', pg_temp.act(a, 'authenticated',
    $q$update public.student_portfolios set display_name='Changed' where slug='portfolio-a'$q$), 'err:new row violates row-level security policy');
  update public.feature_flags set enabled = true where key = 'student_portfolio';

  r := r || pg_temp.ex('feature flag off blocks timetable creation', pg_temp.act(a, 'authenticated',
    $q$insert into public.student_timetable_events (owner_id,title,event_type,event_date,start_time,end_time,timezone) values ('00000000-0000-0000-0000-0000000000a2','Blocked event','lecture','2030-01-08','09:00','10:00','Africa/Lagos')$q$), 'err:new row violates row-level security policy');

  raise exception E'RESULTS\n%', r; -- intentional: rolls back every fixture and flag change
end $do$;
