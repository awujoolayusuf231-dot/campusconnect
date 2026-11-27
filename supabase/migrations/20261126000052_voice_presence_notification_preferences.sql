begin;

do $preflight$
begin
  if to_regclass('public.voice_rooms') is null
     or to_regclass('public.voice_room_members') is null
     or to_regclass('public.voice_room_invitations') is null
     or to_regclass('public.user_preferences') is null
     or to_regclass('public.notifications') is null
     or to_regprocedure('public.voice_can_join(uuid)') is null
     or to_regprocedure('public.internal_notify(uuid,text,uuid,text,uuid,text,jsonb)') is null
     or to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    raise exception 'Voice presence and notification settings require the existing Voice Spaces and notification foundations';
  end if;
end
$preflight$;

alter table public.voice_rooms
  add column live_started_at timestamptz;

update public.voice_rooms
set live_started_at = coalesce(updated_at, created_at)
where status = 'live' and live_started_at is null;

create function public.voice_stamp_live_started_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.status = 'live' and old.status is distinct from 'live' then
    new.live_started_at := coalesce(new.live_started_at, now());
  end if;
  return new;
end
$function$;
create trigger voice_rooms_stamp_live_started_at
  before update of status on public.voice_rooms
  for each row execute function public.voice_stamp_live_started_at();
revoke update on public.voice_rooms from authenticated;

alter table public.user_preferences
  add column notify_enabled boolean not null default true,
  add column notify_voice boolean not null default true,
  add column notify_collaboration boolean not null default true;

grant insert (user_id, notify_enabled, notify_voice, notify_collaboration)
  on public.user_preferences to authenticated;
grant update (notify_enabled, notify_voice, notify_collaboration)
  on public.user_preferences to authenticated;

create or replace function public.internal_notify(
  p_user uuid,
  p_type text,
  p_actor uuid,
  p_entity_type text,
  p_entity uuid,
  p_dedupe text,
  p_data jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enabled boolean := true;
  v_category_enabled boolean := true;
begin
  if p_user is null or p_user is not distinct from p_actor then return; end if;
  if p_actor is not null and public.internal_blocked_either(p_user, p_actor) then return; end if;
  if public.effective_status_internal(p_user) not in ('active', 'restricted') then return; end if;

  select coalesce(preferences.notify_enabled, true),
    coalesce(case p_type
      when 'follow' then preferences.notify_follows
      when 'like' then preferences.notify_likes
      when 'repost' then preferences.notify_likes
      when 'comment' then preferences.notify_comments
      when 'community_join' then preferences.notify_community
      when 'message' then preferences.notify_messages
      when 'discussion_reply' then preferences.notify_discussions
      when 'followed_post' then preferences.notify_followed_posts
      when 'celebration_reminder' then preferences.notify_celebrations
      when 'celebration_published' then preferences.notify_celebrations
      when 'voice_invitation' then preferences.notify_voice
      when 'project_invitation' then preferences.notify_collaboration
      when 'project_application' then preferences.notify_collaboration
      when 'competition_update' then preferences.notify_collaboration
      else true
    end, true)
  into v_enabled, v_category_enabled
  from public.user_preferences preferences
  where preferences.user_id = p_user;

  if not found then
    v_enabled := true;
    v_category_enabled := true;
  end if;
  if not v_enabled or not v_category_enabled then return; end if;

  insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, dedupe_key, data)
  values (p_user, p_type, p_actor, p_entity_type, p_entity, p_dedupe, coalesce(p_data, '{}'::jsonb))
  on conflict (user_id, dedupe_key) do nothing;
end
$function$;
revoke all on function public.internal_notify(uuid, text, uuid, text, uuid, text, jsonb) from public, anon, authenticated;

create function public.notification_master_preference_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enabled boolean := true;
begin
  select coalesce(preferences.notify_enabled, true) into v_enabled
  from public.user_preferences preferences
  where preferences.user_id = new.user_id;
  if found and not v_enabled and new.type not in ('announcement', 'moderation_warning') then
    return null;
  end if;
  return new;
