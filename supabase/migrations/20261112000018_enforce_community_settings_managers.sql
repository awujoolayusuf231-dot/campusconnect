-- Requires:
-- 20261016000007_guard_account_status_visibility.sql
-- 20261018000008_social_core_posts_reports_moderation.sql
-- 20261022000009_phase5_communities_notifications_messaging.sql
-- 20261111000016_community_management.sql
-- 20261111145500_community_social_security_hardening.sql
-- 20261112000017_require_active_members_for_community_posts.sql
begin;

do $preflight$
begin
  if to_regclass('public.communities') is null
     or to_regclass('public.community_members') is null
     or to_regclass('public.community_mod_actions') is null
     or to_regclass('storage.objects') is null
     or to_regclass('storage.buckets') is null
     or to_regprocedure('public.account_can_post()') is null
     or to_regprocedure('public.has_permission(text)') is null
     or to_regprocedure('public.community_manage_update(uuid,text,text,text,uuid,text)') is null
     or to_regprocedure('public.community_update(uuid,text)') is null
     or to_regprocedure('public.community_set_archived(uuid,boolean)') is null
     or to_regprocedure('public.admin_set_community_state(uuid,text,text)') is null
     or to_regprocedure('public.community_members_count_trg()') is null
     or to_regprocedure('campusconnect_private.internal_current_community_manager(uuid)') is null
     or not (select relrowsecurity from pg_class where oid = 'public.communities'::regclass) then
    raise exception 'Community settings authorization prerequisites are missing';
  end if;
end;
$preflight$;

do $authorization_preflight$
declare
  v_source text;
begin
  select prosrc into v_source
  from pg_proc
  where oid = 'public.has_permission(text)'::regprocedure
    and prosecdef;
  if v_source is null
     or position('auth.uid' in lower(v_source)) = 0
     or position('user_roles' in lower(v_source)) = 0
     or position('role_permissions' in lower(v_source)) = 0
     or position('staff_permissions' in lower(v_source)) = 0
     or position('effective_status_internal' in lower(v_source)) = 0 then
    raise exception 'Community settings authorization requires the caller-bound database permission helper';
  end if;

  select prosrc into v_source
  from pg_proc
  where oid = 'public.account_can_post()'::regprocedure
    and prosecdef;
  if v_source is null
     or position('auth.uid' in lower(v_source)) = 0
     or position('effective_status_internal' in lower(v_source)) = 0 then
    raise exception 'Community settings authorization requires the caller-bound posting eligibility helper';
  end if;

  select prosrc into v_source
  from pg_proc
  where oid = 'campusconnect_private.internal_current_community_manager(uuid)'::regprocedure
    and prosecdef;
  if v_source is null
     or position('auth.uid' in lower(v_source)) = 0
     or position('community_members' in lower(v_source)) = 0
     or position('status = ''active''' in lower(v_source)) = 0
     or position('owner' in lower(v_source)) = 0
     or position('moderator' in lower(v_source)) = 0
     or position('account_can_post' in lower(v_source)) = 0 then
    raise exception 'Community settings authorization requires the caller-bound active-manager helper';
  end if;

  if not exists (
    select 1 from storage.buckets
    where id = 'community-covers' and public = false
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'campusconnect_community_cover_read_guard'
      and permissive = 'RESTRICTIVE'
      and roles = array['authenticated'::name]
      and cmd = 'SELECT'
      and qual ilike '%foldername%'
      and qual ilike '%c.id%'
      and qual ilike '%cover_path%'
      and qual ilike '%status%'
  ) then
    raise exception 'Community covers require a private bucket and a current-community-path read guard';
  end if;
end;
$authorization_preflight$;

