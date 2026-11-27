-- Persist standalone quiz drafts and publish question sets to the learning library.
begin;

do $preflight$
begin
  if to_regclass('public.academic_courses') is null
     or to_regprocedure('public.account_effective_status(uuid)') is null then
    raise exception 'The quiz library requires the academic catalog and account status helper';
  end if;
  if to_regclass('public.learning_quizzes') is not null
     or to_regclass('public.learning_quiz_questions') is not null
     or to_regclass('public.learning_quiz_options') is not null
     or to_regclass('public.learning_quiz_answer_keys') is not null then
    raise exception 'Quiz library relations already exist; inspect the schema before applying this migration';
  end if;
end
$preflight$;

create table public.learning_quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_quizzes_course_id_fkey
    foreign key (course_id) references public.academic_courses(id) on delete set null,
  check ((status = 'published') = (published_at is not null))
);

create index learning_quizzes_owner_updated_idx
  on public.learning_quizzes (owner_id, updated_at desc);
create index learning_quizzes_published_updated_idx
  on public.learning_quizzes (updated_at desc)
  where status = 'published';
create index learning_quizzes_course_published_idx
  on public.learning_quizzes (course_id, updated_at desc)
  where status = 'published' and course_id is not null;
create trigger learning_quizzes_updated_at
  before update on public.learning_quizzes
  for each row execute function public.set_updated_at();

create table public.learning_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null,
  position smallint not null check (position between 1 and 100),
  question_type text not null check (question_type in ('multiple_choice', 'true_false', 'short_answer')),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 1500),
  explanation text not null default '' check (char_length(explanation) <= 1000),
  created_at timestamptz not null default now(),
  constraint learning_quiz_questions_quiz_id_fkey foreign key (quiz_id)
    references public.learning_quizzes(id) on delete cascade,
  unique (quiz_id, position),
  unique (quiz_id, id)
);
create index learning_quiz_questions_quiz_position_idx
  on public.learning_quiz_questions (quiz_id, position);

create table public.learning_quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null,
  position smallint not null check (position between 1 and 6),
  option_text text not null check (char_length(btrim(option_text)) between 1 and 300),
  constraint learning_quiz_options_question_id_fkey foreign key (question_id)
    references public.learning_quiz_questions(id) on delete cascade,
  unique (question_id, position),
  unique (question_id, id)
);

create table public.learning_quiz_answer_keys (
  question_id uuid primary key,
  answer_option_id uuid,
  answer_text text,
  constraint learning_quiz_answer_keys_question_id_fkey foreign key (question_id)
    references public.learning_quiz_questions(id) on delete cascade,
  constraint learning_quiz_answer_keys_option_fkey
    foreign key (question_id, answer_option_id)
    references public.learning_quiz_options(question_id, id) on delete cascade,
  check (
    (answer_option_id is not null and answer_text is null)
    or (answer_option_id is null and answer_text is not null and char_length(btrim(answer_text)) between 1 and 300)
  )
);

alter table public.learning_quizzes enable row level security;
alter table public.learning_quiz_questions enable row level security;
alter table public.learning_quiz_options enable row level security;
alter table public.learning_quiz_answer_keys enable row level security;

grant select on public.learning_quizzes, public.learning_quiz_questions,
  public.learning_quiz_options, public.learning_quiz_answer_keys to authenticated;

create policy learning_quizzes_select on public.learning_quizzes
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and (owner_id = (select auth.uid()) or status = 'published')
  );
create policy learning_quiz_questions_select on public.learning_quiz_questions
  for select to authenticated
  using (
    exists (
      select 1 from public.learning_quizzes q
      where q.id = quiz_id
        and (q.owner_id = (select auth.uid()) or q.status = 'published')
    )
  );
create policy learning_quiz_options_select on public.learning_quiz_options
  for select to authenticated
  using (
    exists (
      select 1
      from public.learning_quiz_questions question
      join public.learning_quizzes quiz on quiz.id = question.quiz_id
      where question.id = question_id
        and (quiz.owner_id = (select auth.uid()) or quiz.status = 'published')
    )
  );
create policy learning_quiz_answer_keys_select_owner on public.learning_quiz_answer_keys
  for select to authenticated
  using (
    exists (
      select 1
      from public.learning_quiz_questions question
      join public.learning_quizzes quiz on quiz.id = question.quiz_id
      where question.id = learning_quiz_answer_keys.question_id
        and quiz.owner_id = (select auth.uid())
    )
  );

