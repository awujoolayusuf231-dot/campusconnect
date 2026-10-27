-- 0011 APPLIED to CampusConnect01 as "admin_institution_user_counts"; tested (5 checks PASS, rolled back).
create function public.admin_institution_user_counts()
returns table (institution_id uuid, users bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not (public.has_permission('institutions.manage') or public.has_permission('users.view')) then
    raise exception 'forbidden' using errcode = '42501'; end if;
  return query select p.institution_id, count(*) from public.profiles p where p.institution_id is not null group by p.institution_id;
end $$;
revoke execute on function public.admin_institution_user_counts() from public, anon, authenticated;
grant execute on function public.admin_institution_user_counts() to authenticated;
