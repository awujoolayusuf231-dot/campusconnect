begin;

do $preflight$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.user_preferences') is null
     or to_regclass('public.notifications') is null
     or to_regclass('public.follows') is null
     or to_regclass('public.posts') is null
     or to_regclass('public.celebration_cards') is null
     or to_regclass('public.feature_flags') is null
     or to_regprocedure('public.internal_profile_visible(uuid,uuid)') is null
     or to_regprocedure('public.internal_blocked_either(uuid,uuid)') is null
     or to_regprocedure('public.internal_post_visible_to(uuid,uuid)') is null
     or to_regprocedure('public.effective_status_internal(uuid)') is null
     or to_regprocedure('public.feature_enabled(text)') is null
     or to_regprocedure('public.internal_notify(uuid,text,uuid,text,uuid,text,jsonb)') is null
     or to_regprocedure('public.has_permission(text)') is null then
    raise exception 'Local discovery requires the existing profile, visibility, notification, and RBAC foundations';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_preferences'
      and column_name in ('notify_discussions', 'notify_push')
    group by table_schema, table_name
    having count(*) = 2
  ) then
    raise exception 'Local discovery requires the existing discussion and push preference columns';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_preferences'
      and column_name in ('location_discovery_enabled', 'notify_followed_posts', 'notify_celebrations')
  ) or to_regclass('public.private_discovery_locations') is not null
    or to_regprocedure('public.get_my_discovery_location()') is not null
    or to_regprocedure('public.set_my_discovery_location(text,boolean)') is not null
    or to_regprocedure('public.recommend_students(boolean,integer,integer)') is not null
    or to_regprocedure('public.admin_discovery_overview(integer)') is not null
    or exists (
      select 1 from pg_trigger
      where not tgisinternal
        and tgname in ('posts_notify_followers', 'celebration_cards_notify_followers')
    ) then
    raise exception 'Local discovery objects already exist; inspect the schema instead of rerunning this migration';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_roles where rolname = 'anon') then
    raise exception 'Local discovery requires Supabase API roles';
  end if;
end
$preflight$;

alter table public.user_preferences
  add column notify_followed_posts boolean not null default false,
  add column notify_celebrations boolean not null default true;

grant insert (
  user_id, notify_follows, notify_likes, notify_comments, notify_community, notify_messages,
  notify_discussions, notify_push, notify_followed_posts, notify_celebrations
) on public.user_preferences to authenticated;
grant update (
  notify_follows, notify_likes, notify_comments, notify_community, notify_messages,
  notify_discussions, notify_push, notify_followed_posts, notify_celebrations
) on public.user_preferences to authenticated;

create table public.private_discovery_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  city_state text not null check (char_length(btrim(city_state)) between 2 and 80),
  location_key text not null check (char_length(location_key) between 2 and 80),
  updated_at timestamptz not null default now()
);
alter table public.private_discovery_locations enable row level security;
revoke all on public.private_discovery_locations from public, anon, authenticated;
create index private_discovery_locations_key_idx on public.private_discovery_locations (location_key);

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'follow', 'like', 'comment', 'community_join', 'message', 'announcement', 'moderation_warning',
    'repost', 'discussion_reply', 'celebration_reminder', 'project_invitation', 'project_application',
    'competition_update', 'voice_invitation', 'followed_post', 'celebration_published'
  ));

insert into public.feature_flags (key, enabled, description)
values
  ('local_student_recommendations', true, 'Enable private, on-platform student recommendations based on shared profile signals.'),
  ('location_discovery', true, 'Enable opt-in city or state matching; precise location and GPS are not used.'),
  ('followed_post_notifications', true, 'Enable opt-in in-app notifications for visible posts by followed students.'),
  ('celebration_social_notifications', true, 'Enable in-app notifications when followed students publish a celebration card.')
on conflict (key) do nothing;

create or replace function public.internal_notify(
  p_user uuid,
  p_type text,
  p_actor uuid,
  p_entity_type text,
  p_entity uuid,
  p_dedupe text,
  p_data jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_ok boolean;
begin
  if p_user is null or p_user is not distinct from p_actor then return; end if;
  if p_actor is not null and public.internal_blocked_either(p_user, p_actor) then return; end if;
  if public.effective_status_internal(p_user) not in ('active', 'restricted') then return; end if;

  select case p_type
    when 'follow' then notify_follows
    when 'like' then notify_likes
    when 'comment' then notify_comments
    when 'community_join' then notify_community
    when 'message' then notify_messages
    when 'followed_post' then notify_followed_posts
    when 'celebration_reminder' then notify_celebrations
    when 'celebration_published' then notify_celebrations
    else true
  end into v_ok
  from public.user_preferences
  where user_id = p_user;

  if found and v_ok is false then return; end if;

  insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, dedupe_key, data)
  values (p_user, p_type, p_actor, p_entity_type, p_entity, p_dedupe, coalesce(p_data, '{}'::jsonb))
  on conflict (user_id, dedupe_key) do nothing;