create or replace function campusconnect_private.internal_current_community_owner(p_community uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select coalesce(
    (select public.account_can_post()
       and c.status <> 'disabled'
       and exists (
         select 1
         from public.community_members m
         where m.community_id = c.id
           and m.user_id = (select auth.uid())
           and m.status = 'active'
           and m.role = 'owner'
       )
     from public.communities c
     where c.id = p_community),
    false
  )
$function$;

revoke all on function campusconnect_private.internal_current_community_owner(uuid)
  from public, anon, authenticated;
grant execute on function campusconnect_private.internal_current_community_owner(uuid)
  to authenticated;

create or replace function public.community_manage_update(
  p_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_institution uuid,
  p_cover_path text
)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
  v_status text;
begin
  if v_uid is null or not public.account_can_post() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select c.status into v_status
  from public.communities c
  where c.id = p_id;
  if v_status is null then raise exception 'not_found' using errcode = '22023'; end if;
  if v_status = 'disabled' then raise exception 'disabled_by_platform' using errcode = '42501'; end if;

  -- Match the membership trigger's membership-then-community lock order.
  select m.role into v_role
  from public.community_members m
  where m.community_id = p_id
    and m.user_id = v_uid
    and m.status = 'active'
  for update;

  if v_role is distinct from 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select c.status into v_status
  from public.communities c
  where c.id = p_id
  for update;
  if v_status is null then raise exception 'not_found' using errcode = '22023'; end if;
  if v_status = 'disabled' then raise exception 'disabled_by_platform' using errcode = '42501'; end if;

  if char_length(btrim(coalesce(p_name, ''))) not between 3 and 60 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 500 then
    raise exception 'invalid_description' using errcode = '22023';
  end if;
  if coalesce(p_category, '') not in ('institution','department','course','interest','activity','other') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if p_institution is not null and not exists (
    select 1 from public.institutions where id = p_institution and is_active
  ) then
    raise exception 'invalid_institution' using errcode = '22023';
  end if;
  if p_cover_path is not null and p_cover_path !~ (
    '^' || p_id::text || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$'
  ) then
    raise exception 'invalid_cover_path' using errcode = '22023';
  end if;
  if p_cover_path is not null and not exists (
    select 1 from storage.objects
    where bucket_id = 'community-covers' and name = p_cover_path
  ) then
    raise exception 'cover_not_found' using errcode = '22023';
  end if;

  update public.communities
  set name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      category = p_category,
      institution_id = p_institution,
      cover_path = p_cover_path
  where id = p_id;
exception
  when unique_violation then
    raise exception 'name_taken' using errcode = '23505';
end;
$function$;

create or replace function public.community_set_archived(p_id uuid, p_archived boolean)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_role text;
  v_status text;
begin
  if v_uid is null or not public.account_can_post() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select m.role into v_role
  from public.community_members m
  where m.community_id = p_id
    and m.user_id = v_uid
    and m.status = 'active'
  for update;
  if v_role is distinct from 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select c.status into v_status
  from public.communities c
  where c.id = p_id
  for update;
  if v_status is null then raise exception 'not_found' using errcode = '22023'; end if;
  if v_status = 'disabled' then
    raise exception 'disabled_by_platform' using errcode = '42501';
  end if;

  update public.communities
  set status = case when p_archived then 'archived' else 'active' end
  where id = p_id;
  insert into public.community_mod_actions (community_id, actor_id, action)
  values (p_id, v_uid, case when p_archived then 'archive' else 'unarchive' end);
end;
$function$;

revoke all on function public.community_manage_update(uuid, text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.community_manage_update(uuid, text, text, text, uuid, text)
  to authenticated;
revoke all on function public.community_update(uuid, text)
  from public, anon, authenticated;
revoke all on function public.community_set_archived(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.community_set_archived(uuid, boolean)
  to authenticated;

revoke update on table public.communities from public, anon, authenticated;
revoke update (
  id, name, slug, description, category, institution_id, status,
  created_by, member_count, created_at, updated_at, cover_path
) on table public.communities from public, anon, authenticated;

do $revoke_community_column_updates$
declare
  v_column record;
begin
  for v_column in
    select a.attname
    from pg_attribute a
    where a.attrelid = 'public.communities'::regclass
      and a.attnum > 0
      and not a.attisdropped
  loop
    execute format(
      'revoke update (%I) on table public.communities from public, anon, authenticated',
      v_column.attname
    );
  end loop;
end;
$revoke_community_column_updates$;

drop policy if exists campusconnect_communities_settings_update_guard on public.communities;
create policy campusconnect_communities_settings_update_guard on public.communities
  as restrictive for update to authenticated
  using (
    public.account_can_post()
    and campusconnect_private.internal_current_community_owner(id)
  )
  with check (
    public.account_can_post()
    and campusconnect_private.internal_current_community_owner(id)
  );

drop policy if exists campusconnect_community_cover_insert_guard on storage.objects;
create policy campusconnect_community_cover_insert_guard on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'community-covers'
    or (
      public.account_can_post()
      and (select auth.uid()) is not null
      and name ~ ('^' || (storage.foldername(objects.name))[1] || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$')
      and exists (
        select 1 from public.communities c
        where c.id::text = (storage.foldername(objects.name))[1]
          and c.status <> 'disabled'
          and campusconnect_private.internal_current_community_owner(c.id)
      )
    )
  );

drop policy if exists campusconnect_community_cover_update_guard on storage.objects;
create policy campusconnect_community_cover_update_guard on storage.objects
  as restrictive for update to authenticated
  using (
    bucket_id <> 'community-covers'
    or (
      public.account_can_post()
      and (select auth.uid()) is not null
      and name ~ ('^' || (storage.foldername(objects.name))[1] || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$')
      and exists (
        select 1 from public.communities c
        where c.id::text = (storage.foldername(objects.name))[1]
          and c.status <> 'disabled'
          and campusconnect_private.internal_current_community_owner(c.id)
      )
    )
  )
  with check (
    bucket_id <> 'community-covers'
    or (
      public.account_can_post()
      and (select auth.uid()) is not null
      and name ~ ('^' || (storage.foldername(objects.name))[1] || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$')
      and exists (
        select 1 from public.communities c
        where c.id::text = (storage.foldername(objects.name))[1]
          and c.status <> 'disabled'
          and campusconnect_private.internal_current_community_owner(c.id)
      )
    )
  );

drop policy if exists campusconnect_community_cover_delete_guard on storage.objects;
create policy campusconnect_community_cover_delete_guard on storage.objects
  as restrictive for delete to authenticated
  using (
    bucket_id <> 'community-covers'
    or (
      public.account_can_post()
      and (select auth.uid()) is not null
      and name ~ ('^' || (storage.foldername(objects.name))[1] || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$')
      and exists (
        select 1 from public.communities c
        where c.id::text = (storage.foldername(objects.name))[1]
          and c.status <> 'disabled'
          and campusconnect_private.internal_current_community_owner(c.id)
      )
    )
  );

do $settings_authorization_postflight$
declare
  v_role text;
  v_column record;
begin
  for v_role in
    select role_name from (values ('anon'), ('authenticated')) roles(role_name)
  loop
    if has_table_privilege(v_role, 'public.communities', 'UPDATE') then
      raise exception 'Effective UPDATE privilege remains on public.communities for role %', v_role;
    end if;
    for v_column in
      select a.attname
      from pg_attribute a
      where a.attrelid = 'public.communities'::regclass
        and a.attnum > 0
        and not a.attisdropped
    loop
      if has_column_privilege(v_role, 'public.communities', v_column.attname, 'UPDATE') then
        raise exception 'Effective UPDATE privilege remains on public.communities.%.', v_column.attname;
      end if;
    end loop;
  end loop;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'communities'
      and policyname = 'campusconnect_communities_settings_update_guard'
      and permissive = 'RESTRICTIVE'
      and cmd = 'UPDATE'
      and roles = array['authenticated'::name]
      and qual ilike '%account_can_post%'
      and qual ilike '%internal_current_community_owner%'
      and qual not ilike '%internal_current_community_manager%'
      and qual not ilike '%communities.manage%'
      and with_check ilike '%account_can_post%'
      and with_check ilike '%internal_current_community_owner%'
      and with_check not ilike '%internal_current_community_manager%'
      and with_check not ilike '%communities.manage%'
  ) then
    raise exception 'The restrictive community settings UPDATE guard is missing or incomplete';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'communities'
      and permissive = 'PERMISSIVE'
      and cmd in ('UPDATE', 'ALL')
      and roles && array['anon'::name, 'public'::name]
  ) then
    raise exception 'A permissive communities UPDATE policy grants access to anon or PUBLIC';
  end if;

  if has_function_privilege('authenticated', 'public.community_update(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.community_update(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.community_manage_update(uuid,text,text,text,uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.community_manage_update(uuid,text,text,text,uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.community_set_archived(uuid,boolean)', 'execute')
     or has_function_privilege('anon', 'public.community_set_archived(uuid,boolean)', 'execute') then
    raise exception 'Community settings RPC privileges are incomplete';
  end if;

  if not exists (
    select 1 from pg_proc
    where oid = 'public.community_manage_update(uuid,text,text,text,uuid,text)'::regprocedure
      and prosecdef
      and lower(prosrc) like '%auth.uid%'
      and lower(prosrc) like '%account_can_post%'
      and lower(prosrc) like '%community_members%'
      and lower(prosrc) like '%m.user_id = v_uid%'
      and lower(prosrc) like '%status = ''active''%'
      and lower(prosrc) like '%m.role%'
      and lower(prosrc) like '%owner%'
      and lower(prosrc) not like '%moderator%'
      and lower(prosrc) not like '%has_permission%'
      and lower(prosrc) like '%for update%'
  ) then
    raise exception 'The SECURITY DEFINER settings RPC does not independently enforce owner-only caller authorization';
  end if;

  if not exists (
    select 1 from pg_proc
    where oid = 'campusconnect_private.internal_current_community_owner(uuid)'::regprocedure
      and prosecdef
      and lower(prosrc) like '%auth.uid%'
      and lower(prosrc) like '%account_can_post%'
      and lower(prosrc) like '%community_members%'
      and lower(prosrc) like '%status = ''active''%'
      and lower(prosrc) like '%role = ''owner''%'
      and lower(prosrc) not like '%moderator%'
  ) or not has_function_privilege(
    'authenticated', 'campusconnect_private.internal_current_community_owner(uuid)', 'execute'
  ) or has_function_privilege(
    'anon', 'campusconnect_private.internal_current_community_owner(uuid)', 'execute'
  ) then
    raise exception 'The owner-only community helper is missing or has unsafe execution privileges';
  end if;

  if not exists (
    select 1 from pg_proc
    where oid = 'public.community_set_archived(uuid,boolean)'::regprocedure
      and prosecdef
      and lower(prosrc) like '%auth.uid%'
      and lower(prosrc) like '%account_can_post%'
      and lower(prosrc) like '%community_members%'
      and lower(prosrc) like '%status = ''active''%'
      and lower(prosrc) like '%owner%'
      and lower(prosrc) like '%for update%'
  ) or not exists (
    select 1 from pg_proc
    where oid = 'public.admin_set_community_state(uuid,text,text)'::regprocedure
      and prosecdef
      and lower(prosrc) like '%auth.uid%'
      and lower(prosrc) like '%has_permission%'
      and lower(prosrc) like '%communities.manage%'
  ) or not exists (
    select 1 from pg_proc
    where oid = 'public.community_members_count_trg()'::regprocedure
      and prosecdef
      and lower(prosrc) like '%member_count%'
      and lower(prosrc) like '%count(*)%'
  ) then
    raise exception 'A SECURITY DEFINER community writer is missing its reviewed authorization or trigger-only behavior';
  end if;

  if has_function_privilege('authenticated', 'public.community_members_count_trg()', 'execute')
     or has_function_privilege('anon', 'public.community_members_count_trg()', 'execute')
     or exists (
       select 1 from pg_proc
       where prosecdef
         and lower(prosrc) ~ 'update[[:space:]]+(only[[:space:]]+)?(public[.])?communities([[:space:]]|$)'
         and proname not in (
           'community_manage_update', 'community_update', 'community_set_archived',
           'admin_set_community_state', 'community_members_count_trg'
         )
     ) then
    raise exception 'An unreviewed SECURITY DEFINER community UPDATE path exists';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'campusconnect_community_cover_insert_guard'
      and permissive = 'RESTRICTIVE'
      and roles = array['authenticated'::name]
      and cmd = 'INSERT'
      and with_check ilike '%account_can_post%'
      and with_check ilike '%foldername%'
      and with_check ilike '%c.id%'
      and with_check ilike '%c.status%'
      and with_check ilike '%internal_current_community_owner%'
      and with_check not ilike '%internal_current_community_manager%'
      and with_check not ilike '%communities.manage%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'campusconnect_community_cover_update_guard'
      and permissive = 'RESTRICTIVE'
      and roles = array['authenticated'::name]
      and cmd = 'UPDATE'
      and qual ilike '%account_can_post%'
      and qual ilike '%foldername%'
      and qual ilike '%c.id%'
      and qual ilike '%c.status%'
      and qual ilike '%internal_current_community_owner%'
      and qual not ilike '%internal_current_community_manager%'
      and qual not ilike '%communities.manage%'
      and with_check ilike '%account_can_post%'
      and with_check ilike '%foldername%'
      and with_check ilike '%c.id%'
      and with_check ilike '%c.status%'
      and with_check ilike '%internal_current_community_owner%'
      and with_check not ilike '%internal_current_community_manager%'
      and with_check not ilike '%communities.manage%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'campusconnect_community_cover_delete_guard'
      and permissive = 'RESTRICTIVE'
      and roles = array['authenticated'::name]
      and cmd = 'DELETE'
      and qual ilike '%account_can_post%'
      and qual ilike '%foldername%'
      and qual ilike '%c.id%'
      and qual ilike '%c.status%'
      and qual ilike '%internal_current_community_owner%'
      and qual not ilike '%internal_current_community_manager%'
      and qual not ilike '%communities.manage%'
  ) then
    raise exception 'Community cover write policies are missing caller-bound authorization';
  end if;
end;
$settings_authorization_postflight$;

commit;
