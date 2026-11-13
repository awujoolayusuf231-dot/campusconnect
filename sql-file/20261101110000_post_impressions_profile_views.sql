-- ============================================================================
-- Migration B (v2, after security review): post impressions and profile views
-- STATUS: PREPARED FOR REVIEW. NOT APPLIED to any database. The SQL has NOT been executed (no Postgres here).
-- REQUIRES migration A (20261101100000_hashtags) first: it uses public.internal_post_visible_to().
-- Additive: 7 tables (6 analytics + a settings-ownership ledger), 3 helpers, 7 RPCs, 1 purge function, up to 7 NEW rows in
-- platform_settings (on conflict do nothing; only rows actually inserted are recorded in the ledger).
-- No existing table/column/constraint/policy/function is changed.
-- Rollback: supabase/rollbacks/20261101110000_post_impressions_profile_views_down.sql  (apply BEFORE rolling back A)
--
-- IMPRESSION POLICY
--  * Client contract: report a post only after it was >= 50% visible for >= 1 second; send ids in batches.
--    The server cannot verify what was on screen: client events are NOT fraud-proof.
--  * Server rules: caller signed in with an active/restricted account; own posts never count; the post must pass
--    internal_post_visible_to(post, caller) (visible post, listed author, not blocked by caller, profile visibility,
--    and active membership in the specific active community for community posts).
--  * De-duplication: one counted impression per (viewer, post) per time window (default 30 min, configurable).
--  * Unique viewer = first counted impression of a (viewer, post) in a Lagos calendar day, decided atomically by a
--    primary-key insert (post_viewer_day), not by a racy existence check.
--  * Concurrency: each viewer's calls are serialised with a transaction-scoped advisory lock, so parallel requests
--    cannot slip past the rate limits; ids are processed in sorted order so parallel callers cannot deadlock.
--  * Rate limits per viewer apply to NEW counted rows only: per minute and per Lagos day (configurable). Under the lock
--    they are EXACT: a batch adds at most the remaining allowance, the rest of the batch is ignored.
--  * No function returns anything about eligibility (void), so a caller cannot probe who blocked them, which posts are
--    private, or which ids exist. Only the viewer's own rate-limit error is visible.
--  * Reads: authors get counts only, and NO figure is ever returned that was derived from fewer than
--    analytics_min_unique_viewers (floor 3, default 3) distinct viewers. This is enforced per CELL:
--      - a daily cell (post or profile, one Lagos day) is returned only if it has >= 3 distinct viewers, and then both its
--        exact count and its unique-viewer count are shown; otherwise the whole cell is omitted (not zeroed, not NULL-ed);
--      - "totals" are the SUM OF QUALIFYING DAILY CELLS ONLY, so they can never be differenced against hidden cells;
--      - reach / unique-viewer totals over a window are returned only if >= 3, otherwise NULL.
--    The threshold cannot be configured below 3 (clamped in code). Consequence: totals and series exclude days with fewer
--    than 3 distinct viewers, and the UI must say so. Nothing below the threshold is exposed by any function or table.
--  * Retention: per-viewer rows are purged after analytics_dedupe_retention_days (default 35) and immediately for
--    deleted posts; daily aggregates for 400 days. purge_analytics_dedupe is batched and service-role only.
-- ============================================================================

do $$ begin
  if to_regprocedure('public.internal_post_visible_to(uuid,uuid)') is null then
    raise exception 'Migration B requires migration A (20261101100000_hashtags) to be applied first';
  end if;
end $$;

-- ===== configurable knobs (new rows only; no existing setting is changed) =====
-- Ownership ledger: records exactly which keys THIS migration inserted. A key that already existed is skipped by
-- ON CONFLICT DO NOTHING and is therefore NOT in the ledger, so the rollback will never delete it.
create table public.analytics_setting_ownership (key text primary key);
alter table public.analytics_setting_ownership enable row level security;
revoke all on table public.analytics_setting_ownership from public, anon, authenticated;

with ins as (
  insert into public.platform_settings (key, value, value_type, description, is_public) values
    ('impression_window_minutes',        '30',   'number', 'Dedupe window: one counted impression per viewer per post per this many minutes', false),
    ('impression_batch_max',             '50',   'number', 'Max post ids accepted in one record_post_impressions call', false),
    ('impression_rate_per_minute',       '120',  'number', 'Max NEW counted impressions per viewer per minute', false),
    ('impression_daily_cap_per_viewer',  '3000', 'number', 'Max NEW counted impressions per viewer per Lagos day', false),
    ('profile_view_rate_per_hour',       '100',  'number', 'Max NEW counted profile views per viewer per hour', false),
    ('analytics_dedupe_retention_days',  '35',   'number', 'How long per-viewer dedupe rows are kept before purge (also caps reach lookbacks)', false),
    ('analytics_min_unique_viewers',     '3',    'number', 'Privacy threshold: any figure derived from fewer distinct viewers is hidden. Cannot be set below 3.', false)
  on conflict (key) do nothing
  returning key)
