-- Private account analytics and visibility-qualified comment impressions.
begin;

do $preflight$
begin
  if to_regclass('public.comments') is null
     or to_regclass('public.posts') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.profile_view_daily') is null
     or to_regclass('public.profile_viewer_day') is null
     or to_regclass('public.post_impression_daily') is null
     or to_regclass('public.comment_reposts') is null
     or to_regclass('public.comment_likes') is null
     or to_regprocedure('public.internal_post_visible_to(uuid,uuid)') is null
     or to_regprocedure('public.internal_profile_visible(uuid,uuid)') is null
     or to_regprocedure('public.internal_blocked_either(uuid,uuid)') is null
     or to_regprocedure('public.internal_setting_int(text,integer,integer,integer)') is null
     or to_regprocedure('public.internal_lagos_day(timestamp with time zone)') is null
     or to_regprocedure('public.internal_min_viewers()') is null then
    raise exception 'Private social analytics require the social visibility and analytics foundations';
  end if;
  if not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'posts' and column_name = 'impression_count'
     )
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'posts' and column_name = 'view_count'
     )
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'comments' and column_name = 'parent_comment_id'
     )
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'comments' and column_name = 'like_count'
     )
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'comments' and column_name = 'repost_count'
     ) then
    raise exception 'Private social analytics require migration 20261116000036_social_post_interactions_metrics.sql';
  end if;
end
$preflight$;

lock table public.profile_view_daily in share row exclusive mode;

create table public.profile_analytics_totals (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  profile_views bigint not null default 0 check (profile_views >= 0)
);
alter table public.profile_analytics_totals enable row level security;
revoke all on table public.profile_analytics_totals from public, anon, authenticated;

insert into public.profile_analytics_totals (profile_id, profile_views)
select profile_id, sum(views)::bigint
from public.profile_view_daily
group by profile_id
on conflict (profile_id) do update set profile_views = excluded.profile_views;

create function public.sync_profile_analytics_totals() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  v_delta bigint;
begin
  if tg_op = 'INSERT' then
    v_delta := new.views;
  else
    v_delta := new.views - old.views;
  end if;
  if v_delta > 0 then
    insert into public.profile_analytics_totals (profile_id, profile_views)
    values (new.profile_id, v_delta)
    on conflict (profile_id) do update
      set profile_views = public.profile_analytics_totals.profile_views + excluded.profile_views;
  end if;
  return null;
end
$function$;
create trigger profile_view_lifetime_totals
after insert or update of views on public.profile_view_daily
for each row execute function public.sync_profile_analytics_totals();

create table public.comment_impression_seen (
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  window_start timestamptz not null,
  day date not null,
  first_seen_at timestamptz not null default now(),
  primary key (viewer_id, comment_id, window_start)
);
create index comment_impression_seen_viewer_day_idx
  on public.comment_impression_seen (viewer_id, day);
create index comment_impression_seen_day_idx
  on public.comment_impression_seen (day);

create table public.comment_viewer_day (
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  day date not null,
  primary key (viewer_id, comment_id, day)
);
create index comment_viewer_day_day_idx on public.comment_viewer_day (day);

create table public.comment_impression_daily (
  comment_id uuid not null references public.comments(id) on delete cascade,
  day date not null,
  impressions bigint not null default 0 check (impressions >= 0),
  unique_viewers bigint not null default 0 check (unique_viewers >= 0),
  primary key (comment_id, day)
);
create index comment_impression_daily_day_idx on public.comment_impression_daily (day);

create table public.comment_analytics_totals (
  comment_id uuid primary key references public.comments(id) on delete cascade,
  impressions bigint not null default 0 check (impressions >= 0),
  views bigint not null default 0 check (views >= 0)
);

alter table public.comment_impression_seen enable row level security;
alter table public.comment_viewer_day enable row level security;
alter table public.comment_impression_daily enable row level security;
alter table public.comment_analytics_totals enable row level security;
revoke all on table public.comment_impression_seen, public.comment_viewer_day,
  public.comment_impression_daily, public.comment_analytics_totals
  from public, anon, authenticated;

