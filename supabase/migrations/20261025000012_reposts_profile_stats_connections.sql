-- 0012 APPLIED to CampusConnect01 as "reposts_profile_stats_connections"; tested: 68 checks, all PASS (rolled back).
-- Adds reposts (+counts, notifications), feed shape with repost data, profile stats, followers/following lists.
alter table public.posts add column repost_count int not null default 0;

create table public.reposts (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index reposts_post_idx on public.reposts (post_id);
create index reposts_user_idx on public.reposts (user_id, created_at desc);

create function public.reposts_count_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then update public.posts set repost_count = repost_count + 1 where id = new.post_id;
  else update public.posts set repost_count = greatest(repost_count - 1, 0) where id = old.post_id; end if;
  return null;
end $$;
create trigger reposts_count after insert or delete on public.reposts for each row execute function public.reposts_count_trg();

alter table public.reposts enable row level security;
grant select on public.reposts to authenticated;
create policy reposts_select on public.reposts for select to authenticated using (
  user_id = (select auth.uid())
  or (exists (select 1 from public.profiles pr where pr.id = reposts.user_id)
      and exists (select 1 from public.posts p where p.id = reposts.post_id)
      and not exists (select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = reposts.user_id)));

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow','like','comment','community_join','message','announcement','moderation_warning','repost'));

create or replace function public.internal_notify(p_user uuid, p_type text, p_actor uuid, p_entity_type text, p_entity uuid, p_dedupe text, p_data jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  if p_user is null or p_user is not distinct from p_actor then return; end if;
  if p_actor is not null and public.internal_blocked_either(p_user, p_actor) then return; end if;
  if public.effective_status_internal(p_user) not in ('active', 'restricted') then return; end if;
  select case p_type when 'follow' then notify_follows when 'like' then notify_likes when 'repost' then notify_likes when 'comment' then notify_comments
                     when 'community_join' then notify_community when 'message' then notify_messages else true end
    into v_ok from public.user_preferences where user_id = p_user;
  if found and v_ok is false then return; end if;
  insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, dedupe_key, data)
  values (p_user, p_type, p_actor, p_entity_type, p_entity, p_dedupe, coalesce(p_data, '{}'::jsonb))
  on conflict (user_id, dedupe_key) do nothing;
end $$;

create function public.notify_on_repost() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  perform public.internal_notify(v_author, 'repost', new.user_id, 'post', new.post_id, 'repost:' || new.post_id || ':' || new.user_id);
  return null;
end $$;
create trigger reposts_notify after insert on public.reposts for each row execute function public.notify_on_repost();

create function public.repost_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_author uuid; v_comm uuid;
begin
  if v_uid is null or not public.account_can_post() then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select count(*) from public.reposts where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001'; end if;
  select author_id, community_id into v_author, v_comm from public.posts where id = p_post and status = 'visible';
  if v_author is null or not public.internal_profile_visible(v_author, v_uid) or public.internal_blocked_either(v_uid, v_author) then
    raise exception 'not_found' using errcode = '22023'; end if;
  if v_author = v_uid then raise exception 'cannot_repost_own' using errcode = '22023'; end if;
  if v_comm is not null then raise exception 'cannot_repost_community_post' using errcode = '22023'; end if;
  insert into public.reposts (user_id, post_id) values (v_uid, p_post) on conflict do nothing;
end $$;

create function public.unrepost_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.reposts where user_id = v_uid and post_id = p_post;
end $$;

drop function public.feed_posts(text, timestamptz, uuid, int);
drop function public.community_posts(uuid, timestamptz, uuid, int);

create function public.feed_posts(p_scope text default 'all', p_before timestamptz default null, p_before_id uuid default null, p_limit int default 20)
returns table (id uuid, author_id uuid, body text, created_at timestamptz, edited_at timestamptz, like_count int, comment_count int, repost_count int,
  liked_by_me boolean, reposted_by_me boolean, username text, display_name text, avatar_path text, activity_at timestamptz, reposter_username text, reposter_name text)
language sql stable security invoker set search_path = '' as $$
  with items as (
    select p.id, p.created_at as activity_at, null::uuid as reposter_id
    from public.posts p join public.profiles pr on pr.id = p.author_id
    where p.status = 'visible' and p.community_id is null
      and (p_scope = 'all'
        or (p_scope = 'following' and exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.followee_id = p.author_id))
        or (p_scope = 'institution' and pr.institution_id is not null and pr.institution_id = (select public.current_institution_id())))
    union all
    select p.id, r.created_at, r.user_id
    from public.reposts r join public.posts p on p.id = r.post_id
    where p_scope = 'following' and p.status = 'visible' and p.community_id is null
      and exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.followee_id = r.user_id)
  ), latest as (
    select distinct on (i.id) i.id, i.activity_at, i.reposter_id from items i order by i.id, i.activity_at desc
  )
  select p.id, p.author_id, p.body, p.created_at, p.edited_at, p.like_count, p.comment_count, p.repost_count,
    exists (select 1 from public.post_likes l2 where l2.post_id = p.id and l2.user_id = (select auth.uid())),
    exists (select 1 from public.reposts r2 where r2.post_id = p.id and r2.user_id = (select auth.uid())),
    pr.username, pr.display_name, pr.avatar_path, l.activity_at, rp.username, rp.display_name
  from latest l join public.posts p on p.id = l.id join public.profiles pr on pr.id = p.author_id left join public.profiles rp on rp.id = l.reposter_id
  where (p_before is null or (l.activity_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by l.activity_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

create function public.community_posts(p_comm uuid, p_before timestamptz default null, p_before_id uuid default null, p_limit int default 20)
returns table (id uuid, author_id uuid, body text, created_at timestamptz, edited_at timestamptz, like_count int, comment_count int, repost_count int,
  liked_by_me boolean, reposted_by_me boolean, username text, display_name text, avatar_path text, activity_at timestamptz, reposter_username text, reposter_name text)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.author_id, p.body, p.created_at, p.edited_at, p.like_count, p.comment_count, p.repost_count,
    exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())), false,
    pr.username, pr.display_name, pr.avatar_path, p.created_at, null::text, null::text
  from public.posts p join public.profiles pr on pr.id = p.author_id
  where p.community_id = p_comm and p.status = 'visible'
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