insert into public.analytics_setting_ownership (key) select key from ins;

-- ===== tables (RLS on, NO client policies, NO client grants) =====
create table public.post_impression_seen (       -- impression dedupe window + rate-limit ledger
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  window_start timestamptz not null,
  day date not null,
  first_seen_at timestamptz not null default now(),
  primary key (viewer_id, post_id, window_start)
);
create index post_impression_seen_post_day_idx on public.post_impression_seen (post_id, day);
create index post_impression_seen_day_idx on public.post_impression_seen (day);
create index post_impression_seen_viewer_time_idx on public.post_impression_seen (viewer_id, first_seen_at);

create table public.post_viewer_day (            -- exact "unique viewer per day" + reach source
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  day date not null,
  primary key (viewer_id, post_id, day)
);
create index post_viewer_day_post_day_idx on public.post_viewer_day (post_id, day);
create index post_viewer_day_day_idx on public.post_viewer_day (day);

create table public.post_impression_daily (
  post_id uuid not null references public.posts(id) on delete cascade,
  day date not null,
  impressions int not null default 0 check (impressions >= 0),
  unique_viewers int not null default 0 check (unique_viewers >= 0),
  primary key (post_id, day)
);
create index post_impression_daily_day_idx on public.post_impression_daily (day);

create table public.profile_view_seen (
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  window_start timestamptz not null,
  day date not null,
  first_seen_at timestamptz not null default now(),
  primary key (viewer_id, profile_id, window_start),
  check (viewer_id <> profile_id)
);
create index profile_view_seen_profile_day_idx on public.profile_view_seen (profile_id, day);
create index profile_view_seen_day_idx on public.profile_view_seen (day);
create index profile_view_seen_viewer_time_idx on public.profile_view_seen (viewer_id, first_seen_at);

create table public.profile_viewer_day (
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  primary key (viewer_id, profile_id, day),
  check (viewer_id <> profile_id)
);
create index profile_viewer_day_profile_day_idx on public.profile_viewer_day (profile_id, day);
create index profile_viewer_day_day_idx on public.profile_viewer_day (day);

create table public.profile_view_daily (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  views int not null default 0 check (views >= 0),
  unique_viewers int not null default 0 check (unique_viewers >= 0),
  primary key (profile_id, day)
);
create index profile_view_daily_day_idx on public.profile_view_daily (day);

alter table public.post_impression_seen enable row level security;
alter table public.post_viewer_day enable row level security;
alter table public.post_impression_daily enable row level security;
alter table public.profile_view_seen enable row level security;
alter table public.profile_viewer_day enable row level security;
alter table public.profile_view_daily enable row level security;
revoke all on table public.post_impression_seen, public.post_viewer_day, public.post_impression_daily,
  public.profile_view_seen, public.profile_viewer_day, public.profile_view_daily from public, anon, authenticated;

-- ===== internal helpers (not callable by clients) =====
create function public.internal_lagos_day(p_ts timestamptz default now()) returns date
language sql stable set search_path = '' as $$
  select (p_ts at time zone 'Africa/Lagos')::date
$$;

-- SECURITY DEFINER justification: platform_settings is not readable by ordinary users. Returns one numeric setting
-- clamped to [p_min, p_max] with a default. Not executable by clients.
create function public.internal_setting_int(p_key text, p_default int, p_min int, p_max int) returns int
language sql stable security definer set search_path = '' as $$
  select least(greatest(coalesce(
    (select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric::int end
       from public.platform_settings s where s.key = p_key), p_default), p_min), p_max)
$$;

-- The ONE place the privacy threshold is read. Floor of 3 is enforced here, whatever platform_settings says.
-- SECURITY DEFINER justification: reads platform_settings. Not executable by clients.
create function public.internal_min_viewers() returns int
language sql stable security definer set search_path = '' as $$
  select greatest(public.internal_setting_int('analytics_min_unique_viewers', 3, 3, 50), 3)
$$;

