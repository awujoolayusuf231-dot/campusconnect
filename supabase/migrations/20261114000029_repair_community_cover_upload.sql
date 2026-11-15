-- Repair community cover INSERT policies after community-management migrations.
-- Safe to reapply; cover writes remain private and active-owner-only.
begin;

do $preflight$
begin
  if to_regclass('public.communities') is null
     or to_regclass('public.community_members') is null
     or to_regclass('storage.objects') is null
     or to_regclass('storage.buckets') is null
     or to_regprocedure('public.account_can_post()') is null
     or to_regprocedure('campusconnect_private.internal_current_community_owner(uuid)') is null then
    raise exception 'Community cover repair requires migrations 20261016000007, 20261018000008, 20261022000009, 20261111000016, 20261111145500, 20261112000017, and 20261112000018';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) then
    raise exception 'Storage object row-level security must remain enabled';
  end if;
end
$preflight$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-covers', 'community-covers', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

grant execute on function public.account_can_post() to authenticated;
grant execute on function campusconnect_private.internal_current_community_owner(uuid) to authenticated;

drop policy if exists community_covers_insert_manager on storage.objects;
create policy community_covers_insert_manager on storage.objects
  as permissive for insert to authenticated
  with check (
    bucket_id = 'community-covers'
    and name ~ ('^' || (storage.foldername(objects.name))[1] || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$')
    and public.account_can_post()
    and exists (
      select 1 from public.communities c
      where c.id::text = (storage.foldername(objects.name))[1]
        and c.status <> 'disabled'
        and campusconnect_private.internal_current_community_owner(c.id)
    )
  );

drop policy if exists campusconnect_community_cover_insert_guard on storage.objects;
create policy campusconnect_community_cover_insert_guard on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'community-covers'
    or (
      (select auth.uid()) is not null
      and public.account_can_post()
      and name ~ ('^' || (storage.foldername(objects.name))[1] || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$')
      and exists (
        select 1 from public.communities c
        where c.id::text = (storage.foldername(objects.name))[1]
          and c.status <> 'disabled'
          and campusconnect_private.internal_current_community_owner(c.id)
      )
    )
  );

do $postflight$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'community-covers' and public = false
      and file_size_limit = 2097152
      and allowed_mime_types @> array['image/jpeg','image/png','image/webp']
  ) then
    raise exception 'Community cover bucket configuration is incomplete';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'community_covers_insert_manager'
      and permissive = 'PERMISSIVE'
      and roles = array['authenticated'::name]
      and cmd = 'INSERT'
      and with_check ilike '%account_can_post%'
      and with_check ilike '%internal_current_community_owner%'
      and with_check ilike '%foldername%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'campusconnect_community_cover_insert_guard'
      and permissive = 'RESTRICTIVE'
      and roles = array['authenticated'::name]
      and cmd = 'INSERT'
      and with_check ilike '%account_can_post%'
      and with_check ilike '%internal_current_community_owner%'
      and with_check ilike '%foldername%'
  ) then
    raise exception 'Community cover INSERT policies were not repaired';
  end if;
  if has_function_privilege('anon', 'campusconnect_private.internal_current_community_owner(uuid)', 'execute') then
    raise exception 'Anonymous execution of the community owner helper must remain disabled';
  end if;
end
$postflight$;

commit;
