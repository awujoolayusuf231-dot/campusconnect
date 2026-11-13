-- ROLLBACK for 20261102100000_fix_w1_visibility_helper_community_parity.sql. NEVER AUTO-RUN.
-- Restores migration A's ORIGINAL helper text (byte for byte). WARNING: this re-opens defect W1 (community posts by private or institution-only
-- authors become countable by record_post_impressions). It refuses if the current function is not exactly the W1 text, so it can never overwrite a later change.
-- Run with: psql -v ON_ERROR_STOP=1 -f <this file>
begin;
do $$
declare v_md5 text;
begin
  select md5(replace(p.prosrc, E'\r', '')) into v_md5 from pg_proc p where p.oid = to_regprocedure('public.internal_post_visible_to(uuid,uuid)');
  if v_md5 is null then raise exception 'ROLLBACK REFUSED: public.internal_post_visible_to does not exist'; end if;
  if v_md5 <> '4d5b5995b06dbebe8d977690de098143' then raise exception 'ROLLBACK REFUSED: the helper is not the W1 text (source md5 %); it was changed after W1. Review before restoring.', v_md5; end if;
end $$;

create or replace function public.internal_post_visible_to(p_post uuid, p_viewer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (
      p.status = 'visible'
      and coalesce(public.effective_status_internal(p.author_id) in ('active', 'restricted'), false)
      and not exists (select 1 from public.blocks b where b.blocker_id = p_viewer and b.blocked_id = p.author_id)
      and (
        (p.community_id is null and public.internal_profile_visible(p.author_id, p_viewer))
        or (p.community_id is not null and exists (
              select 1 from public.communities c where c.id = p.community_id and c.status in ('active', 'archived')))
      )
    )
    from public.posts p where p.id = p_post
  ), false)
$$;

revoke execute on function public.internal_post_visible_to(uuid, uuid) from public, anon, authenticated;
commit;
