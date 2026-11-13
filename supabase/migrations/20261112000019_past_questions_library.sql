-- Past Questions Library: catalog, submissions, moderation, and private PDF storage.
-- Apply only after reviewing this migration against the target CampusConnect project.

begin;

insert into public.permissions (key, description) values
  ('past_questions.review', 'Review and publish past-question submissions'),
  ('past_questions.manage', 'Manage academic departments and courses')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions (role, permission) values
  ('moderator', 'past_questions.review'),
  ('admin', 'past_questions.review'),
  ('admin', 'past_questions.manage')
on conflict (role, permission) do nothing;

create table public.academic_departments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index academic_departments_institution_name_key
  on public.academic_departments (institution_id, lower(name));
create index academic_departments_institution_active_idx
  on public.academic_departments (institution_id, is_active, name);
create trigger academic_departments_updated_at
  before update on public.academic_departments
  for each row execute function public.set_updated_at();
create trigger academic_departments_audit
  after insert or update or delete on public.academic_departments
  for each row execute function public.audit_row_change('id');

create table public.academic_courses (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.academic_departments(id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 30),
  title text not null check (char_length(btrim(title)) between 2 and 150),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index academic_courses_department_code_key
  on public.academic_courses (department_id, lower(code));
create index academic_courses_department_active_idx
  on public.academic_courses (department_id, is_active, code);
create trigger academic_courses_updated_at
  before update on public.academic_courses
  for each row execute function public.set_updated_at();
create trigger academic_courses_audit
  after insert or update or delete on public.academic_courses
  for each row execute function public.audit_row_change('id');

create table public.past_question_resources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academic_courses(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 5 and 200),
  academic_session text not null check (char_length(btrim(academic_session)) between 4 and 20),
  exam_year smallint not null check (exam_year between 1950 and 2100),
  semester text check (semester is null or semester in ('first', 'second', 'other')),
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

create index past_question_resources_course_status_created_idx
  on public.past_question_resources (course_id, status, created_at desc);
create index past_question_resources_uploader_created_idx
  on public.past_question_resources (uploaded_by, created_at desc);
create index past_question_resources_pending_created_idx
  on public.past_question_resources (created_at)
  where status = 'pending';

alter table public.academic_departments enable row level security;
alter table public.academic_courses enable row level security;
alter table public.past_question_resources enable row level security;

grant select, insert, update, delete on public.academic_departments to authenticated;
grant select, insert, update, delete on public.academic_courses to authenticated;
grant select on public.past_question_resources to authenticated;
grant insert (course_id, title, academic_session, exam_year, semester, object_path, uploaded_by)
  on public.past_question_resources to authenticated;

create policy academic_departments_select on public.academic_departments
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and (
      is_active
      or (select public.has_permission('past_questions.manage'))
    )
    and exists (
      select 1 from public.institutions i
      where i.id = institution_id and (i.is_active or public.has_permission('institutions.manage'))
    )
  );
create policy academic_departments_manage on public.academic_departments
  for all to authenticated
  using ((select public.has_permission('past_questions.manage')))
  with check ((select public.has_permission('past_questions.manage')));

create policy academic_courses_select on public.academic_courses
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and (
      is_active
      or (select public.has_permission('past_questions.manage'))
    )
    and exists (
      select 1
      from public.academic_departments d
      join public.institutions i on i.id = d.institution_id
      where d.id = department_id
        and (d.is_active or public.has_permission('past_questions.manage'))
        and (i.is_active or public.has_permission('institutions.manage'))
    )
  );
create policy academic_courses_manage on public.academic_courses
  for all to authenticated
  using ((select public.has_permission('past_questions.manage')))
  with check ((select public.has_permission('past_questions.manage')));

create policy past_question_resources_select on public.past_question_resources
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and (
      uploaded_by = (select auth.uid())
      or (select public.has_permission('past_questions.review'))
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
create policy past_question_resources_insert on public.past_question_resources
  for insert to authenticated
  with check (
    public.account_effective_status((select auth.uid())) = 'active'
    and uploaded_by = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and rejection_reason is null
    and exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'past-questions'
        and o.name = object_path
    )
    and exists (
      select 1 from public.academic_courses c
      join public.academic_departments d on d.id = c.department_id
      join public.institutions i on i.id = d.institution_id
      where c.id = course_id and c.is_active and d.is_active and i.is_active
    )
  );

create function public.review_past_question(
  p_resource_id uuid,
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
  if v_actor is null or not public.has_permission('past_questions.review') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'invalid_review_decision' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and (v_reason is null or char_length(v_reason) > 500) then
    raise exception 'rejection_reason_required' using errcode = '22023';
  end if;

  update public.past_question_resources
  set status = p_decision,
      reviewed_by = v_actor,
      reviewed_at = now(),
      rejection_reason = case when p_decision = 'rejected' then v_reason else null end
  where id = p_resource_id and status = 'pending';

  if not found then
    raise exception 'past_question_not_pending' using errcode = 'P0002';
  end if;

  perform public.log_admin_action(
    v_actor,
    'past_questions.' || p_decision,
    'past_question_resource',
    p_resource_id::text,
    v_reason,
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.review_past_question(uuid, text, text) from public, anon;
grant execute on function public.review_past_question(uuid, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('past-questions', 'past-questions', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy past_questions_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'past-questions'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.past_question_resources r
        where r.object_path = storage.objects.name
      )
    )
  );
create policy past_questions_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'past-questions'
    and public.account_effective_status((select auth.uid())) = 'active'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(name) ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$')
    and not exists (
      select 1 from public.past_question_resources r
      where r.object_path = storage.objects.name
    )
  );
create policy past_questions_storage_delete_orphan on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'past-questions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.past_question_resources r
      where r.object_path = storage.objects.name
    )
  );

commit;
