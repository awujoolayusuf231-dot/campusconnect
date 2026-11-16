-- Add a bounded creator-exposure fairness signal to the existing ranked feed.
-- Manual review only. Do not apply until the live schema has been reconciled.
begin;

do $preflight$
begin
  if to_regclass('public.posts') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.follows') is null
     or to_regclass('public.reposts') is null
     or to_regclass('public.platform_settings') is null
     or to_regclass('public.post_impression_daily') is null
     or to_regprocedure('public.internal_post_visible_to(uuid,uuid)') is null
     or to_regprocedure('public.internal_profile_visible(uuid,uuid)') is null
     or to_regprocedure('public.internal_blocked_either(uuid,uuid)') is null
     or to_regprocedure('public.effective_status_internal(uuid)') is null
     or to_regprocedure('public.internal_smart_feed_weight(text,double precision,double precision,double precision)') is null
     or to_regprocedure('public.feed_ranked_posts(double precision,timestamptz,uuid,timestamptz,integer)') is null
     or exists (
       select 1
       from (values
         ('posts', 'id'), ('posts', 'author_id'), ('posts', 'body'), ('posts', 'created_at'),
         ('posts', 'edited_at'), ('posts', 'status'), ('posts', 'community_id'),
         ('posts', 'like_count'), ('posts', 'comment_count'), ('posts', 'repost_count'),
         ('profiles', 'id'), ('profiles', 'username'), ('profiles', 'display_name'),
         ('profiles', 'avatar_path'), ('profiles', 'institution_id'),
         ('follows', 'follower_id'), ('follows', 'followee_id'),
         ('reposts', 'post_id'), ('reposts', 'user_id'), ('reposts', 'created_at'),
         ('post_likes', 'post_id'), ('post_likes', 'user_id'),
         ('post_impression_daily', 'post_id'), ('post_impression_daily', 'day'),
         ('post_impression_daily', 'impressions')
       ) as required(table_name, column_name)
       where not exists (
         select 1 from information_schema.columns c
         where c.table_schema = 'public'
           and c.table_name = required.table_name
           and c.column_name = required.column_name
       )
     ) then
    raise exception 'Fair ranked-feed prerequisites are missing; reconcile the live feed and analytics schema first';
  end if;
end;
$preflight$;

insert into public.platform_settings (key, value, value_type, description, is_public)
values (
  'smart_feed_fairness_weight',
  '0.75'::jsonb,
  'number',
  'Smart feed boost for creators with lower recent exposure; range 0 to 3.',
  false
)
on conflict (key) do nothing;

