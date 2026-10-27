-- CampusConnect 0002: storage buckets and policies (NOT YET APPLIED - see docs/STATUS.md)
-- Path convention: <user_id>/<random-uuid>.<ext>. First folder MUST equal auth.uid().
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',     'avatars',     true,  2097152, array['image/jpeg','image/png','image/webp']),
  ('post-images', 'post-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- avatars (public bucket: object URLs work without a SELECT policy; listing is own-folder only)
create policy avatars_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.account_effective_status((select auth.uid())) in ('active','restricted'));
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own_or_mod on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.has_permission('content.moderate'))));

-- post-images (private bucket: signed URLs; readable by signed-in users until post-level rules exist)
create policy post_images_select on storage.objects for select to authenticated
  using (bucket_id = 'post-images');
create policy post_images_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.account_effective_status((select auth.uid())) = 'active');
create policy post_images_update_own on storage.objects for update to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy post_images_delete_own_or_mod on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and ((storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.has_permission('content.moderate'))));
