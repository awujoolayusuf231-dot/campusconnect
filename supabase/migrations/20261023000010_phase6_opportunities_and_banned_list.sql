-- 0010 Phase 6a: opportunities (+ admin), community banned list, FK indexes, report type 'opportunity'.
-- APPLIED to CampusConnect01 as "phase6_opportunities_and_banned_list"; tested: supabase/tests/phase6_opportunities.sql (93 checks, all PASS).
create index notifications_actor_idx on public.notifications (actor_id) where actor_id is not null;
create index communities_institution_idx on public.communities (institution_id) where institution_id is not null;
create index reports_resolved_by_idx on public.reports (resolved_by) where resolved_by is not null;

create function public.community_banned_list(p_comm uuid)
returns table (user_id uuid, username text, display_name text, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if coalesce((select public.my_community_role(p_comm)), '') not in ('owner', 'moderator') then
    raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select m.user_id, p.username, p.display_name, m.joined_at
    from public.community_members m join public.profiles p on p.id = m.user_id
    where m.community_id = p_comm and m.status = 'banned' order by m.joined_at desc limit 200;
end $$;

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 5 and 150),
  organization text check (organization is null or char_length(organization) <= 100),
  summary text not null check (char_length(btrim(summary)) between 10 and 300),
  description text check (description is null or char_length(description) <= 4000),
  category text not null check (category in ('internship','scholarship','training','competition','career','program')),
  external_url text check (external_url is null or (char_length(external_url) <= 500
    and external_url ~* '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?(/[^[:space:]<>"]*)?$')),
  deadline date,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  featured boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  save_count int not null default 0,
  click_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not featured or status = 'published')
);
create index opportunities_list_idx on public.opportunities (status, featured desc, deadline, created_at desc);
create index opportunities_category_idx on public.opportunities (category) where status = 'published';
create index opportunities_creator_idx on public.opportunities (created_by) where created_by is not null;
create trigger opportunities_updated_at before update on public.opportunities for each row execute function public.set_updated_at();

create table public.opportunity_saves (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);
create index opportunity_saves_opp_idx on public.opportunity_saves (opportunity_id);
create table public.opportunity_clicks (
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  first_clicked_at timestamptz not null default now(),
  primary key (opportunity_id, user_id)
);
create index opportunity_clicks_user_idx on public.opportunity_clicks (user_id);

create function public.opportunity_counters_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'opportunity_saves' then
    if tg_op = 'INSERT' then update public.opportunities set save_count = save_count + 1 where id = new.opportunity_id;
    else update public.opportunities set save_count = greatest(save_count - 1, 0) where id = old.opportunity_id; end if;
  else
    update public.opportunities set click_count = click_count + 1 where id = new.opportunity_id;
  end if;
  return null;
end $$;
create trigger opportunity_saves_count after insert or delete on public.opportunity_saves for each row execute function public.opportunity_counters_trg();
create trigger opportunity_clicks_count after insert on public.opportunity_clicks for each row execute function public.opportunity_counters_trg();

alter table public.opportunities enable row level security;
alter table public.opportunity_saves enable row level security;
alter table public.opportunity_clicks enable row level security;
grant select on public.opportunities to authenticated;
create policy opportunities_select on public.opportunities for select to authenticated using (
  (select public.has_permission('opportunities.manage'))
  or (status = 'published' and (deadline is null or deadline >= current_date) and public.feature_enabled('opportunities')));
grant select, delete on public.opportunity_saves to authenticated;
grant insert (opportunity_id) on public.opportunity_saves to authenticated;
create policy saves_select on public.opportunity_saves for select to authenticated using (user_id = (select auth.uid()));
create policy saves_delete on public.opportunity_saves for delete to authenticated using (user_id = (select auth.uid()));
create policy saves_insert on public.opportunity_saves for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.opportunities o where o.id = opportunity_saves.opportunity_id and o.status = 'published'));

