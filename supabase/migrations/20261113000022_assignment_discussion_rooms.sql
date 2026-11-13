-- Assignment discussion rooms: course threads, replies, private PDF attachments,
-- reply notifications, reporting, and staff moderation.

begin;

create table public.assignment_discussions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academic_courses(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('question', 'assignment_help', 'study_group')),
  title text not null check (char_length(btrim(title)) between 5 and 200),
  body text not null check (char_length(btrim(body)) between 10 and 5000),
  status public.content_status not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assignment_discussions_course_activity_idx
  on public.assignment_discussions (course_id, status, updated_at desc, id desc);
create index assignment_discussions_author_created_idx
  on public.assignment_discussions (author_id, created_at desc);
create trigger assignment_discussions_updated_at
  before update on public.assignment_discussions
  for each row execute function public.set_updated_at();

create table public.assignment_discussion_replies (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.assignment_discussions(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  status public.content_status not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, discussion_id)
);

create index assignment_discussion_replies_discussion_created_idx
  on public.assignment_discussion_replies (discussion_id, status, created_at, id);
create index assignment_discussion_replies_author_created_idx
  on public.assignment_discussion_replies (author_id, created_at desc);
create trigger assignment_discussion_replies_updated_at
  before update on public.assignment_discussion_replies
  for each row execute function public.set_updated_at();

create function public.touch_assignment_discussion_on_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assignment_discussions
  set updated_at = now()
  where id = new.discussion_id;
  return new;
end;
$$;

create trigger assignment_discussion_replies_touch_parent
  after insert or update on public.assignment_discussion_replies
  for each row execute function public.touch_assignment_discussion_on_reply();

revoke all on function public.touch_assignment_discussion_on_reply() from public, anon;

create table public.assignment_discussion_attachments (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.assignment_discussions(id) on delete cascade,
  reply_id uuid,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique,
  file_name text not null check (
    char_length(btrim(file_name)) between 1 and 160
    and position('/' in file_name) = 0
    and position(chr(92) in file_name) = 0
  ),
  file_size bigint not null check (file_size between 1 and 10485760),
  content_type text not null check (content_type = 'application/pdf'),
  created_at timestamptz not null default now(),
  constraint assignment_discussion_attachments_reply_same_discussion_fk
    foreign key (reply_id, discussion_id)
    references public.assignment_discussion_replies(id, discussion_id)
    on delete cascade,
  check (object_path ~ (
    '^' || uploaded_by::text || '/' || discussion_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
  ))
);

create unique index assignment_discussion_thread_attachment_once
  on public.assignment_discussion_attachments (discussion_id)
  where reply_id is null;
create unique index assignment_discussion_reply_attachment_once
  on public.assignment_discussion_attachments (reply_id)
  where reply_id is not null;
create index assignment_discussion_attachments_discussion_idx
  on public.assignment_discussion_attachments (discussion_id, created_at);

alter table public.assignment_discussions enable row level security;
alter table public.assignment_discussion_replies enable row level security;
alter table public.assignment_discussion_attachments enable row level security;

grant select, insert on public.assignment_discussions to authenticated;
grant update (category, title, body) on public.assignment_discussions to authenticated;
grant select, insert on public.assignment_discussion_replies to authenticated;
grant update (body) on public.assignment_discussion_replies to authenticated;
grant select, insert, delete on public.assignment_discussion_attachments to authenticated;

create function public.owns_assignment_discussion_object(p_object_path text, p_discussion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'assignment-discussions'
      and o.name = p_object_path
      and (storage.foldername(o.name))[1] = (select auth.uid())::text
      and (storage.foldername(o.name))[2] = p_discussion_id::text
      and lower(o.name) ~ (
        '^' || (select auth.uid())::text || '/'
        || p_discussion_id::text
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
      )
  );
$$;

revoke all on function public.owns_assignment_discussion_object(text, uuid) from public, anon;
grant execute on function public.owns_assignment_discussion_object(text, uuid) to authenticated;

create policy assignment_discussions_select on public.assignment_discussions
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and exists (
      select 1
      from public.academic_courses c
      join public.academic_departments d on d.id = c.department_id
      join public.institutions i on i.id = d.institution_id
      where c.id = course_id and c.is_active and d.is_active and i.is_active
    )
    and (
      status = 'visible'
      or (status = 'hidden' and author_id = (select auth.uid()))
      or (select public.has_permission('content.moderate'))
    )
    and (
      author_id = (select auth.uid())
      or (select public.has_permission('content.moderate'))
      or public.internal_profile_visible(author_id, (select auth.uid()))
    )
    and (
      author_id = (select auth.uid())
      or not public.internal_blocked_either(author_id, (select auth.uid()))
    )
  );