end
$function$;
create trigger notifications_respect_master_preference
  before insert on public.notifications
  for each row execute function public.notification_master_preference_guard();

create or replace function public.enqueue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enabled boolean := true;
  v_push_enabled boolean := true;
begin
  select coalesce(preferences.notify_enabled, true), coalesce(preferences.notify_push, true)
  into v_enabled, v_push_enabled
  from public.user_preferences preferences
  where preferences.user_id = new.user_id;
  if not found then
    v_enabled := true;
    v_push_enabled := true;
  end if;
  if not v_enabled or not v_push_enabled then return new; end if;
  insert into public.push_outbox (notification_id, user_id, notification_type, entity_type, entity_id)
  values (new.id, new.user_id, new.type, new.entity_type, new.entity_id)
  on conflict (notification_id) do nothing;
  return new;
end
$function$;

create or replace function public.enqueue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enabled boolean := true;
  v_email_enabled boolean := false;
  v_category_enabled boolean := true;
  v_system_notice boolean := new.type in ('announcement', 'moderation_warning');
begin
  select coalesce(preferences.notify_enabled, true),
    coalesce(preferences.notify_email, false),
    coalesce(case new.type
      when 'follow' then preferences.notify_follows
      when 'like' then preferences.notify_likes
      when 'repost' then preferences.notify_likes
      when 'comment' then preferences.notify_comments
      when 'community_join' then preferences.notify_community
      when 'message' then preferences.notify_messages
      when 'discussion_reply' then preferences.notify_discussions
      when 'followed_post' then preferences.notify_followed_posts
      when 'celebration_reminder' then preferences.notify_celebrations
      when 'celebration_published' then preferences.notify_celebrations
      when 'voice_invitation' then preferences.notify_voice
      when 'project_invitation' then preferences.notify_collaboration
      when 'project_application' then preferences.notify_collaboration
      when 'competition_update' then preferences.notify_collaboration
      else true
    end, true)
  into v_enabled, v_email_enabled, v_category_enabled
  from public.user_preferences preferences
  where preferences.user_id = new.user_id;

  if not found then
    v_enabled := true;
    v_email_enabled := false;
    v_category_enabled := true;
  end if;
  if not v_category_enabled or (not v_system_notice and (not v_enabled or not v_email_enabled)) then
    return new;
  end if;

  insert into public.email_outbox (user_id, message_type, notification_id, dedupe_key)
  values (new.user_id, 'activity', new.id, 'notification:' || new.id::text)
  on conflict do nothing;
  return new;
end
$function$;

