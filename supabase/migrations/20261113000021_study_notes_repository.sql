-- Study Notes: private PDF storage, moderated submissions, discovery, and bookmarks.

begin;

insert into public.permissions (key, description) values
  ('study_notes.review', 'Review and publish study-note submissions')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions (role, permission) values
  ('moderator', 'study_notes.review'),
  ('admin', 'study_notes.review')
on conflict (role, permission) do nothing;

create table public.study_notes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academic_courses(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 5 and 200),
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  level text not null check (level in ('100', '200', '300', '400', '500', '600', '700')),
  semester text not null check (semester in ('first', 'second', 'other')),
  object_path text not null unique,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  created_at timestamptz not null default now(),
  check (split_part(object_path, '/', 1) = uploaded_by::text),
  check (object_path ~ ('^' || uploaded_by::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$')),
  check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null and rejection_reason is null)
    or (status = 'approved' and reviewed_at is not null and rejection_reason is null)
    or (status = 'rejected' and reviewed_at is not null and rejection_reason is not null)
  )
);

create index study_notes_course_status_created_idx
  on public.study_notes (course_id, status, created_at desc);
create index study_notes_uploader_created_idx
  on public.study_notes (uploaded_by, created_at desc);
create index study_notes_pending_created_idx
  on public.study_notes (created_at)
  where status = 'pending';

create table public.study_note_saves (
  study_note_id uuid not null references public.study_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (study_note_id, user_id)
);
create index study_note_saves_user_created_idx
  on public.study_note_saves (user_id, created_at desc);

alter table public.study_notes enable row level security;
alter table public.study_note_saves enable row level security;

grant select on public.study_notes to authenticated;
grant insert, delete on public.study_note_saves to authenticated;
grant select on public.study_note_saves to authenticated;
grant insert (course_id, title, description, level, semester, object_path, uploaded_by)
  on public.study_notes to authenticated;

create function public.owns_study_note_object(p_object_path text)
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
    where o.bucket_id = 'study-notes'
      and o.name = p_object_path
      and (storage.foldername(o.name))[1] = (select auth.uid())::text
      and lower(o.name) ~ (
        '^' || (select auth.uid())::text
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
      )
  );
$$;

revoke all on function public.owns_study_note_object(text) from public, anon;
grant execute on function public.owns_study_note_object(text) to authenticated;

create policy study_notes_select on public.study_notes
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and (
      uploaded_by = (select auth.uid())
      or (select public.has_permission('study_notes.review'))
      or (
        status = 'approved'
        and exists (
          select 1
          from public.academic_courses c
          join public.academic_departments d on d.id = c.department_id
          join public.institutions i on i.id = d.institution_id
          where c.id = course_id and c.is_active and d.is_active and i.is_active
        )
      )
    )
  );

create policy study_notes_insert on public.study_notes
  for insert to authenticated
  with check (
    public.account_effective_status((select auth.uid())) = 'active'
    and uploaded_by = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and rejection_reason is null
    and (select public.owns_study_note_object(object_path))
    and exists (
      select 1
      from public.academic_courses c
      join public.academic_departments d on d.id = c.department_id
      join public.institutions i on i.id = d.institution_id
      where c.id = course_id and c.is_active and d.is_active and i.is_active
    )
  );

create policy study_note_saves_select on public.study_note_saves
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and user_id = (select auth.uid())
  );

create policy study_note_saves_insert on public.study_note_saves
  for insert to authenticated
  with check (
    public.account_effective_status((select auth.uid())) = 'active'
    and user_id = (select auth.uid())
    and exists (
      select 1 from public.study_notes n
      where n.id = study_note_id and n.status = 'approved'
    )
  );

create policy study_note_saves_delete on public.study_note_saves
  for delete to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and user_id = (select auth.uid())
  );

create function public.review_study_note(
  p_note_id uuid,
  p_decision text,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_actor is null or not public.has_permission('study_notes.review') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'invalid_review_decision' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and (v_reason is null or char_length(v_reason) > 500) then
    raise exception 'rejection_reason_required' using errcode = '22023';
  end if;

  update public.study_notes
  set status = p_decision,
      reviewed_by = v_actor,
      reviewed_at = now(),
      rejection_reason = case when p_decision = 'rejected' then v_reason else null end
  where id = p_note_id and status = 'pending';

  if not found then
    raise exception 'study_note_not_pending' using errcode = 'P0002';
  end if;

  perform public.log_admin_action(
    v_actor,
    'study_notes.' || p_decision,
    'study_note',
    p_note_id::text,
    v_reason,
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.review_study_note(uuid, text, text) from public, anon;
grant execute on function public.review_study_note(uuid, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-notes', 'study-notes', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy study_notes_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'study-notes'
    and public.account_effective_status((select auth.uid())) = 'active'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.study_notes n
        where n.object_path = storage.objects.name
      )
    )
  );

create policy study_notes_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'study-notes'
    and public.account_effective_status((select auth.uid())) = 'active'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(name) ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$')
  );

create policy study_notes_storage_delete_orphan on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'study-notes'
    and public.account_effective_status((select auth.uid())) = 'active'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.study_notes n
      where n.object_path = storage.objects.name
    )
  );

commit;
