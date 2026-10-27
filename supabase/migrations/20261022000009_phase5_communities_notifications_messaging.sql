-- 0009 Phase 5: communities, notifications + announcements, messaging, extended reports, admin content stats.
-- APPLIED to CampusConnect01 as four migrations (communities, notifications_and_announcements, messaging_reports_and_stats,
-- fix_community_null_role_checks) and TESTED (all checks PASS after the fix; see docs/STATUS.md). This file is the
-- MERGED equivalent for fresh databases: the null-role fix is folded into the original function definitions.
-- Requires migrations 0001-0008 applied first.

-- ======================= COMMUNITIES =======================
create function public.feature_enabled(p_key text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select coalesce((select enabled from public.feature_flags where key = p_key), false)
$$;

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 60),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  description text check (description is null or char_length(description) <= 500),
  category text not null check (category in ('institution','department','course','interest','activity','other')),
  institution_id uuid references public.institutions(id) on delete set null,
  status text not null default 'active' check (status in ('active','archived','disabled')),
  created_by uuid references auth.users(id) on delete set null,
  member_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index communities_slug_key on public.communities (slug);
create unique index communities_name_key on public.communities (lower(btrim(name)));
create index communities_name_trgm on public.communities using gin (name extensions.gin_trgm_ops);
create index communities_status_idx on public.communities (status, member_count desc);
create index communities_creator_idx on public.communities (created_by, created_at desc);
create trigger communities_updated_at before update on public.communities for each row execute function public.set_updated_at();

create table public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','moderator','member')),
  status text not null default 'active' check (status in ('active','banned')),
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index community_members_user_idx on public.community_members (user_id, joined_at desc);
create unique index one_owner_per_community on public.community_members (community_id) where role = 'owner';

create function public.community_members_count_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v uuid := coalesce(new.community_id, old.community_id);
begin
  update public.communities set member_count = (select count(*) from public.community_members where community_id = v and status = 'active') where id = v;
  return null;
end $$;
create trigger community_members_count after insert or update of status or delete on public.community_members
  for each row execute function public.community_members_count_trg();

create table public.community_mod_actions (
  id bigint generated always as identity primary key,
  community_id uuid not null,
  actor_id uuid not null,
  action text not null check (action in ('ban','unban','remove','make_moderator','remove_moderator','hide_post','restore_post','archive','unarchive')),
  target_user_id uuid,
  target_post_id uuid,
  reason text check (reason is null or char_length(btrim(reason)) between 5 and 500),
  created_at timestamptz not null default now()
);
create index community_mod_actions_idx on public.community_mod_actions (community_id, created_at desc);
create trigger community_mod_no_change before update or delete on public.community_mod_actions for each row execute function public.append_only_guard();
create trigger community_mod_no_truncate before truncate on public.community_mod_actions for each statement execute function public.append_only_guard();

alter table public.moderation_actions drop constraint moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check
  check (action in ('hide_content','restore_content','warn_user','dismiss_report','resolve_report','escalate','assign','update_report','community_state'));

create function public.my_community_role(p_comm uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.community_members where community_id = p_comm and user_id = (select auth.uid()) and status = 'active'
$$;

alter table public.posts add column community_id uuid references public.communities(id) on delete cascade;
alter table public.posts add column hidden_scope text check (hidden_scope in ('platform','community'));
create index posts_community_idx on public.posts (community_id, created_at desc, id desc) where status = 'visible' and community_id is not null;
grant insert (community_id) on public.posts to authenticated;

create function public.posts_hidden_scope_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'hidden' and old.status <> 'hidden' then
    new.hidden_scope := coalesce(nullif(current_setting('app.hide_scope', true), ''), 'platform');
  elsif new.status <> 'hidden' then
    new.hidden_scope := null;
  end if;
  return new;
end $$;
create trigger posts_hidden_scope before update of status on public.posts for each row execute function public.posts_hidden_scope_trg();

drop policy posts_select on public.posts;
drop policy posts_insert on public.posts;
create policy posts_select on public.posts for select to authenticated using (
  author_id = (select auth.uid())
  or (select public.has_permission('content.moderate'))
  or (status = 'hidden' and community_id is not null and (select public.my_community_role(posts.community_id)) in ('owner','moderator'))
  or (status = 'visible'
      and exists (select 1 from public.profiles pr where pr.id = posts.author_id)
      and not exists (select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = posts.author_id)
      and (community_id is null or exists (select 1 from public.communities c where c.id = posts.community_id and c.status in ('active','archived'))))
);
create policy posts_insert on public.posts for insert to authenticated with check (
  author_id = (select auth.uid()) and (select public.account_can_post())
  and (community_id is null or (public.feature_enabled('communities')
       and exists (select 1 from public.community_members m join public.communities c on c.id = m.community_id
                   where m.community_id = posts.community_id and m.user_id = (select auth.uid()) and m.status = 'active' and c.status = 'active')))
);

create or replace function public.feed_posts(p_scope text default 'all', p_before timestamptz default null,
  p_before_id uuid default null, p_limit int default 20)
returns table (id uuid, author_id uuid, body text, created_at timestamptz, edited_at timestamptz,
  like_count int, comment_count int, liked_by_me boolean, username text, display_name text, avatar_path text)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.author_id, p.body, p.created_at, p.edited_at, p.like_count, p.comment_count,
    exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
    pr.username, pr.display_name, pr.avatar_path
  from public.posts p join public.profiles pr on pr.id = p.author_id
  where p.status = 'visible' and p.community_id is null
    and (p_scope = 'all'
      or (p_scope = 'following' and exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.followee_id = p.author_id))
      or (p_scope = 'institution' and pr.institution_id is not null and pr.institution_id = (select public.current_institution_id())))
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

