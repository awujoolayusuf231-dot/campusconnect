-- =============================================================================
-- CampusConnect 0001: foundation (identity, RBAC, audit, settings, profiles)
-- Target: dedicated CampusConnect Supabase project ONLY (never whiteshirt.fun).
-- Security model: least privilege. Default table/function privileges are revoked
-- and re-granted explicitly. Privileged writes go through audited RPCs.
-- =============================================================================

-- Least-privilege defaults for everything created from now on in `public`.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create extension if not exists pg_trgm with schema extensions;

-- ---------- Types ------------------------------------------------------------
create type public.app_role as enum ('student', 'moderator', 'admin', 'owner');
create type public.account_status as enum ('active', 'restricted', 'suspended', 'disabled', 'pending_deletion');
create type public.institution_type as enum ('university', 'polytechnic', 'college_of_education', 'other');
create type public.profile_visibility as enum ('public', 'institution', 'private');

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create function public.role_rank(p_role public.app_role) returns int
language sql immutable set search_path = '' as $$
  select case p_role when 'student' then 0 when 'moderator' then 1 when 'admin' then 2 when 'owner' then 3 end
$$;

-- ---------- Institutions -----------------------------------------------------
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 150),
  short_name text check (short_name is null or char_length(short_name) between 2 and 20),
  type public.institution_type not null,
  state text check (state is null or char_length(state) <= 40),
  aliases text[] not null default '{}' check (cardinality(aliases) <= 10),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index institutions_name_key on public.institutions (lower(name));
create index institutions_name_trgm on public.institutions using gin (name extensions.gin_trgm_ops);
create index institutions_active_name_idx on public.institutions (is_active, name);
create trigger institutions_updated_at before update on public.institutions
  for each row execute function public.set_updated_at();

-- ---------- RBAC -------------------------------------------------------------
create table public.permissions (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null
);
create table public.role_permissions (
  role public.app_role not null,
  permission text not null references public.permissions(key) on delete cascade,
  primary key (role, permission)
);
-- A row exists ONLY for staff. Students have no row (effective role = student).
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null check (role <> 'student'),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);
create table public.staff_permissions (
  user_id uuid not null references public.user_roles(user_id) on delete cascade,
  permission text not null references public.permissions(key) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, permission)
);

-- Moderation state lives apart from the (publicly readable) profile.
create table public.account_standing (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status public.account_status not null default 'active',
  posting_restricted boolean not null default false,
  messaging_restricted boolean not null default false,
  restricted_until timestamptz,
  reason text check (reason is null or char_length(reason) <= 500),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index account_standing_status_idx on public.account_standing (status) where status <> 'active';

-- ---------- Profiles ---------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  bio text check (bio is null or char_length(bio) <= 280),
  avatar_path text check (avatar_path is null or (avatar_path like id::text || '/%' and avatar_path !~ '\.\.' and char_length(avatar_path) <= 200)),
  institution_id uuid references public.institutions(id) on delete set null,
  faculty text check (faculty is null or char_length(faculty) <= 100),
  department text check (department is null or char_length(department) <= 100),
  academic_level text check (academic_level is null or char_length(academic_level) <= 30),
  graduation_year smallint check (graduation_year is null or graduation_year between 1990 and 2100),
  interests text[] not null default '{}' check (cardinality(interests) <= 10 and char_length(array_to_string(interests, ',')) <= 300),
  location text check (location is null or char_length(location) <= 80),
  website_url text check (website_url is null or (website_url ~* '^https://[^[:space:]]+$' and char_length(website_url) <= 200)),
  -- Only whiteshirt.fun (optionally www.) over https. Host must end exactly at ".fun" then "/" or end.
  celebration_url text check (celebration_url is null or (celebration_url ~* '^https://(www\.)?whiteshirt\.fun(/[A-Za-z0-9._~%/-]*)?$' and char_length(celebration_url) <= 200)),
  show_celebration boolean not null default true,
  visibility public.profile_visibility not null default 'public',
  institution_verified boolean not null default false, -- no verification process exists yet; never set by clients
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_username_trgm on public.profiles using gin (username extensions.gin_trgm_ops);
create index profiles_display_name_trgm on public.profiles using gin (display_name extensions.gin_trgm_ops);
create index profiles_institution_idx on public.profiles (institution_id, department);
create index profiles_interests_idx on public.profiles using gin (interests);
create index profiles_created_idx on public.profiles (created_at desc);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'completed')),
  requested_at timestamptz not null default now(),
  processed_by uuid references auth.users(id) on delete set null,
  processed_at timestamptz
);