end
$function$;

create function public.get_my_discovery_location()
returns table (city_state text, enabled boolean)
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or public.effective_status_internal(v_uid) not in ('active', 'restricted') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select location.city_state, location.user_id is not null
  from (select v_uid as user_id) caller
  left join public.private_discovery_locations location on location.user_id = caller.user_id;
end
$function$;

create function public.set_my_discovery_location(p_city_state text, p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
  v_city_state text := nullif(btrim(coalesce(p_city_state, '')), '');
begin
  if v_uid is null or public.effective_status_internal(v_uid) not in ('active', 'restricted') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_enabled is null then raise exception 'invalid_setting' using errcode = '22023'; end if;
  if p_enabled and not public.feature_enabled('location_discovery') then
    raise exception 'feature_disabled' using errcode = '42501';
  end if;
  if p_enabled and (v_city_state is null or char_length(v_city_state) not between 2 and 80) then
    raise exception 'enter_city_or_state' using errcode = '22023';
  end if;

  if p_enabled then
    insert into public.private_discovery_locations (user_id, city_state, location_key)
    values (
      v_uid,
      v_city_state,
      lower(regexp_replace(v_city_state, '[[:space:]]+', ' ', 'g'))
    )
    on conflict (user_id) do update
      set city_state = excluded.city_state,
          location_key = excluded.location_key,
          updated_at = now();
  else
    delete from public.private_discovery_locations where user_id = v_uid;
  end if;
  return p_enabled;
end
$function$;

create function public.recommend_students(
  p_location_only boolean default false,
  p_limit integer default 24,
  p_offset integer default 0
) returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  bio text,
  institution_id uuid,
  department text,
  academic_level text,
  shared_interests integer,
  same_institution boolean,
  same_department boolean,
  same_location boolean
)
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
  v_status public.account_status;
  v_location_key text;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  v_status := public.effective_status_internal(v_uid);
  if v_status not in ('active', 'restricted') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.feature_enabled('local_student_recommendations') then return; end if;
  if p_location_only and not public.feature_enabled('location_discovery') then return; end if;

  select location.location_key into v_location_key
  from public.private_discovery_locations location
  where location.user_id = v_uid;
  if p_location_only and v_location_key is null then return; end if;

  return query
  with viewer as (
    select profile.id, profile.institution_id, profile.department, profile.interests
    from public.profiles profile
    where profile.id = v_uid
  ),
  candidates as (
    select
      profile.id,
      profile.username,
      profile.display_name,
      profile.avatar_path,
      profile.bio,
      profile.institution_id,
      profile.department,
      profile.academic_level,
      profile.created_at,
      (
        select count(distinct lower(viewer_interest.value))::integer
        from unnest(viewer.interests) as viewer_interest(value)
        join unnest(profile.interests) as candidate_interest(value)
          on lower(candidate_interest.value) = lower(viewer_interest.value)
      ) as shared_interests,
      (viewer.institution_id is not null and profile.institution_id = viewer.institution_id) as same_institution,
      coalesce(
        nullif(btrim(viewer.department), '') is not null
          and lower(btrim(profile.department)) = lower(btrim(viewer.department)),
        false
      ) as same_department,
      (
        public.feature_enabled('location_discovery')
        and candidate_location.user_id is not null
        and v_location_key is not null
        and candidate_location.location_key = v_location_key
      ) as same_location,
      (
        select count(*)::integer
        from public.follows viewer_follow
        join public.follows candidate_follow
          on candidate_follow.followee_id = viewer_follow.followee_id
        where viewer_follow.follower_id = v_uid
          and candidate_follow.follower_id = profile.id
      ) as mutual_connections
    from public.profiles profile
    cross join viewer
    left join public.private_discovery_locations candidate_location on candidate_location.user_id = profile.id
    where profile.id <> v_uid
      and public.effective_status_internal(profile.id) in ('active', 'restricted')
      and public.internal_profile_visible(profile.id, v_uid)
      and not coalesce(public.internal_blocked_either(v_uid, profile.id), true)
      and not exists (
        select 1 from public.follows already_following
        where already_following.follower_id = v_uid
          and already_following.followee_id = profile.id
      )
  ),
  scored as (
    select candidates.*,
      (shared_interests * 2
        + case when same_institution then 3 else 0 end
        + case when same_department then 2 else 0 end
        + least(mutual_connections, 5)
        + case when same_location then 4 else 0 end) as relevance
    from candidates
  )
  select scored.id, scored.username, scored.display_name, scored.avatar_path, scored.bio,
    scored.institution_id, scored.department, scored.academic_level, scored.shared_interests,
    scored.same_institution, scored.same_department, scored.same_location
  from scored as scored
  where scored.relevance > 0
    and (not coalesce(p_location_only, false) or scored.same_location)
  order by scored.relevance desc, scored.created_at desc, scored.id
  limit least(greatest(coalesce(p_limit, 24), 1), 50)
  offset least(greatest(coalesce(p_offset, 0), 0), 10000);