create function public.community_posts(p_comm uuid, p_before timestamptz default null, p_before_id uuid default null, p_limit int default 20)
returns table (id uuid, author_id uuid, body text, created_at timestamptz, edited_at timestamptz,
  like_count int, comment_count int, liked_by_me boolean, username text, display_name text, avatar_path text)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.author_id, p.body, p.created_at, p.edited_at, p.like_count, p.comment_count,
    exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
    pr.username, pr.display_name, pr.avatar_path
  from public.posts p join public.profiles pr on pr.id = p.author_id
  where p.community_id = p_comm and p.status = 'visible'
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_mod_actions enable row level security;
grant select on public.communities, public.community_members, public.community_mod_actions to authenticated;
create policy communities_select on public.communities for select to authenticated
  using (status in ('active','archived') or created_by = (select auth.uid()) or (select public.has_permission('communities.manage')));
create policy community_members_select on public.community_members for select to authenticated using (
  user_id = (select auth.uid()) or (select public.has_permission('communities.manage'))
  or (status = 'active' and exists (select 1 from public.communities c where c.id = community_members.community_id)));
create policy community_mod_actions_select on public.community_mod_actions for select to authenticated
  using ((select public.my_community_role(community_id)) in ('owner','moderator') or (select public.has_permission('communities.manage')));