create function public.profile_reposts(p_user uuid, p_before timestamptz default null, p_before_id uuid default null, p_limit int default 20)
returns table (id uuid, author_id uuid, body text, created_at timestamptz, edited_at timestamptz, like_count int, comment_count int, repost_count int,
  liked_by_me boolean, reposted_by_me boolean, username text, display_name text, avatar_path text, activity_at timestamptz, reposter_username text, reposter_name text)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.author_id, p.body, p.created_at, p.edited_at, p.like_count, p.comment_count, p.repost_count,
    exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
    exists (select 1 from public.reposts r2 where r2.post_id = p.id and r2.user_id = (select auth.uid())),
    pr.username, pr.display_name, pr.avatar_path, r.created_at, rp.username, rp.display_name
  from public.reposts r join public.posts p on p.id = r.post_id join public.profiles pr on pr.id = p.author_id join public.profiles rp on rp.id = r.user_id
  where r.user_id = p_user and p.status = 'visible' and p.community_id is null
    and (p_before is null or (r.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by r.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

create function public.get_profile_stats(p_user uuid)
returns table (follower_count bigint, following_count bigint, post_count bigint, repost_total bigint, is_following boolean, follows_me boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (public.internal_profile_visible(p_user, v_uid) or public.has_permission('users.view')) then raise exception 'not_found' using errcode = '22023'; end if;
  return query select
    (select count(*) from public.follows f where f.followee_id = p_user),
    (select count(*) from public.follows f where f.follower_id = p_user),
    (select count(*) from public.posts p where p.author_id = p_user and p.status = 'visible' and p.community_id is null),
    (select count(*) from public.reposts r join public.posts p on p.id = r.post_id where r.user_id = p_user and p.status = 'visible' and p.community_id is null),
    exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = p_user),
    exists (select 1 from public.follows f where f.follower_id = p_user and f.followee_id = v_uid);
end $$;

create function public.list_connections(p_user uuid, p_kind text, p_limit int default 30, p_offset int default 0)
returns table (user_id uuid, username text, display_name text, avatar_path text, bio text, institution_id uuid, is_following boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_uid uuid := (select auth.uid()); v_limit int := least(greatest(coalesce(p_limit, 30), 1), 50); v_off int := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind not in ('followers', 'following') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if not (public.internal_profile_visible(p_user, v_uid) or public.has_permission('users.view')) then raise exception 'not_found' using errcode = '22023'; end if;
  return query
    select pr.id, pr.username, pr.display_name, pr.avatar_path, pr.bio, pr.institution_id,
      exists (select 1 from public.follows mine where mine.follower_id = v_uid and mine.followee_id = pr.id)
    from public.follows f
    join public.profiles pr on pr.id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
    where (case when p_kind = 'followers' then f.followee_id else f.follower_id end) = p_user
      and public.internal_profile_visible(pr.id, v_uid) and not public.internal_blocked_either(v_uid, pr.id)
    order by f.created_at desc, pr.id limit v_limit offset v_off;
end $$;

revoke execute on function public.reposts_count_trg(), public.notify_on_repost(), public.repost_post(uuid), public.unrepost_post(uuid),
  public.internal_notify(uuid, text, uuid, text, uuid, text, jsonb),
  public.feed_posts(text, timestamptz, uuid, int), public.community_posts(uuid, timestamptz, uuid, int),
  public.profile_reposts(uuid, timestamptz, uuid, int), public.get_profile_stats(uuid), public.list_connections(uuid, text, int, int)
  from public, anon, authenticated;
grant execute on function public.repost_post(uuid), public.unrepost_post(uuid),
  public.feed_posts(text, timestamptz, uuid, int), public.community_posts(uuid, timestamptz, uuid, int),
  public.profile_reposts(uuid, timestamptz, uuid, int), public.get_profile_stats(uuid), public.list_connections(uuid, text, int, int)
  to authenticated;
