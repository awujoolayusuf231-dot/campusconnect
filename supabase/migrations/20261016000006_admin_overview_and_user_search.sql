-- 0006 (Phase 3) admin read layer. STATUS: written, NOT applied, NOT tested.
-- All functions: SECURITY DEFINER, search_path='', permission-checked inside, execute granted to authenticated only.

-- Permission keys of the caller, for permission-aware admin navigation (UI hint only; DB re-checks everything).
create function public.my_permissions() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case when ur.role = 'owner'
      then (select array_agg(k.key order by k.key) from public.permissions k)
      else (select array_agg(distinct x.p order by x.p) from (
              select rp.permission as p from public.role_permissions rp where rp.role = ur.role
              union select sp.permission from public.staff_permissions sp where sp.user_id = ur.user_id) x)
    end
    from public.user_roles ur
    where ur.user_id = (select auth.uid()) and public.account_effective_status(ur.user_id) = 'active'
  ), '{}'::text[])
$$;

-- Aggregate counts only. No message/post bodies are ever read here.
create function public.admin_overview_stats(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_days int := least(greatest(coalesce(p_days, 30), 1), 365); v_since timestamptz;
begin
  if not public.has_permission('analytics.view') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_since := now() - make_interval(days => v_days);
  return jsonb_build_object(
    'period_days', v_days,
    'total_users', (select count(*) from public.profiles),
    'new_users', (select count(*) from public.profiles where created_at >= v_since),
    'active_users', (select count(*) from auth.users where last_sign_in_at >= v_since),
    'suspended_accounts', (select count(*) from public.account_standing
        where status = 'suspended' and (restricted_until is null or restricted_until >= now())),
    'restricted_accounts', (select count(*) from public.account_standing
        where status = 'restricted' and (restricted_until is null or restricted_until >= now())),
    'pending_deletions', (select count(*) from public.account_deletion_requests where status = 'pending'),
    'staff_count', (select count(*) from public.user_roles),
    'active_institutions', (select count(*) from public.institutions where is_active)
  );
end $$;

create function public.admin_registrations_by_day(p_days int default 30)
returns table (day date, registrations bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  if not public.has_permission('analytics.view') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select g.d::date, count(p.id)
    from generate_series(current_date - (v_days - 1), current_date, interval '1 day') as g(d)
    left join public.profiles p on p.created_at >= g.d and p.created_at < g.d + interval '1 day'
    group by g.d order by g.d;
end $$;

-- Paginated user search. Email is returned (and searchable) ONLY with users.view_email.
create function public.admin_search_users(
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
           public.account_effective_status(p.id),
           coalesce(ur.role, 'student'::public.app_role),
           case when v_email then u.email::text end,
           p.created_at, count(*) over ()
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.user_roles ur on ur.user_id = p.id
    where (v_q is null or p.username ilike '%' || v_q || '%' or p.display_name ilike '%' || v_q || '%'
           or (v_email and u.email ilike '%' || v_q || '%'))
      and (p_institution is null or p.institution_id = p_institution)
      and (p_status is null or public.account_effective_status(p.id) = p_status)
      and (p_from is null or p.created_at >= p_from)
      and (p_to is null or p.created_at < p_to)
    order by p.created_at desc, p.id
    limit v_limit offset v_offset;
end $$;

-- Lock down: never rely on default privileges (see 0004).
revoke execute on function public.my_permissions(), public.admin_overview_stats(int),
  public.admin_registrations_by_day(int),
  public.admin_search_users(text, uuid, public.account_status, timestamptz, timestamptz, int, int)
  from public, anon, authenticated;
grant execute on function public.my_permissions(), public.admin_overview_stats(int),
  public.admin_registrations_by_day(int),
  public.admin_search_users(text, uuid, public.account_status, timestamptz, timestamptz, int, int)
  to authenticated;
