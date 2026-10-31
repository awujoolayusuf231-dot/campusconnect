-- Verify Google-style metadata creates readable, unique usernames.
-- Run in the CampusConnect Supabase SQL editor; all test rows are rolled back.
begin;

do $test$
declare
  v_token text := right(replace(gen_random_uuid()::text, '-', ''), 8);
  v_name text;
  v_expected text;
  v_first uuid := gen_random_uuid();
  v_second uuid := gen_random_uuid();
  v_username text;
begin
  v_name := 'Campus Connect ' || v_token;
  v_expected := 'campus_connect_' || v_token;

  insert into auth.users (id, email, raw_user_meta_data)
  values (v_first, v_first::text || '@google-test.invalid', jsonb_build_object('name', v_name));
  select username into v_username from public.profiles where id = v_first;
  if v_username <> v_expected then
    raise exception 'Expected readable Google username %, got %', v_expected, v_username;
  end if;

  insert into auth.users (id, email, raw_user_meta_data)
  values (v_second, v_second::text || '@google-test.invalid', jsonb_build_object('full_name', v_name));
  select username into v_username from public.profiles where id = v_second;
  if v_username <> (v_expected || '_2') then
    raise exception 'Expected a unique suffixed Google username %, got %', v_expected || '_2', v_username;
  end if;
end
$test$;

rollback;