end
$function$;

create function public.notify_followed_post() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  v_follower record;
begin
  if new.status <> 'visible'
     or not public.feature_enabled('followed_post_notifications') then
    return null;
  end if;

  for v_follower in
    select follow.follower_id
    from public.follows follow
    join public.user_preferences preferences on preferences.user_id = follow.follower_id
    where follow.followee_id = new.author_id
      and preferences.notify_followed_posts
      and public.internal_post_visible_to(new.id, follow.follower_id)
    order by follow.created_at desc, follow.follower_id
    limit 500
  loop
    perform public.internal_notify(
      v_follower.follower_id,
      'followed_post',
      new.author_id,
      'post',
      new.id,
      'followed-post:' || new.id::text,
      '{}'::jsonb
    );
  end loop;
  return null;
end
$function$;

create trigger posts_notify_followers
after insert on public.posts
for each row execute function public.notify_followed_post();

create function public.notify_celebration_published() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  v_follower record;
begin
  if new.status <> 'published' then return null; end if;
  if tg_op = 'UPDATE' and old.status = 'published' then return null; end if;
  if not public.feature_enabled('celebration_social_notifications') then return null; end if;

  for v_follower in
    select follow.follower_id
    from public.follows follow
    left join public.user_preferences preferences on preferences.user_id = follow.follower_id
    where follow.followee_id = new.owner_id
      and coalesce(preferences.notify_celebrations, true)
    order by follow.created_at desc, follow.follower_id
    limit 500
  loop
    perform public.internal_notify(
      v_follower.follower_id,
      'celebration_published',
      new.owner_id,
      'celebration',
      new.id,
      'celebration-published:' || new.id::text,
      jsonb_build_object('title', left(new.title, 120))
    );
  end loop;
  return null;
end
$function$;

create trigger celebration_cards_notify_followers
after insert or update of status on public.celebration_cards
for each row execute function public.notify_celebration_published();

create function public.admin_discovery_overview(p_days integer default 30)
returns table (
  location_opt_ins bigint,
  followed_post_notifications bigint,
  celebration_notifications bigint
)
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  if not public.has_permission('analytics.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from public.private_discovery_locations),
    (select count(*) from public.notifications notification
      where notification.type = 'followed_post'
        and notification.created_at >= now() - make_interval(days => v_days)),
    (select count(*) from public.notifications notification
      where notification.type in ('celebration_published', 'celebration_reminder')
        and notification.created_at >= now() - make_interval(days => v_days));
end
$function$;

revoke all on function public.notify_followed_post(),
  public.notify_celebration_published(),
  public.get_my_discovery_location(),
  public.set_my_discovery_location(text, boolean),
  public.recommend_students(boolean, integer, integer),
  public.admin_discovery_overview(integer)
  from public, anon, authenticated;
grant execute on function public.recommend_students(boolean, integer, integer)
  to authenticated;
grant execute on function public.get_my_discovery_location(),
  public.set_my_discovery_location(text, boolean)
  to authenticated;
grant execute on function public.admin_discovery_overview(integer)
  to authenticated;

do $postflight$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.private_discovery_locations'::regclass)
     or has_function_privilege('anon', 'public.recommend_students(boolean,integer,integer)', 'execute')
     or has_function_privilege('anon', 'public.admin_discovery_overview(integer)', 'execute')
     or has_function_privilege('anon', 'public.get_my_discovery_location()', 'execute')
     or has_function_privilege('anon', 'public.set_my_discovery_location(text,boolean)', 'execute')
     or has_table_privilege('anon', 'public.private_discovery_locations', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.private_discovery_locations', 'select,insert,update,delete')
     or has_function_privilege('authenticated', 'public.notify_followed_post()', 'execute')
     or has_function_privilege('authenticated', 'public.notify_celebration_published()', 'execute') then
    raise exception 'Local discovery function privileges are broader than expected';
  end if;
end
$postflight$;

commit;
