insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-covers', 'profile-covers', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy profile_covers_select_visible_profile on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-covers'
    and exists (
      select 1 from public.profiles p
      where p.id::text = (storage.foldername(name))[1]
        and p.cover_path = name
    )
  );

create policy profile_covers_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name like (select auth.uid())::text || '/private-cover-%'
    and public.account_effective_status((select auth.uid())) in ('active','restricted')
  );

create policy profile_covers_update_own on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name like (select auth.uid())::text || '/private-cover-%'
  );

create policy profile_covers_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
