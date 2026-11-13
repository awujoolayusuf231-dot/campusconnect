-- ============================================================================
-- Migration A (v2, after security review): hashtags + the shared post-visibility function
-- STATUS: PREPARED FOR REVIEW. NOT APPLIED to any database. The SQL has NOT been executed (no Postgres here).
-- What WAS verified: the extraction regex and normalisation logic were run as plain read-only SELECT expressions
-- on the live PostgreSQL 17 engine (29 cases, all passed). The trigger, tables and RPCs have never run.
--
-- Purely additive: 2 tables, 7 functions, 1 AFTER trigger on public.posts, a one-time backfill of DERIVED rows.
-- No existing table, column, constraint, policy or function is altered or dropped.
-- Rollback: supabase/rollbacks/20261101100000_hashtags_down.sql      MUST be applied BEFORE migration B.
--
-- Design notes
--  * The server is the source of truth: tags are extracted by a trigger; the client is never trusted.
--  * Tag alphabet: ASCII letters/digits/underscore PLUS Latin-script letters with diacritics (U+00C0-U+024F,
--    U+1E00-U+1EFF, which covers Yoruba/Igbo/Hausa/French characters such as Ọ ẹ ṣ ị ụ ń) and combining marks
--    U+0300-U+036F. Text is NFC-normalised and lower-cased, so "#Ọlá" typed with precomposed or decomposed
--    characters is the same tag. Other scripts (Cyrillic, Greek, emoji...) are NOT allowed: this blocks look-alike
--    spam tags and invisible characters. Accent-folding is not done (#Ola and #Ọlá are different tags).
--  * 2-50 characters, must contain a letter, at most 10 tags per post. A tag glued to a letter of another script,
--    or too long, is ignored entirely rather than silently truncated.
--  * Clients get NO direct table access. Reads go through RPCs that re-check visibility with ONE shared function
--    (internal_post_visible_to) which mirrors the posts RLS policy + profile visibility. Later migrations that add
--    post audiences (followers-only etc.) must update that single function.
-- ============================================================================

-- ===== shared visibility rule (single source of truth for "may this viewer see this post?") =====
-- SECURITY DEFINER justification: must read profiles/blocks/communities regardless of the caller's RLS. Not executable
-- by any client role; only called from other SECURITY DEFINER functions. search_path is empty.
-- Rules (mirrors posts_select + feed behaviour, deliberately a little stricter):
--   * the post is visible (not hidden/deleted)
--   * the author's account is active or restricted (not suspended/disabled/pending deletion)
--   * the viewer has not blocked the author   (a blocked person can still read the blocker's public posts by design,
--     so blocks in the other direction are NOT applied here and cannot be detected through this function)
--   * every post: the author's profile must be visible to the viewer (public, or institution-only AND same
--     institution; private = only the author).
--   * community post: the viewer must be an active member of the specific active community
-- TRIPWIRE: posts currently has no per-post audience column. When one is added (followers-only celebrations etc.),
-- this function MUST be replaced in the same migration; supabase/tests/hashtags.sql fails until it is.
create function public.internal_post_visible_to(p_post uuid, p_viewer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (
      p.status = 'visible'
      and coalesce(public.effective_status_internal(p.author_id) in ('active', 'restricted'), false)
      and not exists (select 1 from public.blocks b where b.blocker_id = p_viewer and b.blocked_id = p.author_id)
      and public.internal_profile_visible(p.author_id, p_viewer)
      and (
        p.community_id is null
        or exists (
          select 1
          from public.communities c
          join public.community_members m on m.community_id = c.id
          where c.id = p.community_id
            and c.status = 'active'
            and m.user_id = p_viewer
            and m.status = 'active'
        )
      )
    )
    from public.posts p where p.id = p_post
  ), false)
$$;

