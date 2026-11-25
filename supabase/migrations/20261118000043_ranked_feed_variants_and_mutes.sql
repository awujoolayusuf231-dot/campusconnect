begin;

do $preflight$
begin
  if to_regclass('public.posts') is null
     or to_regclass('public.post_views') is null
     or to_regclass('public.feed_ranking_config') is null
     or to_regclass('public.feature_flags') is null
     or to_regclass('public.follows') is null
     or to_regclass('public.reposts') is null
     or to_regclass('public.post_likes') is null
     or to_regclass('public.comments') is null
     or to_regclass('public.post_saves') is null
     or to_regprocedure('campusconnect_private.internal_security_post_visible_to(uuid,uuid)') is null
     or to_regprocedure('public.internal_profile_visible(uuid,uuid)') is null
     or to_regprocedure('public.internal_blocked_either(uuid,uuid)') is null
     or to_regprocedure('public.effective_status_internal(uuid)') is null
     or to_regprocedure('public.feed_timeline(text,timestamptz,text,uuid,integer)') is null
     or to_regprocedure('public.feed_posts(text,timestamptz,uuid,integer)') is null then
    raise exception 'Ranked feed variants require migration 20261118000042 and the social feed foundations';
  end if;
  if to_regclass('public.muted_users') is not null
     or to_regclass('public.feed_variant_exposures') is not null
     or to_regprocedure('public.get_ranked_feed(double precision,timestamptz,uuid,timestamptz,text,integer)') is not null then
    raise exception 'Ranked-feed objects already exist; reconcile schema drift before applying';
  end if;
end
$preflight$;

insert into public.feature_flags (key, enabled, description)
values (
  'feed_variant_experiment',
  false,
  'Compare chronological, trending, and ranked For you feeds. Users remain in a stable variant while enabled.'
)
on conflict (key) do nothing;

create table public.muted_users (
  user_id uuid not null references public.profiles(id) on delete cascade,
  muted_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_user_id),
  check (user_id <> muted_user_id)
);
create index muted_users_target_idx on public.muted_users (muted_user_id, user_id);
alter table public.muted_users enable row level security;
revoke all on table public.muted_users from public, anon, authenticated;
grant select on table public.muted_users to authenticated;
create policy muted_users_select_own on public.muted_users
  for select to authenticated using (user_id = (select auth.uid()));

