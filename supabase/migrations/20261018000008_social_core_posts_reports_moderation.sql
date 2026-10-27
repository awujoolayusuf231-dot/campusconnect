-- 0008 Phase 4 social core. STATUS: APPLIED to CampusConnect01 (manually, by the owner, in the SQL editor) and TESTED: supabase/tests/social_core.sql all PASS.
-- A first attempt failed (rolled back, nothing created) because internal_blocked_either() referenced public.blocks
-- before it existed; this version creates blocks first. Apply in the Supabase SQL editor (single transaction) or ask
-- Claude to apply it when the Supabase tool is connected. Then run the Phase 4 test plan in supabase/tests/social_core_plan.md.

create type public.content_status as enum ('visible', 'hidden', 'deleted');

create function public.append_only_guard() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'append-only table' using errcode = '42501'; end $$;

-- ===== blocks =====
create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create function public.internal_blocked_either(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

-- ===== follows =====
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id, created_at desc);

create function public.blocks_remove_follows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followee_id = new.blocked_id)
     or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return null;
end $$;
create trigger blocks_after_insert after insert on public.blocks
  for each row execute function public.blocks_remove_follows();

-- ===== posts =====
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null,
  status public.content_status not null default 'visible',
  like_count int not null default 0,
  comment_count int not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint posts_body_check check (char_length(body) <= 2000 and (status = 'deleted' or char_length(btrim(body)) >= 1))
);
create index posts_feed_idx on public.posts (created_at desc, id desc) where status = 'visible';
create index posts_author_idx on public.posts (author_id, created_at desc);
create trigger posts_updated_at before update on public.posts for each row execute function public.set_updated_at();

create function public.posts_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.posts where author_id = new.author_id and created_at > now() - interval '1 hour') >= 20 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  elsif new.body is distinct from old.body and old.status = 'visible' and new.status = 'visible' then
    new.edited_at := now();
  end if;
  return new;
end $$;
create trigger posts_before_write before insert or update on public.posts
  for each row execute function public.posts_before_write();

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  storage_path text not null check (char_length(storage_path) <= 200 and storage_path !~ '\.\.'),
  position smallint not null check (position between 0 and 3),
  created_at timestamptz not null default now(),
  unique (post_id, position)
);

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_likes_user_idx on public.post_likes (user_id, created_at desc);

create function public.post_likes_count_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then update public.posts set like_count = like_count + 1 where id = new.post_id;
  else update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id; end if;
  return null;
end $$;
create trigger post_likes_count after insert or delete on public.post_likes
  for each row execute function public.post_likes_count_trg();

-- ===== comments =====
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  status public.content_status not null default 'visible',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint comments_body_check check (char_length(body) <= 1000 and (status = 'deleted' or char_length(btrim(body)) >= 1))
);
create index comments_post_idx on public.comments (post_id, created_at, id) where status = 'visible';
create index comments_author_idx on public.comments (author_id, created_at desc);
create trigger comments_updated_at before update on public.comments for each row execute function public.set_updated_at();

create function public.comments_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.body is distinct from old.body and old.status = 'visible' and new.status = 'visible' then new.edited_at := now(); end if;
  return new;
end $$;
create trigger comments_before_update before update on public.comments
  for each row execute function public.comments_before_update();

create function public.comments_count_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_post uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts set comment_count = (select count(*) from public.comments where post_id = v_post and status = 'visible') where id = v_post;
  return null;
end $$;
create trigger comments_count after insert or update of status or delete on public.comments
  for each row execute function public.comments_count_trg();

-- ===== reports + moderation =====
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  target_type text not null check (target_type in ('user', 'post', 'comment')),
  target_id uuid not null,
  reported_user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('spam','harassment','hate','sexual_content','violence','self_harm','impersonation','misinformation','other')),
  explanation text check (explanation is null or char_length(explanation) <= 500),
  content_snapshot text check (content_snapshot is null or char_length(content_snapshot) <= 600),
  status text not null default 'open' check (status in ('open','under_review','action_taken','dismissed','escalated')),
  assigned_to uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index reports_queue_idx on public.reports (status, created_at desc);
create index reports_reported_user_idx on public.reports (reported_user_id, created_at desc);
create index reports_assigned_idx on public.reports (assigned_to) where assigned_to is not null;

