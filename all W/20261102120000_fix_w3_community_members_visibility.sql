-- ============================================================================
-- FIX W3: community member rows must not reveal private / institution-only users.
-- STATUS: PREPARED FOR REVIEW. NOT APPLIED anywhere. NOT executed. Adds a restrictive guard alongside the existing
-- community_members_select policy, so any other permissive policy cannot widen member visibility.
--
-- THE DEFECT: the current policy shows every ACTIVE membership row (including the bare user_id) of every community to any signed-in user. So the
-- uid of a private-profile user who joined a community was visible, which defeats hiding their profile, and (see W2) made their storage folder
-- enumerable.
--
-- THE CHANGE: a signed-in user may SELECT a community_members row if
--   (1) it is their own row (any status), or
--   (2) they hold communities.manage (staff), or
--   (3) the viewer is an ACTIVE member of that same ACTIVE community, the target row is ACTIVE, AND either
--         (a) the member's profile row is visible to them (this subquery runs under the caller's own RLS: profiles_select, which enforces
--             public / same-institution / owner / staff and the account being listed), or
--         (b) they are the owner or a moderator of THAT community (they need to see and manage their own members; they learn only that the person
--             is a member of their community, never the profile).
-- Banned rows stay visible only to the banned user, community managers, and staff. Unchanged on purpose: every definer function (join_community,
-- leave_community, community_set_member, my_community_role, ...) reads the table directly and is unaffected; posts_insert checks the caller's OWN
-- membership row, which rule (1) keeps visible; communities.member_count still counts every active member, so a private member makes the count
-- larger than the list an ordinary viewer sees (by design: counts reveal nothing identifying).
-- UI effect: the member list (frontend: select ... profile:profiles(...) from community_members) will no longer contain private-profile members for
-- ordinary viewers; today those appear as rows with an empty profile.
-- Rollback: supabase/rollbacks/20261102120000_fix_w3_community_members_visibility_down.sql
-- ============================================================================
do $$
declare v_qual text;
begin
  select p.qual into v_qual from pg_policies p where p.schemaname = 'public' and p.tablename = 'community_members' and p.policyname = 'community_members_select';
  if not found then raise exception 'W3 refused: policy community_members_select does not exist'; end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_members'
      and policyname = 'community_members_visibility_guard'
  ) then raise exception 'W3 is already applied'; end if;
  if v_qual !~* 'communities' then raise exception 'W3 refused: community_members_select is not the expected original policy: %', v_qual; end if;
end $$;

create policy community_members_visibility_guard on public.community_members
as restrictive for select to authenticated using (
  user_id = (select auth.uid())
  or (select public.has_permission('communities.manage'))
  or (
    (select public.account_is_listed((select auth.uid())))
    and (select public.my_community_role(community_members.community_id)) in ('owner', 'moderator')
  )
  or (
    status = 'active'
    and (select public.account_is_listed((select auth.uid())))
    and exists (
      select 1 from public.communities c
      where c.id = community_members.community_id
        and c.status = 'active'
        and (select public.my_community_role(c.id)) is not null
    )
    and (
      exists (select 1 from public.profiles pr where pr.id = community_members.user_id)
      or (select public.my_community_role(community_members.community_id)) in ('owner', 'moderator')
    )
  )
);
