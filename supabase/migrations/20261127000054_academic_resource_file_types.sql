-- Allow private academic-resource uploads to include photos and Word documents.
begin;

do $drop_path_checks$
declare
  item record;
begin
  for item in
    select conrelid::regclass as relation_name, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in (
        'public.study_notes'::regclass,
        'public.past_question_resources'::regclass,
        'public.assignment_discussion_attachments'::regclass
      )
      and pg_get_constraintdef(oid) like '%object_path%'
      and pg_get_constraintdef(oid) like '%~%'
  loop
    execute format('alter table %s drop constraint %I', item.relation_name, item.conname);
  end loop;
end
$drop_path_checks$;

alter table public.study_notes
  add constraint study_notes_object_path_format_check
  check (lower(object_path) ~ (
    '^' || uploaded_by::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|jpg|jpeg|png|webp|doc|docx)$'
  ));

alter table public.past_question_resources
  add constraint past_question_resources_object_path_format_check
  check (lower(object_path) ~ (
    '^' || uploaded_by::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|jpg|jpeg|png|webp|doc|docx)$'
  ));

create or replace function public.owns_study_note_object(p_object_path text)
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
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|jpg|jpeg|png|webp|doc|docx)$'
      )
  );
$$;

drop policy study_notes_storage_insert on storage.objects;
create policy study_notes_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'study-notes'
    and public.account_effective_status((select auth.uid())) = 'active'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(name) ~ (
      '^' || (select auth.uid())::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|jpg|jpeg|png|webp|doc|docx)$'
    )
  );

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where id in ('study-notes', 'past-questions');

drop policy past_questions_storage_insert on storage.objects;
create policy past_questions_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'past-questions'
    and public.account_effective_status((select auth.uid())) = 'active'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(name) ~ (
      '^' || (select auth.uid())::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|jpg|jpeg|png|webp|doc|docx)$'
    )
    and not exists (
      select 1 from public.past_question_resources r
      where r.object_path = storage.objects.name
    )
  );

alter table public.assignment_discussion_attachments
  drop constraint if exists assignment_discussion_attachments_content_type_check;
alter table public.assignment_discussion_attachments
  add constraint assignment_discussion_attachments_content_type_check
  check (content_type in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ));
alter table public.assignment_discussion_attachments
  add constraint assignment_discussion_attachments_object_path_format_check
  check (lower(object_path) ~ (
    '^' || uploaded_by::text || '/' || discussion_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|jpg|jpeg|png|webp|doc|docx)$'
  ));

create or replace function public.owns_assignment_discussion_object(p_object_path text, p_discussion_id uuid)
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
        '^' || (select auth.uid())::text || '/' || p_discussion_id::text
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|jpg|jpeg|png|webp|doc|docx)$'
      )
  );
$$;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where id = 'assignment-discussions';

drop policy assignment_discussions_storage_insert on storage.objects;
create policy assignment_discussions_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assignment-discussions'
    and public.account_effective_status((select auth.uid())) = 'active'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(name) ~ (
      '^' || (select auth.uid())::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|jpg|jpeg|png|webp|doc|docx)$'
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

commit;
