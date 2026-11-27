-- Store immutable quiz attempts and grade answers without exposing answer keys.
begin;

do $preflight$
begin
  if to_regclass('public.learning_quizzes') is null
     or to_regclass('public.learning_quiz_questions') is null
     or to_regclass('public.learning_quiz_options') is null
     or to_regclass('public.learning_quiz_answer_keys') is null
     or to_regprocedure('public.account_effective_status(uuid)') is null then
    raise exception 'Quiz submissions require the learning quiz library and account status helper';
  end if;
  if to_regclass('public.learning_quiz_attempts') is not null
     or to_regclass('public.learning_quiz_attempt_answers') is not null then
    raise exception 'Quiz attempt relations already exist; inspect the schema before applying this migration';
  end if;
end
$preflight$;

create table public.learning_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.learning_quizzes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  correct_count smallint not null default 0 check (correct_count >= 0),
  total_questions smallint not null check (total_questions between 1 and 100),
  score_percent numeric(5, 2) not null default 0 check (score_percent between 0 and 100),
  check (correct_count <= total_questions)
);

create index learning_quiz_attempts_user_submitted_idx
  on public.learning_quiz_attempts (user_id, submitted_at desc);
create index learning_quiz_attempts_user_quiz_submitted_idx
  on public.learning_quiz_attempts (user_id, quiz_id, submitted_at desc);

create table public.learning_quiz_attempt_answers (
  attempt_id uuid not null references public.learning_quiz_attempts(id) on delete cascade,
  position smallint not null check (position between 1 and 100),
  question_type text not null check (question_type in ('multiple_choice', 'true_false', 'short_answer')),
  prompt text not null check (char_length(prompt) between 1 and 1500),
  submitted_answer text check (submitted_answer is null or char_length(submitted_answer) <= 300),
  correct_answer text not null check (char_length(correct_answer) between 1 and 300),
  is_correct boolean not null,
  explanation text not null default '' check (char_length(explanation) <= 1000),
  primary key (attempt_id, position)
);

alter table public.learning_quiz_attempts enable row level security;
alter table public.learning_quiz_attempt_answers enable row level security;

grant select on public.learning_quiz_attempts, public.learning_quiz_attempt_answers to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.learning_quiz_attempts, public.learning_quiz_attempt_answers
  from anon, authenticated;

create policy learning_quiz_attempts_select_own on public.learning_quiz_attempts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and public.account_effective_status((select auth.uid())) = 'active'
  );
create policy learning_quiz_attempt_answers_select_own on public.learning_quiz_attempt_answers
  for select to authenticated
  using (
    exists (
      select 1
      from public.learning_quiz_attempts attempt
      where attempt.id = attempt_id
        and attempt.user_id = (select auth.uid())
        and public.account_effective_status((select auth.uid())) = 'active'
    )
  );

revoke select on public.learning_quiz_questions from authenticated;
grant select (id, quiz_id, position, question_type, prompt, created_at)
  on public.learning_quiz_questions to authenticated;

create function public.get_learning_quiz_questions_for_owner(p_quiz_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_questions jsonb;
begin
  if v_user is null or public.account_effective_status(v_user) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.learning_quizzes
    where id = p_quiz_id and owner_id = v_user
  ) then
    raise exception 'learning_quiz_not_found' using errcode = 'P0002';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', question.id,
        'quiz_id', question.quiz_id,
        'position', question.position,
        'question_type', question.question_type,
        'prompt', question.prompt,
        'explanation', question.explanation,
        'options', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', option.id,
              'question_id', option.question_id,
              'position', option.position,
              'option_text', option.option_text
            ) order by option.position
          )
          from public.learning_quiz_options option
          where option.question_id = question.id
        ), '[]'::jsonb),
        'answer_option_id', answer_key.answer_option_id,
        'answer_text', answer_key.answer_text
      ) order by question.position
    ),
    '[]'::jsonb
  )
  into v_questions
  from public.learning_quiz_questions question
  left join public.learning_quiz_answer_keys answer_key
    on answer_key.question_id = question.id
  where question.quiz_id = p_quiz_id;

  return v_questions;
end;
$function$;

revoke all on function public.get_learning_quiz_questions_for_owner(uuid)
  from public, anon, authenticated;
grant execute on function public.get_learning_quiz_questions_for_owner(uuid)
  to authenticated;

