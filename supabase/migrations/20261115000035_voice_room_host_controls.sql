-- Open-mic rooms by default; hosts can lock publishing and approve raised hands.
begin;

do $preflight$
begin
  if to_regclass('public.voice_rooms') is null
     or to_regclass('public.voice_room_members') is null
     or to_regprocedure('public.voice_can_join(uuid)') is null
     or to_regprocedure('public.voice_is_manager(uuid)') is null then
    raise exception 'Voice host controls require migration 20261115000033';
  end if;
end
$preflight$;

alter table public.voice_rooms
  add column mic_mode text not null default 'open'
  check (mic_mode in ('open', 'host_controlled'));

create or replace function public.voice_join_room(p_room uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
  v_mic_mode text;
  v_host uuid;
begin
  if not public.voice_can_join(p_room) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select mic_mode, host_id into v_mic_mode, v_host
  from public.voice_rooms where id = p_room for update;
  select role into v_role
  from public.voice_room_members
  where room_id = p_room and user_id = v_uid;

  if not found then
    v_role := case
      when v_uid = v_host then 'host'
      when v_mic_mode = 'open' then 'speaker'
      else 'listener'
    end;
    insert into public.voice_room_members(room_id, user_id, role)
    values (p_room, v_uid, v_role)
    on conflict (room_id, user_id) do update
      set role = excluded.role, left_at = null;
  elsif v_uid = v_host then
    update public.voice_room_members set role = 'host', left_at = null
    where room_id = p_room and user_id = v_uid;
    v_role := 'host';
  elsif v_mic_mode = 'open' and v_role = 'listener' then
    update public.voice_room_members set role = 'speaker', left_at = null
    where room_id = p_room and user_id = v_uid;
    v_role := 'speaker';
  else
    update public.voice_room_members set left_at = null
    where room_id = p_room and user_id = v_uid;
  end if;

  return v_role;
end
$function$;

create or replace function public.voice_authorize_token(p_room uuid, p_can_publish boolean)
returns table(livekit_room text, participant_role text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room public.voice_rooms%rowtype;
  v_uid uuid := (select auth.uid());
  v_role text;
  v_can_publish boolean;
begin
  if not public.voice_can_join(p_room) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_room from public.voice_rooms where id = p_room for update;
  if v_room.status = 'scheduled' then
    if v_room.host_id <> v_uid then
      raise exception 'room_not_live' using errcode = '42501';
    end if;
    update public.voice_rooms
    set status = 'live', host_disconnected_at = null
    where id = p_room;
  end if;

  select role into v_role
  from public.voice_room_members
  where room_id = p_room and user_id = v_uid and left_at is null;
  if v_role is null then
    raise exception 'join_room_before_token' using errcode = '42501';
  end if;

  v_can_publish := v_role = 'host'
    or (v_room.mic_mode = 'open' and v_role in ('cohost', 'speaker'))
    or (v_room.mic_mode = 'host_controlled' and v_role = 'speaker');
  if p_can_publish and not v_can_publish then
    raise exception 'speaker_permission_required' using errcode = '42501';
  end if;

  return query select v_room.livekit_room, v_role;
end
$function$;

create function public.voice_set_mic_mode(p_room uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if p_mode not in ('open', 'host_controlled')
     or not exists (
       select 1 from public.voice_rooms
       where id = p_room and host_id = v_actor and status = 'live'
     ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.voice_rooms set mic_mode = p_mode where id = p_room;
  if p_mode = 'host_controlled' then
    update public.voice_room_members
    set role = 'listener'
    where room_id = p_room and role = 'speaker' and user_id <> v_actor and left_at is null;
  else
    update public.voice_room_members
    set role = 'speaker'
    where room_id = p_room and role = 'listener' and left_at is null;
  end if;
end
$function$;

create function public.voice_list_publish_permissions(p_room uuid)
returns table(livekit_room text, participant_identity text, can_publish boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_mode text;
  v_livekit_room text;
begin
  if not public.voice_is_manager(p_room) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select r.mic_mode, r.livekit_room
  into v_mode, v_livekit_room
  from public.voice_rooms r where r.id = p_room;
  if not found then
    raise exception 'room_not_found' using errcode = '22023';
  end if;

  return query
  select v_livekit_room, m.user_id::text,
    (m.role = 'host'
      or (v_mode = 'open' and m.role in ('cohost', 'speaker'))
      or (v_mode = 'host_controlled' and m.role = 'speaker'))
  from public.voice_room_members m
  where m.room_id = p_room and m.left_at is null;
end
$function$;

revoke all on function public.voice_set_mic_mode(uuid, text) from public, anon, authenticated;
revoke all on function public.voice_list_publish_permissions(uuid) from public, anon, authenticated;
grant execute on function public.voice_set_mic_mode(uuid, text) to authenticated;
grant execute on function public.voice_list_publish_permissions(uuid) to authenticated;

commit;