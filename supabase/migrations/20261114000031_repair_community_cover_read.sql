-- Restore private community-cover reads required for signed URL creation.
-- Only the current cover of a non-disabled community is readable.
begin;

do $preflight$
begin
  if to_regclass('public.communities') is null
     or to_regclass('storage.objects') is null
     or to_regclass('storage.buckets') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'communities'
         and column_name = 'cover_path'
     ) then
    raise exception 'Community cover read repair requires migration 20261111000016_community_management.sql';
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

drop policy if exists community_covers_select_visible on storage.objects;
create policy community_covers_select_visible on storage.objects
  as permissive for select to authenticated
  using (
    bucket_id = 'community-covers'
    and name ~ ('^' || (storage.foldername(objects.name))[1] || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$')
    and exists (
      select 1 from public.communities c
      where c.id::text = (storage.foldername(objects.name))[1]
        and c.cover_path = objects.name
        and c.status <> 'disabled'
    )
  );

drop policy if exists campusconnect_community_cover_read_guard on storage.objects;
create policy campusconnect_community_cover_read_guard on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id <> 'community-covers'
    or (
      (select auth.uid()) is not null
      and exists (
        select 1 from public.communities c
        where c.id::text = (storage.foldername(objects.name))[1]
          and c.cover_path = objects.name
          and c.status <> 'disabled'
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
      and policyname = 'community_covers_select_visible'
      and permissive = 'PERMISSIVE'
      and roles = array['authenticated'::name]
      and cmd = 'SELECT'
      and qual ilike '%cover_path%'
      and qual ilike '%foldername%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'campusconnect_community_cover_read_guard'
      and permissive = 'RESTRICTIVE'
      and roles = array['authenticated'::name]
      and cmd = 'SELECT'
      and qual ilike '%cover_path%'
      and qual ilike '%foldername%'
      and qual ilike '%status%'
  ) then
    raise exception 'Community cover SELECT policies were not repaired';
  end if;
end
$postflight$;

commit;