-- ---------- Platform settings and feature flags -----------------------------
create table public.platform_settings (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  value jsonb not null,
  value_type text not null check (value_type in ('boolean', 'string', 'number')),
  description text not null,
  is_public boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  enabled boolean not null default false,
  description text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------- Append-only audit log -------------------------------------------
create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid, -- intentionally no FK: rows must never be modified, even by cascades
  action text not null,
  target_type text not null,
  target_id text,
  reason text check (reason is null or char_length(reason) <= 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_created_idx on public.admin_audit_logs (created_at desc);
create index audit_actor_idx on public.admin_audit_logs (actor_id, created_at desc);
create index audit_target_idx on public.admin_audit_logs (target_type, target_id);

create function public.audit_log_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'admin_audit_logs is append-only' using errcode = '42501'; end $$;
create trigger audit_no_update_delete before update or delete on public.admin_audit_logs
  for each row execute function public.audit_log_immutable();
create trigger audit_no_truncate before truncate on public.admin_audit_logs
  for each statement execute function public.audit_log_immutable();

-- Internal writer: NOT executable by anon/authenticated (default privileges revoked).
create function public.log_admin_action(
  p_actor uuid, p_action text, p_target_type text, p_target_id text,
  p_reason text, p_metadata jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, reason, metadata)
  values (p_actor, p_action, p_target_type, p_target_id, p_reason, coalesce(p_metadata, '{}'::jsonb));
$$;

-- Generic row-change audit trigger for configuration tables.
create function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb; v_key text := coalesce(tg_argv[0], 'id');
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  perform public.log_admin_action((select auth.uid()), tg_table_name || '.' || lower(tg_op),
    tg_table_name, coalesce(v_new ->> v_key, v_old ->> v_key), null,
    jsonb_build_object('old', v_old, 'new', v_new));
  return null;
end $$;

create trigger institutions_audit after insert or update or delete on public.institutions
  for each row execute function public.audit_row_change('id');
create trigger feature_flags_audit after insert or update or delete on public.feature_flags
  for each row execute function public.audit_row_change('key');
create trigger platform_settings_audit after insert or update or delete on public.platform_settings
  for each row execute function public.audit_row_change('key');

-- Settings validation: type must match, strings bounded, actor stamped.
create function public.platform_settings_validate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.key <> old.key or new.value_type <> old.value_type or new.is_public <> old.is_public then
    raise exception 'setting identity is immutable' using errcode = '42501';
  end if;
  if jsonb_typeof(new.value) <> new.value_type then
    raise exception 'setting % expects %', new.key, new.value_type using errcode = '22023';
  end if;
  if new.value_type = 'string' and char_length(new.value #>> '{}') > 500 then
    raise exception 'setting % too long', new.key using errcode = '22023';
  end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end $$;
create trigger a_platform_settings_validate before update on public.platform_settings
  for each row execute function public.platform_settings_validate();

create function public.feature_flags_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin new.updated_by := (select auth.uid()); new.updated_at := now(); return new; end $$;
create trigger a_feature_flags_stamp before update on public.feature_flags
  for each row execute function public.feature_flags_stamp();

-- ---------- Authorization helpers (SECURITY DEFINER, fixed search_path) -----
create function public.account_effective_status(p_user uuid) returns public.account_status
language sql stable security definer set search_path = '' as $$
  select case
    when s.status in ('restricted', 'suspended') and s.restricted_until is not null and s.restricted_until < now()
      then 'active'::public.account_status
    else s.status end
  from public.account_standing s where s.user_id = p_user
$$;

create function public.has_permission(p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and public.account_effective_status(ur.user_id) = 'active'
        and (ur.role = 'owner'
          or exists (select 1 from public.role_permissions rp where rp.role = ur.role and rp.permission = p_permission)
          or exists (select 1 from public.staff_permissions sp where sp.user_id = ur.user_id and sp.permission = p_permission))
    )), false)
$$;

create function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select ur.role from public.user_roles ur
    where ur.user_id = (select auth.uid()) and public.account_effective_status(ur.user_id) = 'active'
  ), 'student'::public.app_role)
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_app_role() <> 'student'
$$;

create function public.current_institution_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select institution_id from public.profiles where id = (select auth.uid())
$$;