create policy assignment_discussions_insert on public.assignment_discussions
  for insert to authenticated
  with check (
    public.account_effective_status((select auth.uid())) = 'active'
    and author_id = (select auth.uid())
    and status = 'visible'
    and exists (
      select 1
      from public.academic_courses c
      join public.academic_departments d on d.id = c.department_id
      join public.institutions i on i.id = d.institution_id
      where c.id = course_id and c.is_active and d.is_active and i.is_active
    )
  );

create policy assignment_discussions_update_own on public.assignment_discussions
  for update to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and author_id = (select auth.uid())
    and status = 'visible'
    and exists (
      select 1
      from public.academic_courses c
      join public.academic_departments d on d.id = c.department_id
      join public.institutions i on i.id = d.institution_id
      where c.id = course_id and c.is_active and d.is_active and i.is_active
    )
  )
  with check (
    author_id = (select auth.uid())
    and status = 'visible'
    and exists (
      select 1
      from public.academic_courses c
      join public.academic_departments d on d.id = c.department_id
      join public.institutions i on i.id = d.institution_id
      where c.id = course_id and c.is_active and d.is_active and i.is_active
    )
  );

create policy assignment_discussion_replies_select on public.assignment_discussion_replies
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and (
      status = 'visible'
      or (status = 'hidden' and author_id = (select auth.uid()))
      or (select public.has_permission('content.moderate'))
    )
    and (
      author_id = (select auth.uid())
      or (select public.has_permission('content.moderate'))
      or public.internal_profile_visible(author_id, (select auth.uid()))
    )
    and (
      author_id = (select auth.uid())
      or not public.internal_blocked_either(author_id, (select auth.uid()))
    )
    and exists (
      select 1
      from public.assignment_discussions d
      join public.academic_courses c on c.id = d.course_id
      join public.academic_departments dep on dep.id = c.department_id
      join public.institutions i on i.id = dep.institution_id
      where d.id = discussion_id
        and (
          d.status = 'visible'
          or (d.status = 'hidden' and d.author_id = (select auth.uid()))
          or (select public.has_permission('content.moderate'))
        )
        and c.is_active and dep.is_active and i.is_active
    )
  );

create policy assignment_discussion_replies_insert on public.assignment_discussion_replies
  for insert to authenticated
  with check (
    public.account_effective_status((select auth.uid())) = 'active'
    and author_id = (select auth.uid())
    and status = 'visible'
    and exists (
      select 1
      from public.assignment_discussions d
      join public.academic_courses c on c.id = d.course_id
      join public.academic_departments dep on dep.id = c.department_id
      join public.institutions i on i.id = dep.institution_id
      where d.id = discussion_id
        and d.status = 'visible'
        and c.is_active and dep.is_active and i.is_active
        and not public.internal_blocked_either(d.author_id, (select auth.uid()))
    )
  );

create policy assignment_discussion_replies_update_own on public.assignment_discussion_replies
  for update to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and author_id = (select auth.uid())
    and status = 'visible'
    and exists (
      select 1 from public.assignment_discussions d
      where d.id = discussion_id and d.status = 'visible'
    )
  )
  with check (
    author_id = (select auth.uid())
    and status = 'visible'
    and exists (
      select 1
      from public.assignment_discussions d
      join public.academic_courses c on c.id = d.course_id
      join public.academic_departments dep on dep.id = c.department_id
      join public.institutions i on i.id = dep.institution_id
      where d.id = discussion_id and d.status = 'visible'
        and c.is_active and dep.is_active and i.is_active
    )
  );

create policy assignment_discussion_attachments_select on public.assignment_discussion_attachments
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and exists (
      select 1 from public.assignment_discussions d
      where d.id = discussion_id
        and (
          d.status = 'visible'
          or d.author_id = (select auth.uid())
          or (select public.has_permission('content.moderate'))
        )
        and (
          reply_id is null
          or exists (
            select 1 from public.assignment_discussion_replies r
            where r.id = reply_id
              and (
                r.status = 'visible'
                or (r.status = 'hidden' and r.author_id = (select auth.uid()))
                or (select public.has_permission('content.moderate'))
              )
          )
        )
    )
  );

create policy assignment_discussion_attachments_insert on public.assignment_discussion_attachments
  for insert to authenticated
  with check (
    public.account_effective_status((select auth.uid())) = 'active'
    and uploaded_by = (select auth.uid())
    and (select public.owns_assignment_discussion_object(object_path, discussion_id))
    and (
      (
        reply_id is null
        and exists (
          select 1 from public.assignment_discussions d
          where d.id = discussion_id
            and d.author_id = (select auth.uid())
            and d.status = 'visible'
        )
      )
      or exists (
        select 1 from public.assignment_discussion_replies r
        join public.assignment_discussions d on d.id = r.discussion_id
        where r.id = reply_id
          and r.discussion_id = discussion_id
          and r.author_id = (select auth.uid())
          and r.status = 'visible'
          and d.status = 'visible'
      )
    )
  );

