begin;

do $preflight$
begin
  if to_regprocedure('campusconnect_private.internal_current_community_member(uuid)') is null
     or to_regprocedure('campusconnect_private.internal_current_post_row_visible(uuid)') is null
     or to_regprocedure('public.community_posts(uuid,timestamp with time zone,uuid,integer)') is null
     or not exists (
       select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'posts'
         and policyname = 'campusconnect_posts_community_guard'
     )
     or not exists (
       select 1 from pg_policies
       where schemaname = 'storage'
         and tablename = 'objects'
         and policyname = 'campusconnect_post_images_read_guard'
     ) then
    raise exception 'Community membership hardening must be applied before this migration';
  end if;
end;
$preflight$;

create or replace function campusconnect_private.internal_current_post_row_visible(p_post uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select coalesce((
    select (
      (p.status = 'visible'
       and campusconnect_private.internal_current_post_visible(p.id))
      or (
        p.author_id = (select auth.uid())
        and (
          p.community_id is null
          or campusconnect_private.internal_current_community_member(p.community_id)
        )
      )
      or (
        p.community_id is null
        and public.has_permission('content.moderate')
      )
      or (
        p.status = 'hidden'
        and p.community_id is not null
        and campusconnect_private.internal_current_community_manager(p.community_id)
        and exists (
          select 1 from public.communities c
          where c.id = p.community_id and c.status = 'active'
        )
      )
    )
    from public.posts p
    where p.id = p_post
  ), false)
$function$;

drop policy campusconnect_posts_community_guard on public.posts;
create policy campusconnect_posts_community_guard on public.posts
  as restrictive for select to authenticated
  using (
    community_id is null
    or campusconnect_private.internal_current_community_member(community_id)
  );

drop policy campusconnect_posts_visibility_guard on public.posts;
create policy campusconnect_posts_visibility_guard on public.posts
  as restrictive for select to authenticated
  using (
    (
      author_id = (select auth.uid())
      and (
        community_id is null
        or campusconnect_private.internal_current_community_member(community_id)
      )
    )
    or (
      community_id is null
      and public.has_permission('content.moderate')
    )
    or (
      status = 'visible'
      and campusconnect_private.internal_current_post_visible(id)
    )
    or (
      status = 'hidden'
      and community_id is not null
      and campusconnect_private.internal_current_community_manager(community_id)
      and exists (
        select 1 from public.communities c
        where c.id = posts.community_id and c.status = 'active'
      )
    )
  );

drop policy campusconnect_post_images_read_guard on storage.objects;
create policy campusconnect_post_images_read_guard on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id <> 'post-images'
    or exists (
      select 1
      from public.post_media pm
      join public.posts p on p.id = pm.post_id
      where pm.storage_path = objects.name
        and (
          campusconnect_private.internal_current_post_visible(p.id)
          or (
            p.community_id is null
            and public.has_permission('content.moderate')
          )
          or campusconnect_private.internal_current_post_row_visible(p.id)
        )
    )
  );

create or replace function public.community_posts(
  p_comm uuid,
  p_before timestamp with time zone default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid, author_id uuid, body text, created_at timestamp with time zone, edited_at timestamp with time zone,
  like_count integer, comment_count integer, repost_count integer,
  liked_by_me boolean, reposted_by_me boolean,
  username text, display_name text, avatar_path text,
  activity_at timestamp with time zone, reposter_username text, reposter_name text
)
language sql stable security invoker set search_path = ''
as $function$
  select p.id, p.author_id, p.body, p.created_at, p.edited_at,
    p.like_count, p.comment_count, p.repost_count,
    exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
    exists (select 1 from public.reposts r where r.post_id = p.id and r.user_id = (select auth.uid())),
    pr.username, pr.display_name, pr.avatar_path,
    p.created_at, null::text, null::text
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where p.community_id = p_comm
    and p.status = 'visible'
    and campusconnect_private.internal_current_community_member(p_comm)
    and (p_before is null or (p.created_at, p.id) < (
      p_before,
      coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
    ))
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$function$;

revoke all on function public.community_update(uuid, text) from public, anon, authenticated;
revoke update on table public.communities from public, anon, authenticated;

commit;