create or replace function public.voice_room_host_controls_history(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null and (
    public.effective_status_internal((select auth.uid())) in ('active', 'restricted')
    and exists (
      select 1 from public.voice_rooms rooms
      where rooms.id = p_room
        and not public.internal_blocked_either((select auth.uid()), rooms.host_id)
        and (
          exists (
            select 1 from public.voice_room_members members
            where members.room_id = rooms.id and members.user_id = (select auth.uid())
          )
          or exists (
            select 1 from public.voice_room_invitations invitations
            where invitations.room_id = rooms.id and invitations.invitee_id = (select auth.uid())
          )
          or (rooms.status = 'ended' and (
            (rooms.room_type <> 'group' and rooms.visibility = 'public')
            or (rooms.visibility = 'followers' and exists (
              select 1 from public.follows follows
              where follows.follower_id = (select auth.uid()) and follows.followee_id = rooms.host_id
            ))
            or (rooms.visibility = 'community' and exists (
              select 1 from public.community_members members
              where members.community_id = rooms.community_id
                and members.user_id = (select auth.uid()) and members.status = 'active'
            ))
            or (rooms.room_type = 'group' and exists (
              select 1 from public.project_members members
              where members.project_id = rooms.project_id and members.user_id = (select auth.uid())
            ))
          ))
        )
    )
  )
$function$;
revoke all on function public.voice_room_host_controls_history(uuid) from public, anon;
grant execute on function public.voice_room_host_controls_history(uuid) to authenticated;

drop policy voice_rooms_read on public.voice_rooms;
create policy voice_rooms_read on public.voice_rooms
  for select to authenticated
  using (
    host_id = (select auth.uid())
    or public.voice_can_join(id)
    or (select public.has_permission('content.moderate'))
    or public.voice_room_host_controls_history(id)
  );

create or replace function public.voice_active_presence()
returns table (
  room_id uuid,
  title text,
  host_display_name text,
  host_avatar_path text,
  participant_count bigint,
  can_join boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    rooms.id,
    case when public.voice_can_join(rooms.id) then rooms.title else 'A restricted Voice Space is live' end,
    case when public.voice_can_join(rooms.id) then profiles.display_name else null end,
    case when public.voice_can_join(rooms.id) then profiles.avatar_path else null end,
    case when public.voice_can_join(rooms.id) then (
      select count(*) from public.voice_room_members members
      where members.room_id = rooms.id and members.left_at is null
    ) else null end,
    public.voice_can_join(rooms.id)
  from public.voice_rooms rooms
  left join public.profiles profiles on profiles.id = rooms.host_id
  where rooms.status = 'live'
    and (select auth.uid()) is not null
    and public.feature_enabled('voice_spaces')
  order by rooms.live_started_at desc nulls last
  limit 50
$function$;
revoke all on function public.voice_active_presence() from public, anon;
grant execute on function public.voice_active_presence() to authenticated;

drop policy if exists voice_presence_authenticated_read on realtime.messages;
create policy voice_presence_authenticated_read on realtime.messages
  for select to authenticated
  using (topic = 'campusconnect:voice-presence');

create function public.broadcast_voice_presence_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'live' or (tg_op = 'UPDATE' and old.status is distinct from new.status) then
    perform realtime.send(
      jsonb_build_object('type', 'voice_presence_changed'),
      'voice_presence_changed',
      'campusconnect:voice-presence',
      true
    );
  end if;
  return new;
end
$function$;
create trigger voice_rooms_broadcast_presence
  after insert or update of status on public.voice_rooms
  for each row execute function public.broadcast_voice_presence_change();

create or replace function public.feature_notification_trg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid;
  v_actor uuid;
  v_type text;
  v_entity uuid;
  v_entity_type text;
  v_dedupe text;
  v_data jsonb := jsonb_build_object('source', tg_table_name);
begin
  if tg_table_name = 'project_applications' then
    select owner_id into v_user from public.projects where id = new.project_id;
    v_actor := new.applicant_id;
    v_type := 'project_application';
    v_entity := new.project_id;
    v_entity_type := 'project';
    v_dedupe := 'project-app-' || new.id::text;
  elsif tg_table_name = 'project_invitations' then
    v_user := new.invitee_id;
    v_actor := new.inviter_id;
    v_type := 'project_invitation';
    v_entity := new.project_id;
    v_entity_type := 'project';
    v_dedupe := 'project-invite-' || new.id::text;
  elsif tg_table_name = 'voice_room_invitations' then
    v_user := new.invitee_id;
    v_actor := new.inviter_id;
    v_type := 'voice_invitation';
    v_entity := new.room_id;
    v_entity_type := 'voice_room';
    v_dedupe := 'voice-invite-' || new.id::text;
    select jsonb_build_object('source', tg_table_name, 'title', rooms.title)
      into v_data from public.voice_rooms rooms where rooms.id = new.room_id;
  elsif tg_table_name = 'competition_registrations' then
    select organizer_id into v_user from public.competitions where id = new.competition_id;
    v_actor := new.user_id;
    v_type := 'competition_update';
    v_entity := new.competition_id;
    v_entity_type := 'competition';
    v_dedupe := 'competition-registration-' || new.id::text;
  else
    return new;
  end if;
  perform public.internal_notify(v_user, v_type, v_actor, v_entity_type, v_entity, v_dedupe, v_data);
  return new;
end
$function$;

commit;
