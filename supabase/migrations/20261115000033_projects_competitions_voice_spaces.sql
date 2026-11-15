-- Project Collaboration, Inter-University Competitions, and Voice Spaces.
-- Live audio is provided by LiveKit; room access remains authorized by Supabase.
begin;

do $preflight$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.institutions') is null
     or to_regclass('public.communities') is null
     or to_regclass('public.community_members') is null
     or to_regclass('public.blocks') is null
     or to_regclass('public.follows') is null
     or to_regclass('public.notifications') is null
     or to_regclass('public.feature_flags') is null
     or to_regclass('storage.buckets') is null
     or not exists(select 1 from pg_publication where pubname='supabase_realtime')
     or to_regprocedure('public.account_effective_status(uuid)') is null
     or to_regprocedure('public.feature_enabled(text)') is null
     or to_regprocedure('public.internal_blocked_either(uuid,uuid)') is null
     or to_regprocedure('public.internal_notify(uuid,text,uuid,text,uuid,text,jsonb)') is null
     or to_regprocedure('public.has_permission(text)') is null
     or to_regprocedure('public.set_updated_at()') is null then
    raise exception 'Projects, competitions, and voice spaces require the existing profile, community, notification, storage, and social security foundations';
  end if;
  if to_regclass('public.projects') is not null
     or to_regclass('public.competitions') is not null
     or to_regclass('public.voice_rooms') is not null then
    raise exception 'One or more collaboration feature tables already exist; inspect the schema before applying this migration';
  end if;
end
$preflight$;

insert into public.feature_flags(key,enabled,description) values
  ('project_collaboration',true,'Enable the Project Collaboration Board'),
  ('interuniversity_competitions',true,'Enable verified inter-university competitions'),
  ('voice_spaces',true,'Enable scheduled and live audio Voice Spaces')
on conflict (key) do nothing;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow','like','comment','community_join','message','announcement','moderation_warning',
    'repost','discussion_reply','celebration_reminder','project_invitation','project_application',
    'competition_update','voice_invitation'));

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  institution_id uuid references public.institutions(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 4 and 120),
  description text not null check (char_length(btrim(description)) between 20 and 5000),
  objectives text not null default '' check (char_length(objectives) <= 2000),
  category text not null check (category in ('academic','software','research','business','design','innovation','other')),
  collaboration_type text not null check (collaboration_type in ('academic','software','research','business','design','innovation','other')),
  required_skills text[] not null default '{}' check (cardinality(required_skills) <= 20),
  cover_path text,
  visibility text not null default 'public' check (visibility in ('public','institution','private')),
  max_collaborators smallint not null default 5 check (max_collaborators between 1 and 50),
  deadline date,
  application_deadline timestamptz,
  status text not null default 'recruiting' check (status in ('recruiting','in_progress','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cover_path is null or (cover_path !~ '\.\.' and char_length(cover_path) <= 500))
);
create index projects_discovery_idx on public.projects (status, created_at desc, id desc);
create index projects_institution_idx on public.projects (institution_id, created_at desc) where institution_id is not null;
create index projects_owner_idx on public.projects (owner_id, created_at desc);
create index projects_skills_idx on public.projects using gin (required_skills);
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_role text not null default 'Collaborator' check (char_length(btrim(project_role)) between 2 and 60),
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id, joined_at desc);

create table public.project_applications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  skills_pitch text not null check (char_length(btrim(skills_pitch)) between 10 and 1200),
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (project_id, applicant_id)
);
create index project_applications_owner_idx on public.project_applications (project_id, status, created_at desc);
create index project_applications_applicant_idx on public.project_applications (applicant_id, created_at desc);

create table public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked')),
  created_at timestamptz not null default now(),
  unique (project_id, invitee_id)
);
create index project_invitations_inbox_idx on public.project_invitations (invitee_id, status, created_at desc);

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  creator_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  assignee_id uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text not null default '' check (char_length(description) <= 1500),
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_tasks_project_idx on public.project_tasks (project_id, status, due_at);
create trigger project_tasks_updated_at before update on public.project_tasks for each row execute function public.set_updated_at();

create table public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index project_messages_history_idx on public.project_messages (project_id, created_at desc, id desc);

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  creator_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index project_milestones_project_idx on public.project_milestones (project_id, due_at);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  institution_id uuid references public.institutions(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 4 and 160),
  description text not null check (char_length(btrim(description)) between 20 and 6000),
  category text not null check (category in ('coding','hackathon','business','research','debate','quiz','design','science','writing','other')),
  rules text not null default '' check (char_length(rules) <= 5000),
  eligibility text not null default '' check (char_length(eligibility) <= 2000),
  participating_institutions uuid[] not null default '{}',
  participation_type text not null default 'individual' check (participation_type in ('individual','team','both')),
  max_team_size smallint not null default 1 check (max_team_size between 1 and 20),
  registration_opens_at timestamptz not null,
  registration_closes_at timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  submission_deadline timestamptz,
  prizes text not null default '' check (char_length(prizes) <= 2000),
  cover_path text,
  verification_status text not null default 'pending' check (verification_status in ('pending','approved','rejected')),
  status text not null default 'pending_review' check (status in ('pending_review','upcoming','registration_open','live','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (registration_opens_at < registration_closes_at),
  check (registration_closes_at <= ends_at),
  check (starts_at < ends_at),
  check (submission_deadline is null or submission_deadline <= ends_at),
  check (cardinality(participating_institutions) <= 100),
  check (cover_path is null or (cover_path !~ '\.\.' and char_length(cover_path) <= 500))
);
create index competitions_discovery_idx on public.competitions (status, starts_at, id);
create index competitions_organizer_idx on public.competitions (organizer_id, created_at desc);
create index competitions_institution_idx on public.competitions (institution_id, starts_at);
create trigger competitions_updated_at before update on public.competitions for each row execute function public.set_updated_at();

create table public.competition_registrations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  team_name text check (team_name is null or char_length(btrim(team_name)) between 2 and 100),
  status text not null default 'registered' check (status in ('registered','withdrawn')),
  created_at timestamptz not null default now(),
  unique (competition_id, user_id)
);
create index competition_registrations_comp_idx on public.competition_registrations (competition_id, created_at);
create index competition_registrations_user_idx on public.competition_registrations (user_id, created_at desc);

create table public.competition_submissions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  registration_id uuid not null references public.competition_registrations(id) on delete cascade,
  submitted_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text not null default '' check (char_length(description) <= 3000),
  asset_path text,
  submitted_at timestamptz not null default now(),
  score numeric(7,2) check (score is null or score between 0 and 100000),
  rank smallint check (rank is null or rank between 1 and 1000),
  judge_feedback text check (judge_feedback is null or char_length(judge_feedback) <= 2000),
  unique (competition_id, registration_id),
  check (asset_path is null or (asset_path !~ '\.\.' and char_length(asset_path) <= 500))
);
create index competition_submissions_comp_idx on public.competition_submissions (competition_id, submitted_at desc);