create function public.account_is_listed(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.account_effective_status(p_user) in ('active', 'restricted'), false)
$$;

-- Profile validation: institution must be active.
create function public.profiles_validate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.institution_id is not null
     and (tg_op = 'INSERT' or new.institution_id is distinct from old.institution_id)
     and not exists (select 1 from public.institutions i where i.id = new.institution_id and i.is_active) then
    raise exception 'institution is not available' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger a_profiles_validate before insert or update on public.profiles
  for each row execute function public.profiles_validate();

-- ---------- Signup: profile + standing created by trigger -------------------
-- Role is NEVER read from client metadata. Everyone starts as a student.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_open boolean;
  v_username text;
  v_display text;
  v_inst uuid;
  v_fallback text := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
begin
  select (value #>> '{}')::boolean into v_open from public.platform_settings where key = 'registration_open';
  if coalesce(v_open, true) = false then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;

  v_username := lower(coalesce(v_meta ->> 'username', ''));
  if v_username !~ '^[a-z0-9_]{3,30}$' then v_username := v_fallback; end if;

  v_display := btrim(coalesce(v_meta ->> 'display_name', ''));
  if char_length(v_display) not between 1 and 60 then
    v_display := coalesce(nullif(left(btrim(split_part(coalesce(new.email, ''), '@', 1)), 60), ''), 'Student');
  end if;

  begin v_inst := (v_meta ->> 'institution_id')::uuid; exception when others then v_inst := null; end;
  if v_inst is not null and not exists (select 1 from public.institutions where id = v_inst and is_active) then
    v_inst := null;
  end if;

  begin
    insert into public.profiles (id, username, display_name, institution_id)
    values (new.id, v_username, v_display, v_inst);
  exception when unique_violation then
    insert into public.profiles (id, username, display_name, institution_id)
    values (new.id, v_fallback, v_display, v_inst);
  end;
  insert into public.account_standing (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Privileged RPCs (audited, permission-checked) -------------------
create function public.is_username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_username ~ '^[a-z0-9_]{3,30}$'
     and not exists (select 1 from public.profiles where username = lower(p_username))
$$;

create function public.admin_set_role(p_target uuid, p_role public.app_role, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_old public.app_role;
begin
  if v_actor is null or not public.has_permission('staff.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_role = 'owner' then raise exception 'owner_role_not_assignable' using errcode = '42501'; end if;
  if p_target = v_actor then raise exception 'cannot_change_own_role' using errcode = '42501'; end if;
  if not exists (select 1 from auth.users where id = p_target) then
    raise exception 'target_not_found' using errcode = '22023';
  end if;
  select role into v_old from public.user_roles where user_id = p_target;
  if v_old = 'owner' then raise exception 'owner_protected' using errcode = '42501'; end if;
  if (p_role = 'admin' or v_old = 'admin') and public.current_app_role() <> 'owner' then
    raise exception 'only_owner_can_manage_admins' using errcode = '42501';
  end if;
  if p_role = 'student' then
    delete from public.user_roles where user_id = p_target; -- cascades staff_permissions
  else
    insert into public.user_roles (user_id, role, granted_by) values (p_target, p_role, v_actor)
    on conflict (user_id) do update set role = excluded.role, granted_by = v_actor, granted_at = now();
  end if;
  perform public.log_admin_action(v_actor, 'role.change', 'user', p_target::text, btrim(p_reason),
    jsonb_build_object('old_role', coalesce(v_old, 'student'), 'new_role', p_role));
end $$;

create function public.admin_set_staff_permission(p_target uuid, p_permission text, p_granted boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_role public.app_role;
begin
  if v_actor is null or public.current_app_role() <> 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select role into v_role from public.user_roles where user_id = p_target;
  if v_role is null or v_role = 'owner' then raise exception 'invalid_target' using errcode = '22023'; end if;
  if not exists (select 1 from public.permissions where key = p_permission) then
    raise exception 'unknown_permission' using errcode = '22023';
  end if;
  if p_granted then
    insert into public.staff_permissions (user_id, permission, granted_by) values (p_target, p_permission, v_actor)
    on conflict do nothing;
  else
    delete from public.staff_permissions where user_id = p_target and permission = p_permission;
  end if;
  perform public.log_admin_action(v_actor, case when p_granted then 'permission.grant' else 'permission.revoke' end,
    'user', p_target::text, btrim(p_reason), jsonb_build_object('permission', p_permission));
end $$;

create function public.admin_set_account_status(
  p_target uuid, p_status public.account_status, p_reason text,
  p_posting_restricted boolean default false, p_messaging_restricted boolean default false,
  p_restricted_until timestamptz default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_caller_rank int; v_target_rank int; v_old public.account_status;
begin
  if v_actor is null or not public.has_permission('users.moderate') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_target = v_actor then raise exception 'cannot_moderate_self' using errcode = '42501'; end if;
  v_caller_rank := public.role_rank(public.current_app_role());
  select public.role_rank(coalesce((select role from public.user_roles where user_id = p_target), 'student'))
    into v_target_rank;
  if v_target_rank >= v_caller_rank then raise exception 'insufficient_rank' using errcode = '42501'; end if;
  if p_status in ('disabled', 'pending_deletion') and v_caller_rank < 2 then
    raise exception 'insufficient_rank' using errcode = '42501';
  end if;
  if p_restricted_until is not null and p_restricted_until <= now() then
    raise exception 'restricted_until_must_be_future' using errcode = '22023';
  end if;
  select status into v_old from public.account_standing where user_id = p_target for update;
  if not found then raise exception 'target_not_found' using errcode = '22023'; end if;
  update public.account_standing set
    status = p_status,
    posting_restricted = case when p_status = 'active' then false else p_posting_restricted end,
    messaging_restricted = case when p_status = 'active' then false else p_messaging_restricted end,
    restricted_until = case when p_status = 'active' then null else p_restricted_until end,
    reason = btrim(p_reason), updated_by = v_actor, updated_at = now()
  where user_id = p_target;
  perform public.log_admin_action(v_actor, 'account.status_change', 'user', p_target::text, btrim(p_reason),
    jsonb_build_object('old_status', v_old, 'new_status', p_status,
      'posting_restricted', p_posting_restricted, 'messaging_restricted', p_messaging_restricted,
      'restricted_until', p_restricted_until));
end $$;

create function public.request_account_deletion() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.account_deletion_requests (user_id) values (v_uid)
  on conflict (user_id) do update set status = 'pending', requested_at = now(), processed_by = null, processed_at = null;
end $$;

create function public.cancel_account_deletion() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.account_deletion_requests set status = 'cancelled', processed_at = now()
  where user_id = v_uid and status = 'pending';
end $$;

-- Owner provisioning: callable ONLY from the SQL editor / postgres role.
create function public.provision_owner(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.user_roles where role = 'owner') then
    raise exception 'an owner already exists';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user not found';
  end if;
  insert into public.user_roles (user_id, role, granted_by) values (p_user_id, 'owner', null);
  perform public.log_admin_action(null, 'owner.provision', 'user', p_user_id::text, 'initial owner provisioning', '{}'::jsonb);
end $$;
revoke all on function public.provision_owner(uuid) from public, anon, authenticated, service_role;

-- ---------- Function grants --------------------------------------------------
grant execute on function public.has_permission(text), public.current_app_role(), public.is_staff(),
  public.current_institution_id(), public.account_is_listed(uuid), public.account_effective_status(uuid),
  public.role_rank(public.app_role),
  public.admin_set_role(uuid, public.app_role, text),
  public.admin_set_staff_permission(uuid, text, boolean, text),
  public.admin_set_account_status(uuid, public.account_status, text, boolean, boolean, timestamptz),
  public.request_account_deletion(), public.cancel_account_deletion()
  to authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- ---------- Table grants + RLS ----------------------------------------------
alter table public.institutions enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.staff_permissions enable row level security;
alter table public.account_standing enable row level security;
alter table public.profiles enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.platform_settings enable row level security;
alter table public.feature_flags enable row level security;
alter table public.admin_audit_logs enable row level security;

grant select on public.institutions to anon, authenticated;
grant insert, update on public.institutions to authenticated;
create policy institutions_select_anon on public.institutions for select to anon using (is_active);
create policy institutions_select_auth on public.institutions for select to authenticated
  using (is_active or (select public.has_permission('institutions.manage')));
create policy institutions_insert on public.institutions for insert to authenticated
  with check ((select public.has_permission('institutions.manage')));
create policy institutions_update on public.institutions for update to authenticated
  using ((select public.has_permission('institutions.manage')))
  with check ((select public.has_permission('institutions.manage')));

grant select on public.permissions, public.role_permissions, public.staff_permissions, public.user_roles to authenticated;
create policy permissions_select on public.permissions for select to authenticated using ((select public.is_staff()));
create policy role_permissions_select on public.role_permissions for select to authenticated using ((select public.is_staff()));
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('staff.view')));
create policy staff_permissions_select on public.staff_permissions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('staff.view')));

grant select on public.account_standing to authenticated;
create policy account_standing_select on public.account_standing for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('users.view')));