-- ===== RPC: record post impressions (returns nothing on purpose) =====
-- SECURITY DEFINER justification: writes tables clients cannot touch. auth.uid() is required, eligibility is
-- re-checked per post by internal_post_visible_to, search_path is empty, execute is granted to authenticated only.
create function public.record_post_impressions(p_post_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_max int := public.internal_setting_int('impression_batch_max', 50, 1, 100);
  v_win int := public.internal_setting_int('impression_window_minutes', 30, 1, 1440);
  v_rate int := public.internal_setting_int('impression_rate_per_minute', 120, 1, 1000);
  v_cap int := public.internal_setting_int('impression_daily_cap_per_viewer', 3000, 10, 100000);
  v_window timestamptz := date_bin(make_interval(mins => v_win), now(), timestamptz '2000-01-01 00:00:00+00');
  v_day date := public.internal_lagos_day(now());
  v_day_start timestamptz := (v_day::timestamp at time zone 'Africa/Lagos');
  v_id uuid; v_author uuid; v_n int; v_new_uv int; v_minute_ct int; v_day_ct int; v_remaining int; v_added int := 0;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_post_ids is null or cardinality(p_post_ids) = 0 then return; end if;
  if cardinality(p_post_ids) > v_max then raise exception 'too_many' using errcode = '22023'; end if;
  -- accounts that are not active/restricted (suspended, pending deletion, no profile/standing row) are ignored silently
  if not coalesce(public.effective_status_internal(v_uid) in ('active', 'restricted'), false) then return; end if;

  -- serialise this viewer's calls: the limit check and the inserts below become atomic per viewer
  perform pg_advisory_xact_lock(hashtextextended('post_impressions:' || v_uid::text, 0));

  -- exact limits: under the lock above, a batch can only add as many NEW rows as the remaining allowance
  select count(*) into v_minute_ct from public.post_impression_seen
   where viewer_id = v_uid and first_seen_at > now() - interval '1 minute';
  select count(*) into v_day_ct from public.post_impression_seen
   where viewer_id = v_uid and first_seen_at >= v_day_start;
  v_remaining := least(v_rate - v_minute_ct, v_cap - v_day_ct);
  if v_remaining <= 0 then raise exception 'rate_limited' using errcode = 'P0001'; end if;

  -- sorted order: parallel callers lock daily rows in the same order, so they cannot deadlock
  for v_id in select distinct x from unnest(p_post_ids) as x where x is not null order by x loop
    select p.author_id into v_author from public.posts p where p.id = v_id;
    if v_author is null or v_author = v_uid or not public.internal_post_visible_to(v_id, v_uid) then continue; end if;

    insert into public.post_impression_seen (viewer_id, post_id, window_start, day)
    values (v_uid, v_id, v_window, v_day) on conflict do nothing;
    get diagnostics v_n = row_count;

    if v_n = 1 then
      insert into public.post_viewer_day (viewer_id, post_id, day) values (v_uid, v_id, v_day) on conflict do nothing;
      get diagnostics v_new_uv = row_count;        -- 1 only for the first counted impression of this viewer today
      insert into public.post_impression_daily (post_id, day, impressions, unique_viewers)
      values (v_id, v_day, 1, v_new_uv)
      on conflict (post_id, day) do update
        set impressions = public.post_impression_daily.impressions + 1,
            unique_viewers = public.post_impression_daily.unique_viewers + v_new_uv;
      v_added := v_added + 1;
      exit when v_added >= v_remaining;      -- allowance used up: ignore the rest of the batch silently
    end if;
  end loop;
end $$;

-- ===== RPC: author-only reads (counts only; every figure comes from >= internal_min_viewers() distinct viewers) =====
-- Owner check excludes deleted posts ("deleted" means gone). Not-yours and does-not-exist raise the same error.
-- Series: one row per qualifying day. Days with fewer distinct viewers are OMITTED entirely.
create function public.post_impression_stats(p_post uuid, p_days int default 28)
returns table (day date, impressions int, unique_viewers int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid()); v_days int := least(greatest(coalesce(p_days, 28), 1), 365);
  v_k int := public.internal_min_viewers();
begin
  if v_uid is null or not exists (
    select 1 from public.posts p
    where p.id = p_post and p.author_id = v_uid and p.status <> 'deleted'
      and (p.community_id is null or public.internal_post_visible_to(p.id, v_uid))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select d.day, d.impressions, d.unique_viewers
  from public.post_impression_daily d
  where d.post_id = p_post and d.day > public.internal_lagos_day(now()) - v_days and d.unique_viewers >= v_k
  order by d.day;
end $$;

-- Exact distinct-viewer reach within the retention period; NULL below the threshold.
create function public.post_reach(p_post uuid, p_days int default 28) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_days int := least(greatest(coalesce(p_days, 28), 1), public.internal_setting_int('analytics_dedupe_retention_days', 35, 7, 90));
  v_k int := public.internal_min_viewers();
  v_n bigint;
begin
  if v_uid is null or not exists (
    select 1 from public.posts p
    where p.id = p_post and p.author_id = v_uid and p.status <> 'deleted'
      and (p.community_id is null or public.internal_post_visible_to(p.id, v_uid))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select count(distinct s.viewer_id) into v_n from public.post_viewer_day s
   where s.post_id = p_post and s.day > public.internal_lagos_day(now()) - v_days;
  return case when v_n >= v_k then v_n end;
end $$;

-- Lifetime totals for the caller's OWN, non-deleted posts: the SUM OF QUALIFYING DAILY CELLS ONLY (days_counted says how
-- many). Posts with no qualifying day return no row. Because hidden days never contribute, totals cannot be differenced
-- against the series to expose them. Other people's post ids are silently ignored.
create function public.my_posts_impression_totals(p_post_ids uuid[])
returns table (post_id uuid, impressions bigint, days_counted int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_uid uuid := (select auth.uid()); v_k int := public.internal_min_viewers();
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_post_ids is null or cardinality(p_post_ids) = 0 then return; end if;
  if cardinality(p_post_ids) > 100 then raise exception 'too_many' using errcode = '22023'; end if;
  return query
  select d.post_id, sum(d.impressions)::bigint, count(*)::int
  from public.post_impression_daily d
  join public.posts p on p.id = d.post_id and p.author_id = v_uid and p.status <> 'deleted'
  where d.post_id = any (p_post_ids) and d.unique_viewers >= v_k
    and (p.community_id is null or public.internal_post_visible_to(p.id, v_uid))
  group by d.post_id;
end $$;

-- ===== RPC: profile views (returns nothing on purpose: no oracle for private/blocked/missing profiles) =====
create function public.record_profile_view(p_profile uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_win int := public.internal_setting_int('impression_window_minutes', 30, 1, 1440);
  v_rate int := public.internal_setting_int('profile_view_rate_per_hour', 100, 1, 10000);
  v_window timestamptz := date_bin(make_interval(mins => v_win), now(), timestamptz '2000-01-01 00:00:00+00');
  v_day date := public.internal_lagos_day(now());
  v_n int; v_new_uv int;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_profile is null or p_profile = v_uid then return; end if;
  if not coalesce(public.effective_status_internal(v_uid) in ('active', 'restricted'), false) then return; end if;
  -- profile must be visible to the viewer (public / same-institution; private = nobody) and not blocked in EITHER direction
  if not public.internal_profile_visible(p_profile, v_uid) or public.internal_blocked_either(v_uid, p_profile) then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('profile_views:' || v_uid::text, 0));
  if (select count(*) from public.profile_view_seen
        where viewer_id = v_uid and first_seen_at > now() - interval '1 hour') >= v_rate then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.profile_view_seen (viewer_id, profile_id, window_start, day)
  values (v_uid, p_profile, v_window, v_day) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return; end if;

  insert into public.profile_viewer_day (viewer_id, profile_id, day) values (v_uid, p_profile, v_day) on conflict do nothing;
  get diagnostics v_new_uv = row_count;
  insert into public.profile_view_daily (profile_id, day, views, unique_viewers)
  values (p_profile, v_day, 1, v_new_uv)
  on conflict (profile_id, day) do update
    set views = public.profile_view_daily.views + 1,
        unique_viewers = public.profile_view_daily.unique_viewers + v_new_uv;
end $$;

-- Series: one row per qualifying day (>= internal_min_viewers() distinct viewers); other days are omitted entirely.
create function public.my_profile_view_stats(p_days int default 28)
returns table (day date, views int, unique_viewers int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid()); v_days int := least(greatest(coalesce(p_days, 28), 1), 365);
  v_k int := public.internal_min_viewers();
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select d.day, d.views, d.unique_viewers
  from public.profile_view_daily d
  where d.profile_id = v_uid and d.day > public.internal_lagos_day(now()) - v_days and d.unique_viewers >= v_k
  order by d.day;
end $$;

-- Distinct viewers of the caller's profile within the retention period; NULL below the threshold.
create function public.my_profile_unique_viewers(p_days int default 28) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_days int := least(greatest(coalesce(p_days, 28), 1), public.internal_setting_int('analytics_dedupe_retention_days', 35, 7, 90));
  v_k int := public.internal_min_viewers();
  v_n bigint;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select count(distinct s.viewer_id) into v_n from public.profile_viewer_day s
   where s.profile_id = v_uid and s.day > public.internal_lagos_day(now()) - v_days;
  return case when v_n >= v_k then v_n end;
end $$;

-- ===== retention: batched purge (service role only; the scheduled Edge Function calls it until "more" is false) =====
-- Removes: per-viewer rows older than the retention period; ALL per-viewer rows and daily counts of deleted posts;
-- daily aggregates older than p_daily_days (min 90). p_dedupe_days is clamped to >= 7.
create function public.purge_analytics_dedupe(p_batch int default 5000, p_dedupe_days int default null, p_daily_days int default 400)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_batch int := least(greatest(coalesce(p_batch, 5000), 100), 50000);
  v_keep int := greatest(coalesce(p_dedupe_days, public.internal_setting_int('analytics_dedupe_retention_days', 35, 7, 90)), 7);
  v_daily int := greatest(coalesce(p_daily_days, 400), 90);
  v_today date := public.internal_lagos_day(now());
  c1 bigint; c2 bigint; c3 bigint; c4 bigint; c5 bigint; c6 bigint; c7 bigint; c8 bigint; c9 bigint; c10 bigint;
begin
  delete from public.post_impression_seen where ctid in (select s.ctid from public.post_impression_seen s where s.day < v_today - v_keep limit v_batch);
  get diagnostics c1 = row_count;
  delete from public.post_viewer_day where ctid in (select s.ctid from public.post_viewer_day s where s.day < v_today - v_keep limit v_batch);
  get diagnostics c2 = row_count;
  delete from public.profile_view_seen where ctid in (select s.ctid from public.profile_view_seen s where s.day < v_today - v_keep limit v_batch);
  get diagnostics c3 = row_count;
  delete from public.profile_viewer_day where ctid in (select s.ctid from public.profile_viewer_day s where s.day < v_today - v_keep limit v_batch);
  get diagnostics c4 = row_count;
  delete from public.post_impression_seen where ctid in (select s.ctid from public.post_impression_seen s join public.posts p on p.id = s.post_id where p.status = 'deleted' limit v_batch);
  get diagnostics c5 = row_count;
  delete from public.post_viewer_day where ctid in (select s.ctid from public.post_viewer_day s join public.posts p on p.id = s.post_id where p.status = 'deleted' limit v_batch);
  get diagnostics c6 = row_count;
  delete from public.post_impression_daily where ctid in (select d.ctid from public.post_impression_daily d join public.posts p on p.id = d.post_id where p.status = 'deleted' limit v_batch);
  get diagnostics c7 = row_count;
  delete from public.post_impression_daily where ctid in (select d.ctid from public.post_impression_daily d where d.day < v_today - v_daily limit v_batch);
  get diagnostics c8 = row_count;
  delete from public.profile_view_daily where ctid in (select d.ctid from public.profile_view_daily d where d.day < v_today - v_daily limit v_batch);
  get diagnostics c9 = row_count;
  c10 := c1 + c2 + c3 + c4 + c5 + c6 + c7 + c8 + c9;
  return jsonb_build_object(
    'post_impression_seen', c1 + c5, 'post_viewer_day', c2 + c6, 'profile_view_seen', c3, 'profile_viewer_day', c4,
    'post_impression_daily', c7 + c8, 'profile_view_daily', c9,
    'more', greatest(c1, c2, c3, c4, c5, c6, c7, c8, c9) >= v_batch);   -- true => call again
end $$;

-- ===== privileges =====
revoke execute on function
  public.internal_lagos_day(timestamptz), public.internal_setting_int(text, int, int, int), public.internal_min_viewers(),
  public.record_post_impressions(uuid[]), public.post_impression_stats(uuid, int), public.post_reach(uuid, int),
  public.my_posts_impression_totals(uuid[]), public.record_profile_view(uuid), public.my_profile_view_stats(int),
  public.my_profile_unique_viewers(int), public.purge_analytics_dedupe(int, int, int)
from public, anon, authenticated;

grant execute on function
  public.record_post_impressions(uuid[]), public.post_impression_stats(uuid, int), public.post_reach(uuid, int),
  public.my_posts_impression_totals(uuid[]), public.record_profile_view(uuid), public.my_profile_view_stats(int),
  public.my_profile_unique_viewers(int)
to authenticated;

grant execute on function public.purge_analytics_dedupe(int, int, int) to service_role;