create or replace function public.feed_ranked_posts(
  p_before_score double precision default null,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_as_of timestamptz default null,
  p_limit integer default 20
)
returns table (
  id uuid, author_id uuid, body text, created_at timestamptz, edited_at timestamptz,
  like_count int, comment_count int, repost_count int,
  liked_by_me boolean, reposted_by_me boolean,
  username text, display_name text, avatar_path text,
  activity_at timestamptz, reposter_username text, reposter_name text,
  rank_score double precision, ranked_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_ranked_at timestamptz := least(coalesce(p_as_of, now()), now());
  v_institution uuid;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if not coalesce(public.effective_status_internal(v_uid) in ('active', 'restricted'), false) then return; end if;
  if p_before_score is not null and (p_before is null or p_before_id is null or p_as_of is null) then
    raise exception 'invalid_cursor' using errcode = '22023';
  end if;
  if p_before_score is null and (p_before is not null or p_before_id is not null) then
    raise exception 'invalid_cursor' using errcode = '22023';
  end if;

  select pr.institution_id into v_institution
  from public.profiles pr where pr.id = v_uid;

  return query
  with weights as (
    select
      public.internal_smart_feed_weight('smart_feed_following_weight', 2.0, 0.0, 10.0) as following_weight,
      public.internal_smart_feed_weight('smart_feed_institution_weight', 1.0, 0.0, 10.0) as institution_weight,
      public.internal_smart_feed_weight('smart_feed_engagement_weight', 0.75, 0.0, 3.0) as engagement_weight,
      public.internal_smart_feed_weight('smart_feed_recency_weight', 1.0, 0.0, 5.0) as recency_weight,
      public.internal_smart_feed_weight('smart_feed_half_life_hours', 48.0, 6.0, 336.0) as half_life_hours,
      public.internal_smart_feed_weight('smart_feed_fairness_weight', 0.75, 0.0, 3.0) as fairness_weight
  ),
  creator_exposure as (
    select p.author_id, sum(d.impressions)::double precision as impressions
    from public.post_impression_daily d
    join public.posts p on p.id = d.post_id
    where d.day >= (v_ranked_at at time zone 'Africa/Lagos')::date - 7
      and d.day < (v_ranked_at at time zone 'Africa/Lagos')::date
    group by p.author_id
  ),
  post_activity as (
    select p.id, p.created_at as activity_at, null::uuid as reposter_id
    from public.posts p
    where p.status = 'visible' and p.community_id is null
      and p.author_id <> v_uid and p.created_at <= v_ranked_at
      and public.internal_post_visible_to(p.id, v_uid)
    union all
    select p.id, r.created_at, r.user_id
    from public.reposts r
    join public.posts p on p.id = r.post_id
    where p.status = 'visible' and p.community_id is null
      and p.author_id <> v_uid and r.created_at <= v_ranked_at
      and exists (
        select 1 from public.follows f
        where f.follower_id = v_uid and f.followee_id = r.user_id
      )
      and public.internal_profile_visible(r.user_id, v_uid)
      and not coalesce(public.internal_blocked_either(v_uid, r.user_id), true)
      and public.internal_post_visible_to(p.id, v_uid)
  ),
  latest_activity as (
    select distinct on (pa.id) pa.id, pa.activity_at, pa.reposter_id
    from post_activity pa
    order by pa.id, pa.activity_at desc, pa.reposter_id
  ),
  scored as (
    select
      p.id, p.author_id, p.body, p.created_at, p.edited_at,
      p.like_count, p.comment_count, p.repost_count,
      exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = v_uid) as liked_by_me,
      exists (select 1 from public.reposts r where r.post_id = p.id and r.user_id = v_uid) as reposted_by_me,
      author.username, author.display_name, author.avatar_path,
      latest.activity_at, reposter.username as reposter_username, reposter.display_name as reposter_name,
      (
        case when exists (
          select 1 from public.follows f
          where f.follower_id = v_uid and f.followee_id = p.author_id
        ) then w.following_weight else 0 end
        + case when v_institution is not null and author.institution_id = v_institution
          then w.institution_weight else 0 end
        + w.engagement_weight * ln(
          1.0 + greatest(p.like_count, 0) + 2.0 * greatest(p.comment_count, 0) + 3.0 * greatest(p.repost_count, 0)
        )
        + w.recency_weight * exp(
          -greatest(extract(epoch from (v_ranked_at - latest.activity_at)) / 3600.0, 0.0) / w.half_life_hours
        )
        + w.fairness_weight / (
          1.0 + ln(1.0 + greatest(coalesce(exposure.impressions, 0.0), 0.0))
        )
      )::double precision as rank_score
    from latest_activity latest
    join public.posts p on p.id = latest.id
    join public.profiles author on author.id = p.author_id
    left join public.profiles reposter on reposter.id = latest.reposter_id
    left join creator_exposure exposure on exposure.author_id = p.author_id
    cross join weights w
  )
  select s.id, s.author_id, s.body, s.created_at, s.edited_at,
    s.like_count, s.comment_count, s.repost_count,
    s.liked_by_me, s.reposted_by_me,
    s.username, s.display_name, s.avatar_path,
    s.activity_at, s.reposter_username, s.reposter_name,
    s.rank_score, v_ranked_at
  from scored s
  where p_before_score is null
     or (s.rank_score, s.activity_at, s.id) < (p_before_score, p_before, p_before_id)
  order by s.rank_score desc, s.activity_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end $$;

revoke all on function public.feed_ranked_posts(double precision,timestamptz,uuid,timestamptz,integer)
  from public, anon, authenticated;
grant execute on function public.feed_ranked_posts(double precision,timestamptz,uuid,timestamptz,integer)
  to authenticated;

commit;