grant select on public.profiles to authenticated;
grant update (username, display_name, bio, avatar_path, institution_id, faculty, department, academic_level,
  graduation_year, interests, location, website_url, celebration_url, show_celebration, visibility)
  on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (select public.has_permission('users.view'))
  or (public.account_is_listed(id) and (
        visibility = 'public'
        or (visibility = 'institution' and institution_id is not null and institution_id = (select public.current_institution_id()))))
);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()) and public.account_effective_status(id) in ('active', 'restricted'))
  with check (id = (select auth.uid()));

grant select on public.account_deletion_requests to authenticated;
create policy deletion_select on public.account_deletion_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('users.view')));

grant select on public.platform_settings to anon, authenticated;
grant update (value) on public.platform_settings to authenticated;
create policy settings_select_anon on public.platform_settings for select to anon using (is_public);
create policy settings_select_auth on public.platform_settings for select to authenticated
  using (is_public or (select public.has_permission('settings.manage')));
create policy settings_update on public.platform_settings for update to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));

grant select on public.feature_flags to anon, authenticated;
grant update (enabled) on public.feature_flags to authenticated;
create policy flags_select on public.feature_flags for select to anon, authenticated using (true);
create policy flags_update on public.feature_flags for update to authenticated
  using ((select public.has_permission('flags.manage')))
  with check ((select public.has_permission('flags.manage')));