create function public.record_opportunity_click(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not public.account_is_listed(v_uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.feature_enabled('opportunities') then raise exception 'feature_disabled' using errcode = '42501'; end if;
  if not exists (select 1 from public.opportunities where id = p_id and status = 'published' and (deadline is null or deadline >= current_date)) then
    raise exception 'not_found' using errcode = '22023'; end if;
  insert into public.opportunity_clicks (opportunity_id, user_id) values (p_id, v_uid) on conflict do nothing;
end $$;

create function public.list_opportunities(p_category text default null, p_q text default null, p_saved boolean default false, p_limit int default 20, p_offset int default 0)
returns table (id uuid, title text, organization text, summary text, category text, deadline date, featured boolean, save_count int, saved_by_me boolean, external_host text)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if v_q is not null then v_q := replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_'); end if;
  return query
    select o.id, o.title, o.organization, o.summary, o.category, o.deadline, o.featured, o.save_count,
      exists (select 1 from public.opportunity_saves s where s.opportunity_id = o.id and s.user_id = (select auth.uid())),
      substring(o.external_url from '^https://([^/:]+)')
    from public.opportunities o
    where o.status = 'published' and (o.deadline is null or o.deadline >= current_date)
      and (p_category is null or o.category = p_category)
      and (v_q is null or o.title ilike '%' || v_q || '%' or o.organization ilike '%' || v_q || '%')
      and (not coalesce(p_saved, false) or exists (select 1 from public.opportunity_saves s where s.opportunity_id = o.id and s.user_id = (select auth.uid())))
    order by o.featured desc, coalesce(o.deadline, date '9999-12-31') asc, o.created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create function public.admin_save_opportunity(p_id uuid, p_title text, p_org text, p_summary text, p_desc text, p_category text, p_url text, p_deadline date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid := p_id;
begin
  if v_actor is null or not public.has_permission('opportunities.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.opportunities (title, organization, summary, description, category, external_url, deadline, created_by)
    values (btrim(p_title), nullif(btrim(coalesce(p_org, '')), ''), btrim(p_summary), nullif(btrim(coalesce(p_desc, '')), ''), p_category, nullif(btrim(coalesce(p_url, '')), ''), p_deadline, v_actor)
    returning id into v_id;
  else
    update public.opportunities set title = btrim(p_title), organization = nullif(btrim(coalesce(p_org, '')), ''), summary = btrim(p_summary),
      description = nullif(btrim(coalesce(p_desc, '')), ''), category = p_category, external_url = nullif(btrim(coalesce(p_url, '')), ''), deadline = p_deadline
    where id = p_id;
    if not found then raise exception 'not_found' using errcode = '22023'; end if;
  end if;
  perform public.log_admin_action(v_actor, case when p_id is null then 'opportunity.create' else 'opportunity.update' end, 'opportunity', v_id::text, null, '{}'::jsonb);
  return v_id;
end $$;

create function public.admin_set_opportunity_state(p_id uuid, p_status text, p_featured boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_o public.opportunities;
begin
  if v_actor is null or not public.has_permission('opportunities.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('draft','published','archived') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into v_o from public.opportunities where id = p_id for update;
  if v_o.id is null then raise exception 'not_found' using errcode = '22023'; end if;
  if p_status = 'published' and v_o.deadline is not null and v_o.deadline < current_date then raise exception 'deadline_passed' using errcode = '22023'; end if;
  if coalesce(p_featured, false) and p_status <> 'published' then raise exception 'only_published_can_be_featured' using errcode = '22023'; end if;
  if coalesce(p_featured, false) and not v_o.featured and (select count(*) from public.opportunities where featured) >= 5 then
    raise exception 'too_many_featured' using errcode = '22023'; end if;
  update public.opportunities set status = p_status, featured = case when p_status = 'published' then coalesce(p_featured, false) else false end,
    published_at = case when p_status = 'published' and published_at is null then now() else published_at end where id = p_id;
  perform public.log_admin_action(v_actor, 'opportunity.state', 'opportunity', p_id::text, btrim(p_reason),
    jsonb_build_object('old_status', v_o.status, 'new_status', p_status, 'featured', coalesce(p_featured, false)));
end $$;

create function public.admin_archive_expired_opportunities() returns int
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_n int;
begin
  if v_actor is null or not public.has_permission('opportunities.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.opportunities set status = 'archived', featured = false where status = 'published' and deadline is not null and deadline < current_date;
  get diagnostics v_n = row_count;
  perform public.log_admin_action(v_actor, 'opportunity.archive_expired', 'opportunity', null, null, jsonb_build_object('count', v_n));
  return v_n;
end $$;

create function public.admin_opportunity_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('opportunities.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'published', (select count(*) from public.opportunities where status = 'published'),
    'drafts', (select count(*) from public.opportunities where status = 'draft'),
    'archived', (select count(*) from public.opportunities where status = 'archived'),
    'featured', (select count(*) from public.opportunities where featured),
    'expired_not_archived', (select count(*) from public.opportunities where status = 'published' and deadline < current_date),
    'expiring_7d', (select count(*) from public.opportunities where status = 'published' and deadline between current_date and current_date + 7),
    'total_saves', (select count(*) from public.opportunity_saves),
    'total_clicks', (select count(*) from public.opportunity_clicks));
end $$;

alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in ('user','post','comment','community','message','opportunity'));
create or replace function public.submit_report(p_type text, p_target uuid, p_category text, p_explanation text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_user uuid; v_snap text; v_id uuid; v_post uuid; v_found boolean := false;
begin
  if v_uid is null or not public.account_is_listed(v_uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select count(*) from public.reports where reporter_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if p_type = 'post' then
    select author_id, left(body, 500) into v_user, v_snap from public.posts where id = p_target and status = 'visible';
    v_found := v_user is not null and public.internal_profile_visible(v_user, v_uid);
  elsif p_type = 'comment' then
    select c.author_id, left(c.body, 500), c.post_id into v_user, v_snap, v_post from public.comments c where c.id = p_target and c.status = 'visible';
    v_found := v_user is not null and public.internal_profile_visible(v_user, v_uid) and exists (select 1 from public.posts where id = v_post and status = 'visible');
  elsif p_type = 'user' then
    select p.id, left(p.display_name || ' @' || p.username || ': ' || coalesce(p.bio, ''), 500) into v_user, v_snap from public.profiles p where p.id = p_target;
    v_found := v_user is not null and public.internal_profile_visible(v_user, v_uid);
  elsif p_type = 'community' then
    select created_by, left(name || ': ' || coalesce(description, ''), 500) into v_user, v_snap from public.communities where id = p_target and status in ('active','archived');
    v_found := v_snap is not null;
  elsif p_type = 'message' then
    select m.sender_id, left(m.body, 500) into v_user, v_snap from public.messages m
    where m.id = p_target and m.status = 'visible' and m.sender_id <> v_uid
      and exists (select 1 from public.conversation_members cm where cm.conversation_id = m.conversation_id and cm.user_id = v_uid);
    v_found := v_user is not null;
  elsif p_type = 'opportunity' then
    select left(title || ' (' || coalesce(organization, 'unknown organisation') || '): ' || summary, 500) into v_snap
      from public.opportunities where id = p_target and status = 'published' and (deadline is null or deadline >= current_date);
    v_found := v_snap is not null;
  else raise exception 'invalid_type' using errcode = '22023'; end if;
  if not v_found then raise exception 'not_found' using errcode = '22023'; end if;
  if v_user = v_uid then raise exception 'cannot_report_self' using errcode = '22023'; end if;
  insert into public.reports (reporter_id, target_type, target_id, reported_user_id, category, explanation, content_snapshot)
  values (v_uid, p_type, p_target, v_user, p_category, nullif(btrim(coalesce(p_explanation, '')), ''), v_snap)
  on conflict (reporter_id, target_type, target_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.reports where reporter_id = v_uid and target_type = p_type and target_id = p_target;
  end if;
  return v_id;
end $$;

revoke execute on function public.community_banned_list(uuid), public.opportunity_counters_trg(), public.record_opportunity_click(uuid),
  public.list_opportunities(text, text, boolean, int, int), public.admin_save_opportunity(uuid, text, text, text, text, text, text, date),
  public.admin_set_opportunity_state(uuid, text, boolean, text), public.admin_archive_expired_opportunities(), public.admin_opportunity_stats(),
  public.submit_report(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.community_banned_list(uuid), public.record_opportunity_click(uuid),
  public.list_opportunities(text, text, boolean, int, int), public.admin_save_opportunity(uuid, text, text, text, text, text, text, date),
  public.admin_set_opportunity_state(uuid, text, boolean, text), public.admin_archive_expired_opportunities(), public.admin_opportunity_stats(),
  public.submit_report(text, uuid, text, text) to authenticated;
