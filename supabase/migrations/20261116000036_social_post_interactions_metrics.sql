-- Public post counts, saved posts, comment likes/replies, and public comment reshares.
begin;

do $preflight$
begin
  if to_regclass('public.posts') is null
     or to_regclass('public.comments') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.post_likes') is null
     or to_regclass('public.reposts') is null
     or to_regclass('public.post_impression_daily') is null
     or to_regprocedure('public.internal_post_visible_to(uuid,uuid)') is null
     or to_regprocedure('public.internal_setting_int(text,integer,integer,integer)') is null
     or to_regprocedure('public.effective_status_internal(uuid)') is null
     or to_regprocedure('public.account_is_listed(uuid)') is null
     or to_regprocedure('public.account_can_post()') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'posts' and column_name = 'visibility'
     )
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'posts' and column_name = 'community_id'
     ) then
    raise exception 'Social interactions require the social core, post-visibility helpers, and post-impression SQL foundation';
  end if;
end
$preflight$;

lock table public.post_impression_daily in share row exclusive mode;

alter table public.posts
  add column impression_count bigint not null default 0 check (impression_count >= 0),
  add column view_count bigint not null default 0 check (view_count >= 0);

update public.posts p
set impression_count = coalesce((
  select sum(d.impressions)::bigint
  from public.post_impression_daily d
  where d.post_id = p.id
), 0);

create function public.sync_post_impression_count() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  v_delta bigint;
  v_post uuid;
begin
  if tg_op = 'INSERT' then
    v_delta := new.impressions;
    v_post := new.post_id;
  else
    v_delta := new.impressions - old.impressions;
    v_post := new.post_id;
  end if;
  if v_delta <> 0 then
    update public.posts set impression_count = impression_count + v_delta where id = v_post;
  end if;
  return null;
end
$function$;

create trigger post_impression_public_count
after insert or update of impressions on public.post_impression_daily
for each row execute function public.sync_post_impression_count();

create table public.post_detail_view_seen (
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  window_start timestamptz not null,
  last_seen_at timestamptz not null default now(),
  primary key (viewer_id, post_id)
);
create index post_detail_view_seen_viewer_time_idx
  on public.post_detail_view_seen (viewer_id, last_seen_at);
alter table public.post_detail_view_seen enable row level security;
revoke all on table public.post_detail_view_seen from public, anon, authenticated;

create function public.record_post_detail_view(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
  v_author uuid;
  v_window_minutes integer := public.internal_setting_int('impression_window_minutes', 30, 1, 1440);
  v_rate integer := public.internal_setting_int('impression_rate_per_minute', 120, 1, 1000);
  v_window timestamptz := date_bin(make_interval(mins => v_window_minutes), now(), timestamptz '2000-01-01 00:00:00+00');
  v_previous_window timestamptz;
  v_increment boolean;
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not coalesce(public.effective_status_internal(v_uid) in ('active', 'restricted'), false) then
    return;
  end if;

  select p.author_id into v_author
  from public.posts p
  where p.id = p_post
    and p.status = 'visible'
    and public.internal_post_visible_to(p.id, v_uid);
  if v_author is null or v_author = v_uid then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('post_detail_views:' || v_uid::text, 0));
  if (
    select count(*) from public.post_detail_view_seen
    where viewer_id = v_uid and last_seen_at > now() - interval '1 minute'
  ) >= v_rate then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  delete from public.post_detail_view_seen
  where viewer_id = v_uid and last_seen_at < now() - interval '35 days';

  select window_start into v_previous_window
  from public.post_detail_view_seen
  where viewer_id = v_uid and post_id = p_post;
  if not found then
    v_increment := true;
  else
    v_increment := v_previous_window < v_window;
  end if;

  insert into public.post_detail_view_seen(viewer_id, post_id, window_start)
  values (v_uid, p_post, v_window)
  on conflict (viewer_id, post_id) do update
    set window_start = greatest(public.post_detail_view_seen.window_start, excluded.window_start),
        last_seen_at = now();

  if v_increment then
    update public.posts
    set view_count = view_count + 1
    where id = p_post and status = 'visible';
  end if;
end
$function$;

create table public.post_saves (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index post_saves_user_created_idx on public.post_saves (user_id, created_at desc);
alter table public.post_saves enable row level security;
grant select on public.post_saves to authenticated;
create policy post_saves_select_own on public.post_saves
  for select to authenticated using (user_id = (select auth.uid()));

create function public.save_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.posts p
    where p.id = p_post and p.status = 'visible'
      and public.internal_post_visible_to(p.id, v_uid)
  ) then
    raise exception 'not_found' using errcode = '22023';
  end if;
  insert into public.post_saves(user_id, post_id)
  values (v_uid, p_post)
  on conflict do nothing;
end
$function$;

create function public.unsave_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.post_saves where user_id = v_uid and post_id = p_post;
end
$function$;