create function public.save_learning_quiz(
  p_quiz_id uuid,
  p_course_id uuid,
  p_title text,
  p_description text,
  p_questions jsonb,
  p_publish boolean
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_quiz_id uuid := p_quiz_id;
  v_question_count integer;
  v_item record;
  v_option record;
  v_question_id uuid;
  v_option_id uuid;
  v_correct_option_id uuid;
  v_correct_index integer;
  v_option_count integer;
begin
  if v_user is null or public.account_effective_status(v_user) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 120
     or char_length(coalesce(p_description, '')) > 1000
     or p_publish is null
     or jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'invalid_learning_quiz' using errcode = '22023';
  end if;

  v_question_count := jsonb_array_length(p_questions);
  if v_question_count < 1 or v_question_count > 100 then
    raise exception 'question_count_out_of_range' using errcode = '22023';
  end if;
  if p_course_id is not null and not exists (
    select 1
    from public.academic_courses c
    join public.academic_departments d on d.id = c.department_id
    join public.institutions i on i.id = d.institution_id
    where c.id = p_course_id and c.is_active and d.is_active and i.is_active
  ) then
    raise exception 'invalid_learning_quiz_course' using errcode = '22023';
  end if;

  for v_item in
    select q.question, q.ordinality
    from jsonb_array_elements(p_questions) with ordinality as q(question, ordinality)
  loop
    if jsonb_typeof(v_item.question) is distinct from 'object'
       or coalesce(v_item.question ->> 'type', '') not in ('multiple_choice', 'true_false', 'short_answer')
       or char_length(btrim(coalesce(v_item.question ->> 'prompt', ''))) not between 1 and 1500
       or char_length(coalesce(v_item.question ->> 'explanation', '')) > 1000 then
      raise exception 'invalid_learning_quiz_question' using errcode = '22023';
    end if;

    if v_item.question ->> 'type' in ('multiple_choice', 'true_false') then
      if jsonb_typeof(v_item.question -> 'options') is distinct from 'array' then
        raise exception 'invalid_learning_quiz_options' using errcode = '22023';
      end if;
      v_option_count := jsonb_array_length(v_item.question -> 'options');
      if v_option_count < 2 or v_option_count > 6
         or coalesce((v_item.question ->> 'correct_index')::integer, -1) not between 0 and v_option_count - 1
         or exists (
           select 1
           from jsonb_array_elements(v_item.question -> 'options') as option(value)
           where jsonb_typeof(option.value) is distinct from 'string'
              or char_length(btrim(option.value #>> '{}')) not between 1 and 300
         ) then
        raise exception 'invalid_learning_quiz_options' using errcode = '22023';
      end if;
    elsif char_length(btrim(coalesce(v_item.question ->> 'answer', ''))) not between 1 and 300 then
      raise exception 'invalid_learning_quiz_answer' using errcode = '22023';
    end if;
  end loop;

  if v_quiz_id is null then
    insert into public.learning_quizzes (owner_id, course_id, title, description, status, published_at)
    values (
      v_user, p_course_id, btrim(p_title), btrim(coalesce(p_description, '')),
      case when p_publish then 'published' else 'draft' end,
      case when p_publish then now() else null end
    )
    returning id into v_quiz_id;
  else
    perform 1 from public.learning_quizzes
    where id = v_quiz_id and owner_id = v_user
    for update;
    if not found then
      raise exception 'learning_quiz_not_found' using errcode = 'P0002';
    end if;
    update public.learning_quizzes
    set course_id = p_course_id,
        title = btrim(p_title),
        description = btrim(coalesce(p_description, '')),
        status = case when p_publish then 'published' else 'draft' end,
        published_at = case when p_publish then coalesce(published_at, now()) else null end
    where id = v_quiz_id;
    delete from public.learning_quiz_questions where quiz_id = v_quiz_id;
  end if;

  for v_item in
    select q.question, q.ordinality
    from jsonb_array_elements(p_questions) with ordinality as q(question, ordinality)
  loop
    insert into public.learning_quiz_questions (quiz_id, position, question_type, prompt, explanation)
    values (
      v_quiz_id, v_item.ordinality::smallint, v_item.question ->> 'type',
      btrim(v_item.question ->> 'prompt'), btrim(coalesce(v_item.question ->> 'explanation', ''))
    )
    returning id into v_question_id;

    v_correct_option_id := null;
    if v_item.question ->> 'type' in ('multiple_choice', 'true_false') then
      v_correct_index := (v_item.question ->> 'correct_index')::integer;
      for v_option in
        select option.value #>> '{}' as option_text, option.ordinality
        from jsonb_array_elements(v_item.question -> 'options') with ordinality as option(value, ordinality)
      loop
        insert into public.learning_quiz_options (question_id, position, option_text)
        values (v_question_id, v_option.ordinality::smallint, btrim(v_option.option_text))
        returning id into v_option_id;
        if v_option.ordinality = v_correct_index + 1 then
          v_correct_option_id := v_option_id;
        end if;
      end loop;
      insert into public.learning_quiz_answer_keys (question_id, answer_option_id)
      values (v_question_id, v_correct_option_id);
    else
      insert into public.learning_quiz_answer_keys (question_id, answer_text)
      values (v_question_id, btrim(v_item.question ->> 'answer'));
    end if;
  end loop;

  return v_quiz_id;
end;
$function$;

revoke all on function public.save_learning_quiz(uuid, uuid, text, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.save_learning_quiz(uuid, uuid, text, text, jsonb, boolean)
  to authenticated;

do $postflight$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.learning_quizzes'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.learning_quiz_answer_keys'::regclass) then
    raise exception 'Learning quiz RLS postflight failed';
  end if;
  if has_table_privilege('authenticated', 'public.learning_quizzes', 'INSERT')
     or has_table_privilege('authenticated', 'public.learning_quiz_answer_keys', 'INSERT')
     or has_function_privilege('anon', 'public.save_learning_quiz(uuid,uuid,text,text,jsonb,boolean)', 'execute') then
    raise exception 'Learning quiz writes must use the authenticated RPC';
  end if;
end;
$postflight$;

commit;
