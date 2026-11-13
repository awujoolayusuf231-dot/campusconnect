-- ============================================================================
-- FIX W4: editing a community post requires the same standing as creating one.
-- STATUS: PREPARED FOR REVIEW. NOT APPLIED anywhere. NOT executed. Replaces an EXISTING security policy (posts_update_own); the original text is
-- restored by the rollback. Independent of A, B, C and the other fixes.
--
-- THE DEFECT: posts_update_own checked only "author, status visible, account_can_post()". A banned or removed community member, and a member of
-- an archived or disabled community, could still EDIT their own existing visible community posts (the insert policy requires an active membership
-- and an active community; the update policy did not). A banned member could rewrite an old post.
--
-- THE CHANGE: the WITH CHECK clause (the state of the row after the edit) additionally requires, for community posts only
-- (community_id is not null): the community status is 'active' AND the author has an 'active' membership. Ordinary (non-community) posts are
-- unaffected. USING is unchanged. Clients still cannot change community_id (they only hold UPDATE on the body column). Moderation is unaffected:
-- hide / restore go through definer functions, and delete_own_post stays available to everyone.
-- Behaviour change: a refused edit raises "new row violates row-level security policy" (or updates 0 rows where the post is not visible to the author).
-- The communities feature flag is deliberately NOT part of the edit rule (it is part of the insert rule).
-- Rollback: supabase/rollbacks/20261102130000_fix_w4_community_post_edit_rules_down.sql
-- ============================================================================
do $$
declare v_check text;
begin
  select p.with_check into v_check from pg_policies p where p.schemaname = 'public' and p.tablename = 'posts' and p.policyname = 'posts_update_own';
  if not found then raise exception 'W4 refused: policy posts_update_own does not exist'; end if;
  if v_check ~* 'community_members' then raise exception 'W4 is already applied (the policy already checks community_members)'; end if;
  if v_check !~* 'account_can_post' then raise exception 'W4 refused: posts_update_own is not the expected original policy: %', v_check; end if;
end $$;

drop policy posts_update_own on public.posts;
create policy posts_update_own on public.posts for update to authenticated
  using (author_id = (select auth.uid()) and status = 'visible')
  with check (
    author_id = (select auth.uid()) and status = 'visible' and (select public.account_can_post())
    and (
      community_id is null
      or (
        exists (select 1 from public.communities c where c.id = posts.community_id and c.status = 'active')
        and exists (select 1 from public.community_members m
                     where m.community_id = posts.community_id and m.user_id = (select auth.uid()) and m.status = 'active')
      )
    )
  );
