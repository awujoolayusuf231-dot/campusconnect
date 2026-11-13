-- ROLLBACK for 20261102110000_fix_w2_post_images_read_policy.sql. NEVER AUTO-RUN.
-- Restores the ORIGINAL policy and drops the index this migration created. WARNING: this re-opens defect W2 (any signed-in user can list and read
-- every post image). The bucket intentionally stays private; this rollback does not restore public delivery. It refuses unless the current policy
-- is the W2 policy and the index exists, so it cannot clobber a later change.
-- Run with: psql -v ON_ERROR_STOP=1 -f <this file>
begin;
do $$
declare v_qual text;
begin
  select p.qual into v_qual from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = 'post_images_select';
  if not found then raise exception 'ROLLBACK REFUSED: policy post_images_select does not exist'; end if;
  if v_qual !~* 'post_media' then raise exception 'ROLLBACK REFUSED: the policy is not the W2 policy (it does not reference post_media): %', v_qual; end if;
  if to_regclass('public.post_media_storage_path_idx') is null then raise exception 'ROLLBACK REFUSED: public.post_media_storage_path_idx does not exist'; end if;
end $$;

drop policy post_images_select on storage.objects;
create policy post_images_select on storage.objects for select to authenticated
  using (bucket_id = 'post-images');
drop index public.post_media_storage_path_idx;
commit;