create function public.mute_user(p_user_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'invalid_mute_target' using errcode = '22023';
  end if;
  if not public.internal_profile_visible(p_user_id, v_uid) then
    raise exception 'not_found' using errcode = '22023';
  end if;
  insert into public.muted_users (user_id, muted_user_id)
  values (v_uid, p_user_id)
  on conflict do nothing;
end
$function$;
revoke all on function public.mute_user(uuid) from public, anon, authenticated;
grant execute on function public.mute_user(uuid) to authenticated;

create function public.unmute_user(p_user_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.muted_users
  where user_id = v_uid and muted_user_id = p_user_id;
end
$function$;
revoke all on function public.unmute_user(uuid) from public, anon, authenticated;
grant execute on function public.unmute_user(uuid) to authenticated;

create table public.feed_variant_exposures (
  user_id uuid not null references public.profiles(id) on delete cascade,
  exposure_day date not null,
  assigned_variant text not null check (assigned_variant in ('chronological', 'trending', 'ranked')),
  variant text not null check (variant in ('chronological', 'trending', 'ranked')),
  used_campus_fallback boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0),
  primary key (user_id, exposure_day)
);
create index feed_variant_exposures_day_variant_idx
  on public.feed_variant_exposures (exposure_day, variant, assigned_variant);
alter table public.feed_variant_exposures enable row level security;
revoke all on table public.feed_variant_exposures from public, anon, authenticated;
grant select on table public.feed_variant_exposures to authenticated;
create policy feed_variant_exposures_select_own on public.feed_variant_exposures
  for select to authenticated using (user_id = (select auth.uid()));

create function public.get_ranked_feed(
  p_before_score double precision default null,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_as_of timestamptz default null,
  p_variant text default null,
  p_limit integer default 20
)
returns table (
  id uuid, author_id uuid, body text, created_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, repost_count integer,
  liked_by_me boolean, reposted_by_me boolean,
  username text, display_name text, avatar_path text,
  activity_at timestamptz, reposter_username text, reposter_name text,
  rank_score double precision, ranked_at timestamptz, feed_variant text
)
language plpgsql volatile security definer set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_now timestamptz := statement_timestamp();
  v_ranked_at timestamptz := least(coalesce(p_as_of, statement_timestamp()), statement_timestamp());
  v_profile_created_at timestamptz;
  v_institution uuid;
  v_assignment text;
  v_variant text;
  v_used_campus_fallback boolean := false;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if not coalesce(public.effective_status_internal(v_uid) in ('active', 'restricted'), false) then return; end if;
  if (p_before_score is null and (p_before is not null or p_before_id is not null or p_as_of is not null or p_variant is not null))
     or (p_before_score is not null and (p_before is null or p_before_id is null or p_as_of is null or p_variant is null))
     or (p_variant is not null and p_variant not in ('chronological', 'trending', 'ranked')) then
    raise exception 'invalid_cursor' using errcode = '22023';
  end if;

  select pr.created_at, pr.institution_id
  into v_profile_created_at, v_institution
  from public.profiles pr where pr.id = v_uid;

  v_assignment := case
    when not coalesce(public.feature_enabled('feed_variant_experiment'), false) then 'chronological'
    else case mod(mod(hashtextextended(v_uid::text, 7422), 3) + 3, 3)
      when 0 then 'chronological'
      when 1 then 'trending'
      else 'ranked'
    end
  end;
  v_used_campus_fallback := coalesce(v_institution is not null
    and v_profile_created_at >= v_ranked_at - (
      select make_interval(days => config.new_user_days)
      from public.feed_ranking_config config where config.singleton
    ), false);
  v_variant := case when v_used_campus_fallback then 'trending' else v_assignment end;

  if p_variant is not null and p_variant <> v_variant then
    raise exception 'invalid_cursor' using errcode = '22023';
  end if;

  if p_before_score is null then
    insert into public.feed_variant_exposures (
      user_id, exposure_day, assigned_variant, variant, used_campus_fallback
    ) values (
      v_uid, (v_now at time zone 'UTC')::date, v_assignment, v_variant, v_used_campus_fallback
    )
    on conflict (user_id, exposure_day) do update
    set assigned_variant = excluded.assigned_variant,
        variant = excluded.variant,
        used_campus_fallback = excluded.used_campus_fallback,
        last_seen_at = excluded.last_seen_at,
        request_count = public.feed_variant_exposures.request_count + 1;
  end if;

  return query
  with config as (
    select * from public.feed_ranking_config where singleton
  ),
  post_activity as (
    select p.id, p.created_at as activity_at, null::uuid as reposter_id
    from public.posts p
    where p.status = 'visible' and p.community_id is null
      and p.author_id <> v_uid and p.created_at <= v_ranked_at
      and campusconnect_private.internal_security_post_visible_to(p.id, v_uid)
    union all
    select p.id, r.created_at, r.user_id
    from public.reposts r
    join public.posts p on p.id = r.post_id
    where p.status = 'visible' and p.community_id is null
      and p.author_id <> v_uid and r.created_at <= v_ranked_at
      and exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = r.user_id)
      and public.internal_profile_visible(r.user_id, v_uid)
      and not public.internal_blocked_either(v_uid, r.user_id)
      and not exists (select 1 from public.muted_users m where m.user_id = v_uid and m.muted_user_id = r.user_id)
      and campusconnect_private.internal_security_post_visible_to(p.id, v_uid)
  ),
  latest_activity as (
    select distinct on (pa.id) pa.id, pa.activity_at, pa.reposter_id
    from post_activity pa
    order by pa.id, pa.activity_at desc, pa.reposter_id
  ),
  recent_interactions as (
    select l.post_id from public.post_likes l
    where l.user_id = v_uid and l.created_at >= v_ranked_at - interval '30 days'
    union
    select c.post_id from public.comments c
    where c.author_id = v_uid and c.status = 'visible' and c.created_at >= v_ranked_at - interval '30 days'
    union
    select s.post_id from public.post_saves s
    where s.user_id = v_uid and s.created_at >= v_ranked_at - interval '30 days'
    union
    select r.post_id from public.reposts r
    where r.user_id = v_uid and r.created_at >= v_ranked_at - interval '30 days'
  ),
  scored as (
    select
      p.id, p.author_id, p.body, p.created_at, p.edited_at,
      p.like_count, p.comment_count, p.repost_count,
      exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = v_uid) as liked_by_me,
      exists (select 1 from public.reposts r where r.post_id = p.id and r.user_id = v_uid) as reposted_by_me,
      author.username, author.display_name, author.avatar_path,
      latest.activity_at, reposter.username as reposter_username, reposter.display_name as reposter_name,
      case v_variant
        when 'chronological' then 0::double precision
        when 'trending' then greatest(p.hot_score, 0)
        else greatest(p.hot_score, 0)
          + case when exists (
              select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = p.author_id
            ) then config.follow_affinity else 0 end
          + case when exists (
              select 1 from recent_interactions ri where ri.post_id = p.id
            ) then config.interaction_affinity else 0 end
          + case when v_institution is not null and author.institution_id = v_institution
            then config.institution_affinity else 0 end
          + case when nullif(btrim(author.department), '') is not null
              and lower(author.department) = lower(coalesce(
                (select viewer.department from public.profiles viewer where viewer.id = v_uid), ''
              ))
            then config.department_affinity else 0 end
      end::double precision as rank_score,
      config.author_post_limit
    from latest_activity latest
    join public.posts p on p.id = latest.id
    join public.profiles author on author.id = p.author_id
    left join public.profiles reposter on reposter.id = latest.reposter_id
    cross join config
    where not exists (
        select 1 from public.post_views views
        where views.user_id = v_uid and views.post_id = p.id
      )
      and not exists (
        select 1 from public.muted_users muted
        where muted.user_id = v_uid and muted.muted_user_id = p.author_id
      )
      and (not v_used_campus_fallback or author.institution_id = v_institution)
      and (
        latest.reposter_id is null
        or not exists (
          select 1 from public.muted_users muted
          where muted.user_id = v_uid and muted.muted_user_id = latest.reposter_id
        )
      )
      and (
        p_before_score is null
        or (case when v_variant = 'chronological' then 0::double precision
            else greatest(p.hot_score, 0)
              + case when v_variant = 'ranked' and exists (
                  select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = p.author_id
                ) then config.follow_affinity else 0 end
              + case when v_variant = 'ranked' and exists (
                  select 1 from recent_interactions ri where ri.post_id = p.id
                ) then config.interaction_affinity else 0 end
              + case when v_variant = 'ranked' and v_institution is not null and author.institution_id = v_institution
                then config.institution_affinity else 0 end
              + case when v_variant = 'ranked' and nullif(btrim(author.department), '') is not null
                  and lower(author.department) = lower(coalesce(
                    (select viewer.department from public.profiles viewer where viewer.id = v_uid), ''
                  ))
                then config.department_affinity else 0 end
           end, latest.activity_at, p.id) < (p_before_score, p_before, p_before_id)
      )
  ),
  diverse as (
    select scored.*,
      row_number() over (
        partition by scored.author_id
        order by scored.rank_score desc, scored.activity_at desc, scored.id desc
      ) as author_position
    from scored
  )
  select d.id, d.author_id, d.body, d.created_at, d.edited_at,
    d.like_count, d.comment_count, d.repost_count,
    d.liked_by_me, d.reposted_by_me,
    d.username, d.display_name, d.avatar_path,
    d.activity_at, d.reposter_username, d.reposter_name,
    d.rank_score, v_ranked_at, v_variant
  from diverse d
  where d.author_position <= d.author_post_limit
  order by d.rank_score desc, d.activity_at desc, d.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end