create policy assignment_discussion_attachments_delete_own on public.assignment_discussion_attachments
  for delete to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and uploaded_by = (select auth.uid())
  );

create function public.delete_own_assignment_discussion(p_discussion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.account_effective_status(auth.uid()) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.assignment_discussions
  set status = 'deleted'
  where id = p_discussion_id
    and author_id = auth.uid()
    and status = 'visible';

  if not found then
    raise exception 'discussion_not_found' using errcode = 'P0002';
  end if;
end;
$$;

create function public.delete_own_assignment_discussion_reply(p_reply_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.account_effective_status(auth.uid()) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.assignment_discussion_replies
  set status = 'deleted'
  where id = p_reply_id
    and author_id = auth.uid()
    and status = 'visible';

  if not found then
    raise exception 'reply_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_own_assignment_discussion(uuid) from public, anon;
revoke all on function public.delete_own_assignment_discussion_reply(uuid) from public, anon;
grant execute on function public.delete_own_assignment_discussion(uuid) to authenticated;
grant execute on function public.delete_own_assignment_discussion_reply(uuid) to authenticated;

alter table public.notifications
  drop constraint notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('follow', 'like', 'comment', 'community_join', 'message', 'announcement', 'moderation_warning', 'repost', 'discussion_reply'));

alter table public.user_preferences
  add column notify_discussions boolean not null default true;

create or replace function public.internal_notify(
  p_user uuid,
  p_type text,
  p_actor uuid,
  p_entity_type text,
  p_entity uuid,
  p_dedupe text,
  p_data jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_ok boolean;
begin
  if p_user is null or p_user is not distinct from p_actor then return; end if;
  if p_actor is not null and public.internal_blocked_either(p_user, p_actor) then return; end if;
  if public.effective_status_internal(p_user) not in ('active', 'restricted') then return; end if;
  select case p_type
    when 'follow' then notify_follows
    when 'like' then notify_likes
    when 'comment' then notify_comments
    when 'community_join' then notify_community
    when 'message' then notify_messages
    when 'discussion_reply' then notify_discussions
    else true
  end into v_ok
  from public.user_preferences
  where user_id = p_user;
  if found and v_ok is false then return; end if;
  insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, dedupe_key, data)
  values (p_user, p_type, p_actor, p_entity_type, p_entity, p_dedupe, coalesce(p_data, '{}'::jsonb))
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

revoke all on function public.internal_notify(uuid, text, uuid, text, uuid, text, jsonb) from public, anon, authenticated;

create function public.notify_on_assignment_discussion_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_author uuid; v_course uuid;
begin
  select d.author_id, d.course_id into v_author, v_course
  from public.assignment_discussions d
  where d.id = new.discussion_id and d.status = 'visible';
  if v_author is not null then
    perform public.internal_notify(
      v_author,
      'discussion_reply',
      new.author_id,
      'assignment_discussion',
      new.discussion_id,
      'discussion-reply:' || new.id::text,
      jsonb_build_object('course_id', v_course, 'reply_id', new.id)
    );
  end if;
  return null;
end;
$$;

create trigger assignment_discussion_replies_notify
  after insert on public.assignment_discussion_replies
  for each row execute function public.notify_on_assignment_discussion_reply();

revoke all on function public.notify_on_assignment_discussion_reply() from public, anon;

alter table public.reports
  drop constraint reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('user', 'post', 'comment', 'community', 'message', 'opportunity', 'assignment_discussion', 'assignment_discussion_reply'));

