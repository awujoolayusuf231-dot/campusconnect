begin;

do $preflight$
begin
  if to_regprocedure('public.recommend_students(boolean,integer,integer)') is null then
    raise exception 'Recommendation fix requires public.recommend_students(boolean,integer,integer)';
  end if;
end
$preflight$;

create or replace function public.recommend_students(
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
      (candidates.shared_interests * 2
        + case when candidates.same_institution then 3 else 0 end
        + case when candidates.same_department then 2 else 0 end
        + least(candidates.mutual_connections, 5)
        + case when candidates.same_location then 4 else 0 end) as relevance
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

commit;
