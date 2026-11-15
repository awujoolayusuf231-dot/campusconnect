-- Group Quiz: membership, scheduled quizzes, protected answer keys and private attempts.
-- Review and apply manually in Supabase SQL Editor. This file is never executed by the app.
begin;

do $preflight$
begin
  if to_regclass('public.academic_courses') is null
     or to_regclass('public.academic_departments') is null
     or to_regprocedure('public.account_effective_status(uuid)') is null
     or to_regprocedure('public.current_institution_id()') is null
     or to_regnamespace('campusconnect_private') is null then
    raise exception 'Group Quiz requires the academic catalog and existing account/privacy helpers';
  end if;
  if to_regclass('public.quiz_groups') is not null
     or to_regclass('public.quiz_group_members') is not null
     or to_regclass('public.group_quizzes') is not null then
    raise exception 'Group Quiz relations already exist; inspect the schema before applying this migration';
  end if;
end;
$preflight$;

create table public.quiz_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  institution_id uuid not null references public.institutions(id) on delete restrict,
  department_id uuid references public.academic_departments(id) on delete set null,
  course_id uuid references public.academic_courses(id) on delete set null,
  visibility text not null default 'discoverable' check (visibility in ('discoverable', 'invite_only')),
  join_policy text not null default 'approval' check (join_policy in ('open', 'approval', 'invite_only')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (department_id is not null or course_id is null)
);

create index quiz_groups_discover_idx on public.quiz_groups (institution_id, created_at desc)
  where visibility = 'discoverable';
create index quiz_groups_creator_idx on public.quiz_groups (created_by, created_at desc);
create trigger quiz_groups_updated_at before update on public.quiz_groups
  for each row execute function public.set_updated_at();

create table public.quiz_group_members (
  group_id uuid not null references public.quiz_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'moderator', 'member')),
  status text not null default 'active' check (status in ('active', 'pending', 'invited', 'banned')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create unique index quiz_group_one_owner_idx on public.quiz_group_members (group_id) where role = 'owner';
create index quiz_group_members_user_status_idx on public.quiz_group_members (user_id, status, created_at desc);
create trigger quiz_group_members_updated_at before update on public.quiz_group_members
  for each row execute function public.set_updated_at();

create table public.group_quizzes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.quiz_groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  starts_at timestamptz not null,
  closes_at timestamptz,
  duration_minutes smallint not null check (duration_minutes between 1 and 240),
  answer_release text not null default 'after_close' check (answer_release in ('immediately', 'after_close', 'at_time')),
  answer_release_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at is null or closes_at > starts_at),
  check ((answer_release = 'at_time') = (answer_release_at is not null)),
  check (answer_release_at is null or answer_release_at >= starts_at)
);
create index group_quizzes_group_schedule_idx on public.group_quizzes (group_id, starts_at desc);
create index group_quizzes_status_schedule_idx on public.group_quizzes (status, starts_at);
create trigger group_quizzes_updated_at before update on public.group_quizzes
  for each row execute function public.set_updated_at();

create table public.group_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.group_quizzes(id) on delete cascade,
  position smallint not null check (position between 1 and 100),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 2000),
  explanation text not null default '' check (char_length(explanation) <= 2000),
  created_at timestamptz not null default now(),
  unique (quiz_id, position),
  unique (quiz_id, id)
);

create table public.group_quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.group_quiz_questions(id) on delete cascade,
  position smallint not null check (position between 1 and 6),
  option_text text not null check (char_length(btrim(option_text)) between 1 and 500),
  unique (question_id, position),
  unique (question_id, id)
);

create table public.group_quiz_answer_keys (
  question_id uuid primary key references public.group_quiz_questions(id) on delete cascade,
  correct_option_id uuid not null,
  foreign key (question_id, correct_option_id)
    references public.group_quiz_options(question_id, id) on delete cascade
);

create table public.group_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.group_quizzes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score integer,
  percentage numeric(5,2),
  correct_count integer,
  incorrect_count integer,
  unanswered_count integer,
  created_at timestamptz not null default now(),
  unique (quiz_id, user_id),
  check (
    (submitted_at is null and score is null and percentage is null
      and correct_count is null and incorrect_count is null and unanswered_count is null)
    or (submitted_at is not null and score is not null and percentage between 0 and 100
      and correct_count >= 0 and incorrect_count >= 0 and unanswered_count >= 0)
  )
);
create index group_quiz_attempts_quiz_submitted_idx on public.group_quiz_attempts (quiz_id, submitted_at desc);
create index group_quiz_attempts_user_idx on public.group_quiz_attempts (user_id, created_at desc);

