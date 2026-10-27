-- CampusConnect foundation security tests.
-- HOW TO RUN: paste into the Supabase SQL editor of the CampusConnect project.
-- It always ends with an intentional exception so EVERYTHING rolls back (no test data persists).
-- Read the "RESULTS" block in the error message: every line must start with PASS.
-- STATUS: executed against CampusConnect01 on 2026-10-16 after migrations 0001-0004: 75/75 PASS (after 0007).
-- Re-run after every migration that touches policies, grants or functions.
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
  c uuid := '00000000-0000-0000-0000-0000000000c1'; d uuid := '00000000-0000-0000-0000-0000000000d1';
  e uuid := '00000000-0000-0000-0000-0000000000e1'; o uuid := '00000000-0000-0000-0000-0000000000f1';
  i1 uuid; i2 uuid; n int; u text; got text;
begin
  insert into public.institutions (name, type) values ('TEST Inst One','university') returning id into i1;
  insert into public.institutions (name, type) values ('TEST Inst Two','polytechnic') returning id into i2;
  insert into auth.users (id, email, raw_user_meta_data) values
    (a,'a@test.invalid', jsonb_build_object('role','owner','username','Alice_01','display_name','Alice','institution_id',i1)),
    (b,'b@test.invalid','{"username":"bob_02"}'), (c,'c@test.invalid','{}'),
    (d,'d@test.invalid', jsonb_build_object('institution_id',i1)),
    (e,'e@test.invalid', jsonb_build_object('institution_id',i2)), (o,'o@test.invalid','{}');

  select count(*) into n from public.user_roles where user_id = a;
  r := r || pg_temp.ex('signup metadata cannot grant role', n::text, '0');
  select username into u from public.profiles where id = a;
  r := r || pg_temp.ex('signup normalizes username', u, 'alice_01');

  r := r || pg_temp.ex('student edits own profile', pg_temp.act(a,'authenticated', format($q$update public.profiles set display_name='Alice2' where id=%L$q$, a)), 'ok:1');
  r := r || pg_temp.ex('student cannot set institution_verified', pg_temp.act(a,'authenticated', format($q$update public.profiles set institution_verified=true where id=%L$q$, a)), 'err:permission denied');
  r := r || pg_temp.ex('student cannot insert user_roles', pg_temp.act(a,'authenticated', format($q$insert into public.user_roles(user_id,role) values (%L,'owner')$q$, a)), 'err:permission denied');
  r := r || pg_temp.ex('student cannot self-promote (RPC)', pg_temp.act(a,'authenticated', format($q$select public.admin_set_role(%L,'admin','self promote now')$q$, a)), 'err:forbidden');
  r := r || pg_temp.ex('student cannot edit others', pg_temp.act(a,'authenticated', format($q$update public.profiles set display_name='hax' where id=%L$q$, b)), 'ok:0');
  r := r || pg_temp.ex('student sees no audit rows', pg_temp.act(a,'authenticated','select * from public.admin_audit_logs'), 'ok:0');
  r := r || pg_temp.ex('student cannot change settings', pg_temp.act(a,'authenticated', $q$update public.platform_settings set value='false' where key='registration_open'$q$), 'ok:0');
  r := r || pg_temp.ex('student cannot change flags', pg_temp.act(a,'authenticated','update public.feature_flags set enabled=false'), 'ok:0');
  r := r || pg_temp.ex('student cannot create institution', pg_temp.act(a,'authenticated', $q$insert into public.institutions(name,type) values ('Evil Inst','other')$q$), 'err:new row violates row-level security');
  r := r || pg_temp.ex('student cannot call provision_owner', pg_temp.act(a,'authenticated', format($q$select public.provision_owner(%L)$q$, a)), 'err:permission denied');
  r := r || pg_temp.ex('student cannot forge audit entries', pg_temp.act(a,'authenticated', $q$select public.log_admin_action(null,'fake.action','user','x','forged','{}')$q$), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot call admin_set_role', pg_temp.act(null,'anon', format($q$select public.admin_set_role(%L,'admin','anon escalation')$q$, a)), 'err:permission denied');
  r := r || pg_temp.ex('student cannot grant permission', pg_temp.act(a,'authenticated', format($q$select public.admin_set_staff_permission(%L,'audit.view',true,'sneaky grant')$q$, a)), 'err:forbidden');

  r := r || pg_temp.ex('reject lookalike domain', pg_temp.act(a,'authenticated', format($q$update public.profiles set celebration_url='https://whiteshirt.fun.evil.com/x' where id=%L$q$, a)), 'err:new row');
  r := r || pg_temp.ex('reject userinfo trick', pg_temp.act(a,'authenticated', format($q$update public.profiles set celebration_url='https://whiteshirt.fun@evil.com/' where id=%L$q$, a)), 'err:new row');
  r := r || pg_temp.ex('reject javascript url', pg_temp.act(a,'authenticated', format($q$update public.profiles set celebration_url='javascript:alert(1)' where id=%L$q$, a)), 'err:new row');
  r := r || pg_temp.ex('reject http', pg_temp.act(a,'authenticated', format($q$update public.profiles set celebration_url='http://whiteshirt.fun/x' where id=%L$q$, a)), 'err:new row');
  r := r || pg_temp.ex('accept valid whiteshirt url', pg_temp.act(a,'authenticated', format($q$update public.profiles set celebration_url='https://www.whiteshirt.fun/adewale' where id=%L$q$, a)), 'ok:1');
  r := r || pg_temp.ex('reject other user avatar path', pg_temp.act(a,'authenticated', format($q$update public.profiles set avatar_path=%L where id=%L$q$, b::text||'/x.png', a)), 'err:new row');

  perform public.provision_owner(o);
  begin perform public.provision_owner(c); got := 'allowed'; exception when others then got := 'err:' || sqlerrm; end;
  r := r || pg_temp.ex('single owner provisioning', got, 'err:an owner already exists');

  r := r || pg_temp.ex('owner sets moderator', pg_temp.act(o,'authenticated', format($q$select public.admin_set_role(%L,'moderator','promote to moderator')$q$, b)), 'ok:1');
  r := r || pg_temp.ex('moderator cannot grant admin', pg_temp.act(b,'authenticated', format($q$select public.admin_set_role(%L,'admin','attempted escalation')$q$, a)), 'err:forbidden');
  r := r || pg_temp.ex('moderator cannot suspend', pg_temp.act(b,'authenticated', format($q$select public.admin_set_account_status(%L,'suspended','no permission here')$q$, a)), 'err:forbidden');
  r := r || pg_temp.ex('moderator can view users', pg_temp.act(b,'authenticated','select 1 where public.has_permission($$users.view$$)'), 'ok:1');
  r := r || pg_temp.ex('moderator cannot view audit', pg_temp.act(b,'authenticated','select * from public.admin_audit_logs'), 'ok:0');
  r := r || pg_temp.ex('owner cannot assign owner', pg_temp.act(o,'authenticated', format($q$select public.admin_set_role(%L,'owner','make another owner')$q$, a)), 'err:owner_role_not_assignable');
  r := r || pg_temp.ex('owner cannot change own role', pg_temp.act(o,'authenticated', format($q$select public.admin_set_role(%L,'student','demote myself now')$q$, o)), 'err:cannot_change_own_role');
  r := r || pg_temp.ex('role change needs reason', pg_temp.act(o,'authenticated', format($q$select public.admin_set_role(%L,'moderator','x')$q$, c)), 'err:reason_required');
  r := r || pg_temp.ex('owner sets admin', pg_temp.act(o,'authenticated', format($q$select public.admin_set_role(%L,'admin','promote to admin')$q$, c)), 'ok:1');
  r := r || pg_temp.ex('admin cannot manage roles', pg_temp.act(c,'authenticated', format($q$select public.admin_set_role(%L,'moderator','admin tries roles')$q$, a)), 'err:forbidden');
  r := r || pg_temp.ex('admin cannot grant permissions', pg_temp.act(c,'authenticated', format($q$select public.admin_set_staff_permission(%L,'settings.manage',true,'admin tries grant')$q$, b)), 'err:forbidden');
  r := r || pg_temp.ex('admin cannot change settings', pg_temp.act(c,'authenticated', $q$update public.platform_settings set value='false' where key='registration_open'$q$), 'ok:0');
  r := r || pg_temp.ex('admin cannot suspend owner', pg_temp.act(c,'authenticated', format($q$select public.admin_set_account_status(%L,'suspended','attack on owner')$q$, o)), 'err:insufficient_rank');
  r := r || pg_temp.ex('admin cannot suspend self', pg_temp.act(c,'authenticated', format($q$select public.admin_set_account_status(%L,'suspended','suspend myself')$q$, c)), 'err:cannot_moderate_self');
  r := r || pg_temp.ex('admin suspends student', pg_temp.act(c,'authenticated', format($q$select public.admin_set_account_status(%L,'suspended','spam posting repeated')$q$, a)), 'ok:1');
  r := r || pg_temp.ex('suspended profile hidden', pg_temp.act(d,'authenticated', format($q$select * from public.profiles where id=%L$q$, a)), 'ok:0');
  r := r || pg_temp.ex('suspended cannot edit profile', pg_temp.act(a,'authenticated', format($q$update public.profiles set bio='still here' where id=%L$q$, a)), 'ok:0');
  r := r || pg_temp.ex('student cannot call internal status fn', pg_temp.act(a,'authenticated', format($q$select public.effective_status_internal(%L)$q$, b)), 'err:permission denied');
  r := r || pg_temp.ex('student cannot learn others status', pg_temp.act(d,'authenticated', format($q$select 1 where public.account_effective_status(%L) is not null$q$, a)), 'ok:0');
  r := r || pg_temp.ex('student can read own status', pg_temp.act(d,'authenticated', format($q$select 1 where public.account_effective_status(%L) is not null$q$, d)), 'ok:1');
  r := r || pg_temp.ex('admin reinstates', pg_temp.act(c,'authenticated', format($q$select public.admin_set_account_status(%L,'active','appeal accepted ok')$q$, a)), 'ok:1');
  r := r || pg_temp.ex('reinstated profile visible', pg_temp.act(d,'authenticated', format($q$select * from public.profiles where id=%L$q$, a)), 'ok:1');

  select count(*) into n from public.admin_audit_logs where action in ('role.change','account.status_change');
  r := r || pg_temp.ex('audit captured privileged actions', (n >= 4)::text, 'true');
  r := r || pg_temp.ex('admin can read audit', pg_temp.act(c,'authenticated','select * from public.admin_audit_logs'), 'ok:');
  begin update public.admin_audit_logs set reason='tamper'; got := 'allowed'; exception when others then got := 'err:' || sqlerrm; end;
  r := r || pg_temp.ex('audit update blocked', got, 'err:admin_audit_logs is append-only');
  begin delete from public.admin_audit_logs; got := 'allowed'; exception when others then got := 'err:' || sqlerrm; end;
  r := r || pg_temp.ex('audit delete blocked', got, 'err:admin_audit_logs is append-only');
  begin truncate public.admin_audit_logs; got := 'allowed'; exception when others then got := 'err:' || sqlerrm; end;
  r := r || pg_temp.ex('audit truncate blocked', got, 'err:admin_audit_logs is append-only');

  r := r || pg_temp.ex('owner revokes moderator', pg_temp.act(o,'authenticated', format($q$select public.admin_set_role(%L,'student','revoking staff access')$q$, b)), 'ok:1');
  r := r || pg_temp.ex('revoked staff loses permission', pg_temp.act(b,'authenticated','select 1 where public.has_permission($$users.view$$)'), 'ok:0');

  update public.profiles set visibility='private' where id=a;
  r := r || pg_temp.ex('private profile hidden', pg_temp.act(d,'authenticated', format($q$select * from public.profiles where id=%L$q$, a)), 'ok:0');
  update public.profiles set visibility='institution' where id=a;
  r := r || pg_temp.ex('institution-only visible to same institution', pg_temp.act(d,'authenticated', format($q$select * from public.profiles where id=%L$q$, a)), 'ok:1');
  r := r || pg_temp.ex('institution-only hidden from others', pg_temp.act(e,'authenticated', format($q$select * from public.profiles where id=%L$q$, a)), 'ok:0');

  r := r || pg_temp.ex('owner creates institution', pg_temp.act(o,'authenticated', $q$insert into public.institutions(name,type) values ('TEST Inst Three','other')$q$), 'ok:1');
  r := r || pg_temp.ex('duplicate institution rejected', pg_temp.act(o,'authenticated', $q$insert into public.institutions(name,type) values ('test inst one','other')$q$), 'err:duplicate key');
  r := r || pg_temp.ex('setting type enforced', pg_temp.act(o,'authenticated', $q$update public.platform_settings set value='"yes"' where key='registration_open'$q$), 'err:setting registration_open expects boolean');
  r := r || pg_temp.ex('owner updates setting', pg_temp.act(o,'authenticated', $q$update public.platform_settings set value='"CampusConnect NG"' where key='platform_name'$q$), 'ok:1');
  r := r || pg_temp.ex('setting identity immutable', pg_temp.act(o,'authenticated', $q$update public.platform_settings set is_public=false where key='platform_name'$q$), 'err:permission denied');
  r := r || pg_temp.ex('owner toggles flag', pg_temp.act(o,'authenticated', $q$update public.feature_flags set enabled=false where key='messaging'$q$), 'ok:1');

  r := r || pg_temp.ex('anon cannot call has_permission', pg_temp.act(null,'anon', $q$select public.has_permission('x')$q$), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot read profiles', pg_temp.act(null,'anon','select * from public.profiles'), 'err:permission denied');
  r := r || pg_temp.ex('anon reads 6 public settings', pg_temp.act(null,'anon','select * from public.platform_settings'), 'ok:6');
  r := r || pg_temp.ex('anon cannot read audit', pg_temp.act(null,'anon','select * from public.admin_audit_logs'), 'err:permission denied');
  r := r || pg_temp.ex('anon username check', pg_temp.act(null,'anon', $q$select public.is_username_available('free_name')$q$), 'ok:1');

  r := r || pg_temp.ex('user requests deletion', pg_temp.act(d,'authenticated','select public.request_account_deletion()'), 'ok:1');
  r := r || pg_temp.ex('deletion requests are private', pg_temp.act(e,'authenticated','select * from public.account_deletion_requests'), 'ok:0');

  update public.platform_settings set value='false' where key='registration_open';
  begin insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f2','late@test.invalid'); got := 'allowed';
  exception when others then got := 'err:' || sqlerrm; end;
  r := r || pg_temp.ex('closed registration blocks signup', got, 'err:registration_closed');

  raise exception E'RESULTS\n%', r;   -- intentional: rolls back all test data
end $do$;
