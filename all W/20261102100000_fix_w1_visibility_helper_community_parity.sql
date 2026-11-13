-- ============================================================================
-- FIX W1: the shared visibility helper must apply the author's-profile rule to COMMUNITY posts too.
-- STATUS: PREPARED FOR REVIEW. NOT APPLIED anywhere. NOT executed (no PostgreSQL was available where this was written).
-- Requires migration A (it replaces A's public.internal_post_visible_to). Migrations A, B and C are NOT edited.
--
-- This corrected helper requires profile visibility for every post and active membership in an active community.
--
-- The same signature and SECURITY DEFINER boundary are retained for existing callers.
-- Rollback: supabase/rollbacks/20261102100000_fix_w1_visibility_helper_community_parity_down.sql
-- ============================================================================
do $$
begin
  if to_regprocedure('public.internal_post_visible_to(uuid,uuid)') is null then
    raise exception 'W1 requires migration A: public.internal_post_visible_to(uuid,uuid) does not exist';
  end if;
end $$;

create or replace function public.internal_post_visible_to(p_post uuid, p_viewer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (
      p.status = 'visible'
      and coalesce(public.effective_status_internal(p.author_id) in ('active', 'restricted'), false)
      and not exists (select 1 from public.blocks b where b.blocker_id = p_viewer and b.blocked_id = p.author_id)
      and public.internal_profile_visible(p.author_id, p_viewer)
      and (
        p.community_id is null
        or exists (
          select 1
          from public.communities c
          join public.community_members m on m.community_id = c.id
          where c.id = p.community_id
            and c.status = 'active'
            and m.user_id = p_viewer
            and m.status = 'active'
        )
      )
    )
    from public.posts p where p.id = p_post
  ), false)
$$;

-- re-assert (idempotent): still not callable by any client role
revoke execute on function public.internal_post_visible_to(uuid, uuid) from public, anon, authenticated;