create table public.group_quiz_answers (
  attempt_id uuid not null references public.group_quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.group_quiz_questions(id) on delete cascade,
  selected_option_id uuid,
  primary key (attempt_id, question_id),
  foreign key (question_id, selected_option_id)
    references public.group_quiz_options(question_id, id)
);

alter table public.quiz_groups enable row level security;
alter table public.quiz_group_members enable row level security;
alter table public.group_quizzes enable row level security;
alter table public.group_quiz_questions enable row level security;
alter table public.group_quiz_options enable row level security;
alter table public.group_quiz_answer_keys enable row level security;
alter table public.group_quiz_attempts enable row level security;
alter table public.group_quiz_answers enable row level security;

grant select on public.quiz_groups, public.quiz_group_members, public.group_quizzes,
  public.group_quiz_questions, public.group_quiz_options, public.group_quiz_attempts,
  public.group_quiz_answers to authenticated;
revoke all on public.group_quiz_answer_keys from public, anon, authenticated;

create function campusconnect_private.internal_quiz_group_status(p_group uuid)
returns text
language sql stable security definer set search_path = ''
as $function$
  select m.status
  from public.quiz_group_members m
  where m.group_id = p_group and m.user_id = (select auth.uid())
$function$;

create function campusconnect_private.internal_quiz_group_manager(p_group uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.quiz_group_members m
    where m.group_id = p_group and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role in ('owner', 'moderator')
  )
$function$;

create function campusconnect_private.internal_quiz_visible(p_quiz uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1
    from public.group_quizzes q
    join public.quiz_group_members m on m.group_id = q.group_id
    where q.id = p_quiz and m.user_id = (select auth.uid()) and m.status = 'active'
      and (q.status = 'published' or q.created_by = (select auth.uid()) or m.role in ('owner', 'moderator'))
  )
$function$;

create function campusconnect_private.internal_quiz_result_released(p_attempt uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1
    from public.group_quiz_attempts a
    join public.group_quizzes q on q.id = a.quiz_id
    where a.id = p_attempt and a.submitted_at is not null
      and (
        campusconnect_private.internal_quiz_group_manager(q.group_id)
        or (
          a.user_id = (select auth.uid())
          and (
            q.answer_release = 'immediately'
            or (q.answer_release = 'after_close' and q.closes_at is not null and now() >= q.closes_at)
            or (q.answer_release = 'at_time' and q.answer_release_at <= now())
          )
        )
      )
  )
$function$;

revoke all on function campusconnect_private.internal_quiz_group_status(uuid) from public, anon, authenticated;
revoke all on function campusconnect_private.internal_quiz_group_manager(uuid) from public, anon, authenticated;
revoke all on function campusconnect_private.internal_quiz_visible(uuid) from public, anon, authenticated;
revoke all on function campusconnect_private.internal_quiz_result_released(uuid) from public, anon, authenticated;
grant execute on function campusconnect_private.internal_quiz_group_status(uuid) to authenticated;
grant execute on function campusconnect_private.internal_quiz_group_manager(uuid) to authenticated;
grant execute on function campusconnect_private.internal_quiz_visible(uuid) to authenticated;
grant execute on function campusconnect_private.internal_quiz_result_released(uuid) to authenticated;

create policy quiz_groups_read on public.quiz_groups
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and (
      (visibility = 'discoverable' and institution_id = (select public.current_institution_id()))
      or created_by = (select auth.uid())
      or campusconnect_private.internal_quiz_group_status(id) is not null
    )
  );
create policy quiz_group_members_read on public.quiz_group_members
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and (
      user_id = (select auth.uid())
      or campusconnect_private.internal_quiz_group_status(group_id) = 'active'
      or campusconnect_private.internal_quiz_group_manager(group_id)
    )
  );
create policy group_quizzes_read on public.group_quizzes
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and campusconnect_private.internal_quiz_visible(id)
  );
create policy group_quiz_questions_read on public.group_quiz_questions
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and campusconnect_private.internal_quiz_visible(quiz_id)
  );
create policy group_quiz_options_read on public.group_quiz_options
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and exists (
      select 1 from public.group_quiz_questions question
      where question.id = question_id
        and campusconnect_private.internal_quiz_visible(question.quiz_id)
    )
  );