grant select on public.admin_audit_logs to authenticated;
create policy audit_select on public.admin_audit_logs for select to authenticated
  using ((select public.has_permission('audit.view')));

-- ---------- Configuration seed (not test data) -------------------------------
insert into public.permissions (key, description) values
  ('users.view', 'View user accounts and public profile data'),
  ('users.view_email', 'View account email addresses'),
  ('users.moderate', 'Warn, restrict, suspend and reinstate accounts'),
  ('content.moderate', 'Hide and restore posts and comments'),
  ('reports.manage', 'Review and resolve user reports'),
  ('institutions.manage', 'Create and edit institutions'),
  ('communities.manage', 'Manage communities'),
  ('opportunities.manage', 'Manage opportunities'),
  ('announcements.manage', 'Manage platform announcements'),
  ('analytics.view', 'View aggregate platform analytics'),
  ('audit.view', 'View the administrative audit log'),
  ('settings.manage', 'Change platform settings'),
  ('flags.manage', 'Change feature flags'),
  ('staff.view', 'View staff roles and permissions'),
  ('staff.manage', 'Assign and revoke staff roles');
insert into public.role_permissions (role, permission) values
  ('moderator', 'users.view'), ('moderator', 'content.moderate'), ('moderator', 'reports.manage'),
  ('admin', 'users.view'), ('admin', 'users.view_email'), ('admin', 'users.moderate'),
  ('admin', 'content.moderate'), ('admin', 'reports.manage'), ('admin', 'communities.manage'),
  ('admin', 'opportunities.manage'), ('admin', 'announcements.manage'), ('admin', 'analytics.view'),
  ('admin', 'audit.view');
insert into public.platform_settings (key, value, value_type, description, is_public) values
  ('platform_name', '"CampusConnect"', 'string', 'Display name of the platform', true),
  ('registration_open', 'true', 'boolean', 'Whether new accounts can be created', true),
  ('maintenance_message', '""', 'string', 'Maintenance notice shown to all visitors (empty = none)', true),
  ('announcement_banner', '""', 'string', 'Public landing-page announcement (empty = none)', true),
  ('support_email', '""', 'string', 'Public support contact email', true),
  ('guidelines_url', '"/community-guidelines"', 'string', 'Community guidelines link', true);
insert into public.feature_flags (key, enabled, description) values
  ('campus_celebrations', true, 'Show whiteshirt.fun celebration links on profiles'),
  ('messaging', true, 'Private one-to-one messaging'),
  ('communities', true, 'Campus communities'),
  ('opportunities', true, 'Student opportunities');