-- ===== tables =====
create table public.hashtags (
  id uuid primary key default gen_random_uuid(),
  tag text not null unique,
  created_at timestamptz not null default now(),
  constraint hashtags_tag_format check (
    char_length(tag) between 2 and 50
    and tag = normalize(tag, NFC)
    and tag = lower(tag)
    and tag ~ '^[A-Za-z0-9_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF][A-Za-z0-9_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF\u0300-\u036F]*$'
    and tag ~ '[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF]')
);
create index hashtags_tag_prefix_idx on public.hashtags (tag text_pattern_ops);   -- prefix search, no extension needed

create table public.post_hashtags (
  post_id uuid not null references public.posts(id) on delete cascade,
  hashtag_id uuid not null references public.hashtags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, hashtag_id)
);
create index post_hashtags_hashtag_idx on public.post_hashtags (hashtag_id, post_id);

alter table public.hashtags enable row level security;
alter table public.post_hashtags enable row level security;
-- Deliberately NO policies and NO client grants: only the SECURITY DEFINER functions below touch these tables.
revoke all on table public.hashtags, public.post_hashtags from public, anon, authenticated;

-- ===== extraction and normalisation (pure, no table access) =====
-- The same character classes appear in the table CHECK, here and in normalize_hashtag(); the tests assert they agree.
create function public.extract_hashtags(p_body text) returns text[]
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(array_agg(t.tag order by t.first_pos), '{}'::text[])
  from (
    select s.tag, min(s.pos) as first_pos
    from (
      select normalize(lower(normalize(r.m[1], NFC)), NFC) as tag, r.pos
      from regexp_matches(normalize(coalesce(p_body, ''), NFC),
        '(?<![A-Za-z0-9_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF\u0300-\u036F&/#])#([A-Za-z0-9_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF][A-Za-z0-9_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF\u0300-\u036F]{1,49})(?![[:alnum:]_\u0300-\u036F])',
        'g') with ordinality as r(m, pos)
    ) s
    where s.tag ~ '[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF]'
      and char_length(s.tag) between 2 and 50
    group by s.tag
    order by min(s.pos)
    limit 10
  ) t
$$;