create function public.create_community(p_name text, p_slug text, p_description text, p_category text, p_institution uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid;
begin
  if v_uid is null or not public.account_can_post() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.feature_enabled('communities') then raise exception 'feature_disabled' using errcode = '42501'; end if;
  if (select count(*) from public.communities where created_by = v_uid and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'rate_limited' using errcode = 'P0001'; end if;
  if (select count(*) from public.communities where created_by = v_uid and status = 'active') >= 10 then
    raise exception 'too_many_communities' using errcode = 'P0001'; end if;
  begin
    insert into public.communities (name, slug, description, category, institution_id, created_by)
    values (btrim(p_name), lower(btrim(p_slug)), nullif(btrim(coalesce(p_description, '')), ''), p_category, p_institution, v_uid)
    returning id into v_id;
  exception when unique_violation then raise exception 'name_or_slug_taken' using errcode = '23505'; end;
  insert into public.community_members (community_id, user_id, role) values (v_id, v_uid, 'owner');
  return v_id;
end $$;

create function public.join_community(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_status text; v_mstatus text;
begin
  if v_uid is null or not public.account_is_listed(v_uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.feature_enabled('communities') then raise exception 'feature_disabled' using errcode = '42501'; end if;
  select status into v_status from public.communities where id = p_id;
  if v_status is distinct from 'active' then raise exception 'not_found' using errcode = '22023'; end if;
  select status into v_mstatus from public.community_members where community_id = p_id and user_id = v_uid;
  if v_mstatus = 'banned' then raise exception 'banned' using errcode = '42501'; end if;
  if v_mstatus = 'active' then return; end if;
  if (select count(*) from public.community_members where user_id = v_uid and joined_at > now() - interval '24 hours') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001'; end if;
  insert into public.community_members (community_id, user_id) values (p_id, v_uid);
end $$;

create function public.leave_community(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_role text; v_status text;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select role, status into v_role, v_status from public.community_members where community_id = p_id and user_id = v_uid;
  if v_role = 'owner' then raise exception 'owner_cannot_leave' using errcode = '22023'; end if;
  if v_status = 'banned' then raise exception 'banned' using errcode = '42501'; end if;
  delete from public.community_members where community_id = p_id and user_id = v_uid;
end $$;

create function public.community_update(p_id uuid, p_description text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select public.my_community_role(p_id)) is distinct from 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(coalesce(p_description, '')) > 500 then raise exception 'invalid_body' using errcode = '22023'; end if;
  update public.communities set description = nullif(btrim(coalesce(p_description, '')), '') where id = p_id and status <> 'disabled';
end $$;

create function public.community_set_archived(p_id uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_status text;
begin
  if (select public.my_community_role(p_id)) is distinct from 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  select status into v_status from public.communities where id = p_id for update;
  if v_status = 'disabled' then raise exception 'disabled_by_platform' using errcode = '42501'; end if;
  update public.communities set status = case when p_archived then 'archived' else 'active' end where id = p_id;
  insert into public.community_mod_actions (community_id, actor_id, action) values (p_id, v_uid, case when p_archived then 'archive' else 'unarchive' end);
end $$;

-- NOTE: role comparisons use coalesce(...,'') because `NULL not in (...)` is NOT true in SQL; without it an outsider passed the check.
create function public.community_set_member(p_comm uuid, p_user uuid, p_action text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_caller text := coalesce((select public.my_community_role(p_comm)), ''); v_trole text; v_tstatus text;
begin
  if v_uid is null or v_caller not in ('owner','moderator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action not in ('ban','unban','remove','make_moderator','remove_moderator') then raise exception 'invalid_action' using errcode = '22023'; end if;
  if p_user = v_uid then raise exception 'cannot_target_self' using errcode = '42501'; end if;
  if p_action in ('ban','unban','remove') and (p_reason is null or char_length(btrim(p_reason)) < 5) then raise exception 'reason_required' using errcode = '22023'; end if;
  select role, status into v_trole, v_tstatus from public.community_members where community_id = p_comm and user_id = p_user for update;
  if v_trole is null then raise exception 'not_found' using errcode = '22023'; end if;
  if v_trole = 'owner' then raise exception 'owner_protected' using errcode = '42501'; end if;
  if v_caller = 'moderator' and (v_trole <> 'member' or p_action in ('make_moderator','remove_moderator')) then raise exception 'insufficient_role' using errcode = '42501'; end if;
  if p_action = 'ban' then update public.community_members set status = 'banned', role = 'member' where community_id = p_comm and user_id = p_user;
  elsif p_action = 'unban' then
    if v_tstatus <> 'banned' then raise exception 'invalid_state' using errcode = '22023'; end if;
    delete from public.community_members where community_id = p_comm and user_id = p_user;
  elsif p_action = 'remove' then delete from public.community_members where community_id = p_comm and user_id = p_user;
  elsif p_action = 'make_moderator' then
    if v_tstatus <> 'active' then raise exception 'invalid_state' using errcode = '22023'; end if;
    update public.community_members set role = 'moderator' where community_id = p_comm and user_id = p_user;
  else update public.community_members set role = 'member' where community_id = p_comm and user_id = p_user; end if;
  insert into public.community_mod_actions (community_id, actor_id, action, target_user_id, reason)
  values (p_comm, v_uid, p_action, p_user, nullif(btrim(coalesce(p_reason, '')), ''));
end $$;

create function public.community_set_post_state(p_post uuid, p_hide boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_comm uuid; v_author uuid; v_status public.content_status; v_scope text; v_caller text; v_arole text;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select community_id, author_id, status, hidden_scope into v_comm, v_author, v_status, v_scope from public.posts where id = p_post for update;
  if v_comm is null then raise exception 'not_found' using errcode = '22023'; end if;
  v_caller := coalesce((select public.my_community_role(v_comm)), '');
  if v_caller not in ('owner','moderator') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select role into v_arole from public.community_members where community_id = v_comm and user_id = v_author;
  if v_caller = 'moderator' and v_arole in ('owner','moderator') then raise exception 'insufficient_role' using errcode = '42501'; end if;
  if p_hide then
    if v_status <> 'visible' then raise exception 'invalid_state' using errcode = '22023'; end if;
    perform set_config('app.hide_scope', 'community', true);
    update public.posts set status = 'hidden' where id = p_post;
    perform set_config('app.hide_scope', '', true);
  else
    if v_status <> 'hidden' or v_scope is distinct from 'community' then raise exception 'not_restorable' using errcode = '42501'; end if;
    update public.posts set status = 'visible' where id = p_post;
  end if;
  insert into public.community_mod_actions (community_id, actor_id, action, target_user_id, target_post_id, reason)
  values (v_comm, v_uid, case when p_hide then 'hide_post' else 'restore_post' end, v_author, p_post, btrim(p_reason));
end $$;

create function public.admin_set_community_state(p_id uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_old text; v_owner uuid;
begin
  if v_actor is null or not public.has_permission('communities.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active','archived','disabled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select status, created_by into v_old, v_owner from public.communities where id = p_id for update;
  if v_old is null then raise exception 'not_found' using errcode = '22023'; end if;
  update public.communities set status = p_status where id = p_id;
  insert into public.moderation_actions (actor_id, action, target_type, target_id, target_user_id, reason)
  values (v_actor, 'community_state', 'community', p_id, v_owner, btrim(p_reason));
  perform public.log_admin_action(v_actor, 'community.state', 'community', p_id::text, btrim(p_reason), jsonb_build_object('old_status', v_old, 'new_status', p_status));
end $$;

-- ======================= NOTIFICATIONS + ANNOUNCEMENTS =======================
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('follow','like','comment','community_join','message','announcement','moderation_warning')),
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text,
  entity_id uuid,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 2000),
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc, id desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  notify_follows boolean not null default true,
  notify_likes boolean not null default true,
  notify_comments boolean not null default true,
  notify_community boolean not null default true,
  notify_messages boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger user_preferences_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();

create function public.internal_notify(p_user uuid, p_type text, p_actor uuid, p_entity_type text, p_entity uuid, p_dedupe text, p_data jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  if p_user is null or p_user is not distinct from p_actor then return; end if;
  if p_actor is not null and public.internal_blocked_either(p_user, p_actor) then return; end if;
  if public.effective_status_internal(p_user) not in ('active', 'restricted') then return; end if;
  select case p_type when 'follow' then notify_follows when 'like' then notify_likes when 'comment' then notify_comments
                     when 'community_join' then notify_community when 'message' then notify_messages else true end
    into v_ok from public.user_preferences where user_id = p_user;
  if found and v_ok is false then return; end if;
  insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, dedupe_key, data)
  values (p_user, p_type, p_actor, p_entity_type, p_entity, p_dedupe, coalesce(p_data, '{}'::jsonb))
  on conflict (user_id, dedupe_key) do nothing;
end $$;

create function public.notify_on_follow() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform public.internal_notify(new.followee_id, 'follow', new.follower_id, 'user', new.follower_id, 'follow:' || new.follower_id); return null; end $$;
create trigger follows_notify after insert on public.follows for each row execute function public.notify_on_follow();

create function public.notify_on_like() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  perform public.internal_notify(v_author, 'like', new.user_id, 'post', new.post_id, 'like:' || new.post_id || ':' || new.user_id);
  return null;
end $$;
create trigger post_likes_notify after insert on public.post_likes for each row execute function public.notify_on_like();

create function public.notify_on_comment() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  perform public.internal_notify(v_author, 'comment', new.author_id, 'post', new.post_id, 'comment:' || new.id, jsonb_build_object('comment_id', new.id));
  return null;
end $$;
create trigger comments_notify after insert on public.comments for each row execute function public.notify_on_comment();

create function public.notify_on_community_join() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if new.role = 'member' then
    select created_by into v_owner from public.communities where id = new.community_id;
    perform public.internal_notify(v_owner, 'community_join', new.user_id, 'community', new.community_id, 'join:' || new.community_id || ':' || new.user_id);
  end if;
  return null;
end $$;
create trigger community_members_notify after insert on public.community_members for each row execute function public.notify_on_community_join();

create or replace function public.admin_warn_user(p_user uuid, p_reason text, p_report uuid default null) returns void
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
  perform public.internal_notify(p_user, 'moderation_warning', null, 'user', p_user, null, jsonb_build_object('reason', left(btrim(p_reason), 300)));
  perform public.log_admin_action(v_actor, 'user.warn', 'user', p_user::text, btrim(p_reason), jsonb_build_object('report_id', p_report));
end $$;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null check (char_length(btrim(body)) between 3 and 1000),
  audience text not null default 'all' check (audience in ('all','institution')),
  institution_id uuid references public.institutions(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','published','unpublished')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  recipient_count int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (audience = 'all' or institution_id is not null)
);
create index announcements_status_idx on public.announcements (status, starts_at);
create trigger announcements_updated_at before update on public.announcements for each row execute function public.set_updated_at();

create function public.announcement_audience_count(p_audience text, p_institution uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.profiles p
  where public.effective_status_internal(p.id) in ('active', 'restricted')
    and (p_audience = 'all' or p.institution_id = p_institution)
$$;

create function public.admin_save_announcement(p_id uuid, p_title text, p_body text, p_audience text, p_institution uuid, p_starts timestamptz, p_ends timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid := p_id; v_status text;
begin
  if v_actor is null or not public.has_permission('announcements.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.announcements (title, body, audience, institution_id, starts_at, ends_at, created_by)
    values (btrim(p_title), btrim(p_body), p_audience, p_institution, p_starts, p_ends, v_actor) returning id into v_id;
  else
    select status into v_status from public.announcements where id = p_id for update;
    if v_status is null then raise exception 'not_found' using errcode = '22023'; end if;
    if v_status <> 'draft' then raise exception 'only_drafts_editable' using errcode = '22023'; end if;
    update public.announcements set title = btrim(p_title), body = btrim(p_body), audience = p_audience, institution_id = p_institution, starts_at = p_starts, ends_at = p_ends where id = p_id;
  end if;
  perform public.log_admin_action(v_actor, case when p_id is null then 'announcement.create' else 'announcement.update' end, 'announcement', v_id::text, null, '{}'::jsonb);
  return v_id;
end $$;

create function public.admin_announcement_recipients(p_id uuid) returns int
language plpgsql stable security definer set search_path = '' as $$
declare v_a public.announcements;
begin
  if not public.has_permission('announcements.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_a from public.announcements where id = p_id;
  if v_a.id is null then raise exception 'not_found' using errcode = '22023'; end if;
  return public.announcement_audience_count(v_a.audience, v_a.institution_id);
end $$;

create function public.admin_publish_announcement(p_id uuid, p_confirm_count int) returns int
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_a public.announcements; v_count int;
begin
  if v_actor is null or not public.has_permission('announcements.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_a from public.announcements where id = p_id for update;
  if v_a.id is null then raise exception 'not_found' using errcode = '22023'; end if;
  if v_a.status <> 'draft' then raise exception 'already_published' using errcode = '22023'; end if;
  if (select count(*) from public.admin_audit_logs where actor_id = v_actor and action = 'announcement.publish' and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001'; end if;
  v_count := public.announcement_audience_count(v_a.audience, v_a.institution_id);
  if p_confirm_count is distinct from v_count then raise exception 'confirm_count_mismatch' using errcode = '22023'; end if;
  insert into public.notifications (user_id, type, entity_type, entity_id, dedupe_key, data)
  select p.id, 'announcement', 'announcement', v_a.id, 'announcement:' || v_a.id, jsonb_build_object('title', v_a.title)
  from public.profiles p
  where public.effective_status_internal(p.id) in ('active', 'restricted') and (v_a.audience = 'all' or p.institution_id = v_a.institution_id)
  on conflict (user_id, dedupe_key) do nothing;
  update public.announcements set status = 'published', published_by = v_actor, published_at = now(), recipient_count = v_count where id = p_id;
  perform public.log_admin_action(v_actor, 'announcement.publish', 'announcement', p_id::text, null, jsonb_build_object('recipients', v_count, 'audience', v_a.audience));
  return v_count;
end $$;

create function public.admin_unpublish_announcement(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.has_permission('announcements.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.announcements set status = 'unpublished' where id = p_id and status = 'published';
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  perform public.log_admin_action(v_actor, 'announcement.unpublish', 'announcement', p_id::text, btrim(p_reason), '{}'::jsonb);
end $$;

create function public.notifications_list(p_before bigint default null, p_limit int default 30)
returns table (id bigint, type text, actor_id uuid, actor_username text, actor_display_name text, entity_type text, entity_id uuid, data jsonb, created_at timestamptz, read_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select n.id, n.type, n.actor_id, pr.username, pr.display_name, n.entity_type, n.entity_id, n.data, n.created_at, n.read_at
  from public.notifications n left join public.profiles pr on pr.id = n.actor_id
  where n.user_id = (select auth.uid()) and (p_before is null or n.id < p_before)
  order by n.id desc limit least(greatest(coalesce(p_limit, 30), 1), 50)
$$;
create function public.unread_notification_count() returns int
language sql stable security invoker set search_path = '' as $$
  select count(*)::int from public.notifications where user_id = (select auth.uid()) and read_at is null
$$;
create function public.mark_notifications_read(p_ids bigint[] default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.notifications set read_at = now() where user_id = v_uid and read_at is null and (p_ids is null or id = any(p_ids));
end $$;

alter table public.notifications enable row level security;
alter table public.user_preferences enable row level security;
alter table public.announcements enable row level security;
grant select, delete on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));
grant select on public.user_preferences to authenticated;
grant insert (user_id, notify_follows, notify_likes, notify_comments, notify_community, notify_messages) on public.user_preferences to authenticated;
grant update (notify_follows, notify_likes, notify_comments, notify_community, notify_messages) on public.user_preferences to authenticated;
create policy prefs_select on public.user_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy prefs_insert on public.user_preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy prefs_update on public.user_preferences for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.announcements to authenticated;
create policy announcements_select on public.announcements for select to authenticated using (
  (select public.has_permission('announcements.manage'))
  or (status = 'published' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
      and (audience = 'all' or institution_id = (select public.current_institution_id()))));

alter publication supabase_realtime add table public.notifications;

-- ======================= MESSAGING =======================
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  direct_key text not null unique,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id, joined_at desc);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  status text not null default 'visible' check (status in ('visible','deleted')),
  created_at timestamptz not null default now(),
  constraint messages_body_check check (char_length(body) <= 2000 and (status = 'deleted' or char_length(btrim(body)) >= 1))
);
create index messages_conv_idx on public.messages (conversation_id, created_at desc, id desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);

create function public.is_conversation_member(p_conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members where conversation_id = p_conv and user_id = (select auth.uid()))
$$;
create function public.account_can_message() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.effective_status_internal(s.user_id) = 'active'
        or (public.effective_status_internal(s.user_id) = 'restricted' and not s.messaging_restricted)
    from public.account_standing s where s.user_id = (select auth.uid())), false)
$$;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
grant select on public.conversations, public.conversation_members, public.messages to authenticated;
-- No staff policies on purpose: platform staff (including the owner) cannot read private messages.
create policy conversations_select on public.conversations for select to authenticated using ((select public.is_conversation_member(id)));
create policy conversation_members_select on public.conversation_members for select to authenticated using ((select public.is_conversation_member(conversation_id)));
create policy messages_select on public.messages for select to authenticated using ((select public.is_conversation_member(conversation_id)));

create function public.start_conversation(p_other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_key text; v_id uuid;
begin
  if v_uid is null or not public.account_can_message() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.feature_enabled('messaging') then raise exception 'feature_disabled' using errcode = '42501'; end if;
  if p_other = v_uid then raise exception 'cannot_message_self' using errcode = '22023'; end if;
  if not public.internal_profile_visible(p_other, v_uid) or public.internal_blocked_either(v_uid, p_other) then
    raise exception 'not_found' using errcode = '22023'; end if;
  v_key := least(v_uid::text, p_other::text) || ':' || greatest(v_uid::text, p_other::text);
  select id into v_id from public.conversations where direct_key = v_key;
  if v_id is not null then return v_id; end if;
  if (select count(*) from public.conversation_members where user_id = v_uid and joined_at > now() - interval '24 hours') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001'; end if;
  begin
    insert into public.conversations (direct_key) values (v_key) returning id into v_id;
    insert into public.conversation_members (conversation_id, user_id) values (v_id, v_uid), (v_id, p_other);
  exception when unique_violation then
    select id into v_id from public.conversations where direct_key = v_key;
  end;
  return v_id;
end $$;

create function public.send_message(p_conv uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_body text := btrim(coalesce(p_body, '')); v_other uuid; v_id uuid;
begin
  if v_uid is null or not public.account_can_message() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.feature_enabled('messaging') then raise exception 'feature_disabled' using errcode = '42501'; end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'invalid_body' using errcode = '22023'; end if;
  select user_id into v_other from public.conversation_members where conversation_id = p_conv and user_id <> v_uid;
  if not exists (select 1 from public.conversation_members where conversation_id = p_conv and user_id = v_uid) or v_other is null
     or public.internal_blocked_either(v_uid, v_other) then
    raise exception 'not_found' using errcode = '22023'; end if;
  if (select count(*) from public.messages where sender_id = v_uid and created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.messages where sender_id = v_uid and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'rate_limited' using errcode = 'P0001'; end if;
  insert into public.messages (conversation_id, sender_id, body) values (p_conv, v_uid, v_body) returning id into v_id;
  update public.conversations set last_message_at = now() where id = p_conv;
  update public.conversation_members set last_read_at = now() where conversation_id = p_conv and user_id = v_uid;
  perform public.internal_notify(v_other, 'message', v_uid, 'conversation', p_conv,
    'message:' || p_conv || ':' || v_other || ':' || floor(extract(epoch from now()) / 600)::bigint, jsonb_build_object('conversation_id', p_conv));
  return v_id;
end $$;

create function public.mark_conversation_read(p_conv uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.conversation_members set last_read_at = now() where conversation_id = p_conv and user_id = v_uid;
end $$;

create function public.delete_own_message(p_msg uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.messages set status = 'deleted', body = '' where id = p_msg and sender_id = v_uid and status = 'visible';
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
end $$;

create function public.my_conversations()
returns table (conversation_id uuid, other_user_id uuid, username text, display_name text, avatar_path text, last_message_at timestamptz, preview text, unread_count bigint)
language sql stable security invoker set search_path = '' as $$
  select cm.conversation_id, o.user_id, pr.username, pr.display_name, pr.avatar_path, c.last_message_at,
    (select left(m.body, 80) from public.messages m where m.conversation_id = c.id and m.status = 'visible' order by m.created_at desc limit 1),
    (select count(*) from public.messages m where m.conversation_id = c.id and m.sender_id <> (select auth.uid()) and m.status = 'visible'
        and m.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz))
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  join public.conversation_members o on o.conversation_id = c.id and o.user_id <> (select auth.uid())
  left join public.profiles pr on pr.id = o.user_id
  where cm.user_id = (select auth.uid())
  order by c.last_message_at desc limit 100
$$;

create function public.unread_message_count() returns bigint
language sql stable security invoker set search_path = '' as $$
  select count(*) from public.conversation_members cm join public.messages m on m.conversation_id = cm.conversation_id
  where cm.user_id = (select auth.uid()) and m.sender_id <> (select auth.uid()) and m.status = 'visible'
    and m.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)
$$;

alter publication supabase_realtime add table public.messages;

-- ======================= REPORTS (community, message) + ADMIN STATS =======================
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in ('user','post','comment','community','message'));

create or replace function public.submit_report(p_type text, p_target uuid, p_category text, p_explanation text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_user uuid; v_snap text; v_id uuid; v_post uuid; v_found boolean := false;
begin
  if v_uid is null or not public.account_is_listed(v_uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select count(*) from public.reports where reporter_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if p_type = 'post' then
    select author_id, left(body, 500) into v_user, v_snap from public.posts where id = p_target and status = 'visible';
    v_found := v_user is not null and public.internal_profile_visible(v_user, v_uid);
  elsif p_type = 'comment' then
    select c.author_id, left(c.body, 500), c.post_id into v_user, v_snap, v_post from public.comments c where c.id = p_target and c.status = 'visible';
    v_found := v_user is not null and public.internal_profile_visible(v_user, v_uid)
               and exists (select 1 from public.posts where id = v_post and status = 'visible');
  elsif p_type = 'user' then
    select p.id, left(p.display_name || ' @' || p.username || ': ' || coalesce(p.bio, ''), 500) into v_user, v_snap from public.profiles p where p.id = p_target;
    v_found := v_user is not null and public.internal_profile_visible(v_user, v_uid);
  elsif p_type = 'community' then
    select created_by, left(name || ': ' || coalesce(description, ''), 500) into v_user, v_snap from public.communities where id = p_target and status in ('active','archived');
    v_found := v_snap is not null;
  elsif p_type = 'message' then
    select m.sender_id, left(m.body, 500) into v_user, v_snap from public.messages m
    where m.id = p_target and m.status = 'visible' and m.sender_id <> v_uid
      and exists (select 1 from public.conversation_members cm where cm.conversation_id = m.conversation_id and cm.user_id = v_uid);
    v_found := v_user is not null;
  else raise exception 'invalid_type' using errcode = '22023'; end if;
  if not v_found then raise exception 'not_found' using errcode = '22023'; end if;
  if v_user = v_uid then raise exception 'cannot_report_self' using errcode = '22023'; end if;
  insert into public.reports (reporter_id, target_type, target_id, reported_user_id, category, explanation, content_snapshot)
  values (v_uid, p_type, p_target, v_user, p_category, nullif(btrim(coalesce(p_explanation, '')), ''), v_snap)
  on conflict (reporter_id, target_type, target_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.reports where reporter_id = v_uid and target_type = p_type and target_id = p_target;
  end if;
  return v_id;
end $$;

create function public.admin_content_stats(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_days int := least(greatest(coalesce(p_days, 30), 1), 365); v_since timestamptz;
begin
  if not public.has_permission('analytics.view') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_since := now() - make_interval(days => v_days);
  return jsonb_build_object(
    'period_days', v_days,
    'total_posts', (select count(*) from public.posts where status <> 'deleted'),
    'new_posts', (select count(*) from public.posts where created_at >= v_since and status <> 'deleted'),
    'total_comments', (select count(*) from public.comments where status <> 'deleted'),
    'new_comments', (select count(*) from public.comments where created_at >= v_since and status <> 'deleted'),
    'total_communities', (select count(*) from public.communities),
    'new_communities', (select count(*) from public.communities where created_at >= v_since),
    'total_conversations', (select count(*) from public.conversations),
    'total_messages', (select count(*) from public.messages),
    'new_messages', (select count(*) from public.messages where created_at >= v_since),
    'open_reports', (select count(*) from public.reports where status in ('open','under_review')),
    'escalated_reports', (select count(*) from public.reports where status = 'escalated'),
    'new_reports', (select count(*) from public.reports where created_at >= v_since));
end $$;

-- ======================= PRIVILEGES (explicit; never rely on defaults) =======================
revoke execute on function
  public.feature_enabled(text), public.my_community_role(uuid), public.community_members_count_trg(), public.posts_hidden_scope_trg(),
  public.feed_posts(text, timestamptz, uuid, int), public.community_posts(uuid, timestamptz, uuid, int),
  public.create_community(text, text, text, text, uuid), public.join_community(uuid), public.leave_community(uuid),
  public.community_update(uuid, text), public.community_set_archived(uuid, boolean),
  public.community_set_member(uuid, uuid, text, text), public.community_set_post_state(uuid, boolean, text),
  public.admin_set_community_state(uuid, text, text),
  public.internal_notify(uuid, text, uuid, text, uuid, text, jsonb), public.notify_on_follow(), public.notify_on_like(), public.notify_on_comment(),
  public.notify_on_community_join(), public.announcement_audience_count(text, uuid),
  public.admin_warn_user(uuid, text, uuid), public.admin_save_announcement(uuid, text, text, text, uuid, timestamptz, timestamptz),
  public.admin_announcement_recipients(uuid), public.admin_publish_announcement(uuid, int), public.admin_unpublish_announcement(uuid, text),
  public.notifications_list(bigint, int), public.unread_notification_count(), public.mark_notifications_read(bigint[]),
  public.is_conversation_member(uuid), public.account_can_message(), public.start_conversation(uuid), public.send_message(uuid, text),
  public.mark_conversation_read(uuid), public.delete_own_message(uuid), public.my_conversations(), public.unread_message_count(),
  public.submit_report(text, uuid, text, text), public.admin_content_stats(int)
  from public, anon, authenticated;
grant execute on function
  public.feature_enabled(text), public.my_community_role(uuid),
  public.feed_posts(text, timestamptz, uuid, int), public.community_posts(uuid, timestamptz, uuid, int),
  public.create_community(text, text, text, text, uuid), public.join_community(uuid), public.leave_community(uuid),
  public.community_update(uuid, text), public.community_set_archived(uuid, boolean),
  public.community_set_member(uuid, uuid, text, text), public.community_set_post_state(uuid, boolean, text),
  public.admin_set_community_state(uuid, text, text),
  public.admin_warn_user(uuid, text, uuid), public.admin_save_announcement(uuid, text, text, text, uuid, timestamptz, timestamptz),
  public.admin_announcement_recipients(uuid), public.admin_publish_announcement(uuid, int), public.admin_unpublish_announcement(uuid, text),
  public.notifications_list(bigint, int), public.unread_notification_count(), public.mark_notifications_read(bigint[]),
  public.is_conversation_member(uuid), public.account_can_message(), public.start_conversation(uuid), public.send_message(uuid, text),
  public.mark_conversation_read(uuid), public.delete_own_message(uuid), public.my_conversations(), public.unread_message_count(),
  public.submit_report(text, uuid, text, text), public.admin_content_stats(int)
  to authenticated;