$function$;
revoke all on function public.get_ranked_feed(double precision,timestamptz,uuid,timestamptz,text,integer)
  from public, anon, authenticated;
grant execute on function public.get_ranked_feed(double precision,timestamptz,uuid,timestamptz,text,integer) to authenticated;

create or replace function public.feed_posts(
  p_scope text default 'all', p_before timestamptz default null,
  p_before_id uuid default null, p_limit integer default 20
)
returns table (
  id uuid, author_id uuid, body text, created_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, repost_count integer,
  liked_by_me boolean, reposted_by_me boolean,
  username text, display_name text, avatar_path text,
  activity_at timestamptz, reposter_username text, reposter_name text
)
language sql stable security invoker set search_path = ''
as $function$
  with items as (
    select p.id, p.created_at as activity_at, null::uuid as reposter_id
    from public.posts p
    where p.status = 'visible' and p.community_id is null
      and (p_scope = 'all'
        or (p_scope = 'following' and exists (
          select 1 from public.follows f
          where f.follower_id = (select auth.uid()) and f.followee_id = p.author_id
        ))
        or (p_scope = 'institution' and exists (
          select 1 from public.profiles author
          where author.id = p.author_id and author.institution_id = (select public.current_institution_id())
        )))
    union all
    select p.id, r.created_at, r.user_id
    from public.reposts r
    join public.posts p on p.id = r.post_id
    where p_scope = 'following' and p.status = 'visible' and p.community_id is null
      and exists (
        select 1 from public.follows f
        where f.follower_id = (select auth.uid()) and f.followee_id = r.user_id
      )
  ), latest as (
    select distinct on (i.id) i.id, i.activity_at, i.reposter_id
    from items i order by i.id, i.activity_at desc
  )
  select p.id, p.author_id, p.body, p.created_at, p.edited_at,
    p.like_count, p.comment_count, p.repost_count,
    exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
    exists (select 1 from public.reposts r where r.post_id = p.id and r.user_id = (select auth.uid())),
    author.username, author.display_name, author.avatar_path,
    latest.activity_at, reposter.username, reposter.display_name
  from latest
  join public.posts p on p.id = latest.id
  join public.profiles author on author.id = p.author_id
  left join public.profiles reposter on reposter.id = latest.reposter_id
  where not exists (
      select 1 from public.muted_users muted
      where muted.user_id = (select auth.uid()) and muted.muted_user_id = p.author_id
    )
    and (latest.reposter_id is null or not exists (
      select 1 from public.muted_users muted
      where muted.user_id = (select auth.uid()) and muted.muted_user_id = latest.reposter_id
    ))
    and (p_before is null or (latest.activity_at, p.id) < (
      p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
    ))
  order by latest.activity_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$function$;

