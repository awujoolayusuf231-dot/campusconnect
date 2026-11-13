-- ROLLBACK for 20261102120000_fix_w3_community_members_visibility.sql. NEVER AUTO-RUN.
-- Removes the restrictive guard. WARNING: this re-opens any broad member visibility allowed by existing permissive policies. Refuses unless
-- the current policy is the W3 guard and the original community_members_select policy remains in place.
-- Run with: psql -v ON_ERROR_STOP=1 -f <this file>
begin;
do $$
declare v_qual text;
begin
  select p.qual into v_qual from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'community_members'
    and p.policyname = 'community_members_visibility_guard';
  if not found then raise exception 'ROLLBACK REFUSED: W3 visibility guard does not exist'; end if;
  if v_qual !~* 'profiles' then raise exception 'ROLLBACK REFUSED: the visibility guard is not the W3 policy: %', v_qual; end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_members'
      and policyname = 'community_members_select'
  ) then raise exception 'ROLLBACK REFUSED: original community_members_select policy is missing'; end if;
end $$;

drop policy community_members_visibility_guard on public.community_members;
commit;