create function public.post_public_metrics(p_post_ids uuid[])
returns table(post_id uuid, impressions bigint, views bigint, saved_by_me boolean)
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_post_ids is null or cardinality(p_post_ids) = 0 then
    return;
  end if;
  if cardinality(p_post_ids) > 100 then
    raise exception 'too_many' using errcode = '22023';
  end if;

  return query
  select p.id, p.impression_count, p.view_count,
    exists (select 1 from public.post_saves s where s.user_id = v_uid and s.post_id = p.id)
  from public.posts p
  where p.id = any(p_post_ids)
    and p.status = 'visible'
    and public.internal_post_visible_to(p.id, v_uid);
end
$function$;

create function public.saved_posts(p_limit integer default 20, p_offset integer default 0)
returns table(
  id uuid, author_id uuid, body text, created_at timestamptz, edited_at timestamptz,
  like_count integer, comment_count integer, repost_count integer,
  liked_by_me boolean, reposted_by_me boolean,
  username text, display_name text, avatar_path text,
  activity_at timestamptz, reposter_username text, reposter_name text
)
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select p.id, p.author_id, p.body, p.created_at, p.edited_at,
    p.like_count, p.comment_count, p.repost_count,
    exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = v_uid),
    exists (select 1 from public.reposts r where r.post_id = p.id and r.user_id = v_uid),
    pr.username, pr.display_name, pr.avatar_path,
    s.created_at, null::text, null::text
  from public.post_saves s
  join public.posts p on p.id = s.post_id
  join public.profiles pr on pr.id = p.author_id
  where s.user_id = v_uid
    and p.status = 'visible'
    and public.internal_post_visible_to(p.id, v_uid)
  order by s.created_at desc, p.id desc
  limit v_limit offset v_offset;
end
$function$;

alter table public.comments
  add column parent_comment_id uuid references public.comments(id) on delete cascade,
  add column like_count integer not null default 0 check (like_count >= 0),
  add column repost_count integer not null default 0 check (repost_count >= 0),
  add constraint comments_parent_not_self check (parent_comment_id is null or parent_comment_id <> id);
create index comments_parent_created_idx on public.comments (parent_comment_id, created_at) where status = 'visible';

create function public.hide_replies_with_parent() returns trigger
language plpgsql security definer set search_path = '' as $function$
begin
  if old.parent_comment_id is null and old.status = 'visible' and new.status <> 'visible' then
    update public.comments
    set status = new.status
    where parent_comment_id = new.id and status = 'visible';
  end if;
  return null;
end
$function$;
create trigger comments_hide_replies
after update of status on public.comments
for each row execute function public.hide_replies_with_parent();

create table public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.comment_likes enable row level security;
grant select on public.comment_likes to authenticated;
create policy comment_likes_select_own on public.comment_likes
  for select to authenticated using (user_id = (select auth.uid()));

create function public.comment_likes_count_trg() returns trigger
language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op = 'INSERT' then
    update public.comments set like_count = like_count + 1 where id = new.comment_id;
  else
    update public.comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end
$function$;
create trigger comment_likes_count after insert or delete on public.comment_likes
for each row execute function public.comment_likes_count_trg();

create table public.comment_reposts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  post_id uuid not null unique references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);
alter table public.comment_reposts enable row level security;
grant select on public.comment_reposts to authenticated;
create policy comment_reposts_select_own on public.comment_reposts
  for select to authenticated using (user_id = (select auth.uid()));