create function public.submit_assignment_discussion_report(
  p_type text,
  p_target uuid,
  p_category text,
  p_explanation text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_user uuid;
  v_discussion uuid;
  v_snapshot text;
  v_id uuid;
begin
  if v_uid is null or public.account_effective_status(v_uid) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_type is null or p_type not in ('assignment_discussion', 'assignment_discussion_reply') then
    raise exception 'invalid_type' using errcode = '22023';
  end if;
  if p_category is null or p_category not in ('spam', 'harassment', 'hate', 'sexual_content', 'violence', 'self_harm', 'impersonation', 'misinformation', 'other') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if (select count(*) from public.reports
      where reporter_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if p_type = 'assignment_discussion' then
    select d.author_id, d.id,
      left(d.title || ': ' || d.body, 600)
    into v_user, v_discussion, v_snapshot
    from public.assignment_discussions d
    join public.academic_courses c on c.id = d.course_id and c.is_active
    join public.academic_departments dep on dep.id = c.department_id and dep.is_active
    join public.institutions i on i.id = dep.institution_id and i.is_active
    where d.id = p_target and d.status = 'visible';
  else
    select r.author_id, d.id,
      left(d.title || ': ' || r.body, 600)
    into v_user, v_discussion, v_snapshot
    from public.assignment_discussion_replies r
    join public.assignment_discussions d on d.id = r.discussion_id and d.status = 'visible'
    join public.academic_courses c on c.id = d.course_id and c.is_active
    join public.academic_departments dep on dep.id = c.department_id and dep.is_active
    join public.institutions i on i.id = dep.institution_id and i.is_active
    where r.id = p_target and r.status = 'visible';
  end if;

  if v_user is null
    or not public.internal_profile_visible(v_user, v_uid)
    or public.internal_blocked_either(v_user, v_uid) then
    raise exception 'not_found' using errcode = '22023';
  end if;
  if v_user = v_uid then
    raise exception 'cannot_report_self' using errcode = '22023';
  end if;

  insert into public.reports (
    reporter_id, target_type, target_id, reported_user_id, category, explanation, content_snapshot
  )
  values (
    v_uid,
    p_type,
    p_target,
    v_user,
    p_category,
    nullif(btrim(coalesce(p_explanation, '')), ''),
    v_snapshot
  )
  on conflict (reporter_id, target_type, target_id) do nothing
  returning id into v_id;

  if v_id is null then
    select r.id into v_id
    from public.reports r
    where r.reporter_id = v_uid and r.target_type = p_type and r.target_id = p_target;
  end if;
  return v_id;
end;
$$;

revoke all on function public.submit_assignment_discussion_report(text, uuid, text, text) from public, anon;
grant execute on function public.submit_assignment_discussion_report(text, uuid, text, text) to authenticated;

create or replace function public.admin_set_content_state(
  p_type text,
  p_id uuid,
  p_hide boolean,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_author uuid;
  v_status public.content_status;
  v_new public.content_status;
begin
  if v_actor is null or not public.has_permission('content.moderate') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  if p_type = 'post' then
    select author_id, status into v_author, v_status
    from public.posts where id = p_id for update;
  elsif p_type = 'comment' then
    select author_id, status into v_author, v_status
    from public.comments where id = p_id for update;
  elsif p_type = 'assignment_discussion' then
    select author_id, status into v_author, v_status
    from public.assignment_discussions where id = p_id for update;
  elsif p_type = 'assignment_discussion_reply' then
    select author_id, status into v_author, v_status
    from public.assignment_discussion_replies where id = p_id for update;
  else
    raise exception 'invalid_type' using errcode = '22023';
  end if;

  if v_author is null then
    raise exception 'not_found' using errcode = '22023';
  end if;
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

  if p_type = 'post' then
    update public.posts set status = v_new where id = p_id;
  elsif p_type = 'comment' then
    update public.comments set status = v_new where id = p_id;
  elsif p_type = 'assignment_discussion' then
    update public.assignment_discussions set status = v_new where id = p_id;
  else
    update public.assignment_discussion_replies set status = v_new where id = p_id;
  end if;

  insert into public.moderation_actions (actor_id, action, target_type, target_id, target_user_id, reason)
  values (
    v_actor,
    case when p_hide then 'hide_content' else 'restore_content' end,
    p_type,
    p_id,
    v_author,
    btrim(p_reason)
  );
  perform public.log_admin_action(
    v_actor,
    case when p_hide then 'content.hide' else 'content.restore' end,
    p_type,
    p_id::text,
    btrim(p_reason),
    jsonb_build_object('author_id', v_author)
  );
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assignment-discussions', 'assignment-discussions', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy assignment_discussions_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assignment-discussions'
    and public.account_effective_status((select auth.uid())) = 'active'
    and exists (
      select 1
      from public.assignment_discussion_attachments a
      join public.assignment_discussions d on d.id = a.discussion_id
      where a.object_path = storage.objects.name
        and (
          d.status = 'visible'
          or (select public.has_permission('content.moderate'))
        )
        and (
          a.reply_id is null
          or exists (
            select 1 from public.assignment_discussion_replies r
            where r.id = a.reply_id and r.status = 'visible'
          )
          or (select public.has_permission('content.moderate'))
        )
    )
  );

create policy assignment_discussions_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assignment-discussions'
    and public.account_effective_status((select auth.uid())) = 'active'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(name) ~ (
      '^' || (select auth.uid())::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
    )
    and exists (
      select 1
      from public.assignment_discussions d
      where d.id::text = (storage.foldername(name))[2]
        and d.status = 'visible'
        and (
          d.author_id = (select auth.uid())
          or exists (
            select 1 from public.assignment_discussion_replies r
            where r.discussion_id = d.id
              and r.author_id = (select auth.uid())
              and r.status = 'visible'
          )
        )
    )
  );

create policy assignment_discussions_storage_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'assignment-discussions'
    and public.account_effective_status((select auth.uid())) = 'active'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
