-- Regression checks for direct, audited student deletion requests and rank-safe approval.
-- Run against a disposable migrated CampusConnect database; all fixture data rolls back.
begin;

create function pg_temp.act(p_uid uuid, p_role text, p_sql text)
returns text language plpgsql as $function$
declare
  v_rows integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
  exception when others then
    execute 'reset role';
    return 'err:' || sqlerrm;
  end;
  execute 'reset role';
  return 'ok:' || v_rows;
end
$function$;

create function pg_temp.assert_result(p_name text, p_got text, p_expected_prefix text)
returns void language plpgsql as $function$
begin
  if p_got not like p_expected_prefix || '%' then
    raise exception 'FAIL % -> % (expected %)', p_name, p_got, p_expected_prefix;
  end if;
  raise notice 'PASS %', p_name;
end
$function$;

do $tests$
declare
  v_admin uuid := '00000000-0000-4000-8000-0000000000a1';
  v_student uuid := '00000000-0000-4000-8000-0000000000b1';
  v_peer_admin uuid := '00000000-0000-4000-8000-0000000000c1';
  v_owner uuid := '00000000-0000-4000-8000-0000000000d1';
  v_count integer;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_admin, 'direct-delete-admin@test.invalid', '{"username":"direct_delete_admin","display_name":"Deletion Admin"}'),
    (v_student, 'direct-delete-student@test.invalid', '{"username":"direct_delete_student","display_name":"Deletion Student"}'),
    (v_peer_admin, 'direct-delete-peer@test.invalid', '{"username":"direct_delete_peer","display_name":"Peer Admin"}'),
    (v_owner, 'direct-delete-owner@test.invalid', '{"username":"direct_delete_owner","display_name":"Platform Owner"}');
  insert into public.user_roles (user_id, role) values
    (v_admin, 'admin'), (v_peer_admin, 'admin'), (v_owner, 'owner');

  perform pg_temp.assert_result(
    'student cannot request direct account deletion',
    pg_temp.act(v_student, 'authenticated', format(
      'select public.admin_request_user_deletion(%L, %L)', v_student, 'valid reason for deletion'
    )),
    'err:forbidden'
  );
  perform pg_temp.assert_result(
    'admin cannot target own account',
    pg_temp.act(v_admin, 'authenticated', format(
      'select public.admin_request_user_deletion(%L, %L)', v_admin, 'valid reason for deletion'
    )),
    'err:cannot_delete_self_or_missing_target'
  );
  perform pg_temp.assert_result(
    'admin deletion requires an audit reason',
    pg_temp.act(v_admin, 'authenticated', format(
      'select public.admin_request_user_deletion(%L, %L)', v_student, '  no '
    )),
    'err:reason_required'
  );
  insert into public.account_deletion_requests (user_id) values (v_student);
  perform pg_temp.assert_result(
    'admin can request deletion of student with an existing pending request',
    pg_temp.act(v_admin, 'authenticated', format(
      'select public.admin_request_user_deletion(%L, %L)', v_student, 'Confirmed fraudulent student account'
    )),
    'ok:1'
  );

  select count(*) into v_count from public.admin_audit_logs
  where actor_id = v_admin and target_id = v_student::text
    and action = 'account.deletion_requested_by_admin';
  perform pg_temp.assert_result('direct deletion request is audited', v_count::text, '1');

  perform pg_temp.assert_result(
    'admin can approve lower-rank student deletion',
    pg_temp.act(v_admin, 'authenticated', format(
      'select public.admin_begin_account_deletion(%L)', v_student
    )),
    'ok:1'
  );
  insert into public.account_deletion_requests (user_id) values (v_peer_admin), (v_owner);
  perform pg_temp.assert_result(
    'admin cannot delete peer administrator',
    pg_temp.act(v_admin, 'authenticated', format(
      'select public.admin_begin_account_deletion(%L)', v_peer_admin
    )),
    'err:insufficient_rank'
  );
  perform pg_temp.assert_result(
    'admin cannot delete owner',
    pg_temp.act(v_admin, 'authenticated', format(
      'select public.admin_begin_account_deletion(%L)', v_owner
    )),
    'err:insufficient_rank'
  );
  perform pg_temp.assert_result(
    'student account deletion request remains available to staff review',
    (select status from public.account_deletion_requests where user_id = v_student),
    'completed'
  );
end
$tests$;

rollback;