create function public.record_comment_impressions(p_comment_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
  v_max integer := public.internal_setting_int('impression_batch_max', 50, 1, 100);
  v_win integer := public.internal_setting_int('impression_window_minutes', 30, 1, 1440);
  v_rate integer := public.internal_setting_int('impression_rate_per_minute', 120, 1, 1000);
  v_cap integer := public.internal_setting_int('impression_daily_cap_per_viewer', 3000, 10, 100000);
  v_keep integer := greatest(public.internal_setting_int('analytics_dedupe_retention_days', 35, 7, 90), 7);
  v_window timestamptz := date_bin(make_interval(mins => v_win), now(), timestamptz '2000-01-01 00:00:00+00');
  v_day date := public.internal_lagos_day(now());
  v_day_start timestamptz := (v_day::timestamp at time zone 'Africa/Lagos');
  v_id uuid;
  v_post uuid;
  v_author uuid;
  v_n integer;
  v_new_viewer integer;
  v_minute_count integer;
  v_day_count integer;
  v_remaining integer;
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_comment_ids is null or cardinality(p_comment_ids) = 0 then
    return;
  end if;
  if cardinality(p_comment_ids) > v_max then
    raise exception 'too_many' using errcode = '22023';
  end if;
  if not coalesce(public.effective_status_internal(v_uid) in ('active', 'restricted'), false) then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('comment_impressions:' || v_uid::text, 0));
  delete from public.comment_impression_seen
  where viewer_id = v_uid and day < v_day - v_keep;
  delete from public.comment_viewer_day
  where viewer_id = v_uid and day < v_day - v_keep;

  select count(*) into v_minute_count
  from public.comment_impression_seen
  where viewer_id = v_uid and first_seen_at > now() - interval '1 minute';
  select count(*) into v_day_count
  from public.comment_impression_seen
  where viewer_id = v_uid and first_seen_at >= v_day_start;
  v_remaining := least(v_rate - v_minute_count, v_cap - v_day_count);
  if v_remaining <= 0 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  for v_id in
    select distinct x from unnest(p_comment_ids) as x where x is not null order by x
  loop
    select c.post_id, c.author_id into v_post, v_author
    from public.comments c
    join public.posts p on p.id = c.post_id
    where c.id = v_id and c.status = 'visible' and p.status = 'visible'
      and public.internal_post_visible_to(p.id, v_uid);
    if v_post is null or v_author = v_uid
       or not public.internal_profile_visible(v_author, v_uid)
       or public.internal_blocked_either(v_uid, v_author) then
      continue;
    end if;

    insert into public.comment_impression_seen (viewer_id, comment_id, window_start, day)
    values (v_uid, v_id, v_window, v_day)
    on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      continue;
    end if;

    v_remaining := v_remaining - 1;
    insert into public.comment_viewer_day (viewer_id, comment_id, day)
    values (v_uid, v_id, v_day)
    on conflict do nothing;
    get diagnostics v_new_viewer = row_count;

    insert into public.comment_impression_daily (comment_id, day, impressions, unique_viewers)
    values (v_id, v_day, 1, v_new_viewer)
    on conflict (comment_id, day) do update
      set impressions = public.comment_impression_daily.impressions + 1,
          unique_viewers = public.comment_impression_daily.unique_viewers + excluded.unique_viewers;

    insert into public.comment_analytics_totals (comment_id, impressions, views)
    values (v_id, 1, v_new_viewer)
    on conflict (comment_id) do update
      set impressions = public.comment_analytics_totals.impressions + 1,
          views = public.comment_analytics_totals.views + excluded.views;

    if v_remaining <= 0 then
      exit;
    end if;
  end loop;
end
$function$;

