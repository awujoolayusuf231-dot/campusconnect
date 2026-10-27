-- 0007 (APPLIED to CampusConnect01 as "guard_account_status_visibility"; tests 75/75 PASS)
-- Problem: any signed-in user could call account_effective_status(uuid) for ANY user and learn whether they were
-- suspended/restricted. Fix: internal function (no API grants) + guarded wrapper (self or users.view only).

create function public.effective_status_internal(p_user uuid) returns public.account_status
language sql stable security definer set search_path = '' as $$
  select case
    when s.status in ('restricted', 'suspended') and s.restricted_until is not null and s.restricted_until < now()
      then 'active'::public.account_status
    else s.status end
  from public.account_standing s where s.user_id = p_user
$$;
revoke execute on function public.effective_status_internal(uuid) from public, anon, authenticated;

create or replace function public.has_permission(p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and public.effective_status_internal(ur.user_id) = 'active'
        and (ur.role = 'owner'
          or exists (select 1 from public.role_permissions rp where rp.role = ur.role and rp.permission = p_permission)
          or exists (select 1 from public.staff_permissions sp where sp.user_id = ur.user_id and sp.permission = p_permission))
    )), false)
$$;

create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select ur.role from public.user_roles ur
    where ur.user_id = (select auth.uid()) and public.effective_status_internal(ur.user_id) = 'active'
  ), 'student'::public.app_role)
$$;

create or replace function public.account_is_listed(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.effective_status_internal(p_user) in ('active', 'restricted'), false)
$$;

create or replace function public.my_permissions() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case when ur.role = 'owner'
      then (select array_agg(k.key order by k.key) from public.permissions k)
      else (select array_agg(distinct x.p order by x.p) from (
              select rp.permission as p from public.role_permissions rp where rp.role = ur.role
              union select sp.permission from public.staff_permissions sp where sp.user_id = ur.user_id) x)
    end
    from public.user_roles ur
    where ur.user_id = (select auth.uid()) and public.effective_status_internal(ur.user_id) = 'active'
  ), '{}'::text[])
$$;

create or replace function public.account_effective_status(p_user uuid) returns public.account_status
language sql stable security definer set search_path = '' as $$
  select case when p_user = (select auth.uid()) or public.has_permission('users.view')
              then public.effective_status_internal(p_user) end
$$;

create or replace function public.admin_search_users(
  p_query text default null, p_institution uuid default null, p_status public.account_status default null,
  p_from timestamptz default null, p_to timestamptz default null, p_limit int default 25, p_offset int default 0
) returns table (user_id uuid, username text, display_name text, institution_id uuid,
                 status public.account_status, role public.app_role, email text,
                 joined_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_q text; v_email boolean; v_limit int; v_offset int;
begin
  if not public.has_permission('users.view') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_email := public.has_permission('users.view_email');
  v_limit := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_q := nullif(btrim(coalesce(p_query, '')), '');
  if v_q is not null then
    v_q := replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_');
  end if;
  return query
    select p.id, p.username, p.display_name, p.institution_id,
           public.effective_status_internal(p.id),
           coalesce(ur.role, 'student'::public.app_role),
           case when v_email then u.email::text end,
           p.created_at, count(*) over ()
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.user_roles ur on ur.user_id = p.id
    where (v_q is null or p.username ilike '%' || v_q || '%' or p.display_name ilike '%' || v_q || '%'
           or (v_email and u.email ilike '%' || v_q || '%'))
      and (p_institution is null or p.institution_id = p_institution)
      and (p_status is null or public.effective_status_internal(p.id) = p_status)
      and (p_from is null or p.created_at >= p_from)
      and (p_to is null or p.created_at < p_to)
    order by p.created_at desc, p.id
    limit v_limit offset v_offset;
end $$;

revoke execute on function public.admin_search_users(text, uuid, public.account_status, timestamptz, timestamptz, int, int),
  public.my_permissions(), public.has_permission(text), public.current_app_role(),
  public.account_is_listed(uuid), public.account_effective_status(uuid) from public, anon;
grant execute on function public.admin_search_users(text, uuid, public.account_status, timestamptz, timestamptz, int, int),
  public.my_permissions(), public.has_permission(text), public.current_app_role(),
  public.account_is_listed(uuid), public.account_effective_status(uuid) to authenticated;
