-- Keep private social helpers private while allowing discussion RLS to use them safely.
begin;

create function public.assignment_discussion_author_visible_to_current_user(p_author_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      p_author_id = (select auth.uid())
      or (
        not public.internal_blocked_either(p_author_id, (select auth.uid()))
        and (
          public.internal_profile_visible(p_author_id, (select auth.uid()))
          or (select public.has_permission('content.moderate'))
        )
      )
    );
$$;

revoke all on function public.assignment_discussion_author_visible_to_current_user(uuid)
  from public, anon, authenticated;
grant execute on function public.assignment_discussion_author_visible_to_current_user(uuid)
  to authenticated;

drop policy assignment_discussions_select on public.assignment_discussions;
create policy assignment_discussions_select on public.assignment_discussions
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and exists (
      select 1
      from public.academic_courses c
      join public.academic_departments dep on dep.id = c.department_id
      join public.institutions i on i.id = dep.institution_id
      where c.id = course_id and c.is_active and dep.is_active and i.is_active
    )
    and (
      status = 'visible'
      or (status = 'hidden' and author_id = (select auth.uid()))
      or (select public.has_permission('content.moderate'))
    )
    and public.assignment_discussion_author_visible_to_current_user(author_id)
  );

drop policy assignment_discussion_replies_select on public.assignment_discussion_replies;
create policy assignment_discussion_replies_select on public.assignment_discussion_replies
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and (
      status = 'visible'
      or (status = 'hidden' and author_id = (select auth.uid()))
      or (select public.has_permission('content.moderate'))
    )
    and public.assignment_discussion_author_visible_to_current_user(author_id)
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

drop policy assignment_discussion_replies_insert on public.assignment_discussion_replies;
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
        and public.assignment_discussion_author_visible_to_current_user(d.author_id)
    )
  );

notify pgrst, 'reload schema';

commit;