create table public.report_notes (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  note text not null check (char_length(btrim(note)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index report_notes_report_idx on public.report_notes (report_id, created_at);

create table public.moderation_actions (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  action text not null check (action in ('hide_content','restore_content','warn_user','dismiss_report','resolve_report','escalate','assign','update_report')),
  target_type text not null,
  target_id uuid,
  target_user_id uuid,
  report_id uuid,
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  created_at timestamptz not null default now()
);
create index mod_actions_target_idx on public.moderation_actions (target_type, target_id);
create index mod_actions_user_idx on public.moderation_actions (target_user_id, created_at desc);
create index mod_actions_report_idx on public.moderation_actions (report_id);
create trigger mod_actions_no_change before update or delete on public.moderation_actions
  for each row execute function public.append_only_guard();
create trigger mod_actions_no_truncate before truncate on public.moderation_actions
  for each statement execute function public.append_only_guard();

-- ===== posting eligibility (self only; reveals nothing about other users) =====
create function public.account_can_post() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.effective_status_internal(s.user_id) = 'active'
        or (public.effective_status_internal(s.user_id) = 'restricted' and not s.posting_restricted)
    from public.account_standing s where s.user_id = (select auth.uid())
  ), false)
$$;

create function public.internal_profile_visible(p_profile uuid, p_viewer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_profile and (
      p.id = p_viewer
      or (public.effective_status_internal(p.id) in ('active', 'restricted')
          and (p.visibility = 'public'
               or (p.visibility = 'institution' and p.institution_id is not null
                   and p.institution_id = (select v.institution_id from public.profiles v where v.id = p_viewer)))))
  )
$$;

-- ===== RLS =====
alter table public.blocks enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_likes enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;
alter table public.report_notes enable row level security;
alter table public.moderation_actions enable row level security;

grant select, delete on public.blocks to authenticated;
grant insert (blocked_id) on public.blocks to authenticated;
create policy blocks_select on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy blocks_insert on public.blocks for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy blocks_delete on public.blocks for delete to authenticated using (blocker_id = (select auth.uid()));

grant select, delete on public.follows to authenticated;
create policy follows_select on public.follows for select to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()) or (select public.has_permission('users.view')));
create policy follows_delete on public.follows for delete to authenticated using (follower_id = (select auth.uid()));

grant select on public.posts to authenticated;
grant insert (body) on public.posts to authenticated;
grant update (body) on public.posts to authenticated;
create policy posts_select on public.posts for select to authenticated using (
  author_id = (select auth.uid())
  or (select public.has_permission('content.moderate'))
  or (status = 'visible'
      and exists (select 1 from public.profiles pr where pr.id = posts.author_id)
      and not exists (select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = posts.author_id))
);
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.account_can_post()));
create policy posts_update_own on public.posts for update to authenticated
  using (author_id = (select auth.uid()) and status = 'visible')
  with check (author_id = (select auth.uid()) and status = 'visible' and (select public.account_can_post()));

grant select, delete on public.post_media to authenticated;
grant insert (post_id, storage_path, position) on public.post_media to authenticated;
create policy post_media_select on public.post_media for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_media.post_id));
create policy post_media_insert on public.post_media for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_media.post_id and p.author_id = (select auth.uid()))
              and split_part(storage_path, '/', 1) = (select auth.uid())::text);
create policy post_media_delete on public.post_media for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_media.post_id and p.author_id = (select auth.uid())));

grant select on public.post_likes to authenticated;
create policy post_likes_select on public.post_likes for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('content.moderate')));

grant select on public.comments to authenticated;
grant update (body) on public.comments to authenticated;
create policy comments_select on public.comments for select to authenticated using (
  author_id = (select auth.uid())
  or (select public.has_permission('content.moderate'))
  or (status = 'visible'
      and exists (select 1 from public.posts p where p.id = comments.post_id)
      and exists (select 1 from public.profiles pr where pr.id = comments.author_id)
      and not exists (select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = comments.author_id))
);
create policy comments_update_own on public.comments for update to authenticated
  using (author_id = (select auth.uid()) and status = 'visible')
  with check (author_id = (select auth.uid()) and status = 'visible' and (select public.account_can_post()));