create table public.competition_announcements (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 3 and 2000),
  created_at timestamptz not null default now()
);
create index competition_announcements_idx on public.competition_announcements (competition_id, created_at desc);

create table public.competition_reports (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);
create index competition_reports_review_idx on public.competition_reports (status, created_at);

create table public.competition_team_members (
  registration_id uuid not null references public.competition_registrations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('captain','member')),
  status text not null default 'active' check (status in ('pending','active','declined','removed')),
  joined_at timestamptz not null default now(),
  primary key (registration_id,user_id)
);
create index competition_team_members_user_idx on public.competition_team_members (user_id,status);
create table public.competition_team_invitations (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.competition_registrations(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked')),
  created_at timestamptz not null default now(),
  unique(registration_id,invitee_id)
);
create index competition_team_invites_user_idx on public.competition_team_invitations (invitee_id,status,created_at desc);

create table public.voice_rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  community_id uuid references public.communities(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 4 and 120),
  description text not null default '' check (char_length(description) <= 1200),
  category text not null check (category in ('academic','technology','study','mentorship','community','general','other')),
  room_type text not null default 'personal' check (room_type in ('personal','community','group')),
  visibility text not null default 'public' check (visibility in ('public','followers','community','invite_only')),
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled')),
  scheduled_at timestamptz not null default now(),
  livekit_room text not null unique default gen_random_uuid()::text,
  cover_path text,
  host_disconnected_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((room_type = 'community') = (community_id is not null)),
  check ((room_type = 'group') = (project_id is not null)),
  check (visibility <> 'community' or room_type = 'community'),
  check (cover_path is null or (cover_path !~ '\.\.' and char_length(cover_path) <= 500))
);
create index voice_rooms_discovery_idx on public.voice_rooms (status, scheduled_at, id);
create index voice_rooms_host_idx on public.voice_rooms (host_id, scheduled_at desc);
create index voice_rooms_community_idx on public.voice_rooms (community_id, scheduled_at desc) where community_id is not null;
create trigger voice_rooms_updated_at before update on public.voice_rooms for each row execute function public.set_updated_at();

create table public.voice_room_members (
  room_id uuid not null references public.voice_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'listener' check (role in ('host','cohost','speaker','listener')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, user_id)
);
create index voice_room_members_user_idx on public.voice_room_members (user_id, joined_at desc);

create table public.voice_room_invitations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.voice_rooms(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  requested_role text not null default 'listener' check (requested_role in ('speaker','listener')),
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked')),
  created_at timestamptz not null default now(),
  unique (room_id, invitee_id)
);
create index voice_room_invites_inbox_idx on public.voice_room_invitations (invitee_id, status, created_at desc);