create or replace function public.feed_timeline(
  p_scope text default 'all',
  p_before timestamptz default null,
  p_before_type text default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns table (item_type text, item_id uuid, activity_at timestamptz, item jsonb)
language sql stable security invoker set search_path = ''
as $function$
  with post_activity as (
    select p.id, p.created_at as activity_at, null::uuid as reposter_id
    from public.posts p
    where p.status = 'visible' and p.community_id is null
      and (p_scope = 'all'
        or (p_scope = 'following' and exists (
          select 1 from public.follows f
          where f.follower_id = (select auth.uid()) and f.followee_id = p.author_id
        ))
        or (p_scope = 'institution' and exists (
          select 1 from public.profiles author
          where author.id = p.author_id and author.institution_id = (select public.current_institution_id())
        )))
    union all
    select p.id, r.created_at, r.user_id
    from public.reposts r
    join public.posts p on p.id = r.post_id
    where p_scope = 'following' and p.status = 'visible' and p.community_id is null
      and exists (
        select 1 from public.follows f
        where f.follower_id = (select auth.uid()) and f.followee_id = r.user_id
      )
  ),
  latest_posts as (
    select distinct on (activity.id) activity.id, activity.activity_at, activity.reposter_id
    from post_activity activity
    order by activity.id, activity.activity_at desc
  ),
  post_items as (
    select 'post'::text as item_type, p.id as item_id, latest.activity_at,
      jsonb_build_object(
        'id', p.id, 'author_id', p.author_id, 'body', p.body, 'created_at', p.created_at,
        'edited_at', p.edited_at, 'like_count', p.like_count, 'comment_count', p.comment_count,
        'repost_count', p.repost_count,
        'liked_by_me', exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
        'reposted_by_me', exists (select 1 from public.reposts r where r.post_id = p.id and r.user_id = (select auth.uid())),
        'username', author.username, 'display_name', author.display_name, 'avatar_path', author.avatar_path,
        'activity_at', latest.activity_at, 'reposter_username', reposter.username, 'reposter_name', reposter.display_name
      ) as item
    from latest_posts latest
    join public.posts p on p.id = latest.id
    join public.profiles author on author.id = p.author_id
    left join public.profiles reposter on reposter.id = latest.reposter_id
    where not exists (
        select 1 from public.muted_users muted
        where muted.user_id = (select auth.uid()) and muted.muted_user_id = p.author_id
      )
      and (latest.reposter_id is null or not exists (
        select 1 from public.muted_users muted
        where muted.user_id = (select auth.uid()) and muted.muted_user_id = latest.reposter_id
      ))
  ),
  celebration_items as (
    select 'celebration'::text as item_type, c.id as item_id, c.published_at as activity_at,
      jsonb_build_object(
        'id', c.id, 'title', c.title, 'category', c.category, 'celebrant_name', c.celebrant_name,
        'celebration_at', c.celebration_at, 'timezone', c.timezone, 'message', c.message,
        'venue', c.venue, 'whiteshirt_url', c.whiteshirt_url, 'template_id', c.template_id,
        'customization', c.customization, 'photo_path', c.photo_path,
        'created_at', c.created_at, 'published_at', c.published_at,
        'creator_name', coalesce(author.display_name, 'CampusConnect student'),
        'creator_username', author.username
      ) as item
    from public.celebration_cards c
    left join public.profiles author on author.id = c.owner_id
    where p_scope = 'all' and c.status = 'published'
      and not exists (
        select 1 from public.muted_users muted
        where muted.user_id = (select auth.uid()) and muted.muted_user_id = c.owner_id
      )
  ),
  timeline as (
    select * from post_items
    union all
    select * from celebration_items
  )
  select t.item_type, t.item_id, t.activity_at, t.item
  from timeline t
  where p_before is null or (t.activity_at, t.item_type, t.item_id) < (
    p_before, coalesce(p_before_type, 'post'),
    coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
  )
  order by t.activity_at desc, t.item_type desc, t.item_id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$function$;

commit;