grant select on public.reports, public.report_notes, public.moderation_actions to authenticated;
create policy reports_select_staff on public.reports for select to authenticated using ((select public.has_permission('reports.manage')));
create policy report_notes_select on public.report_notes for select to authenticated using ((select public.has_permission('reports.manage')));
create policy mod_actions_select on public.moderation_actions for select to authenticated
  using ((select public.has_permission('reports.manage')) or (select public.has_permission('content.moderate')));

-- ===== student RPCs =====
create function public.like_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_author uuid;
begin
  if v_uid is null or not public.account_is_listed(v_uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  select author_id into v_author from public.posts where id = p_post and status = 'visible';
  if v_author is null or not public.internal_profile_visible(v_author, v_uid) or public.internal_blocked_either(v_uid, v_author) then
    raise exception 'not_found' using errcode = '22023';
  end if;
  insert into public.post_likes (post_id, user_id) values (p_post, v_uid) on conflict do nothing;
end $$;

create function public.unlike_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.post_likes where post_id = p_post and user_id = v_uid;
end $$;

create function public.add_comment(p_post uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_author uuid; v_id uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  if v_uid is null or not public.account_can_post() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(v_body) not between 1 and 1000 then raise exception 'invalid_body' using errcode = '22023'; end if;
  if (select count(*) from public.comments where author_id = v_uid and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  select author_id into v_author from public.posts where id = p_post and status = 'visible';
  if v_author is null or not public.internal_profile_visible(v_author, v_uid) or public.internal_blocked_either(v_uid, v_author) then
    raise exception 'not_found' using errcode = '22023';
  end if;
  insert into public.comments (post_id, author_id, body) values (p_post, v_uid, v_body) returning id into v_id;
  return v_id;
end $$;

create function public.delete_own_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.posts set status = 'deleted', body = '' where id = p_post and author_id = v_uid and status <> 'deleted';
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
end $$;

create function public.delete_own_comment(p_comment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.comments set status = 'deleted', body = '' where id = p_comment and author_id = v_uid and status <> 'deleted';
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
end $$;

create function public.follow_user(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not public.account_is_listed(v_uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_target = v_uid then raise exception 'cannot_follow_self' using errcode = '22023'; end if;
  if not public.internal_profile_visible(p_target, v_uid) or public.internal_blocked_either(v_uid, p_target) then
    raise exception 'not_found' using errcode = '22023';
  end if;
  insert into public.follows (follower_id, followee_id) values (v_uid, p_target) on conflict do nothing;
end $$;

create function public.unfollow_user(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.follows where follower_id = v_uid and followee_id = p_target;
end $$;

create function public.submit_report(p_type text, p_target uuid, p_category text, p_explanation text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_user uuid; v_snap text; v_id uuid; v_post uuid;
begin
  if v_uid is null or not public.account_is_listed(v_uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select count(*) from public.reports where reporter_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if p_type = 'post' then
    select author_id, left(body, 500) into v_user, v_snap from public.posts where id = p_target and status = 'visible';
  elsif p_type = 'comment' then
    select c.author_id, left(c.body, 500), c.post_id into v_user, v_snap, v_post
      from public.comments c where c.id = p_target and c.status = 'visible';
    if v_post is not null and not exists (select 1 from public.posts where id = v_post and status = 'visible') then v_user := null; end if;
  elsif p_type = 'user' then
    select p.id, left(p.display_name || ' @' || p.username || ': ' || coalesce(p.bio, ''), 500) into v_user, v_snap
      from public.profiles p where p.id = p_target;
  else raise exception 'invalid_type' using errcode = '22023'; end if;
  if v_user is null or not public.internal_profile_visible(v_user, v_uid) then raise exception 'not_found' using errcode = '22023'; end if;
  if v_user = v_uid then raise exception 'cannot_report_self' using errcode = '22023'; end if;
  insert into public.reports (reporter_id, target_type, target_id, reported_user_id, category, explanation, content_snapshot)
  values (v_uid, p_type, p_target, v_user, p_category, nullif(btrim(coalesce(p_explanation, '')), ''), v_snap)
  on conflict (reporter_id, target_type, target_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.reports where reporter_id = v_uid and target_type = p_type and target_id = p_target;
  end if;
  return v_id;
end $$;

create function public.my_reports() returns table (id uuid, target_type text, category text, status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.target_type, r.category, r.status, r.created_at
  from public.reports r where r.reporter_id = (select auth.uid()) order by r.created_at desc limit 100
$$;

-- ===== read RPCs (SECURITY INVOKER: RLS applies) =====
create function public.feed_posts(p_scope text default 'all', p_before timestamptz default null,
  p_before_id uuid default null, p_limit int default 20)
returns table (id uuid, author_id uuid, body text, created_at timestamptz, edited_at timestamptz,
  like_count int, comment_count int, liked_by_me boolean, username text, display_name text, avatar_path text)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.author_id, p.body, p.created_at, p.edited_at, p.like_count, p.comment_count,
    exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
    pr.username, pr.display_name, pr.avatar_path
  from public.posts p join public.profiles pr on pr.id = p.author_id
  where p.status = 'visible'
    and (p_scope = 'all'
      or (p_scope = 'following' and exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.followee_id = p.author_id))
      or (p_scope = 'institution' and pr.institution_id is not null and pr.institution_id = (select public.current_institution_id())))
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

create function public.discover_students(p_query text default null, p_institution uuid default null,
  p_department text default null, p_level text default null, p_interest text default null,
  p_limit int default 24, p_offset int default 0)
returns table (id uuid, username text, display_name text, avatar_path text, bio text,
  institution_id uuid, department text, academic_level text)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if v_q is not null then v_q := replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_'); end if;
  return query
    select p.id, p.username, p.display_name, p.avatar_path, p.bio, p.institution_id, p.department, p.academic_level
    from public.profiles p
    where p.id <> (select auth.uid()) and p.visibility <> 'private'
      and not exists (select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = p.id)
      and (v_q is null or p.username ilike '%' || v_q || '%' or p.display_name ilike '%' || v_q || '%')
      and (p_institution is null or p.institution_id = p_institution)
      and (p_department is null or lower(p.department) = lower(p_department))
      and (p_level is null or p.academic_level = p_level)
      and (p_interest is null or exists (select 1 from unnest(p.interests) i where lower(i) = lower(p_interest)))
    order by p.created_at desc, p.id
    limit least(greatest(coalesce(p_limit, 24), 1), 50) offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- ===== admin / moderator RPCs =====
create function public.admin_set_content_state(p_type text, p_id uuid, p_hide boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_author uuid; v_status public.content_status; v_new public.content_status;
begin
  if v_actor is null or not public.has_permission('content.moderate') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_type = 'post' then select author_id, status into v_author, v_status from public.posts where id = p_id for update;
  elsif p_type = 'comment' then select author_id, status into v_author, v_status from public.comments where id = p_id for update;
  else raise exception 'invalid_type' using errcode = '22023'; end if;
  if v_author is null then raise exception 'not_found' using errcode = '22023'; end if;
  if public.role_rank(coalesce((select role from public.user_roles where user_id = v_author), 'student'))
       >= public.role_rank(public.current_app_role()) then
    raise exception 'insufficient_rank' using errcode = '42501';
  end if;
  if p_hide then
    if v_status <> 'visible' then raise exception 'invalid_state' using errcode = '22023'; end if;
    v_new := 'hidden';
  else
    if v_status = 'deleted' then raise exception 'not_restorable' using errcode = '22023'; end if;
    if v_status <> 'hidden' then raise exception 'invalid_state' using errcode = '22023'; end if;
    v_new := 'visible';
  end if;
  if p_type = 'post' then update public.posts set status = v_new where id = p_id;
  else update public.comments set status = v_new where id = p_id; end if;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, target_user_id, reason)
  values (v_actor, case when p_hide then 'hide_content' else 'restore_content' end, p_type, p_id, v_author, btrim(p_reason));
  perform public.log_admin_action(v_actor, case when p_hide then 'content.hide' else 'content.restore' end,
    p_type, p_id::text, btrim(p_reason), jsonb_build_object('author_id', v_author));
end $$;

create function public.admin_update_report(p_report uuid, p_status text, p_resolution text, p_assign_to uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_old text; v_user uuid; v_terminal boolean := p_status in ('action_taken', 'dismissed');
begin
  if v_actor is null or not public.has_permission('reports.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('open', 'under_review', 'action_taken', 'dismissed', 'escalated') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_resolution is null or char_length(btrim(p_resolution)) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select status, reported_user_id into v_old, v_user from public.reports where id = p_report for update;
  if v_old is null then raise exception 'not_found' using errcode = '22023'; end if;
  if v_old in ('action_taken', 'dismissed') and p_status not in ('action_taken', 'dismissed')
     and public.role_rank(public.current_app_role()) < 2 then
    raise exception 'insufficient_rank' using errcode = '42501';
  end if;
  if p_assign_to is not null and not exists (select 1 from public.user_roles where user_id = p_assign_to and role in ('moderator', 'admin', 'owner')) then
    raise exception 'invalid_assignee' using errcode = '22023';
  end if;
  update public.reports set status = p_status,
    assigned_to = coalesce(p_assign_to, assigned_to),
    resolved_by = case when v_terminal then v_actor else null end,
    resolved_at = case when v_terminal then now() else null end
  where id = p_report;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, target_user_id, report_id, reason)
  values (v_actor,
    case p_status when 'dismissed' then 'dismiss_report' when 'action_taken' then 'resolve_report'
                  when 'escalated' then 'escalate' else case when p_assign_to is not null then 'assign' else 'update_report' end end,
    'report', p_report, v_user, p_report, btrim(p_resolution));
  perform public.log_admin_action(v_actor, 'report.update', 'report', p_report::text, btrim(p_resolution),
    jsonb_build_object('old_status', v_old, 'new_status', p_status, 'assigned_to', p_assign_to));
end $$;

create function public.admin_add_report_note(p_report uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.has_permission('reports.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.reports where id = p_report) then raise exception 'not_found' using errcode = '22023'; end if;
  insert into public.report_notes (report_id, author_id, note) values (p_report, v_actor, btrim(p_note));
  perform public.log_admin_action(v_actor, 'report.note', 'report', p_report::text, null, '{}'::jsonb);
end $$;

create function public.admin_warn_user(p_user uuid, p_reason text, p_report uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.has_permission('reports.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_user = v_actor or not exists (select 1 from public.profiles where id = p_user) then raise exception 'invalid_target' using errcode = '22023'; end if;
  if public.role_rank(coalesce((select role from public.user_roles where user_id = p_user), 'student'))
       >= public.role_rank(public.current_app_role()) then
    raise exception 'insufficient_rank' using errcode = '42501';
  end if;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, target_user_id, report_id, reason)
  values (v_actor, 'warn_user', 'user', p_user, p_user, p_report, btrim(p_reason));
  perform public.log_admin_action(v_actor, 'user.warn', 'user', p_user::text, btrim(p_reason), jsonb_build_object('report_id', p_report));
end $$;

-- ===== function privileges: explicit, never rely on defaults =====
revoke execute on function
  public.append_only_guard(), public.internal_blocked_either(uuid, uuid), public.internal_profile_visible(uuid, uuid),
  public.blocks_remove_follows(), public.posts_before_write(), public.post_likes_count_trg(),
  public.comments_before_update(), public.comments_count_trg(), public.account_can_post(),
  public.like_post(uuid), public.unlike_post(uuid), public.add_comment(uuid, text), public.delete_own_post(uuid),
  public.delete_own_comment(uuid), public.follow_user(uuid), public.unfollow_user(uuid),
  public.submit_report(text, uuid, text, text), public.my_reports(),
  public.feed_posts(text, timestamptz, uuid, int),
  public.discover_students(text, uuid, text, text, text, int, int),
  public.admin_set_content_state(text, uuid, boolean, text), public.admin_update_report(uuid, text, text, uuid),
  public.admin_add_report_note(uuid, text), public.admin_warn_user(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function
  public.account_can_post(), public.like_post(uuid), public.unlike_post(uuid), public.add_comment(uuid, text),
  public.delete_own_post(uuid), public.delete_own_comment(uuid), public.follow_user(uuid), public.unfollow_user(uuid),
  public.submit_report(text, uuid, text, text), public.my_reports(), public.feed_posts(text, timestamptz, uuid, int),
  public.discover_students(text, uuid, text, text, text, int, int),
  public.admin_set_content_state(text, uuid, boolean, text), public.admin_update_report(uuid, text, text, uuid),
  public.admin_add_report_note(uuid, text), public.admin_warn_user(uuid, text, uuid)
  to authenticated;
