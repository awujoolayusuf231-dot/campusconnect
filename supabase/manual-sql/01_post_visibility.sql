-- Forward-only manual patch. Apply only after reviewing README.md and running 00_preflight.sql.
-- Requires the existing CampusConnect migrations and prepared hashtag SQL (Migration A).
-- This file is intentionally outside supabase/migrations so Supabase CLI cannot apply it automatically.
begin;

do $preflight$
begin
  if to_regclass('public.posts') is null
     or to_regclass('public.blocks') is null
     or to_regclass('public.follows') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.communities') is null
     or to_regclass('public.community_members') is null
     or to_regprocedure('public.internal_profile_visible(uuid,uuid)') is null
     or to_regprocedure('public.internal_blocked_either(uuid,uuid)') is null
     or to_regprocedure('public.effective_status_internal(uuid)') is null
     or to_regprocedure('public.internal_post_visible_to(uuid,uuid)') is null
     or to_regprocedure('public.search_hashtags(text,integer)') is null
     or to_regprocedure('public.trending_hashtags(integer,integer)') is null
     or to_regprocedure('campusconnect_private.internal_security_post_visible_to(uuid,uuid)') is null
     or to_regprocedure('campusconnect_private.internal_current_post_visible(uuid)') is null then
    raise exception 'Feed visibility prerequisites are missing; apply the existing social hardening migrations and Migration A first';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'visibility'
  ) or exists (
    select 1 from pg_trigger where tgname = 'posts_set_visibility'
  ) or to_regprocedure('public.set_post_visibility()') is not null then
    raise exception 'Post visibility objects already exist; do not rerun this patch';
  end if;

  if coalesce(current_setting('pgrst.db_schemas', true), 'public, graphql_public')
       like '%campusconnect_private%' then
    raise exception 'campusconnect_private must not be exposed through PostgREST';
  end if;
end;
$preflight$;

alter table public.posts add column visibility text;

update public.posts
set visibility = case when community_id is null then 'public' else 'community' end;

alter table public.posts alter column visibility set default 'public';
alter table public.posts alter column visibility set not null;
alter table public.posts
  add constraint posts_visibility_check
  check (visibility in ('public', 'followers', 'institution', 'private', 'community'));
alter table public.posts
  add constraint posts_community_visibility_check
  check ((community_id is null and visibility <> 'community')
      or (community_id is not null and visibility = 'community'));

grant insert (visibility), update (visibility) on public.posts to authenticated;

comment on column public.posts.visibility is
  'Audience for a post. Community audience is derived from community_id; other audiences are public, followers, institution, or author-only.';

create function public.set_post_visibility() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.community_id is not null then
    new.visibility := 'community';
  elsif new.visibility = 'community' then
    raise exception 'community_visibility_requires_community' using errcode = '22023';
  end if;

  if new.visibility = 'institution'
     and not exists (
       select 1 from public.profiles pr
       where pr.id = new.author_id and pr.institution_id is not null
     ) then
    raise exception 'institution_required' using errcode = '22023';
  end if;

  return new;
end $$;

revoke all on function public.set_post_visibility() from public, anon, authenticated;

create trigger posts_set_visibility
  before insert or update of author_id, community_id, visibility on public.posts
  for each row execute function public.set_post_visibility();

-- This is the single audience check shared by RLS, hashtag results, analytics, and the ranked feed.
-- It aligns with the hardened RLS contract: blocks in either direction deny access.
create or replace function public.internal_post_visible_to(p_post uuid, p_viewer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (
      p.status = 'visible'
      and coalesce(public.effective_status_internal(p.author_id) in ('active', 'restricted'), false)
      and public.internal_profile_visible(p.author_id, p_viewer)
      and not coalesce(public.internal_blocked_either(p_viewer, p.author_id), true)
      and case p.visibility
        when 'public' then p.community_id is null
        when 'followers' then p.community_id is null and (
          p.author_id = p_viewer
          or exists (
            select 1 from public.follows f
            where f.follower_id = p_viewer and f.followee_id = p.author_id
          )
        )
        when 'institution' then p.community_id is null and (
          p.author_id = p_viewer
          or exists (
            select 1
            from public.profiles author
            join public.profiles viewer on viewer.id = p_viewer
            where author.id = p.author_id
              and author.institution_id is not null
              and author.institution_id = viewer.institution_id
          )
        )
        when 'private' then p.community_id is null and p.author_id = p_viewer
        when 'community' then p.community_id is not null and exists (
          select 1
          from public.communities c
          join public.community_members m on m.community_id = c.id
          where c.id = p.community_id
            and c.status = 'active'
            and m.user_id = p_viewer
            and m.status = 'active'
        )
        else false
      end
    )
    from public.posts p
    where p.id = p_post and p_viewer is not null
  ), false)
$$;

revoke all on function public.internal_post_visible_to(uuid,uuid) from public, anon, authenticated;

-- Keep the existing RLS helper and all policies intact while routing them through the same audience rule.
create or replace function campusconnect_private.internal_security_post_visible_to(p_post uuid, p_viewer uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select public.internal_post_visible_to(p_post, p_viewer)
$function$;

revoke all on function campusconnect_private.internal_security_post_visible_to(uuid,uuid) from public, anon, authenticated;

-- Hashtag discovery is an aggregate surface, so it only counts truly public posts.
create or replace function public.search_hashtags(p_prefix text, p_limit int default 8)
returns table (tag text, post_count bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_prefix text := normalize(lower(normalize(btrim(coalesce(p_prefix, ''), '# '), NFC)), NFC);
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_prefix !~ '^[A-Za-z0-9_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF\u0300-\u036F]{1,50}$' then return; end if;
  return query
  select h.tag, count(p.id) as post_count
  from public.hashtags h
  join public.post_hashtags ph on ph.hashtag_id = h.id
  join public.posts p on p.id = ph.post_id and p.status = 'visible'
    and p.community_id is null and p.visibility = 'public'
  join public.profiles pr on pr.id = p.author_id and pr.visibility = 'public'
  where h.tag like replace(v_prefix, '_', '\_') || '%'
    and coalesce(public.effective_status_internal(p.author_id) in ('active', 'restricted'), false)
    and not coalesce(public.internal_blocked_either((select auth.uid()), p.author_id), true)
  group by h.tag
  order by count(p.id) desc, h.tag asc
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
end $$;

create or replace function public.trending_hashtags(p_days int default 7, p_limit int default 10)
returns table (tag text, posts bigint, authors bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_days int := least(greatest(coalesce(p_days, 7), 1), 30);
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select h.tag, count(*) as posts, count(distinct p.author_id) as authors
  from public.post_hashtags ph
  join public.posts p on p.id = ph.post_id
  join public.profiles pr on pr.id = p.author_id and pr.visibility = 'public'
  join public.hashtags h on h.id = ph.hashtag_id
  where p.status = 'visible' and p.community_id is null and p.visibility = 'public'
    and p.created_at > now() - make_interval(days => v_days)
    and coalesce(public.effective_status_internal(p.author_id) in ('active', 'restricted'), false)
    and not coalesce(public.internal_blocked_either((select auth.uid()), p.author_id), true)
  group by h.tag
  order by count(distinct p.author_id) desc, count(*) desc, h.tag asc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
end $$;

revoke all on function public.search_hashtags(text,integer), public.trending_hashtags(integer,integer)
  from public, anon, authenticated;
grant execute on function public.search_hashtags(text,integer), public.trending_hashtags(integer,integer)
  to authenticated;

commit;