create function public.comment_reposts_count_trg() returns trigger
language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op = 'INSERT' then
    update public.comments set repost_count = repost_count + 1 where id = new.comment_id;
  else
    update public.comments set repost_count = greatest(repost_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end
$function$;
create trigger comment_reposts_count after insert or delete on public.comment_reposts
for each row execute function public.comment_reposts_count_trg();

create function public.comment_like(p_comment uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
  v_author uuid;
begin
  if v_uid is null or not public.account_is_listed(v_uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select c.author_id into v_author
  from public.comments c join public.posts p on p.id = c.post_id
  where c.id = p_comment and c.status = 'visible' and p.status = 'visible'
    and public.internal_post_visible_to(p.id, v_uid);
  if v_author is null or not public.internal_profile_visible(v_author, v_uid)
     or public.internal_blocked_either(v_uid, v_author) then
    raise exception 'not_found' using errcode = '22023';
  end if;
  insert into public.comment_likes(comment_id, user_id)
  values (p_comment, v_uid)
  on conflict do nothing;
end
$function$;

create function public.comment_unlike(p_comment uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.comment_likes where comment_id = p_comment and user_id = v_uid;
end
$function$;

create function public.reply_to_comment(p_post uuid, p_body text, p_parent_comment uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
  v_author uuid;
  v_parent_post uuid;
  v_parent_parent uuid;
  v_parent_author uuid;
  v_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_uid is null or not public.account_can_post() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 1000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;
  if (select count(*) from public.comments where author_id = v_uid and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if p_parent_comment is null then
    raise exception 'invalid_parent_comment' using errcode = '22023';
  end if;

  select p.author_id into v_author
  from public.posts p
  where p.id = p_post and p.status = 'visible'
    and public.internal_post_visible_to(p.id, v_uid);
  if v_author is null or public.internal_blocked_either(v_uid, v_author) then
    raise exception 'not_found' using errcode = '22023';
  end if;

  if p_parent_comment is not null then
    select c.post_id, c.parent_comment_id, c.author_id
    into v_parent_post, v_parent_parent, v_parent_author
    from public.comments c
    where c.id = p_parent_comment and c.status = 'visible';
    if not found or v_parent_post <> p_post or v_parent_parent is not null
       or not public.internal_profile_visible(v_parent_author, v_uid)
       or public.internal_blocked_either(v_uid, v_parent_author) then
      raise exception 'invalid_parent_comment' using errcode = '22023';
    end if;
  end if;

  insert into public.comments(post_id, author_id, body, parent_comment_id)
  values (p_post, v_uid, v_body, p_parent_comment)
  returning id into v_id;
  return v_id;
end
$function$;

create function public.repost_comment(p_comment uuid) returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
  v_existing uuid;
  v_post uuid;
  v_post_author uuid;
  v_post_visibility text;
  v_community uuid;
  v_comment_author uuid;
  v_comment_body text;
  v_comment_username text;
  v_new_post uuid;
  v_body text;
begin
  if v_uid is null or not public.account_can_post() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('comment_repost:' || v_uid::text || ':' || p_comment::text, 0));
  select cr.post_id into v_existing
  from public.comment_reposts cr
  where cr.user_id = v_uid and cr.comment_id = p_comment;
  if found then
    return v_existing;
  end if;
  if (select count(*) from public.comment_reposts where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  select c.post_id, p.author_id, p.visibility, p.community_id, c.author_id, c.body,
    pr.username
  into v_post, v_post_author, v_post_visibility, v_community, v_comment_author, v_comment_body, v_comment_username
  from public.comments c
  join public.posts p on p.id = c.post_id
  join public.profiles pr on pr.id = c.author_id
  where c.id = p_comment and c.status = 'visible' and p.status = 'visible'
    and public.internal_post_visible_to(p.id, v_uid);

  if not found or v_post_visibility <> 'public' or v_community is not null
     or not public.internal_profile_visible(v_comment_author, v_uid)
     or public.internal_blocked_either(v_uid, v_comment_author)
     or public.internal_blocked_either(v_uid, v_post_author) then
    raise exception 'comment_not_publicly_reshareable' using errcode = '22023';
  end if;

  v_body := 'Reposted comment by @' || v_comment_username || E':\n\n'
    || v_comment_body || E'\n\nOriginal discussion: /app/p/' || v_post::text || '#comment-' || p_comment::text;
  insert into public.posts(author_id, body, visibility)
  values (v_uid, v_body, 'public')
  returning id into v_new_post;

  insert into public.comment_reposts(user_id, comment_id, post_id)
  values (v_uid, p_comment, v_new_post);
  return v_new_post;
end
$function$;

create function public.unrepost_comment(p_comment uuid) returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
  v_post uuid;
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select post_id into v_post from public.comment_reposts
  where user_id = v_uid and comment_id = p_comment;
  if v_post is not null then
    delete from public.posts where id = v_post and author_id = v_uid;
  end if;
end
$function$;

create function public.redact_comment_reposts() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  v_comment uuid;
begin
  if tg_op = 'DELETE' then
    v_comment := old.id;
  elsif old.status = 'visible' and new.status <> 'visible' then
    v_comment := new.id;
  else
    return new;
  end if;

  update public.posts p
  set body = 'This comment is no longer available.'
  where p.id in (select cr.post_id from public.comment_reposts cr where cr.comment_id = v_comment)
    and p.status = 'visible';
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;
create trigger comments_redact_reposts
before delete or update of status on public.comments
for each row execute function public.redact_comment_reposts();

revoke all on function public.sync_post_impression_count(),
  public.record_post_detail_view(uuid), public.save_post(uuid), public.unsave_post(uuid),
  public.post_public_metrics(uuid[]), public.saved_posts(integer, integer),
  public.comment_likes_count_trg(), public.comment_reposts_count_trg(),
  public.comment_like(uuid), public.comment_unlike(uuid),
  public.reply_to_comment(uuid, text, uuid), public.repost_comment(uuid),
  public.hide_replies_with_parent(),
  public.unrepost_comment(uuid), public.redact_comment_reposts()
from public, anon, authenticated;

grant execute on function public.record_post_detail_view(uuid), public.save_post(uuid),
  public.unsave_post(uuid), public.post_public_metrics(uuid[]), public.saved_posts(integer, integer),
  public.comment_like(uuid), public.comment_unlike(uuid), public.reply_to_comment(uuid, text, uuid),
  public.repost_comment(uuid), public.unrepost_comment(uuid)
to authenticated;

commit;

