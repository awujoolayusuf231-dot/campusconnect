-- Allow active authenticated users to add verified-shape catalog rows.
-- Existing catalog management policies continue to control updates and deletes.

begin;

create policy academic_departments_student_insert
  on public.academic_departments
  for insert to authenticated
  with check (
    public.account_effective_status((select auth.uid())) = 'active'
    and is_active
    and exists (
      select 1
      from public.institutions i
      where i.id = institution_id and i.is_active
    )
  );

create policy academic_courses_student_insert
  on public.academic_courses
  for insert to authenticated
  with check (
    public.account_effective_status((select auth.uid())) = 'active'
    and is_active
    and exists (
      select 1
      from public.academic_departments d
      join public.institutions i on i.id = d.institution_id
      where d.id = department_id and d.is_active and i.is_active
    )
  );

commit;
