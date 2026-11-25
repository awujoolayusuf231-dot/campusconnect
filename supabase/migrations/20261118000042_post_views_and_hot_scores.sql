begin;

do $preflight$
begin
  if to_regclass('public.posts') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.post_likes') is null
     or to_regclass('public.comments') is null
     or to_regclass('public.post_saves') is null
     or to_regclass('public.reposts') is null
     or to_regprocedure('campusconnect_private.internal_security_post_visible_to(uuid,uuid)') is null
     or to_regprocedure('public.effective_status_internal(uuid)') is null
     or to_regclass('cron.job') is null then
    raise exception 'Feed views and hot scores require social interactions, visibility helpers, and pg_cron';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'hot_score'
  ) or to_regclass('public.post_views') is not null
     or to_regclass('public.feed_ranking_config') is not null then
    raise exception 'Feed view or hot-score objects already exist; reconcile schema drift before applying';
  end if;
end
$preflight$;

alter table public.posts
  add column hot_score double precision not null default 0 check (hot_score >= 0);

create index posts_hot_score_idx
  on public.posts (hot_score desc, created_at desc, id desc)
  where status = 'visible' and community_id is null;

create table public.post_views (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  seen_at timestamptz not null default now(),
  dwell_ms bigint not null default 0 check (dwell_ms >= 0),
  primary key (user_id, post_id)
);
create index post_views_user_seen_idx on public.post_views (user_id, seen_at desc, post_id);
create index post_views_post_seen_idx on public.post_views (post_id, seen_at desc);
alter table public.post_views enable row level security;
revoke all on table public.post_views from public, anon, authenticated;
grant select on table public.post_views to authenticated;
create policy post_views_select_own on public.post_views
  for select to authenticated using (user_id = (select auth.uid()));

create table public.feed_ranking_config (
  singleton boolean primary key default true check (singleton),
  like_weight double precision not null check (like_weight >= 0),
  comment_weight double precision not null check (comment_weight >= 0),
  save_weight double precision not null check (save_weight >= 0),
  repost_weight double precision not null check (repost_weight >= 0),
  follow_affinity double precision not null check (follow_affinity >= 0),
  interaction_affinity double precision not null check (interaction_affinity >= 0),
  institution_affinity double precision not null check (institution_affinity >= 0),
  department_affinity double precision not null check (department_affinity >= 0),
  new_user_days integer not null check (new_user_days between 1 and 365),
  author_post_limit integer not null check (author_post_limit between 1 and 10)
);
insert into public.feed_ranking_config (
  singleton, like_weight, comment_weight, save_weight, repost_weight,
  follow_affinity, interaction_affinity, institution_affinity, department_affinity,
  new_user_days, author_post_limit
) values (true, 1, 3, 3, 4, 0.5, 0.35, 0.2, 0.25, 30, 2);
alter table public.feed_ranking_config enable row level security;
revoke all on table public.feed_ranking_config from public, anon, authenticated;

create function public.record_post_views(p_post_ids uuid[], p_dwell_ms integer[])
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_view record;
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not coalesce(public.effective_status_internal(v_uid) in ('active', 'restricted'), false) then
    return;
  end if;
  if coalesce(cardinality(p_post_ids), 0) = 0 then return; end if;
  if cardinality(p_post_ids) > 50
     or p_dwell_ms is null
     or cardinality(p_post_ids) <> cardinality(p_dwell_ms) then
    raise exception 'invalid_view_batch' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('feed_post_views:' || v_uid::text, 0));
  if (
    select count(*) from public.post_views
    where user_id = v_uid and seen_at > now() - interval '1 minute'
  ) >= 120 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  for v_view in
    select batch.post_id,
      least(sum(greatest(coalesce(batch.dwell_ms, 0), 0)::bigint), 600000)::integer as dwell_ms
    from unnest(p_post_ids, p_dwell_ms) as batch(post_id, dwell_ms)
    where batch.post_id is not null
    group by batch.post_id
  loop
    if campusconnect_private.internal_security_post_visible_to(v_view.post_id, v_uid)
       and exists (
         select 1 from public.posts p
         where p.id = v_view.post_id and p.community_id is null and p.author_id <> v_uid
       ) then
      insert into public.post_views (user_id, post_id, seen_at, dwell_ms)
      values (v_uid, v_view.post_id, now(), v_view.dwell_ms)
      on conflict (user_id, post_id) do update
      set seen_at = excluded.seen_at,
          dwell_ms = least(public.post_views.dwell_ms + excluded.dwell_ms, 86400000);
    end if;
  end loop;
end
$function$;
revoke all on function public.record_post_views(uuid[], integer[]) from public, anon, authenticated;
grant execute on function public.record_post_views(uuid[], integer[]) to authenticated;

create function public.refresh_post_hot_score(p_post_id uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  update public.posts p
  set hot_score = (
    select (
      coalesce(likes.count, 0) * config.like_weight
      + coalesce(comments.count, 0) * config.comment_weight
      + coalesce(saves.count, 0) * config.save_weight
      + coalesce(reposts.count, 0) * config.repost_weight
    ) / power(
      greatest(extract(epoch from (statement_timestamp() - p.created_at)) / 3600.0, 0.0) + 2.0,
      1.5
    )
    from public.feed_ranking_config config
    left join lateral (
      select count(*) as count from public.post_likes l where l.post_id = p.id
    ) likes on true
    left join lateral (
      select count(*) as count from public.comments c where c.post_id = p.id and c.status = 'visible'
    ) comments on true
    left join lateral (
      select count(*) as count from public.post_saves s where s.post_id = p.id
    ) saves on true
    left join lateral (
      select count(*) as count from public.reposts r where r.post_id = p.id
    ) reposts on true
    where config.singleton
  )
  where (p_post_id is null or p.id = p_post_id)
    and p.community_id is null;
end
$function$;
revoke all on function public.refresh_post_hot_score(uuid) from public, anon, authenticated;

create function public.refresh_post_hot_score_on_engagement()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare
  v_post_id uuid := coalesce(new.post_id, old.post_id);
begin
  perform public.refresh_post_hot_score(v_post_id);
  return null;
end
$function$;
revoke all on function public.refresh_post_hot_score_on_engagement() from public, anon, authenticated;

create trigger post_likes_refresh_hot_score
after insert or delete on public.post_likes
for each row execute function public.refresh_post_hot_score_on_engagement();
create trigger comments_refresh_hot_score
after insert or update of status or delete on public.comments
for each row execute function public.refresh_post_hot_score_on_engagement();
create trigger post_saves_refresh_hot_score
after insert or delete on public.post_saves
for each row execute function public.refresh_post_hot_score_on_engagement();
create trigger reposts_refresh_hot_score
after insert or delete on public.reposts
for each row execute function public.refresh_post_hot_score_on_engagement();

create function public.refresh_post_hot_score_after_post_write()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  perform public.refresh_post_hot_score(new.id);
  return null;
end
$function$;
revoke all on function public.refresh_post_hot_score_after_post_write() from public, anon, authenticated;
create trigger posts_refresh_hot_score
after insert or update of status, created_at, community_id on public.posts
for each row execute function public.refresh_post_hot_score_after_post_write();

create function public.refresh_post_hot_scores()
returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  perform public.refresh_post_hot_score(null);
end
$function$;
revoke all on function public.refresh_post_hot_scores() from public, anon, authenticated;

select public.refresh_post_hot_scores();

select cron.schedule(
  'campusconnect-refresh-hot-scores',
  '*/10 * * * *',
  'select public.refresh_post_hot_scores();'
);

commit;