create table public.voice_hand_requests (
  room_id uuid not null references public.voice_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index voice_hand_requests_queue_idx on public.voice_hand_requests (room_id, status, created_at);

create table public.voice_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.voice_rooms(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index voice_room_messages_history_idx on public.voice_room_messages (room_id, created_at desc, id desc);

create table public.voice_room_interests (
  room_id uuid not null references public.voice_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.feature_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('project','project_user','competition','voice_room','voice_participant')),
  target_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 5 and 1000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);
create index feature_reports_review_idx on public.feature_reports (status, created_at desc);

-- Caller-bound helpers: these reveal only whether the current user belongs to/hosts a resource.
create function public.project_is_member(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_members m where m.project_id = p_project and m.user_id = (select auth.uid()))
$$;
create function public.project_is_owner(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects p where p.id = p_project and p.owner_id = (select auth.uid()))
$$;
create function public.competition_is_organizer(p_competition uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.competitions c where c.id = p_competition and c.organizer_id = (select auth.uid()))
$$;
create function public.competition_is_registered(p_competition uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.competition_registrations r where r.competition_id = p_competition and r.user_id = (select auth.uid()) and r.status = 'registered')
$$;
create function public.voice_is_manager(p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.voice_room_members m where m.room_id = p_room and m.user_id = (select auth.uid()) and m.left_at is null and m.role in ('host','cohost'))
$$;
create function public.project_member_count(p_project uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*)
  from public.project_members m
  join public.projects p on p.id=m.project_id
  where p.id=p_project and (
    p.owner_id=(select auth.uid()) or public.project_is_member(p.id)
    or exists(select 1 from public.project_invitations i where i.project_id=p.id and i.invitee_id=(select auth.uid()) and i.status='pending')
    or ((select public.feature_enabled('project_collaboration')) and p.status<>'cancelled' and (
      p.visibility='public'
      or (p.visibility='institution' and p.institution_id is not null
        and p.institution_id=(select institution_id from public.profiles where id=(select auth.uid())))
    ))
  )
$$;
create function public.voice_can_join(p_room uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_room public.voice_rooms%rowtype; v_uid uuid := (select auth.uid());
begin
  if v_uid is null or public.account_effective_status(v_uid) <> 'active' then return false; end if;
  if not public.feature_enabled('voice_spaces') then return false; end if;
  select * into v_room from public.voice_rooms where id = p_room;
  if not found or v_room.status in ('ended','cancelled') then return false; end if;
  if v_room.host_id = v_uid then return true; end if;
  if public.internal_blocked_either(v_uid, v_room.host_id) then return false; end if;
  if exists (select 1 from public.voice_room_members m join public.blocks b
    on (b.blocker_id = v_uid and b.blocked_id = m.user_id) or (b.blocker_id = m.user_id and b.blocked_id = v_uid)
    where m.room_id = p_room and m.left_at is null) then return false; end if;
  if v_room.room_type='group' then
    return exists(select 1 from public.project_members pm where pm.project_id=v_room.project_id and pm.user_id=v_uid);
  end if;
  if exists (select 1 from public.voice_room_invitations i where i.room_id = p_room and i.invitee_id = v_uid and i.status in ('pending','accepted')) then return true; end if;
  if v_room.visibility = 'invite_only' then return false; end if;
  if v_room.visibility = 'community' then
    return v_room.community_id is not null and exists (select 1 from public.community_members cm
      where cm.community_id = v_room.community_id and cm.user_id = v_uid and cm.status = 'active');
  end if;
  if v_room.visibility = 'followers' then
    return exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = v_room.host_id);
  end if;
  return v_room.visibility = 'public';
end $$;

create function public.respond_voice_invitation(p_invitation uuid,p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_inv public.voice_room_invitations%rowtype;
begin
 select * into v_inv from public.voice_room_invitations where id=p_invitation and invitee_id=(select auth.uid()) for update;
 if not found or v_inv.status<>'pending' or not public.voice_can_join(v_inv.room_id) then raise exception 'forbidden' using errcode='42501'; end if;
 update public.voice_room_invitations set status=case when p_accept then 'accepted' else 'declined' end where id=p_invitation;
 if p_accept then
   insert into public.voice_room_members(room_id,user_id,role,left_at)
   values(v_inv.room_id,(select auth.uid()),v_inv.requested_role,null)
   on conflict(room_id,user_id) do update set role=excluded.role,left_at=null;
 end if;
end $$;

create function public.voice_leave_room(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 update public.voice_room_members set left_at=now() where room_id=p_room and user_id=(select auth.uid()) and role<>'host' and left_at is null;
end $$;

create function public.invite_competition_teammate(p_registration uuid,p_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=(select auth.uid()); v_comp uuid; v_max integer; v_id uuid; v_allowed uuid[];
begin
 select r.competition_id,c.max_team_size,c.participating_institutions into v_comp,v_max,v_allowed
 from public.competition_registrations r join public.competitions c on c.id=r.competition_id
 join public.competition_team_members captain on captain.registration_id=r.id and captain.user_id=v_uid and captain.role='captain' and captain.status='active'
 where r.id=p_registration and r.status='registered' and c.verification_status='approved' and c.registration_closes_at>now();
 if v_comp is null or not public.feature_enabled('interuniversity_competitions')
   or p_user=v_uid or public.internal_blocked_either(v_uid,p_user)
   or not exists(select 1 from public.profiles where id=p_user and public.account_effective_status(id)='active')
   or (cardinality(v_allowed)>0 and not exists(select 1 from public.profiles where id=p_user and institution_id=any(v_allowed)))
   or exists(select 1 from public.competition_registrations r where r.competition_id=v_comp and r.user_id=p_user)
   or exists(select 1 from public.competition_team_members tm join public.competition_registrations r on r.id=tm.registration_id
      where r.competition_id=v_comp and tm.user_id=p_user and tm.status='active')
   or (select count(*) from public.competition_team_members where registration_id=p_registration and status='active')
      + (select count(*) from public.competition_team_invitations where registration_id=p_registration and status='pending')>=v_max then
   raise exception 'forbidden_or_team_full' using errcode='42501';
 end if;
 insert into public.competition_team_invitations(registration_id,inviter_id,invitee_id)
 values(p_registration,v_uid,p_user)
 on conflict(registration_id,invitee_id) do update set inviter_id=excluded.inviter_id,status='pending',created_at=now()
 returning id into v_id;
 perform public.internal_notify(p_user,'competition_update',v_uid,'competition',v_comp,'competition-team-invite-'||v_id::text,'{}'::jsonb);
 return v_id;
end $$;

create function public.respond_competition_team_invitation(p_invitation uuid,p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_inv public.competition_team_invitations%rowtype; v_max integer;
begin
 select * into v_inv from public.competition_team_invitations where id=p_invitation and invitee_id=(select auth.uid()) for update;
 if not found or v_inv.status<>'pending' then raise exception 'forbidden' using errcode='42501'; end if;
 if p_accept then
   select c.max_team_size into v_max from public.competition_registrations r join public.competitions c on c.id=r.competition_id
   where r.id=v_inv.registration_id and r.status='registered' and c.verification_status='approved' and c.registration_closes_at>now()
   for update of r;
   if v_max is null
     or public.internal_blocked_either(v_inv.inviter_id,(select auth.uid()))
     or exists(select 1 from public.competition_registrations r join public.competition_team_members tm on tm.registration_id=r.id
       where r.competition_id=(select competition_id from public.competition_registrations where id=v_inv.registration_id)
         and (r.user_id=(select auth.uid()) or (tm.user_id=(select auth.uid()) and tm.status='active')))
     or (select count(*) from public.competition_team_members where registration_id=v_inv.registration_id and status='active')>=v_max then raise exception 'team_full_or_registration_closed' using errcode='22023'; end if;
   if exists(select 1 from public.competitions c join public.profiles p on p.id=(select auth.uid())
     where c.id=(select competition_id from public.competition_registrations where id=v_inv.registration_id)
       and cardinality(c.participating_institutions)>0
       and (p.institution_id is null or not p.institution_id=any(c.participating_institutions))) then raise exception 'not_eligible' using errcode='42501'; end if;
   insert into public.competition_team_members(registration_id,user_id,status) values(v_inv.registration_id,(select auth.uid()),'active')
   on conflict(registration_id,user_id) do update set status='active',joined_at=now();
 end if;
 update public.competition_team_invitations set status=case when p_accept then 'accepted' else 'declined' end where id=p_invitation;
end $$;

create function public.score_competition_submission(p_submission uuid,p_score numeric,p_rank smallint,p_feedback text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_comp uuid;
begin
 select competition_id into v_comp from public.competition_submissions where id=p_submission;
 if v_comp is null or (not public.competition_is_organizer(v_comp) and not public.has_permission('content.moderate')) then raise exception 'forbidden' using errcode='42501'; end if;
 update public.competition_submissions set score=p_score,rank=p_rank,judge_feedback=nullif(btrim(coalesce(p_feedback,'')),'') where id=p_submission;
end $$;

create function public.complete_competition(p_competition uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.competition_is_organizer(p_competition) then raise exception 'forbidden' using errcode='42501'; end if;
 update public.competitions set status='completed' where id=p_competition and verification_status='approved' and ends_at<=now() and status not in ('completed','cancelled');
 if not found then raise exception 'competition_not_ended' using errcode='22023'; end if;
end $$;

revoke all on function public.project_is_member(uuid), public.project_is_owner(uuid),
  public.competition_is_organizer(uuid), public.competition_is_registered(uuid),
  public.voice_is_manager(uuid), public.voice_can_join(uuid), public.project_member_count(uuid) from public, anon, authenticated;
grant execute on function public.project_is_member(uuid), public.project_is_owner(uuid),
  public.competition_is_organizer(uuid), public.competition_is_registered(uuid),
  public.voice_is_manager(uuid), public.voice_can_join(uuid), public.project_member_count(uuid) to authenticated;

create function public.create_project(
  p_title text, p_description text, p_objectives text, p_category text, p_collaboration_type text,
  p_skills text[], p_institution uuid, p_visibility text, p_max_collaborators smallint,
  p_deadline date, p_application_deadline timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid;
begin
  if v_uid is null or public.account_effective_status(v_uid) <> 'active' then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.feature_enabled('project_collaboration') then raise exception 'feature_disabled' using errcode = '42501'; end if;
  if p_institution is not null and p_institution is distinct from (select institution_id from public.profiles where id=v_uid) then
    raise exception 'owner_institution_mismatch' using errcode='42501';
  end if;
  insert into public.projects(owner_id,institution_id,title,description,objectives,category,collaboration_type,required_skills,visibility,max_collaborators,deadline,application_deadline)
  values(v_uid,coalesce(p_institution,(select institution_id from public.profiles where id=v_uid)),btrim(p_title),btrim(p_description),coalesce(p_objectives,''),p_category,p_collaboration_type,coalesce(p_skills,'{}'),p_visibility,p_max_collaborators,p_deadline,p_application_deadline)
  returning id into v_id;
  insert into public.project_members(project_id,user_id,project_role) values(v_id,v_uid,'Project owner');
  return v_id;
end $$;

create function public.apply_to_project(p_project uuid,p_pitch text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_application uuid; v_owner uuid;
begin
  if v_uid is null or public.account_effective_status(v_uid) <> 'active' then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.feature_enabled('project_collaboration') then raise exception 'feature_disabled' using errcode = '42501'; end if;
  select p.owner_id into v_owner from public.projects p
  join public.profiles applicant_profile on applicant_profile.id=v_uid
  where p.id=p_project and p.status='recruiting' and p.visibility<>'private'
    and (p.visibility<>'institution' or p.institution_id=applicant_profile.institution_id)
    and p.owner_id<>v_uid and (p.application_deadline is null or p.application_deadline>now())
    and not exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=v_uid)
    and not public.internal_blocked_either(v_uid,p.owner_id);
  if v_owner is null then
    raise exception 'project_not_accepting_applications' using errcode = '42501';
  end if;
  insert into public.project_applications(project_id,applicant_id,skills_pitch)
  values(p_project,v_uid,btrim(p_pitch)) returning id into v_application;
  return v_application;
end $$;

create function public.review_project_application(p_application uuid,p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_app public.project_applications%rowtype; v_limit integer;
begin
  select * into v_app from public.project_applications where id=p_application for update;
  if not found or not public.project_is_owner(v_app.project_id) or v_app.status<>'pending' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_approve then
    select max_collaborators into v_limit from public.projects where id=v_app.project_id for update;
    if (select count(*) from public.project_members where project_id=v_app.project_id)>=v_limit then raise exception 'project_full' using errcode = '22023'; end if;
    if public.internal_blocked_either(v_app.applicant_id,(select auth.uid())) then raise exception 'blocked_user' using errcode='42501'; end if;
    insert into public.project_members(project_id,user_id) values(v_app.project_id,v_app.applicant_id) on conflict do nothing;
  end if;
  update public.project_applications set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now() where id=p_application;
  perform public.internal_notify(v_app.applicant_id,'project_application',(select auth.uid()),'project',v_app.project_id,
    'project-application-'||p_application::text,jsonb_build_object('approved',p_approve));
end $$;

create function public.invite_to_project(p_project uuid,p_invitee uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid;
begin
  if not public.feature_enabled('project_collaboration')
    or not public.project_is_owner(p_project) or v_uid=p_invitee
    or public.internal_blocked_either(v_uid,p_invitee)
    or not exists(select 1 from public.profiles where id=p_invitee and public.account_effective_status(id)='active')
    or not exists(select 1 from public.projects where id=p_project and status<>'cancelled') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.project_invitations(project_id,inviter_id,invitee_id) values(p_project,v_uid,p_invitee)
  on conflict(project_id,invitee_id) do update set inviter_id=excluded.inviter_id,status='pending',created_at=now()
  returning id into v_id;
  perform public.internal_notify(p_invitee,'project_invitation',v_uid,'project',p_project,'project-invite-'||v_id::text,'{}'::jsonb);
  return v_id;
end $$;

create function public.respond_project_invitation(p_invitation uuid,p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_inv public.project_invitations%rowtype; v_max integer;
begin
  select * into v_inv from public.project_invitations where id=p_invitation and invitee_id=(select auth.uid()) for update;
  if not found or v_inv.status<>'pending' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_accept then
    select max_collaborators into v_max from public.projects where id=v_inv.project_id and status<>'cancelled' for update;
    if v_max is null or (select count(*) from public.project_members where project_id=v_inv.project_id)>=v_max then raise exception 'project_full' using errcode = '22023'; end if;
    insert into public.project_members(project_id,user_id) values(v_inv.project_id,(select auth.uid())) on conflict do nothing;
  end if;
  update public.project_invitations set status=case when p_accept then 'accepted' else 'declined' end where id=p_invitation;
end $$;

create function public.create_competition(
 p_name text,p_description text,p_category text,p_rules text,p_eligibility text,p_institution uuid,
 p_participating_institutions uuid[],p_participation_type text,p_max_team_size smallint,
 p_registration_opens timestamptz,p_registration_closes timestamptz,p_starts timestamptz,p_ends timestamptz,
 p_submission_deadline timestamptz,p_prizes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid;
begin
 if v_uid is null or public.account_effective_status(v_uid)<>'active' then raise exception 'forbidden' using errcode='42501'; end if;
 if not public.feature_enabled('interuniversity_competitions') then raise exception 'feature_disabled' using errcode='42501'; end if;
 if p_participation_type='individual' and p_participating_institutions is null then
   p_participating_institutions:='{}';
 end if;
 if p_institution is not null and p_institution is distinct from (select institution_id from public.profiles where id=v_uid) then
   raise exception 'organizer_institution_mismatch' using errcode='42501';
 end if;
 if exists(select 1 from unnest(coalesce(p_participating_institutions,'{}')) i(id)
   where not exists(select 1 from public.institutions where id=i.id and is_active)) then
   raise exception 'invalid_participating_institution' using errcode='22023';
 end if;
 insert into public.competitions(organizer_id,institution_id,name,description,category,rules,eligibility,participating_institutions,participation_type,max_team_size,registration_opens_at,registration_closes_at,starts_at,ends_at,submission_deadline,prizes,status,verification_status)
 values(v_uid,coalesce(p_institution,(select institution_id from public.profiles where id=v_uid)),btrim(p_name),btrim(p_description),p_category,coalesce(p_rules,''),coalesce(p_eligibility,''),coalesce(p_participating_institutions,'{}'),p_participation_type,p_max_team_size,p_registration_opens,p_registration_closes,p_starts,p_ends,p_submission_deadline,coalesce(p_prizes,''),'pending_review','pending')
 returning id into v_id;
 return v_id;
end $$;

create function public.moderate_competition(p_competition uuid,p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.has_permission('content.moderate') then raise exception 'forbidden' using errcode='42501'; end if;
 update public.competitions set verification_status=case when p_approve then 'approved' else 'rejected' end,
   status=case when p_approve then case when registration_opens_at<=now() and registration_closes_at>now() then 'registration_open' else 'upcoming' end else 'cancelled' end
 where id=p_competition and verification_status='pending';
 if not found then raise exception 'not_pending_review' using errcode='22023'; end if;
end $$;

create function public.register_for_competition(p_competition uuid,p_team_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid; v_comp public.competitions%rowtype;
begin
 if v_uid is null or public.account_effective_status(v_uid)<>'active' then raise exception 'forbidden' using errcode='42501'; end if;
 if not public.feature_enabled('interuniversity_competitions') then raise exception 'feature_disabled' using errcode='42501'; end if;
 select * into v_comp from public.competitions where id=p_competition and verification_status='approved'
   and status in ('upcoming','registration_open') and registration_opens_at<=now() and registration_closes_at>now();
 if not found or v_comp.participation_type='individual' and nullif(btrim(coalesce(p_team_name,'')),'') is not null
   or v_comp.participation_type='team' and nullif(btrim(coalesce(p_team_name,'')),'') is null then
   raise exception 'registration_closed_or_invalid_team' using errcode='22023';
 end if;
 if exists(select 1 from public.competition_team_members tm join public.competition_registrations r on r.id=tm.registration_id
   where r.competition_id=p_competition and tm.user_id=v_uid and tm.status='active') then raise exception 'already_participating' using errcode='23505'; end if;
 if cardinality(v_comp.participating_institutions)>0 and not exists(select 1 from public.profiles pr where pr.id=v_uid and pr.institution_id=any(v_comp.participating_institutions)) then raise exception 'not_eligible' using errcode='42501'; end if;
 insert into public.competition_registrations(competition_id,user_id,team_name)
 values(p_competition,v_uid,nullif(btrim(coalesce(p_team_name,'')),''))
 returning id into v_id;
 if nullif(btrim(coalesce(p_team_name,'')),'') is not null then
   insert into public.competition_team_members(registration_id,user_id,role,status) values(v_id,v_uid,'captain','active');
 end if;
 return v_id;
end $$;

create function public.submit_competition_entry(p_competition uuid,p_title text,p_description text,p_asset_path text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_reg uuid; v_id uuid; v_deadline timestamptz;
begin
 if not public.feature_enabled('interuniversity_competitions') then raise exception 'feature_disabled' using errcode='42501'; end if;
 if not public.feature_enabled('interuniversity_competitions') then raise exception 'feature_disabled' using errcode='42501'; end if;
 select r.id,c.submission_deadline into v_reg,v_deadline from public.competition_registrations r
 join public.competitions c on c.id=r.competition_id
 left join public.competition_team_members tm on tm.registration_id=r.id and tm.user_id=v_uid and tm.status='active'
 where r.competition_id=p_competition and (r.user_id=v_uid or tm.user_id=v_uid) and r.status='registered'
   and c.verification_status='approved' and c.status in ('upcoming','registration_open','live')
   and c.starts_at<=now() and c.ends_at>=now()
   and (c.submission_deadline is null or c.submission_deadline>=now());
 if v_reg is null or v_uid is null or public.account_effective_status(v_uid)<>'active' then raise exception 'forbidden_or_deadline_passed' using errcode='42501'; end if;
 if p_asset_path is not null and (p_asset_path !~ ('^'||p_competition::text||'/[^/]+$') or p_asset_path ~ '\.\.') then
   raise exception 'invalid_competition_asset_path' using errcode='22023';
 end if;
 insert into public.competition_submissions(competition_id,registration_id,submitted_by,title,description,asset_path)
 values(p_competition,v_reg,v_uid,btrim(p_title),coalesce(p_description,''),p_asset_path)
 on conflict(competition_id,registration_id) do update set title=excluded.title,description=excluded.description,asset_path=excluded.asset_path,submitted_at=now()
 returning id into v_id;
 return v_id;
end $$;

create function public.my_competition_registration(p_competition uuid)
returns table(registration_id uuid,team_name text,team_role text)
language sql stable security definer set search_path = '' as $$
 select r.id,r.team_name,coalesce(tm.role,'individual')
 from public.competition_registrations r
 left join public.competition_team_members tm on tm.registration_id=r.id and tm.user_id=(select auth.uid()) and tm.status='active'
 where r.competition_id=p_competition and r.status='registered'
   and (r.user_id=(select auth.uid()) or tm.user_id=(select auth.uid()))
 limit 1
$$;

create function public.voice_set_member_role(p_room uuid,p_user uuid,p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if p_role not in ('cohost','speaker','listener') or not public.voice_is_manager(p_room) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_role='cohost' and not exists(select 1 from public.voice_rooms where id=p_room and host_id=(select auth.uid())) then raise exception 'only_host_can_assign_cohosts' using errcode='42501'; end if;
 if exists(select 1 from public.voice_rooms where id=p_room and host_id=p_user) then raise exception 'host_role_is_fixed' using errcode='42501'; end if;
 if p_role in ('speaker','cohost') and not exists(select 1 from public.voice_room_invitations i where i.room_id=p_room and i.invitee_id=p_user and i.status='accepted')
   and not exists(select 1 from public.voice_hand_requests h where h.room_id=p_room and h.user_id=p_user and h.status='approved') then
   raise exception 'participant_must_be_invited_or_approved' using errcode='42501';
 end if;
 insert into public.voice_room_members(room_id,user_id,role,left_at) values(p_room,p_user,p_role,null)
 on conflict(room_id,user_id) do update set role=excluded.role,left_at=null;
end $$;

create function public.voice_end_room(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.voice_rooms where id=p_room and host_id=(select auth.uid())) then raise exception 'forbidden' using errcode='42501'; end if;
 update public.voice_rooms set status='ended',ended_at=now(),host_disconnected_at=null where id=p_room and status in ('scheduled','live');
 update public.voice_room_members set left_at=coalesce(left_at,now()) where room_id=p_room;
end $$;

-- Insert the creator as a host/single-owner member, including for direct authenticated inserts.
create function public.voice_room_host_member_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.voice_room_members(room_id,user_id,role) values(new.id,new.host_id,'host');
 return new;
end $$;
create trigger voice_room_host_member after insert on public.voice_rooms for each row execute function public.voice_room_host_member_trg();

-- In-app notifications feed the existing Firebase push outbox trigger.
create function public.feature_notification_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_actor uuid; v_type text; v_entity uuid; v_entity_type text; v_dedupe text;
begin
 if tg_table_name='project_applications' then
   select owner_id into v_user from public.projects where id=new.project_id;
   v_actor:=new.applicant_id; v_type:='project_application'; v_entity:=new.project_id; v_entity_type:='project';
   v_dedupe:='project-app-'||new.id::text;
 elsif tg_table_name='project_invitations' then
   v_user:=new.invitee_id; v_actor:=new.inviter_id; v_type:='project_invitation'; v_entity:=new.project_id; v_entity_type:='project';
   v_dedupe:='project-invite-'||new.id::text;
 elsif tg_table_name='voice_room_invitations' then
   v_user:=new.invitee_id; v_actor:=new.inviter_id; v_type:='voice_invitation'; v_entity:=new.room_id; v_entity_type:='voice_room';
   v_dedupe:='voice-invite-'||new.id::text;
 elsif tg_table_name='competition_registrations' then
   select organizer_id into v_user from public.competitions where id=new.competition_id;
   v_actor:=new.user_id; v_type:='competition_update'; v_entity:=new.competition_id; v_entity_type:='competition';
   v_dedupe:='competition-registration-'||new.id::text;
 else return new;
 end if;
 perform public.internal_notify(v_user,v_type,v_actor,v_entity_type,v_entity,v_dedupe,jsonb_build_object('source',tg_table_name));
 return new;
end $$;
create trigger project_application_notification after insert on public.project_applications for each row execute function public.feature_notification_trg();
create trigger project_invitation_notification after insert or update of status on public.project_invitations for each row when (new.status='pending') execute function public.feature_notification_trg();
create trigger voice_invitation_notification after insert or update of status on public.voice_room_invitations for each row when (new.status='pending') execute function public.feature_notification_trg();
create trigger competition_registration_notification after insert on public.competition_registrations for each row execute function public.feature_notification_trg();

-- Every feature table is RLS-protected. Mutations with privilege changes go through RPCs.
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_applications enable row level security;
alter table public.project_invitations enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_messages enable row level security;
alter table public.project_milestones enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_registrations enable row level security;
alter table public.competition_submissions enable row level security;
alter table public.competition_announcements enable row level security;
alter table public.competition_reports enable row level security;
alter table public.competition_team_members enable row level security;
alter table public.competition_team_invitations enable row level security;
alter table public.voice_rooms enable row level security;
alter table public.voice_room_members enable row level security;
alter table public.voice_room_invitations enable row level security;
alter table public.voice_hand_requests enable row level security;
alter table public.voice_room_messages enable row level security;
alter table public.voice_room_interests enable row level security;
alter table public.competition_reports enable row level security;
alter table public.feature_reports enable row level security;

revoke all on public.projects, public.project_members, public.project_applications, public.project_invitations,
  public.project_tasks, public.project_messages, public.project_milestones, public.competitions,
  public.competition_registrations, public.competition_submissions, public.competition_announcements,
  public.competition_reports, public.competition_team_members, public.competition_team_invitations,
  public.voice_rooms, public.voice_room_members, public.voice_room_invitations, public.voice_hand_requests,
  public.voice_room_messages, public.voice_room_interests, public.feature_reports from public,anon,authenticated;
grant select,update on public.projects to authenticated;
grant select on public.project_members, public.project_applications, public.project_invitations,
  public.project_tasks, public.project_messages, public.project_milestones to authenticated;
grant insert,update,delete on public.project_tasks, public.project_milestones to authenticated;
grant insert on public.project_messages to authenticated;
grant select,insert,update on public.competitions to authenticated;
grant select,insert on public.competition_registrations, public.competition_submissions,
  public.competition_announcements, public.competition_reports, public.feature_reports,
  public.competition_team_members, public.competition_team_invitations to authenticated;
grant select,insert,update on public.voice_rooms to authenticated;
grant select on public.voice_room_members, public.voice_hand_requests to authenticated;
grant select,insert,delete on public.voice_room_interests to authenticated;
grant select,insert on public.voice_room_invitations, public.voice_room_messages to authenticated;
grant update (status) on public.competition_reports, public.feature_reports to authenticated;

create policy projects_read on public.projects for select to authenticated using (
  owner_id=(select auth.uid()) or public.project_is_member(id)
  or exists(select 1 from public.project_invitations i where i.project_id=id and i.invitee_id=(select auth.uid()) and i.status='pending')
  or ((select public.feature_enabled('project_collaboration')) and (
    (status<>'cancelled' and visibility='public')
    or (status<>'cancelled' and visibility='institution' and institution_id is not null
      and institution_id=(select institution_id from public.profiles where id=(select auth.uid())))
  ))
);
create policy projects_insert on public.projects for insert to authenticated with check (
  owner_id=(select auth.uid()) and public.account_effective_status((select auth.uid()))='active'
  and (select public.feature_enabled('project_collaboration'))
);
create policy projects_update_owner on public.projects for update to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
create policy project_members_read on public.project_members for select to authenticated using (user_id=(select auth.uid()) or public.project_is_member(project_id) or public.project_is_owner(project_id));
create policy project_applications_read on public.project_applications for select to authenticated using (applicant_id=(select auth.uid()) or public.project_is_owner(project_id));
create policy project_applications_insert on public.project_applications for insert to authenticated with check (applicant_id=(select auth.uid()));
create policy project_invitations_read on public.project_invitations for select to authenticated using (invitee_id=(select auth.uid()) or public.project_is_owner(project_id));
create policy project_tasks_read on public.project_tasks for select to authenticated using (public.project_is_member(project_id));
create policy project_tasks_insert on public.project_tasks for insert to authenticated with check (public.project_is_member(project_id) and creator_id=(select auth.uid()));
create policy project_tasks_update on public.project_tasks for update to authenticated using (public.project_is_member(project_id)) with check (public.project_is_member(project_id) and (assignee_id is null or exists(select 1 from public.project_members m where m.project_id=project_tasks.project_id and m.user_id=project_tasks.assignee_id)));
create policy project_tasks_delete on public.project_tasks for delete to authenticated using (public.project_is_owner(project_id));
create policy project_messages_read on public.project_messages for select to authenticated using (public.project_is_member(project_id));
create policy project_messages_insert on public.project_messages for insert to authenticated with check (public.project_is_member(project_id) and author_id=(select auth.uid()));
create policy project_milestones_read on public.project_milestones for select to authenticated using (public.project_is_member(project_id));
create policy project_milestones_insert on public.project_milestones for insert to authenticated with check (public.project_is_member(project_id) and creator_id=(select auth.uid()));
create policy project_milestones_update on public.project_milestones for update to authenticated using (public.project_is_member(project_id)) with check (public.project_is_member(project_id));
create policy project_milestones_delete on public.project_milestones for delete to authenticated using (public.project_is_owner(project_id));

create policy competitions_read on public.competitions for select to authenticated using (
  organizer_id=(select auth.uid()) or (select public.has_permission('content.moderate'))
  or ((select public.feature_enabled('interuniversity_competitions')) and verification_status='approved' and status<>'cancelled')
);
create policy competitions_insert on public.competitions for insert to authenticated with check (
  organizer_id=(select auth.uid()) and status='pending_review' and verification_status='pending'
  and (select public.feature_enabled('interuniversity_competitions'))
);
create policy competitions_update_organizer on public.competitions for update to authenticated using (
  organizer_id=(select auth.uid()) and verification_status='pending'
) with check (organizer_id=(select auth.uid()) and verification_status='pending' and status='pending_review');
create policy competition_registrations_read on public.competition_registrations for select to authenticated using (
  user_id=(select auth.uid()) or public.competition_is_organizer(competition_id) or (select public.has_permission('content.moderate'))
);
create policy competition_submissions_read on public.competition_submissions for select to authenticated using (
  exists(select 1 from public.competition_team_members tm where tm.registration_id=competition_submissions.registration_id and tm.user_id=(select auth.uid()) and tm.status='active')
  or submitted_by=(select auth.uid()) or public.competition_is_organizer(competition_id) or (select public.has_permission('content.moderate'))
  or exists(select 1 from public.competitions c where c.id=competition_id and c.status='completed' and c.verification_status='approved')
);
create policy competition_submissions_update_organizer on public.competition_submissions for update to authenticated using (
  public.competition_is_organizer(competition_id) or (select public.has_permission('content.moderate'))
) with check (public.competition_is_organizer(competition_id) or (select public.has_permission('content.moderate')));
create policy competition_announcements_read on public.competition_announcements for select to authenticated using (
  exists(select 1 from public.competitions c where c.id=competition_id and (c.verification_status='approved' or c.organizer_id=(select auth.uid())))
);
create policy competition_announcements_insert on public.competition_announcements for insert to authenticated with check (
  author_id=(select auth.uid()) and public.competition_is_organizer(competition_id)
);
create policy competition_reports_read on public.competition_reports for select to authenticated using (
  reporter_id=(select auth.uid()) or (select public.has_permission('content.moderate')) or (select public.has_permission('reports.manage'))
);
create policy competition_reports_insert on public.competition_reports for insert to authenticated with check (reporter_id=(select auth.uid()));
create policy competition_reports_moderate_update on public.competition_reports for update to authenticated
  using ((select public.has_permission('content.moderate')) or (select public.has_permission('reports.manage')))
  with check ((select public.has_permission('content.moderate')) or (select public.has_permission('reports.manage')));
create policy feature_reports_moderate_update on public.feature_reports for update to authenticated
  using ((select public.has_permission('content.moderate')) or (select public.has_permission('reports.manage')))
  with check ((select public.has_permission('content.moderate')) or (select public.has_permission('reports.manage')));
create policy competition_team_members_read on public.competition_team_members for select to authenticated using (
  user_id=(select auth.uid()) or exists(select 1 from public.competition_registrations r where r.id=registration_id and (r.user_id=(select auth.uid()) or public.competition_is_organizer(r.competition_id)))
);
create policy competition_team_invites_read on public.competition_team_invitations for select to authenticated using (invitee_id=(select auth.uid()) or inviter_id=(select auth.uid()));
create policy feature_reports_read on public.feature_reports for select to authenticated using (
  reporter_id=(select auth.uid()) or (select public.has_permission('content.moderate')) or (select public.has_permission('reports.manage'))
);
create policy feature_reports_insert on public.feature_reports for insert to authenticated with check (reporter_id=(select auth.uid()));

create policy voice_rooms_read on public.voice_rooms for select to authenticated using (
  host_id=(select auth.uid()) or public.voice_can_join(id) or (select public.has_permission('content.moderate'))
);
create policy voice_rooms_insert on public.voice_rooms for insert to authenticated with check (
  host_id=(select auth.uid()) and public.account_effective_status((select auth.uid()))='active'
  and (room_type<>'community' or exists(select 1 from public.community_members m where m.community_id=voice_rooms.community_id and m.user_id=(select auth.uid()) and m.role in ('owner','moderator') and m.status='active'))
  and (room_type<>'group' or exists(select 1 from public.project_members m where m.project_id=voice_rooms.project_id and m.user_id=(select auth.uid())))
);
create policy voice_rooms_update_host on public.voice_rooms for update to authenticated using (host_id=(select auth.uid())) with check (host_id=(select auth.uid()));
create policy voice_members_read on public.voice_room_members for select to authenticated using (public.voice_can_join(room_id));
create policy voice_members_insert_self on public.voice_room_members for insert to authenticated with check (
  user_id=(select auth.uid()) and public.voice_can_join(room_id) and role='listener'
);
create policy voice_invites_read on public.voice_room_invitations for select to authenticated using (invitee_id=(select auth.uid()) or public.voice_is_manager(room_id));
create policy voice_invites_insert_manager on public.voice_room_invitations for insert to authenticated with check (public.voice_is_manager(room_id) and inviter_id=(select auth.uid()));
create policy voice_hands_read on public.voice_hand_requests for select to authenticated using (user_id=(select auth.uid()) or public.voice_is_manager(room_id));
create policy voice_hands_insert_self on public.voice_hand_requests for insert to authenticated with check (user_id=(select auth.uid()) and public.voice_can_join(room_id));
create policy voice_hands_update on public.voice_hand_requests for update to authenticated using (user_id=(select auth.uid()) or public.voice_is_manager(room_id))
  with check (user_id=(select auth.uid()) or public.voice_is_manager(room_id));
create policy voice_messages_read on public.voice_room_messages for select to authenticated using (public.voice_can_join(room_id));
create policy voice_messages_insert on public.voice_room_messages for insert to authenticated with check (author_id=(select auth.uid()) and public.voice_can_join(room_id));
create policy voice_interests_read on public.voice_room_interests for select to authenticated using (user_id=(select auth.uid()) or public.voice_can_join(room_id));
create policy voice_interests_insert on public.voice_room_interests for insert to authenticated with check (user_id=(select auth.uid()) and public.voice_can_join(room_id));
create policy voice_interests_delete on public.voice_room_interests for delete to authenticated using (user_id=(select auth.uid()));
create function public.create_voice_room(
 p_title text,p_description text,p_category text,p_room_type text,p_visibility text,
 p_community_id uuid,p_scheduled_at timestamptz,p_cover_path text default null,p_project_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=(select auth.uid()); v_id uuid;
begin
 if v_uid is null or public.account_effective_status(v_uid)<>'active' then raise exception 'forbidden' using errcode='42501'; end if;
 if not public.feature_enabled('voice_spaces') then raise exception 'feature_disabled' using errcode='42501'; end if;
 if p_scheduled_at < now()-interval '2 minutes' then raise exception 'invalid_schedule' using errcode='22023'; end if;
 if p_room_type='community' and not exists(select 1 from public.community_members m where m.community_id=p_community_id and m.user_id=v_uid and m.role in ('owner','moderator') and m.status='active') then raise exception 'forbidden' using errcode='42501'; end if;
 if p_room_type='group' and not exists(select 1 from public.project_members m where m.project_id=p_project_id and m.user_id=v_uid) then raise exception 'forbidden' using errcode='42501'; end if;
 insert into public.voice_rooms(host_id,community_id,project_id,title,description,category,room_type,visibility,scheduled_at,cover_path)
 values(v_uid,case when p_room_type='community' then p_community_id else null end,case when p_room_type='group' then p_project_id else null end,btrim(p_title),coalesce(p_description,''),p_category,p_room_type,p_visibility,p_scheduled_at,p_cover_path)
 returning id into v_id;
 return v_id;
end $$;

create function public.voice_join_room(p_room uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=(select auth.uid()); v_role text;
begin
 if not public.voice_can_join(p_room) then raise exception 'forbidden' using errcode='42501'; end if;
 select role into v_role from public.voice_room_members where room_id=p_room and user_id=v_uid and left_at is null;
 if not found then
   insert into public.voice_room_members(room_id,user_id,role) values(p_room,v_uid,'listener')
   on conflict(room_id,user_id) do update set role='listener',left_at=null;
   return 'listener';
 end if;
 return v_role;
end $$;

create function public.voice_request_to_speak(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.voice_can_join(p_room) then raise exception 'forbidden' using errcode='42501'; end if;
 if exists(select 1 from public.voice_room_members where room_id=p_room and user_id=(select auth.uid()) and left_at is null and role<>'listener') then
   raise exception 'already_a_speaker' using errcode='22023';
 end if;
 insert into public.voice_hand_requests(room_id,user_id,status) values(p_room,(select auth.uid()),'pending')
 on conflict(room_id,user_id) do update set status='pending',created_at=now(),updated_at=now();
end $$;

create function public.voice_resolve_hand(p_room uuid,p_user uuid,p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not public.voice_is_manager(p_room) then raise exception 'forbidden' using errcode='42501'; end if;
 update public.voice_hand_requests set status=case when p_approve then 'approved' else 'rejected' end,updated_at=now()
 where room_id=p_room and user_id=p_user and status='pending';
 if p_approve and found then
   insert into public.voice_room_members(room_id,user_id,role,left_at) values(p_room,p_user,'speaker',null)
   on conflict(room_id,user_id) do update set role='speaker',left_at=null;
 end if;
end $$;

create function public.voice_authorize_token(p_room uuid,p_can_publish boolean) returns table(livekit_room text,participant_role text)
language plpgsql security definer set search_path = '' as $$
declare v_room public.voice_rooms%rowtype; v_uid uuid:=(select auth.uid()); v_role text;
begin
 if not public.voice_can_join(p_room) then raise exception 'forbidden' using errcode='42501'; end if;
 select * into v_room from public.voice_rooms where id=p_room;
 if v_room.status='scheduled' then
   if v_room.host_id<>v_uid then raise exception 'room_not_live' using errcode='42501'; end if;
   update public.voice_rooms set status='live',host_disconnected_at=null where id=p_room;
 end if;
 select role into v_role from public.voice_room_members where room_id=p_room and user_id=v_uid and left_at is null;
 if v_role is null then
   insert into public.voice_room_members(room_id,user_id,role) values(p_room,v_uid,'listener') on conflict(room_id,user_id) do update set role='listener',left_at=null;
   v_role:='listener';
 end if;
 if p_can_publish and v_role not in ('host','cohost','speaker') then raise exception 'speaker_permission_required' using errcode='42501'; end if;
 return query select v_room.livekit_room,v_role;
end $$;

revoke all on function public.create_project(text,text,text,text,text,text[],uuid,text,smallint,date,timestamptz),
 public.apply_to_project(uuid,text), public.review_project_application(uuid,boolean),
 public.invite_to_project(uuid,uuid), public.respond_project_invitation(uuid,boolean),
 public.create_competition(text,text,text,text,text,uuid,uuid[],text,smallint,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text),
 public.moderate_competition(uuid,boolean), public.register_for_competition(uuid,text),
 public.submit_competition_entry(uuid,text,text,text), public.voice_set_member_role(uuid,uuid,text),
 public.invite_competition_teammate(uuid,uuid),public.respond_competition_team_invitation(uuid,boolean),
 public.score_competition_submission(uuid,numeric,smallint,text),public.complete_competition(uuid),
 public.my_competition_registration(uuid),
 public.voice_end_room(uuid), public.create_voice_room(text,text,text,text,text,uuid,timestamptz,text,uuid),
 public.voice_join_room(uuid), public.voice_request_to_speak(uuid), public.voice_resolve_hand(uuid,uuid,boolean),
 public.respond_voice_invitation(uuid,boolean),public.voice_leave_room(uuid),
 public.voice_authorize_token(uuid,boolean) from public,anon,authenticated;
grant execute on function public.create_project(text,text,text,text,text,text[],uuid,text,smallint,date,timestamptz),
 public.apply_to_project(uuid,text), public.review_project_application(uuid,boolean),
 public.invite_to_project(uuid,uuid), public.respond_project_invitation(uuid,boolean),
 public.create_competition(text,text,text,text,text,uuid,uuid[],text,smallint,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text),
 public.moderate_competition(uuid,boolean), public.register_for_competition(uuid,text),
 public.submit_competition_entry(uuid,text,text,text), public.voice_set_member_role(uuid,uuid,text),
 public.invite_competition_teammate(uuid,uuid),public.respond_competition_team_invitation(uuid,boolean),
 public.score_competition_submission(uuid,numeric,smallint,text),public.complete_competition(uuid),
 public.my_competition_registration(uuid),
 public.voice_end_room(uuid), public.create_voice_room(text,text,text,text,text,uuid,timestamptz,text,uuid),
 public.voice_join_room(uuid), public.voice_request_to_speak(uuid), public.voice_resolve_hand(uuid,uuid,boolean),
 public.respond_voice_invitation(uuid,boolean),public.voice_leave_room(uuid),
 public.voice_authorize_token(uuid,boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('collaboration-assets','collaboration-assets',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf','text/plain','application/zip'])
on conflict(id) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('competition-assets','competition-assets',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/plain','application/zip'])
on conflict(id) do nothing;
alter publication supabase_realtime add table
  public.project_messages, public.voice_rooms, public.voice_room_members,
  public.voice_hand_requests, public.voice_room_messages, public.voice_room_invitations;
create policy collaboration_assets_read on storage.objects for select to authenticated using (
 bucket_id='collaboration-assets' and (
  public.project_is_member((storage.foldername(name))[1]::uuid) or public.project_is_owner((storage.foldername(name))[1]::uuid)
  or exists(select 1 from public.voice_rooms r where r.id=(storage.foldername(name))[1]::uuid and public.voice_can_join(r.id))
 )
);
create policy collaboration_assets_insert on storage.objects for insert to authenticated with check (
 bucket_id='collaboration-assets' and (
  public.project_is_member((storage.foldername(name))[1]::uuid)
  or exists(select 1 from public.voice_rooms r where r.id=(storage.foldername(name))[1]::uuid and r.host_id=auth.uid())
 )
);
create policy competition_assets_read on storage.objects for select to authenticated using (
 bucket_id='competition-assets' and (
  exists(select 1 from public.competitions c where c.id=(storage.foldername(name))[1]::uuid and (
    c.organizer_id=auth.uid() or (c.verification_status='approved' and (public.competition_is_organizer(c.id)
      or exists(select 1 from public.competition_registrations r where r.competition_id=c.id and (r.user_id=auth.uid()
        or exists(select 1 from public.competition_team_members tm where tm.registration_id=r.id and tm.user_id=auth.uid() and tm.status='active')))))
    or (select public.has_permission('content.moderate'))
  ))
 )
);
create policy competition_assets_insert on storage.objects for insert to authenticated with check (
 bucket_id='competition-assets' and (
  exists(select 1 from public.competitions c where c.id=(storage.foldername(name))[1]::uuid and c.organizer_id=auth.uid())
 or exists(select 1 from public.competition_registrations r where r.competition_id=(storage.foldername(name))[1]::uuid and (
   (r.user_id=auth.uid() and r.status='registered')
   or exists(select 1 from public.competition_team_members tm where tm.registration_id=r.id and tm.user_id=auth.uid() and tm.status='active')
 ))
 )
);

do $postflight$
begin
 if not (select relrowsecurity from pg_class where oid='public.projects'::regclass)
   or not (select relrowsecurity from pg_class where oid='public.competitions'::regclass)
   or not (select relrowsecurity from pg_class where oid='public.voice_rooms'::regclass)
   or has_function_privilege('anon','public.voice_authorize_token(uuid,boolean)','execute')
   or has_function_privilege('anon','public.project_member_count(uuid)','execute')
   or not has_function_privilege('authenticated','public.voice_authorize_token(uuid,boolean)','execute')
   or (select public_count from (select count(*) filter(where public) as public_count from storage.buckets where id in ('collaboration-assets','competition-assets')) b)<>0 then
   raise exception 'Collaboration feature security postflight failed';
 end if;
end
$postflight$;
commit;
