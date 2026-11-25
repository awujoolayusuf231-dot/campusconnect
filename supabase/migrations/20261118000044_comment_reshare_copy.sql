begin;

do $preflight$
declare
  v_source text;
begin
  if to_regclass('public.comments') is null
     or to_regclass('public.comment_reposts') is null
     or to_regclass('public.posts') is null
     or to_regclass('public.profiles') is null
     or to_regprocedure('public.repost_comment(uuid)') is null
     or to_regprocedure('public.internal_post_visible_to(uuid,uuid)') is null
     or to_regprocedure('public.internal_profile_visible(uuid,uuid)') is null
     or to_regprocedure('public.internal_blocked_either(uuid,uuid)') is null
     or to_regprocedure('public.account_can_post()') is null then
    raise exception 'Comment reshare cleanup requires the existing comment, post, and visibility foundations';
  end if;

  select proc.prosrc into v_source
  from pg_catalog.pg_proc proc
  where proc.oid = 'public.repost_comment(uuid)'::regprocedure;
  if position('Original discussion:' in v_source) = 0 then
    raise exception 'The current comment reshare function does not match the expected copy format';
  end if;
end
$preflight$;

create or replace function public.repost_comment(p_comment uuid) returns uuid
language plpgsql security definer set search_path = ''
as $function$
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

  select c.post_id, p.author_id, p.visibility, p.community_id, c.author_id, c.body, pr.username
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

  v_body := 'Reposted comment by @' || v_comment_username || E':\n\n' || v_comment_body;
  insert into public.posts(author_id, body, visibility)
  values (v_uid, v_body, 'public')
  returning id into v_new_post;

  insert into public.comment_reposts(user_id, comment_id, post_id)
  values (v_uid, p_comment, v_new_post);
  return v_new_post;
end
$function$;

update public.posts p
set body = left(p.body, char_length(p.body) - char_length(suffix.value))
from public.comment_reposts repost
join public.comments c on c.id = repost.comment_id
cross join lateral (
  select E'\n\nOriginal discussion: /app/p/' || c.post_id::text || '#comment-' || c.id::text as value
) suffix
where p.id = repost.post_id
  and p.body like 'Reposted comment by @%'
  and right(p.body, char_length(suffix.value)) = suffix.value;

commit;