-- Normalises user input ("#ỌLÁ", " olá ") to the stored form; returns NULL when it cannot be a valid tag.
create function public.normalize_hashtag(p_tag text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when s.t ~ '^[A-Za-z0-9_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF][A-Za-z0-9_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF\u0300-\u036F]*$'
     and s.t ~ '[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF]'
     and char_length(s.t) between 2 and 50
    then s.t end
  from (select normalize(lower(normalize(btrim(coalesce(p_tag, ''), '# '), NFC)), NFC) as t) s
$$;

-- ===== trigger: keep post_hashtags consistent with the post =====
-- SECURITY DEFINER justification: must write tables that clients cannot touch. Empty search_path; not client-executable.
-- Tags are inserted in sorted order so two concurrent posts using the same new tags cannot deadlock.
create function public.sync_post_hashtags() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_tags text[];
begin
  v_tags := case when new.status = 'deleted' then '{}'::text[] else public.extract_hashtags(new.body) end;

  delete from public.post_hashtags ph          -- obsolete relationships (edits, deletions)
  using public.hashtags h
  where ph.post_id = new.id and ph.hashtag_id = h.id and not (h.tag = any (v_tags));

  if coalesce(array_length(v_tags, 1), 0) > 0 then
    insert into public.hashtags (tag) select t from unnest(v_tags) as t order by t on conflict (tag) do nothing;
    insert into public.post_hashtags (post_id, hashtag_id)
      select new.id, h.id from public.hashtags h where h.tag = any (v_tags) order by h.id
    on conflict do nothing;
  end if;
  return null;
end $$;

create trigger posts_sync_hashtags
  after insert or update of body, status on public.posts
  for each row execute function public.sync_post_hashtags();

-- ===== one-time backfill of derived data (existing posts) =====
insert into public.hashtags (tag)
select distinct t.tag
from public.posts p cross join lateral unnest(public.extract_hashtags(p.body)) as t(tag)
where p.status <> 'deleted'
order by 1
on conflict (tag) do nothing;

insert into public.post_hashtags (post_id, hashtag_id)
select p.id, h.id
from public.posts p
cross join lateral unnest(public.extract_hashtags(p.body)) as t(tag)
join public.hashtags h on h.tag = t.tag
where p.status <> 'deleted'
on conflict do nothing;

-- ===== RPC: posts for one hashtag =====
-- Returns EXACTLY the columns of the existing FeedPost type (activity_at = created_at; reposter_* = null) so
-- PostCard and the FeedPage cursor (created_at := last.activity_at, id) work unchanged.
-- SECURITY DEFINER justification: reads post_hashtags (no client access); authorization is re-checked per row with
-- internal_post_visible_to. Main-feed (non-community) posts only, to match the main feed.
create function public.posts_by_hashtag(
  p_tag text, p_before timestamptz default null, p_before_id uuid default null, p_limit int default 20)
returns table (
  id uuid, author_id uuid, body text, created_at timestamptz, edited_at timestamptz,
  like_count int, comment_count int, repost_count int,
  liked_by_me boolean, reposted_by_me boolean,
  username text, display_name text, avatar_path text,
  activity_at timestamptz, reposter_username text, reposter_name text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_tag text := public.normalize_hashtag(p_tag);
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_tag is null then return; end if;   -- malformed tag: empty result, no error

  return query
  select p.id, p.author_id, p.body, p.created_at, p.edited_at,
         p.like_count, p.comment_count, p.repost_count,
         exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = v_uid),
         exists (select 1 from public.reposts r where r.post_id = p.id and r.user_id = v_uid),
         pr.username, pr.display_name, pr.avatar_path,
         p.created_at, null::text, null::text
  from public.hashtags h
  join public.post_hashtags ph on ph.hashtag_id = h.id
  join public.posts p on p.id = ph.post_id
  join public.profiles pr on pr.id = p.author_id
  where h.tag = v_tag
    and p.status = 'visible' and p.community_id is null
    and public.internal_post_visible_to(p.id, v_uid)
    and (p_before is null
         or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end $$;

-- ===== RPC: tag autocomplete =====
-- Counts only visible main-feed posts by authors whose account is active/restricted AND whose profile is PUBLIC, so
-- nothing about private, institution-only, suspended or pending-deletion accounts is revealed. Counts are
-- approximate for the viewer (they ignore the viewer's personal blocks).
create function public.search_hashtags(p_prefix text, p_limit int default 8)
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
  join public.posts p on p.id = ph.post_id and p.status = 'visible' and p.community_id is null
  join public.profiles pr on pr.id = p.author_id and pr.visibility = 'public'
  where h.tag like replace(v_prefix, '_', '\_') || '%'      -- '_' is a LIKE wildcard; the rest of the alphabet is not
    and coalesce(public.effective_status_internal(p.author_id) in ('active', 'restricted'), false)
  group by h.tag
  order by count(p.id) desc, h.tag asc
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
end $$;

-- ===== RPC: trending tags =====
-- Ranked by DISTINCT AUTHORS first (one person repeating a tag cannot make it trend), then post count. Same
-- public-only, listed-account-only counting rule as search_hashtags.
create function public.trending_hashtags(p_days int default 7, p_limit int default 10)
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
  where p.status = 'visible' and p.community_id is null
    and p.created_at > now() - make_interval(days => v_days)
    and coalesce(public.effective_status_internal(p.author_id) in ('active', 'restricted'), false)
  group by h.tag
  order by count(distinct p.author_id) desc, count(*) desc, h.tag asc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
end $$;

-- ===== privileges =====
-- Supabase leaves new functions executable by PUBLIC/anon unless revoked (see migration 0004).
revoke execute on function
  public.internal_post_visible_to(uuid, uuid), public.extract_hashtags(text), public.normalize_hashtag(text),
  public.sync_post_hashtags(), public.posts_by_hashtag(text, timestamptz, uuid, int),
  public.search_hashtags(text, int), public.trending_hashtags(int, int)
from public, anon, authenticated;
grant execute on function
  public.posts_by_hashtag(text, timestamptz, uuid, int), public.search_hashtags(text, int),
  public.trending_hashtags(int, int)
to authenticated;
