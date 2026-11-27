-- Preserve the existing announcement fan-out while including complete copy
-- in each deduplicated notification for in-app and push presentation.
begin;

update public.notifications n
set data = coalesce(n.data, '{}'::jsonb) || jsonb_build_object('title', a.title, 'body', a.body)
from public.announcements a
where n.type = 'announcement'
  and n.entity_type = 'announcement'
  and n.entity_id = a.id;

create or replace function public.admin_publish_announcement(p_id uuid, p_confirm_count int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_a public.announcements;
  v_count int;
begin
  if v_actor is null or not public.has_permission('announcements.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_a from public.announcements where id = p_id for update;
  if v_a.id is null then raise exception 'not_found' using errcode = '22023'; end if;
  if v_a.status <> 'draft' then raise exception 'already_published' using errcode = '22023'; end if;
  if (select count(*) from public.admin_audit_logs
      where actor_id = v_actor and action = 'announcement.publish' and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  v_count := public.announcement_audience_count(v_a.audience, v_a.institution_id);
  if p_confirm_count is distinct from v_count then
    raise exception 'confirm_count_mismatch' using errcode = '22023';
  end if;

  insert into public.notifications (user_id, type, entity_type, entity_id, dedupe_key, data)
  select p.id, 'announcement', 'announcement', v_a.id, 'announcement:' || v_a.id,
    jsonb_build_object('title', v_a.title, 'body', v_a.body)
  from public.profiles p
  where public.effective_status_internal(p.id) in ('active', 'restricted')
    and (v_a.audience = 'all' or p.institution_id = v_a.institution_id)
  on conflict (user_id, dedupe_key) do nothing;

  update public.announcements
  set status = 'published', published_by = v_actor, published_at = now(), recipient_count = v_count
  where id = p_id;
  perform public.log_admin_action(
    v_actor,
    'announcement.publish',
    'announcement',
    p_id::text,
    null,
    jsonb_build_object('recipients', v_count, 'audience', v_a.audience)
  );
  return v_count;
end
$$;

commit;