create policy group_quiz_attempts_read on public.group_quiz_attempts
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and (
      user_id = (select auth.uid())
      or exists (
        select 1 from public.group_quizzes q
        where q.id = quiz_id
          and campusconnect_private.internal_quiz_group_manager(q.group_id)
      )
    )
  );
create policy group_quiz_answers_read on public.group_quiz_answers
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and campusconnect_private.internal_quiz_result_released(attempt_id)
  );

create function public.create_quiz_group(
  p_name text,
  p_description text,
  p_institution_id uuid,
  p_department_id uuid,
  p_course_id uuid,
  p_visibility text,
  p_join_policy text
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_group uuid;
  v_user_institution uuid;
begin
  if v_user is null or public.account_effective_status(v_user) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 3 and 100
     or char_length(coalesce(p_description, '')) > 1000
     or p_visibility is null or p_visibility not in ('discoverable', 'invite_only')
     or p_join_policy is null or p_join_policy not in ('open', 'approval', 'invite_only') then
    raise exception 'invalid_quiz_group' using errcode = '22023';
  end if;
  select institution_id into v_user_institution from public.profiles where id = v_user;
  if v_user_institution is distinct from p_institution_id then
    raise exception 'institution_mismatch' using errcode = '42501';
  end if;
  if p_institution_id is null or not exists (
    select 1 from public.institutions i where i.id = p_institution_id and i.is_active
  ) then
    raise exception 'invalid_institution' using errcode = '22023';
  end if;
  if p_department_id is not null and not exists (
    select 1 from public.academic_departments d
    where d.id = p_department_id and d.institution_id = p_institution_id and d.is_active
  ) then
    raise exception 'invalid_department' using errcode = '22023';
  end if;
  if p_course_id is not null and not exists (
    select 1 from public.academic_courses c
    join public.academic_departments d on d.id = c.department_id
    where c.id = p_course_id and c.is_active and d.is_active
      and d.institution_id = p_institution_id
      and (p_department_id is null or d.id = p_department_id)
  ) then
    raise exception 'invalid_course' using errcode = '22023';
  end if;
  insert into public.quiz_groups (name, description, institution_id, department_id, course_id, visibility, join_policy, created_by)
  values (btrim(p_name), btrim(coalesce(p_description, '')), p_institution_id, p_department_id, p_course_id,
    p_visibility, p_join_policy, v_user)
  returning id into v_group;
  insert into public.quiz_group_members (group_id, user_id, role, status)
  values (v_group, v_user, 'owner', 'active');
  return v_group;
end
$function$;

create function public.request_quiz_group_membership(p_group_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_group public.quiz_groups%rowtype;
  v_profile_institution uuid;
  v_status text;
begin
  if v_user is null or public.account_effective_status(v_user) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_group from public.quiz_groups where id = p_group_id for update;
  if not found then raise exception 'quiz_group_not_found' using errcode = 'P0002'; end if;
  if v_group.visibility = 'invite_only' or v_group.join_policy = 'invite_only' then
    raise exception 'invite_required' using errcode = '42501';
  end if;
  select institution_id into v_profile_institution from public.profiles where id = v_user;
  if v_profile_institution is distinct from v_group.institution_id then
    raise exception 'institution_mismatch' using errcode = '42501';
  end if;
  v_status := case when v_group.join_policy = 'open' then 'active' else 'pending' end;
  insert into public.quiz_group_members (group_id, user_id, status)
  values (p_group_id, v_user, v_status)
  on conflict (group_id, user_id) do update
    set status = excluded.status, updated_at = now()
    where public.quiz_group_members.status not in ('active', 'banned');
  if not found then
    select status into v_status from public.quiz_group_members
    where group_id = p_group_id and user_id = v_user;
    if v_status = 'banned' then raise exception 'membership_forbidden' using errcode = '42501'; end if;
  end if;
  select status into v_status from public.quiz_group_members
  where group_id = p_group_id and user_id = v_user;
  return v_status;
end
$function$;

create function public.manage_quiz_group_member(p_group_id uuid, p_user_id uuid, p_action text)
returns text
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_status text;
begin
  if v_actor is null or public.account_effective_status(v_actor) <> 'active'
     or not campusconnect_private.internal_quiz_group_manager(p_group_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('invite', 'approve', 'reject', 'remove', 'ban', 'unban', 'promote', 'demote')
     or p_user_id is null or p_user_id = v_actor then
    raise exception 'invalid_membership_action' using errcode = '22023';
  end if;
  select role, status into v_role, v_status
  from public.quiz_group_members where group_id = p_group_id and user_id = p_user_id for update;
  if p_action = 'invite' then
    if public.account_effective_status(p_user_id) <> 'active'
       or not exists (select 1 from public.profiles p join public.quiz_groups g on g.id = p_group_id
         where p.id = p_user_id and p.institution_id = g.institution_id) then
      raise exception 'ineligible_member' using errcode = '22023';
    end if;
    insert into public.quiz_group_members (group_id, user_id, status, invited_by)
    values (p_group_id, p_user_id, 'invited', v_actor)
    on conflict (group_id, user_id) do update
      set status = 'invited', invited_by = v_actor, updated_at = now()
      where public.quiz_group_members.status in ('pending', 'invited');
    if found then return 'invited'; end if;
    select status into v_status from public.quiz_group_members
    where group_id = p_group_id and user_id = p_user_id;
    return v_status;
  end if;
  if not found then raise exception 'member_not_found' using errcode = 'P0002'; end if;
  if v_role = 'owner' then raise exception 'cannot_manage_group_owner' using errcode = '42501'; end if;
  if p_action in ('promote', 'demote') and not exists (
    select 1 from public.quiz_group_members
    where group_id = p_group_id and user_id = v_actor and role = 'owner' and status = 'active'
  ) then raise exception 'owner_required' using errcode = '42501'; end if;
  if p_action = 'approve' and v_status = 'pending' then
    update public.quiz_group_members set status = 'active' where group_id = p_group_id and user_id = p_user_id;
  elsif p_action = 'reject' and v_status = 'pending' then
    delete from public.quiz_group_members where group_id = p_group_id and user_id = p_user_id;
  elsif p_action = 'remove' and v_status = 'active' then
    delete from public.quiz_group_members where group_id = p_group_id and user_id = p_user_id;
  elsif p_action = 'ban' and v_status <> 'banned' then
    update public.quiz_group_members set status = 'banned', role = 'member'
    where group_id = p_group_id and user_id = p_user_id;
  elsif p_action = 'unban' and v_status = 'banned' then
    delete from public.quiz_group_members where group_id = p_group_id and user_id = p_user_id;
  elsif p_action = 'promote' and v_status = 'active' and v_role = 'member' then
    update public.quiz_group_members set role = 'moderator' where group_id = p_group_id and user_id = p_user_id;
  elsif p_action = 'demote' and v_status = 'active' and v_role = 'moderator' then
    update public.quiz_group_members set role = 'member' where group_id = p_group_id and user_id = p_user_id;
  else
    raise exception 'invalid_membership_transition' using errcode = '22023';
  end if;
  return p_action;
end
$function$;

create function public.respond_quiz_group_invite(p_group_id uuid, p_accept boolean)
returns text
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or public.account_effective_status(v_user) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.quiz_group_members
    where group_id = p_group_id and user_id = v_user and status = 'invited'
  ) then raise exception 'invite_not_found' using errcode = 'P0002'; end if;
  if p_accept then
    update public.quiz_group_members set status = 'active' where group_id = p_group_id and user_id = v_user;
    return 'active';
  end if;
  delete from public.quiz_group_members where group_id = p_group_id and user_id = v_user;
  return 'declined';
end
$function$;

create function public.leave_quiz_group(p_group_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (
    select 1 from public.quiz_group_members
    where group_id = p_group_id and user_id = v_user and role = 'owner' and status = 'active'
  ) then raise exception 'owner_must_transfer_or_delete_group' using errcode = '42501'; end if;
  delete from public.quiz_group_members where group_id = p_group_id and user_id = v_user and status = 'active';
  if not found then raise exception 'active_membership_not_found' using errcode = 'P0002'; end if;
end
$function$;

create function public.update_quiz_group(
  p_group_id uuid,
  p_name text,
  p_description text,
  p_visibility text,
  p_join_policy text
) returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or public.account_effective_status((select auth.uid())) <> 'active'
     or not campusconnect_private.internal_quiz_group_manager(p_group_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 3 and 100
     or char_length(coalesce(p_description, '')) > 1000
     or p_visibility is null or p_visibility not in ('discoverable', 'invite_only')
     or p_join_policy is null or p_join_policy not in ('open', 'approval', 'invite_only') then
    raise exception 'invalid_quiz_group' using errcode = '22023';
  end if;
  update public.quiz_groups
  set name = btrim(p_name), description = btrim(coalesce(p_description, '')),
      visibility = p_visibility, join_policy = p_join_policy
  where id = p_group_id;
end
$function$;

create function public.transfer_quiz_group_ownership(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_owner uuid := (select auth.uid());
begin
  if v_owner is null or public.account_effective_status(v_owner) <> 'active'
     or p_user_id is null or p_user_id = v_owner
     or not exists (
       select 1 from public.quiz_group_members
       where group_id = p_group_id and user_id = v_owner and role = 'owner' and status = 'active'
     ) then
    raise exception 'owner_required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.quiz_group_members
    where group_id = p_group_id and user_id = p_user_id and status = 'active' and role <> 'owner'
  ) or public.account_effective_status(p_user_id) <> 'active' then
    raise exception 'active_member_required' using errcode = '22023';
  end if;
  update public.quiz_group_members set role = 'moderator'
  where group_id = p_group_id and user_id = v_owner;
  update public.quiz_group_members set role = 'owner'
  where group_id = p_group_id and user_id = p_user_id;
end
$function$;

create function public.save_group_quiz(
  p_quiz_id uuid,
  p_group_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_closes_at timestamptz,
  p_duration_minutes smallint,
  p_answer_release text,
  p_answer_release_at timestamptz,
  p_questions jsonb,
  p_publish boolean
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_quiz uuid := p_quiz_id;
  v_group uuid := p_group_id;
  v_count integer;
begin
  if v_user is null or public.account_effective_status(v_user) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 120
     or char_length(coalesce(p_description, '')) > 1000
     or p_starts_at is null
     or (p_closes_at is not null and p_closes_at <= p_starts_at)
     or p_duration_minutes is null or p_duration_minutes not between 1 and 240
     or p_answer_release is null or p_answer_release not in ('immediately', 'after_close', 'at_time')
     or (p_answer_release = 'after_close' and p_closes_at is null)
     or ((p_answer_release = 'at_time') <> (p_answer_release_at is not null))
     or (p_answer_release_at is not null and p_answer_release_at < p_starts_at)
     or jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'invalid_group_quiz' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_questions);
  if v_count < 1 or v_count > 100 then raise exception 'question_count_out_of_range' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_questions) q(question)
    where jsonb_typeof(q.question) is distinct from 'object'
       or char_length(btrim(coalesce(q.question ->> 'prompt', ''))) not between 1 and 2000
       or jsonb_typeof(q.question -> 'options') is distinct from 'array'
       or jsonb_array_length(q.question -> 'options') not between 2 and 6
       or coalesce((q.question ->> 'correct_index')::integer, -1) not between 0 and jsonb_array_length(q.question -> 'options') - 1
       or exists (
         select 1 from jsonb_array_elements(q.question -> 'options') o(option)
         where jsonb_typeof(o.option) is distinct from 'string'
            or char_length(btrim(o.option #>> '{}')) not between 1 and 500
       )
  ) then raise exception 'invalid_group_quiz_question' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_questions) q(question)
    where char_length(coalesce(q.question ->> 'explanation', '')) > 2000
  ) then raise exception 'invalid_group_quiz_explanation' using errcode = '22023'; end if;

  if v_quiz is null then
    if not campusconnect_private.internal_quiz_group_manager(v_group) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    insert into public.group_quizzes (
      group_id, created_by, title, description, status, starts_at, closes_at,
      duration_minutes, answer_release, answer_release_at
    ) values (
      v_group, v_user, btrim(p_title), btrim(coalesce(p_description, '')),
      case when p_publish then 'published' else 'draft' end,
      p_starts_at, p_closes_at, p_duration_minutes, p_answer_release, p_answer_release_at
    ) returning id into v_quiz;
  else
    select q.group_id into v_group from public.group_quizzes q
    where q.id = v_quiz and q.created_by = v_user and q.status = 'draft' for update;
    if not found or not campusconnect_private.internal_quiz_group_manager(v_group) then
      raise exception 'quiz_not_editable' using errcode = '42501';
    end if;
    if exists (select 1 from public.group_quiz_attempts a where a.quiz_id = v_quiz) then
      raise exception 'quiz_has_attempts' using errcode = '42501';
    end if;
    update public.group_quizzes
    set title = btrim(p_title), description = btrim(coalesce(p_description, '')),
      status = case when p_publish then 'published' else 'draft' end,
      starts_at = p_starts_at, closes_at = p_closes_at, duration_minutes = p_duration_minutes,
      answer_release = p_answer_release, answer_release_at = p_answer_release_at
    where id = v_quiz;
    delete from public.group_quiz_questions where quiz_id = v_quiz;
  end if;

  with inserted_questions as (
    insert into public.group_quiz_questions (quiz_id, position, prompt, explanation)
    select v_quiz, q.ordinality::smallint, btrim(q.question ->> 'prompt'),
      btrim(coalesce(q.question ->> 'explanation', ''))
    from jsonb_array_elements(p_questions) with ordinality q(question, ordinality)
    returning id, position
  ), inserted_options as (
    insert into public.group_quiz_options (question_id, position, option_text)
    select iq.id, option.ordinality::smallint, btrim(option.value #>> '{}')
    from inserted_questions iq
    join jsonb_array_elements(p_questions) with ordinality q(question, ordinality)
      on q.ordinality = iq.position
    cross join jsonb_array_elements(q.question -> 'options') with ordinality option(value, ordinality)
    returning id, question_id, position
  )
  insert into public.group_quiz_answer_keys (question_id, correct_option_id)
  select iq.id, io.id
  from inserted_questions iq
  join jsonb_array_elements(p_questions) with ordinality q(question, ordinality)
    on q.ordinality = iq.position
  join inserted_options io on io.question_id = iq.id
    and io.position = ((q.question ->> 'correct_index')::integer + 1);
  return v_quiz;
end
$function$;

create function public.start_group_quiz(p_quiz_id uuid)
returns table (attempt_id uuid, started_at timestamptz, duration_minutes smallint, closes_at timestamptz)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_quiz public.group_quizzes%rowtype;
  v_attempt public.group_quiz_attempts%rowtype;
begin
  if v_user is null or public.account_effective_status(v_user) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_quiz from public.group_quizzes where id = p_quiz_id for update;
  if not found or v_quiz.status <> 'published'
     or not exists (
       select 1 from public.quiz_group_members m
       where m.group_id = v_quiz.group_id and m.user_id = v_user and m.status = 'active'
     ) then raise exception 'quiz_not_available' using errcode = '42501'; end if;
  if now() < v_quiz.starts_at or (v_quiz.closes_at is not null and now() >= v_quiz.closes_at) then
    raise exception 'quiz_not_open' using errcode = '22023';
  end if;
  insert into public.group_quiz_attempts (quiz_id, user_id)
  values (p_quiz_id, v_user)
  on conflict (quiz_id, user_id) do nothing;
  select * into v_attempt from public.group_quiz_attempts
  where quiz_id = p_quiz_id and user_id = v_user;
  if v_attempt.submitted_at is not null then raise exception 'quiz_already_submitted' using errcode = '22023'; end if;
  return query select v_attempt.id, v_attempt.started_at, v_quiz.duration_minutes, v_quiz.closes_at;
end
$function$;

create function public.submit_group_quiz(p_attempt_id uuid, p_answers jsonb)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_quiz uuid;
  v_started timestamptz;
  v_duration smallint;
  v_close timestamptz;
  v_total integer;
  v_correct integer;
  v_answered integer;
begin
  if v_user is null or public.account_effective_status(v_user) <> 'active'
     or jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select a.quiz_id, a.started_at, q.duration_minutes, q.closes_at
  into v_quiz, v_started, v_duration, v_close
  from public.group_quiz_attempts a
  join public.group_quizzes q on q.id = a.quiz_id
  join public.quiz_group_members m on m.group_id = q.group_id
  where a.id = p_attempt_id and a.user_id = v_user and a.submitted_at is null and m.user_id = v_user and m.status = 'active'
  for update of a;
  if not found then raise exception 'attempt_not_available' using errcode = '42501'; end if;
  if now() > v_started + make_interval(mins => v_duration)
     or (v_close is not null and now() >= v_close) then
    raise exception 'quiz_submission_window_closed' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_answers) a(answer)
    where jsonb_typeof(a.answer) is distinct from 'object'
       or (a.answer ->> 'question_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(a.answer ->> 'selected_option_id', '') <> ''
         and (a.answer ->> 'selected_option_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then raise exception 'invalid_quiz_answers' using errcode = '22023'; end if;
  if (select count(*) <> count(distinct a.answer ->> 'question_id')
      from jsonb_array_elements(p_answers) a(answer)) then
    raise exception 'duplicate_quiz_answer' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_answers) a(answer)
    where not exists (
      select 1 from public.group_quiz_questions q
      where q.id = (a.answer ->> 'question_id')::uuid and q.quiz_id = v_quiz
    )
    or coalesce(a.answer ->> 'selected_option_id', '') <> ''
      and not exists (
        select 1 from public.group_quiz_options o
        join public.group_quiz_questions q on q.id = o.question_id
        where o.id = (a.answer ->> 'selected_option_id')::uuid
          and q.id = (a.answer ->> 'question_id')::uuid and q.quiz_id = v_quiz
      )
  ) then raise exception 'answer_not_in_quiz' using errcode = '22023'; end if;

  select count(*) into v_total from public.group_quiz_questions where quiz_id = v_quiz;
  select count(*) into v_answered from jsonb_array_elements(p_answers) a(answer)
    where coalesce(a.answer ->> 'selected_option_id', '') <> '';
  select count(*) into v_correct
  from jsonb_array_elements(p_answers) a(answer)
  join public.group_quiz_answer_keys k
    on k.question_id = (a.answer ->> 'question_id')::uuid
   and k.correct_option_id = (a.answer ->> 'selected_option_id')::uuid;
  insert into public.group_quiz_answers (attempt_id, question_id, selected_option_id)
  select p_attempt_id, (a.answer ->> 'question_id')::uuid,
    nullif(a.answer ->> 'selected_option_id', '')::uuid
  from jsonb_array_elements(p_answers) a(answer);
  update public.group_quiz_attempts
  set submitted_at = now(), score = v_correct,
      percentage = round(v_correct::numeric * 100 / greatest(v_total, 1), 2),
      correct_count = v_correct, incorrect_count = greatest(v_answered - v_correct, 0),
      unanswered_count = greatest(v_total - v_answered, 0)
  where id = p_attempt_id;
end
$function$;

create function public.group_quiz_attempt_result(p_attempt_id uuid)
returns table (
  attempt_id uuid, quiz_id uuid, quiz_title text, user_id uuid, submitted_at timestamptz,
  score integer, percentage numeric, correct_count integer, incorrect_count integer, unanswered_count integer,
  question_id uuid, "position" smallint, prompt text, explanation text, selected_option_id uuid,
  correct_option_id uuid, is_correct boolean
)
language sql stable security definer set search_path = ''
as $function$
  select a.id, q.id, q.title, a.user_id, a.submitted_at, a.score, a.percentage,
    a.correct_count, a.incorrect_count, a.unanswered_count,
    question.id, question.position, question.prompt,
    case when campusconnect_private.internal_quiz_result_released(a.id)
      then question.explanation else '' end,
    answer.selected_option_id,
    case when campusconnect_private.internal_quiz_result_released(a.id)
      then key.correct_option_id else null end,
    case when campusconnect_private.internal_quiz_result_released(a.id)
      then answer.selected_option_id = key.correct_option_id else null end
  from public.group_quiz_attempts a
  join public.group_quizzes q on q.id = a.quiz_id
  join public.group_quiz_questions question on question.quiz_id = q.id
  left join public.group_quiz_answers answer on answer.attempt_id = a.id and answer.question_id = question.id
  left join public.group_quiz_answer_keys key on key.question_id = question.id
  where a.id = p_attempt_id
    and (
      a.user_id = (select auth.uid())
      or campusconnect_private.internal_quiz_group_manager(q.group_id)
    )
    and campusconnect_private.internal_quiz_result_released(a.id)
  order by question.position
$function$;

create function public.group_quiz_leaderboard(p_quiz_id uuid)
returns table (user_id uuid, username text, display_name text, score integer, percentage numeric, submitted_at timestamptz)
language sql stable security definer set search_path = ''
as $function$
  select a.user_id, p.username, p.display_name, a.score, a.percentage, a.submitted_at
  from public.group_quiz_attempts a
  join public.group_quizzes q on q.id = a.quiz_id
  join public.profiles p on p.id = a.user_id
  where q.id = p_quiz_id
    and a.submitted_at is not null
    and public.account_effective_status((select auth.uid())) = 'active'
    and campusconnect_private.internal_quiz_group_manager(q.group_id)
    and exists (
      select 1 from public.quiz_group_members m
      where m.group_id = q.group_id and m.user_id = (select auth.uid()) and m.status = 'active'
    )
    and (
      q.answer_release = 'immediately'
      or (q.answer_release = 'after_close' and q.closes_at is not null and now() >= q.closes_at)
      or (q.answer_release = 'at_time' and q.answer_release_at <= now())
    )
  order by a.score desc, a.submitted_at asc
$function$;

create function public.group_quiz_performance(p_quiz_id uuid)
returns table (
  attempt_id uuid,
  user_id uuid,
  username text,
  display_name text,
  membership_role text,
  started_at timestamptz,
  submitted_at timestamptz,
  score integer,
  percentage numeric,
  correct_count integer,
  incorrect_count integer,
  unanswered_count integer
)
language sql stable security definer set search_path = ''
as $function$
  select a.id, m.user_id, p.username, p.display_name, m.role,
    a.started_at, a.submitted_at, a.score, a.percentage,
    a.correct_count, a.incorrect_count, a.unanswered_count
  from public.group_quizzes q
  join public.quiz_group_members m on m.group_id = q.group_id and m.status = 'active'
  join public.profiles p on p.id = m.user_id
  left join public.group_quiz_attempts a on a.quiz_id = q.id and a.user_id = m.user_id
  where q.id = p_quiz_id
    and public.account_effective_status((select auth.uid())) = 'active'
    and campusconnect_private.internal_quiz_group_manager(q.group_id)
    and exists (
      select 1 from public.quiz_group_members manager
      where manager.group_id = q.group_id and manager.user_id = (select auth.uid())
        and manager.status = 'active' and manager.role in ('owner', 'moderator')
    )
  order by p.display_name, p.username
$function$;

revoke all on function public.create_quiz_group(text, text, uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.request_quiz_group_membership(uuid) from public, anon, authenticated;
revoke all on function public.manage_quiz_group_member(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.respond_quiz_group_invite(uuid, boolean) from public, anon, authenticated;
revoke all on function public.leave_quiz_group(uuid) from public, anon, authenticated;
revoke all on function public.update_quiz_group(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.transfer_quiz_group_ownership(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_group_quiz(uuid, uuid, text, text, timestamptz, timestamptz, smallint, text, timestamptz, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.start_group_quiz(uuid) from public, anon, authenticated;
revoke all on function public.submit_group_quiz(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.group_quiz_attempt_result(uuid) from public, anon, authenticated;
revoke all on function public.group_quiz_leaderboard(uuid) from public, anon, authenticated;
revoke all on function public.group_quiz_performance(uuid) from public, anon, authenticated;
grant execute on function public.create_quiz_group(text, text, uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.request_quiz_group_membership(uuid) to authenticated;
grant execute on function public.manage_quiz_group_member(uuid, uuid, text) to authenticated;
grant execute on function public.respond_quiz_group_invite(uuid, boolean) to authenticated;
grant execute on function public.leave_quiz_group(uuid) to authenticated;
grant execute on function public.update_quiz_group(uuid, text, text, text, text) to authenticated;
grant execute on function public.transfer_quiz_group_ownership(uuid, uuid) to authenticated;
grant execute on function public.save_group_quiz(uuid, uuid, text, text, timestamptz, timestamptz, smallint, text, timestamptz, jsonb, boolean) to authenticated;
grant execute on function public.start_group_quiz(uuid) to authenticated;
grant execute on function public.submit_group_quiz(uuid, jsonb) to authenticated;
grant execute on function public.group_quiz_attempt_result(uuid) to authenticated;
grant execute on function public.group_quiz_leaderboard(uuid) to authenticated;
grant execute on function public.group_quiz_performance(uuid) to authenticated;

do $postflight$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.quiz_groups'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.quiz_group_members'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.group_quizzes'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.group_quiz_questions'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.group_quiz_options'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.group_quiz_answer_keys'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.group_quiz_attempts'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.group_quiz_answers'::regclass) then
    raise exception 'Group Quiz RLS postflight failed';
  end if;
  if has_table_privilege('authenticated', 'public.group_quiz_answer_keys', 'select')
     or has_table_privilege('anon', 'public.group_quiz_answer_keys', 'select') then
    raise exception 'Group Quiz answer keys must not be readable by client roles';
  end if;
  if has_function_privilege('anon', 'public.submit_group_quiz(uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.group_quiz_attempt_result(uuid)', 'execute') then
    raise exception 'Anonymous Group Quiz RPC access remains enabled';
  end if;
end
$postflight$;

commit;
