-- 0003: fallback username used only 12 chars of the user id and could collide; use the last 24 (29 chars total).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_open boolean;
  v_username text;
  v_display text;
  v_inst uuid;
  v_fallback text := 'user_' || right(replace(new.id::text, '-', ''), 24);
begin
  select (value #>> '{}')::boolean into v_open from public.platform_settings where key = 'registration_open';
  if coalesce(v_open, true) = false then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  v_username := lower(coalesce(v_meta ->> 'username', ''));
  if v_username !~ '^[a-z0-9_]{3,30}$' then v_username := v_fallback; end if;
  v_display := btrim(coalesce(v_meta ->> 'display_name', ''));
  if char_length(v_display) not between 1 and 60 then
    v_display := coalesce(nullif(left(btrim(split_part(coalesce(new.email, ''), '@', 1)), 60), ''), 'Student');
  end if;
  begin v_inst := (v_meta ->> 'institution_id')::uuid; exception when others then v_inst := null; end;
  if v_inst is not null and not exists (select 1 from public.institutions where id = v_inst and is_active) then
    v_inst := null;
  end if;
  begin
    insert into public.profiles (id, username, display_name, institution_id) values (new.id, v_username, v_display, v_inst);
  exception when unique_violation then
    insert into public.profiles (id, username, display_name, institution_id) values (new.id, v_fallback, v_display, v_inst);
  end;
  insert into public.account_standing (user_id) values (new.id);
  return new;
end $$;
