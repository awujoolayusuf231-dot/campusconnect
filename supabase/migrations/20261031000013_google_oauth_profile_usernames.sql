-- Use provider profile names to create readable usernames for OAuth signups.
-- Existing Google profiles with generated user_* handles are migrated in place.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_open boolean;
  v_username text;
  v_base_username text;
  v_display text;
  v_inst uuid;
  v_suffix integer := 1;
begin
  select (value #>> '{}')::boolean into v_open from public.platform_settings where key = 'registration_open';
  if coalesce(v_open, true) = false then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;

  v_display := btrim(coalesce(
    nullif(v_meta ->> 'display_name', ''),
    nullif(v_meta ->> 'full_name', ''),
    nullif(v_meta ->> 'name', ''),
    nullif(v_meta ->> 'given_name', '')
  ));
  if char_length(v_display) not between 1 and 60 then
    v_display := coalesce(nullif(left(btrim(split_part(coalesce(new.email, ''), '@', 1)), 60), ''), 'Student');
  end if;

  v_username := lower(coalesce(v_meta ->> 'username', ''));
  if v_username !~ '^[a-z0-9_]{3,30}$' then
    v_username := lower(regexp_replace(
      coalesce(v_display, split_part(coalesce(new.email, ''), '@', 1)),
      '[^a-z0-9]+',
      '_',
      'g'
    ));
    v_username := trim(both '_' from v_username);
  end if;
  if v_username !~ '^[a-z0-9_]{3,30}$' then v_username := 'student'; end if;
  v_base_username := v_username;

  begin v_inst := (v_meta ->> 'institution_id')::uuid; exception when others then v_inst := null; end;
  if v_inst is not null and not exists (select 1 from public.institutions where id = v_inst and is_active) then
    v_inst := null;
  end if;

  loop
    begin
      insert into public.profiles (id, username, display_name, institution_id)
      values (new.id, v_username, v_display, v_inst);
      exit;
    exception when unique_violation then
      v_suffix := v_suffix + 1;
      v_username := left(v_base_username, 30 - char_length(v_suffix::text) - 1) || '_' || v_suffix;
    end;
  end loop;

  insert into public.account_standing (user_id) values (new.id);
  return new;
end $$;

do $migration$
declare
  r record;
  v_source text;
  v_base text;
  v_username text;
  v_suffix integer;
begin
  for r in
    select p.id, p.username, p.display_name, u.email, u.raw_user_meta_data
    from public.profiles p
    join auth.users u on u.id = p.id
    where left(p.username, 5) = 'user_'
      and exists (
        select 1 from auth.identities i
        where i.user_id = u.id and i.provider = 'google'
      )
    order by p.created_at, p.id
  loop
    v_source := coalesce(
      nullif(r.raw_user_meta_data ->> 'full_name', ''),
      nullif(r.raw_user_meta_data ->> 'name', ''),
      nullif(r.raw_user_meta_data ->> 'given_name', ''),
      split_part(coalesce(r.email, ''), '@', 1)
    );
    v_base := trim(both '_' from lower(regexp_replace(v_source, '[^a-z0-9]+', '_', 'g')));
    if v_base !~ '^[a-z0-9_]{3,}$' then continue; end if;

    v_username := left(v_base, 30);
    v_suffix := 1;
    loop
      exit when not exists (
        select 1 from public.profiles p
        where p.username = v_username and p.id <> r.id
      );
      v_suffix := v_suffix + 1;
      v_username := left(v_base, 30 - char_length(v_suffix::text) - 1) || '_' || v_suffix;
    end loop;

    update public.profiles
    set username = v_username,
        display_name = case
          when char_length(btrim(coalesce(
            r.raw_user_meta_data ->> 'full_name',
            r.raw_user_meta_data ->> 'name',
            r.raw_user_meta_data ->> 'given_name',
            ''
          ))) between 1 and 60
          then btrim(coalesce(
            r.raw_user_meta_data ->> 'full_name',
            r.raw_user_meta_data ->> 'name',
            r.raw_user_meta_data ->> 'given_name'
          ))
          else r.display_name
        end
    where id = r.id;
  end loop;
end
$migration$;
