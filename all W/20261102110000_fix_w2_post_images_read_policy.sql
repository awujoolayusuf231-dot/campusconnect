-- ============================================================================
-- FIX W2: who may read (and LIST) objects in the post-images storage bucket.
-- STATUS: PREPARED FOR REVIEW. NOT APPLIED anywhere. NOT executed. Replaces an EXISTING security policy (post_images_select); the original
-- text is restored by the rollback. Independent of A, B, C and of the other fixes.
--
-- THE DEFECT: the current policy is  using (bucket_id = 'post-images')  : ANY signed-in user may read and LIST every object. Object names are
-- <author uid>/<random uuid>.<ext>. The random part is unguessable, but listing a folder returns the names, and an author's uid is visible wherever
-- their profile is visible (and, until fix W3, even for private users through community member rows). So images belonging to private-account,
-- hidden, deleted and orphaned posts could be enumerated, signed and fetched.
--
-- THE CHANGE: a signed-in user may SELECT an object in post-images only if
--   a post_media row references that exact path AND that row is visible to them. The subquery on post_media runs under the caller's own
--       row level security: post_media_select -> posts_select -> profiles_select, so private / institution-only / hidden / deleted / blocked
--       authors' images are excluded by the same rules that protect the posts themselves. Authorized moderators retain access through posts RLS.
-- Upload INSERT remains allowed in the owner's folder. Until attachment, the uploaded object is not readable by clients.
-- The bucket is made private below because Storage's public-bucket delivery bypasses object SELECT policies.
-- UPDATE / DELETE policies, the avatars bucket and the service role are not touched.
-- INDEX: public.post_media_storage_path_idx on post_media(storage_path) keeps rule (2) fast; it did not exist (post_media had only its primary key
-- and unique(post_id, position)). It is created here and dropped by the rollback; the migration refuses if an object of that name already exists.
-- NOT SOLVED HERE: files of deleted posts and deleted accounts are never removed from storage (needs a cleanup job); signed URLs already issued
-- stay valid until they expire (the app uses 3600 seconds).
-- Rollback: supabase/rollbacks/20261102110000_fix_w2_post_images_read_policy_down.sql
-- ============================================================================
do $$
declare v_qual text;
begin
  select p.qual into v_qual from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = 'post_images_select';
  if not found then raise exception 'W2 refused: policy post_images_select on storage.objects does not exist'; end if;
  if v_qual ~* 'post_media' then raise exception 'W2 is already applied (the policy already references post_media)'; end if;
  if v_qual !~* 'post-images' then raise exception 'W2 refused: post_images_select is not the expected original policy: %', v_qual; end if;
  if to_regclass('public.post_media_storage_path_idx') is not null then raise exception 'W2 refused: public.post_media_storage_path_idx already exists'; end if;
  if not exists (select 1 from storage.buckets where id = 'post-images') then
    raise exception 'W2 refused: post-images bucket does not exist';
  end if;
end $$;

create index post_media_storage_path_idx on public.post_media (storage_path);

drop policy post_images_select on storage.objects;
create policy post_images_select on storage.objects for select to authenticated using (
  bucket_id = 'post-images'
  and exists (
    select 1 from public.post_media pm
    where pm.storage_path = objects.name
  )
);

update storage.buckets set public = false where id = 'post-images';