create function public.my_social_analytics(p_days integer default 28)
returns table (
  profile_views bigint,
  profile_views_28d bigint,
  profile_unique_viewers_28d bigint,
  post_impressions bigint,
  comment_impressions bigint,
  total_impressions bigint,
  post_views bigint,
  comment_views bigint,
  total_views bigint,
  post_likes bigint,
  comment_likes bigint,
  total_likes bigint,
  comments_received bigint,
  replies_received bigint,
  post_reposts bigint,
  comment_reshares bigint,
  total_engagement bigint
)
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
  v_days integer := least(greatest(coalesce(p_days, 28), 1), 28);
  v_min integer := public.internal_min_viewers();
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with my_posts as (
    select p.id, p.like_count, p.impression_count, p.view_count, p.repost_count
    from public.posts p
    where p.author_id = v_uid and p.status <> 'deleted'
  ),
  my_comments as (
    select c.id, c.post_id, c.like_count, c.repost_count
    from public.comments c
    join public.posts p on p.id = c.post_id
    where (c.author_id = v_uid or p.author_id = v_uid)
      and c.status <> 'deleted' and p.status <> 'deleted'
  ),
  profile_window as (
    select
      coalesce(sum(d.views), 0)::bigint as views,
      count(distinct s.viewer_id)::bigint as unique_viewers
    from public.profile_view_daily d
    left join public.profile_viewer_day s
      on s.profile_id = d.profile_id and s.day = d.day
    where d.profile_id = v_uid
      and d.day > public.internal_lagos_day(now()) - v_days
      and d.unique_viewers >= v_min
  ),
  post_totals as (
    select
      coalesce(sum(p.impression_count), 0)::bigint as impressions,
      coalesce(sum(p.view_count), 0)::bigint as views,
      coalesce(sum(p.like_count), 0)::bigint as likes,
      coalesce(sum(p.repost_count), 0)::bigint as reposts
    from my_posts p
  ),
  comment_totals as (
    select
      coalesce(sum(m.impressions), 0)::bigint as impressions,
      coalesce(sum(m.views), 0)::bigint as views,
      coalesce(sum(c.like_count), 0)::bigint as likes,
      coalesce(sum(c.repost_count), 0)::bigint as reshares
    from my_comments c
    left join public.comment_analytics_totals m on m.comment_id = c.id
  ),
  received_comments as (
    select count(*)::bigint as total
    from public.comments c
    join public.posts p on p.id = c.post_id
    where p.author_id = v_uid and p.status <> 'deleted'
      and c.author_id <> v_uid and c.status = 'visible'
  ),
  received_replies as (
    select count(*)::bigint as total
    from public.comments child
    join public.comments parent on parent.id = child.parent_comment_id
    join public.posts p on p.id = parent.post_id
    where parent.author_id = v_uid and p.author_id <> v_uid
      and child.author_id <> v_uid
      and parent.status = 'visible' and child.status = 'visible' and p.status = 'visible'
  ),
  profile_total as (
    select coalesce(t.profile_views, 0)::bigint as views
    from (select 1) seed
    left join public.profile_analytics_totals t on t.profile_id = v_uid
  )
  select
    pt.views,
    pw.views,
    case when pw.unique_viewers >= v_min then pw.unique_viewers else null end,
    pots.impressions,
    cts.impressions,
    pots.impressions + cts.impressions,
    pots.views,
    cts.views,
    pots.views + cts.views,
    pots.likes,
    cts.likes,
    pots.likes + cts.likes,
    rc.total,
    rr.total,
    pots.reposts,
    cts.reshares,
    pots.likes + cts.likes + rc.total + rr.total + pots.reposts + cts.reshares
  from profile_total pt
  cross join profile_window pw
  cross join post_totals pots
  cross join comment_totals cts
  cross join received_comments rc
  cross join received_replies rr;
end
$function$;

create function public.my_comment_analytics(p_comment_ids uuid[])
returns table (comment_id uuid, impressions bigint, views bigint)
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_comment_ids is null or cardinality(p_comment_ids) = 0 then
    return;
  end if;
  if cardinality(p_comment_ids) > 100 then
    raise exception 'too_many' using errcode = '22023';
  end if;

  return query
  select c.id, coalesce(t.impressions, 0), coalesce(t.views, 0)
  from public.comments c
  join public.posts p on p.id = c.post_id
  left join public.comment_analytics_totals t on t.comment_id = c.id
  where c.id = any(p_comment_ids)
    and c.status = 'visible' and p.status = 'visible'
    and (c.author_id = v_uid or p.author_id = v_uid)
  order by c.id;
end
$function$;

create function public.purge_comment_analytics(
  p_batch integer default 5000,
  p_dedupe_days integer default null,
  p_daily_days integer default 400
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_batch integer := least(greatest(coalesce(p_batch, 5000), 100), 50000);
  v_keep integer := greatest(coalesce(p_dedupe_days,
    public.internal_setting_int('analytics_dedupe_retention_days', 35, 7, 90)), 7);
  v_daily integer := greatest(coalesce(p_daily_days, 400), 90);
  v_today date := public.internal_lagos_day(now());
  v_seen bigint;
  v_viewers bigint;
  v_daily_rows bigint;
begin
  delete from public.comment_impression_seen
  where ctid in (
    select s.ctid from public.comment_impression_seen s
    where s.day < v_today - v_keep limit v_batch
  );
  get diagnostics v_seen = row_count;

  delete from public.comment_viewer_day
  where ctid in (
    select s.ctid from public.comment_viewer_day s
    where s.day < v_today - v_keep limit v_batch
  );
  get diagnostics v_viewers = row_count;

  delete from public.comment_impression_daily
  where ctid in (
    select d.ctid from public.comment_impression_daily d
    where d.day < v_today - v_daily limit v_batch
  );
  get diagnostics v_daily_rows = row_count;

  return jsonb_build_object(
    'comment_impression_seen', v_seen,
    'comment_viewer_day', v_viewers,
    'comment_impression_daily', v_daily_rows,
    'more', greatest(v_seen, v_viewers, v_daily_rows) >= v_batch
  );
end
$function$;

revoke all on function public.sync_profile_analytics_totals(),
  public.record_comment_impressions(uuid[]), public.my_social_analytics(integer),
  public.my_comment_analytics(uuid[]),
  public.purge_comment_analytics(integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_comment_impressions(uuid[]),
  public.my_social_analytics(integer), public.my_comment_analytics(uuid[]) to authenticated;
grant execute on function public.purge_comment_analytics(integer, integer, integer) to service_role;

commit;
