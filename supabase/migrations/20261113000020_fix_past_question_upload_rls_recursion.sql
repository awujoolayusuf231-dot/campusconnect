begin;

create function public.owns_past_question_object(p_object_path text)
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
    where o.bucket_id = 'past-questions'
      and o.name = p_object_path
      and (storage.foldername(o.name))[1] = (select auth.uid())::text
      and lower(o.name) ~ (
        '^' || (select auth.uid())::text
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
      )
  );
$$;

revoke all on function public.owns_past_question_object(text) from public, anon;
grant execute on function public.owns_past_question_object(text) to authenticated;

drop policy if exists past_question_resources_insert on public.past_question_resources;
create policy past_question_resources_insert on public.past_question_resources
  for insert to authenticated
  with check (
    public.account_effective_status((select auth.uid())) = 'active'
    and uploaded_by = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and rejection_reason is null
    and (select public.owns_past_question_object(object_path))
    and exists (
      select 1 from public.academic_courses c
      join public.academic_departments d on d.id = c.department_id
      join public.institutions i on i.id = d.institution_id
      where c.id = course_id and c.is_active and d.is_active and i.is_active
    )
  );

commit;
