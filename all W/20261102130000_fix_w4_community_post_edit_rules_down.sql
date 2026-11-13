-- ROLLBACK for 20261102130000_fix_w4_community_post_edit_rules.sql. NEVER AUTO-RUN.
-- Restores the ORIGINAL policy. WARNING: this re-opens defect W4 (banned or removed members, and members of archived/disabled communities, can
-- edit their own existing community posts). Refuses unless the current policy is the W4 policy.
-- Run with: psql -v ON_ERROR_STOP=1 -f <this file>
begin;
do $$
declare v_check text;
begin
  select p.with_check into v_check from pg_policies p where p.schemaname = 'public' and p.tablename = 'posts' and p.policyname = 'posts_update_own';
  if not found then raise exception 'ROLLBACK REFUSED: policy posts_update_own does not exist'; end if;
  if v_check !~* 'community_members' then raise exception 'ROLLBACK REFUSED: the policy is not the W4 policy (it does not check community_members): %', v_check; end if;
end $$;

drop policy posts_update_own on public.posts;
create policy posts_update_own on public.posts for update to authenticated
  using (author_id = (select auth.uid()) and status = 'visible')
  with check (author_id = (select auth.uid()) and status = 'visible' and (select public.account_can_post()));
commit;
