begin;

do $migration$
declare
  v_ranked_definition text;
  v_timeline_definition text;
  v_old_repost_author_filter text := 'and p.author_id <> v_uid and r.created_at <= v_ranked_at';
  v_old_ranked_follow_filter text := 'and exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = r.user_id)';
  v_old_seen_filter text := 'where views.user_id = v_uid and views.post_id = p.id';
  v_timeline_follow_pattern text := $pattern$and\s+exists\s*\(\s*select\s+1\s+from\s+public\.follows\s+f\s+where\s+f\.follower_id\s*=\s*\(select\s+auth\.uid\(\)\)\s+and\s+f\.followee_id\s*=\s*r\.user_id\s*\)$pattern$;
  v_timeline_follow_replacement text := $replacement$and (
        r.user_id = (select auth.uid())
        or p.author_id = (select auth.uid())
        or exists (
          select 1 from public.follows f
          where f.follower_id = (select auth.uid()) and f.followee_id = r.user_id
        ))$replacement$;
  v_timeline_follow_matches integer;
begin
  if to_regclass('public.posts') is null
     or to_regclass('public.reposts') is null
     or to_regclass('public.post_views') is null
     or to_regclass('public.muted_users') is null
     or to_regprocedure('public.get_ranked_feed(double precision,timestamptz,uuid,timestamptz,text,integer)') is null
     or to_regprocedure('public.feed_timeline(text,timestamptz,text,uuid,integer)') is null then
    raise exception 'Repost feed visibility requires the ranked feed and repost foundations';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.get_ranked_feed(double precision,timestamptz,uuid,timestamptz,text,integer)'::regprocedure
  ) into v_ranked_definition;
  if position(v_old_repost_author_filter in v_ranked_definition) = 0
     or position(v_old_ranked_follow_filter in v_ranked_definition) = 0
     or position(v_old_seen_filter in v_ranked_definition) = 0 then
    raise exception 'Ranked feed definition differs from the expected repost visibility version';
  end if;

  v_ranked_definition := replace(
    v_ranked_definition,
    v_old_repost_author_filter,
    'and r.created_at <= v_ranked_at'
  );
  v_ranked_definition := replace(
    v_ranked_definition,
    v_old_ranked_follow_filter,
    'and (r.user_id = v_uid or p.author_id = v_uid or exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = r.user_id))'
  );
  v_ranked_definition := replace(
    v_ranked_definition,
    v_old_seen_filter,
    'where views.user_id = v_uid and views.post_id = p.id and views.seen_at >= latest.activity_at'
  );
  execute v_ranked_definition;

  select pg_catalog.pg_get_functiondef(
    'public.feed_timeline(text,timestamptz,text,uuid,integer)'::regprocedure
  ) into v_timeline_definition;
  select count(*) into v_timeline_follow_matches
  from regexp_matches(v_timeline_definition, v_timeline_follow_pattern, 'g');
  if v_timeline_follow_matches <> 1 then
    raise exception 'Feed timeline definition differs from the expected repost visibility version';
  end if;

  v_timeline_definition := regexp_replace(
    v_timeline_definition,
    v_timeline_follow_pattern,
    v_timeline_follow_replacement
  );
  execute v_timeline_definition;
end
$migration$;

commit;