create function public.submit_learning_quiz(p_quiz_id uuid, p_answers jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_question record;
  v_answer jsonb;
  v_total integer;
  v_answer_count integer;
  v_attempt_id uuid;
  v_selected_option_id uuid;
  v_correct_option_id uuid;
  v_selected_option_text text;
  v_correct_option_text text;
  v_correct_answer_text text;
  v_submitted_answer text;
  v_normalized_answer text;
  v_normalized_correct_answer text;
  v_correct boolean;
  v_correct_count integer := 0;
begin
  if v_user is null or public.account_effective_status(v_user) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform 1
  from public.learning_quizzes
  where id = p_quiz_id and status = 'published'
  for share;
  if not found then
    raise exception 'published_quiz_not_found' using errcode = 'P0002';
  end if;

  if p_answers is null or jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'invalid_learning_quiz_answers' using errcode = '22023';
  end if;

  select count(*) into v_total
  from public.learning_quiz_questions
  where quiz_id = p_quiz_id;
  v_answer_count := jsonb_array_length(p_answers);
  if v_total < 1 or v_total > 100 or v_answer_count <> v_total then
    raise exception 'learning_quiz_answer_count_mismatch' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_answers) as item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
       or coalesce(item.value ->> 'question_id', '') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'invalid_learning_quiz_answers' using errcode = '22023';
  end if;

  if (
    select count(distinct item.value ->> 'question_id')
    from jsonb_array_elements(p_answers) as item(value)
  ) <> v_answer_count or exists (
    select 1
    from jsonb_array_elements(p_answers) as item(value)
    where not exists (
      select 1
      from public.learning_quiz_questions question
      where question.quiz_id = p_quiz_id
        and question.id::text = item.value ->> 'question_id'
    )
  ) then
    raise exception 'invalid_learning_quiz_answers' using errcode = '22023';
  end if;

  insert into public.learning_quiz_attempts (quiz_id, user_id, total_questions)
  values (p_quiz_id, v_user, v_total)
  returning id into v_attempt_id;

  for v_question in
    select question.id, question.position, question.question_type, question.prompt, question.explanation
    from public.learning_quiz_questions question
    where question.quiz_id = p_quiz_id
    order by question.position
  loop
    select item.value into v_answer
    from jsonb_array_elements(p_answers) as item(value)
    where item.value ->> 'question_id' = v_question.id::text;

    if (v_answer ? 'selected_option_id'
        and jsonb_typeof(v_answer -> 'selected_option_id') not in ('string', 'null'))
       or (v_answer ? 'answer_text'
        and jsonb_typeof(v_answer -> 'answer_text') not in ('string', 'null')) then
      raise exception 'invalid_learning_quiz_answer' using errcode = '22023';
    end if;

    v_selected_option_id := nullif(v_answer ->> 'selected_option_id', '')::uuid;
    v_submitted_answer := nullif(btrim(coalesce(v_answer ->> 'answer_text', '')), '');
    v_correct_option_id := null;
    v_selected_option_text := null;
    v_correct_option_text := null;
    v_correct_answer_text := null;

    if v_question.question_type = 'short_answer' then
      if v_selected_option_id is not null
         or char_length(coalesce(v_answer ->> 'answer_text', '')) > 300 then
        raise exception 'invalid_learning_quiz_answer' using errcode = '22023';
      end if;
      select answer_key.answer_text
        into v_correct_answer_text
      from public.learning_quiz_answer_keys answer_key
      where answer_key.question_id = v_question.id;
      if not found then
        raise exception 'learning_quiz_answer_key_missing' using errcode = 'P0001';
      end if;
      v_normalized_answer := btrim(regexp_replace(coalesce(v_submitted_answer, ''), '[[:space:]]+', ' ', 'g'));
      v_normalized_correct_answer := btrim(regexp_replace(v_correct_answer_text, '[[:space:]]+', ' ', 'g'));
      v_correct := v_normalized_answer <> ''
        and lower(v_normalized_answer) = lower(v_normalized_correct_answer);
    else
      if nullif(btrim(coalesce(v_answer ->> 'answer_text', '')), '') is not null then
        raise exception 'invalid_learning_quiz_answer' using errcode = '22023';
      end if;
      if v_selected_option_id is not null then
        select option.option_text into v_selected_option_text
        from public.learning_quiz_options option
        where option.id = v_selected_option_id
          and option.question_id = v_question.id;
        if not found then
          raise exception 'invalid_learning_quiz_option' using errcode = '22023';
        end if;
      end if;
      select answer_key.answer_option_id, option.option_text
        into v_correct_option_id, v_correct_option_text
      from public.learning_quiz_answer_keys answer_key
      left join public.learning_quiz_options option
        on option.id = answer_key.answer_option_id
       and option.question_id = answer_key.question_id
      where answer_key.question_id = v_question.id;
      if not found then
        raise exception 'learning_quiz_answer_key_missing' using errcode = 'P0001';
      end if;
      v_correct := v_selected_option_id is not null
        and v_selected_option_id = v_correct_option_id;
      v_correct_answer_text := v_correct_option_text;
      v_submitted_answer := v_selected_option_text;
    end if;

    if v_correct then
      v_correct_count := v_correct_count + 1;
    end if;
    insert into public.learning_quiz_attempt_answers (
      attempt_id, position, question_type, prompt, submitted_answer, correct_answer, is_correct, explanation
    ) values (
      v_attempt_id, v_question.position, v_question.question_type, v_question.prompt,
      v_submitted_answer, v_correct_answer_text, v_correct, v_question.explanation
    );
  end loop;

  update public.learning_quiz_attempts
  set correct_count = v_correct_count,
      score_percent = round(100.0 * v_correct_count / v_total, 2)
  where id = v_attempt_id;

  return v_attempt_id;
end;
$function$;

revoke all on function public.submit_learning_quiz(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_learning_quiz(uuid, jsonb) to authenticated;

do $postflight$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.learning_quiz_attempts'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.learning_quiz_attempt_answers'::regclass) then
    raise exception 'Learning quiz attempt RLS postflight failed';
  end if;
  if has_table_privilege('authenticated', 'public.learning_quiz_attempts', 'INSERT')
     or has_table_privilege('authenticated', 'public.learning_quiz_attempt_answers', 'INSERT')
     or has_column_privilege('authenticated', 'public.learning_quiz_questions', 'explanation', 'SELECT')
     or has_function_privilege('anon', 'public.get_learning_quiz_questions_for_owner(uuid)', 'execute')
     or has_function_privilege('anon', 'public.submit_learning_quiz(uuid,jsonb)', 'execute') then
    raise exception 'Quiz answers and explanations must remain protected by owner and attempt policies';
  end if;
end;
$postflight$;

commit;
