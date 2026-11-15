-- Flashcard collections, cards, and private per-student review progress.
begin;

do $preflight$
begin
  if to_regclass('public.academic_courses') is null
     or to_regclass('public.account_standing') is null
     or to_regprocedure('public.account_effective_status(uuid)') is null then
    raise exception 'Flashcards require the academic catalog and account status helpers';
  end if;
  if to_regclass('public.flashcard_collections') is not null
     or to_regclass('public.flashcards') is not null
     or to_regclass('public.flashcard_progress') is not null then
    raise exception 'A flashcard relation already exists; inspect the schema before applying this migration';
  end if;
end;
$preflight$;

create table public.flashcard_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.academic_courses(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index flashcard_collections_owner_updated_idx
  on public.flashcard_collections (owner_id, updated_at desc);
create index flashcard_collections_public_updated_idx
  on public.flashcard_collections (updated_at desc)
  where is_public;
create index flashcard_collections_course_public_idx
  on public.flashcard_collections (course_id, updated_at desc)
  where is_public and course_id is not null;
create trigger flashcard_collections_updated_at
  before update on public.flashcard_collections
  for each row execute function public.set_updated_at();

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.flashcard_collections(id) on delete cascade,
  prompt text not null check (char_length(btrim(prompt)) between 1 and 2000),
  answer text not null check (char_length(btrim(answer)) between 1 and 4000),
  position integer not null check (position between 1 and 400),
  created_at timestamptz not null default now(),
  unique (collection_id, position)
);

create index flashcards_collection_position_idx
  on public.flashcards (collection_id, position);

create table public.flashcard_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  flashcard_id uuid not null references public.flashcards(id) on delete cascade,
  status text not null check (status in ('known', 'needs_practice', 'review_again')),
  review_count integer not null default 1 check (review_count > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, flashcard_id)
);

create index flashcard_progress_user_updated_idx
  on public.flashcard_progress (user_id, updated_at desc);

alter table public.flashcard_collections enable row level security;
alter table public.flashcards enable row level security;
alter table public.flashcard_progress enable row level security;

grant select, delete on public.flashcard_collections to authenticated;
grant select on public.flashcards, public.flashcard_progress to authenticated;

create policy flashcard_collections_select on public.flashcard_collections
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and (owner_id = (select auth.uid()) or is_public)
  );

create policy flashcard_collections_delete_own on public.flashcard_collections
  for delete to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and owner_id = (select auth.uid())
  );

create policy flashcards_select_visible_collection on public.flashcards
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and exists (
      select 1
      from public.flashcard_collections c
      where c.id = collection_id
        and (c.owner_id = (select auth.uid()) or c.is_public)
    )
  );

create policy flashcard_progress_select_own on public.flashcard_progress
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and user_id = (select auth.uid())
  );

create function public.save_flashcard_collection(
  p_collection_id uuid,
  p_course_id uuid,
  p_title text,
  p_description text,
  p_is_public boolean,
  p_cards jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_collection_id uuid := p_collection_id;
  v_card_count integer;
begin
  if v_uid is null or public.account_effective_status(v_uid) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 120 then
    raise exception 'invalid_flashcard_title' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 1000 then
    raise exception 'invalid_flashcard_description' using errcode = '22023';
  end if;
  if p_is_public is null then
    raise exception 'invalid_flashcard_visibility' using errcode = '22023';
  end if;
  if jsonb_typeof(p_cards) is distinct from 'array' then
    raise exception 'invalid_flashcard_list' using errcode = '22023';
  end if;

  v_card_count := jsonb_array_length(p_cards);
  if v_card_count < 1 or v_card_count > 200 then
    raise exception 'flashcard_count_out_of_range' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_cards) as item(card)
    where jsonb_typeof(item.card) is distinct from 'object'
       or char_length(btrim(coalesce(item.card ->> 'prompt', ''))) not between 1 and 2000
       or char_length(btrim(coalesce(item.card ->> 'answer', ''))) not between 1 and 4000
       or (
         item.card ? 'id'
         and (item.card ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       )
  ) then
    raise exception 'invalid_flashcard_content' using errcode = '22023';
  end if;
  if (
    select count(*) <> count(distinct item.card ->> 'id')
    from jsonb_array_elements(p_cards) as item(card)
    where item.card ? 'id'
  ) then
    raise exception 'duplicate_flashcard_id' using errcode = '22023';
  end if;
  if p_course_id is not null and not exists (
    select 1 from public.academic_courses c
    join public.academic_departments d on d.id = c.department_id
    join public.institutions i on i.id = d.institution_id
    where c.id = p_course_id and c.is_active and d.is_active and i.is_active
  ) then
    raise exception 'invalid_flashcard_course' using errcode = '22023';
  end if;

  if v_collection_id is null then
    if exists (
      select 1 from jsonb_array_elements(p_cards) as item(card)
      where item.card ? 'id'
    ) then
      raise exception 'invalid_flashcard_id' using errcode = '22023';
    end if;
    insert into public.flashcard_collections (owner_id, course_id, title, description, is_public)
    values (v_uid, p_course_id, btrim(p_title), btrim(coalesce(p_description, '')), p_is_public)
    returning id into v_collection_id;
  else
    perform 1
    from public.flashcard_collections c
    where c.id = v_collection_id and c.owner_id = v_uid
    for update;
    if not found then
      raise exception 'flashcard_collection_not_found' using errcode = 'P0002';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_cards) as item(card)
      where item.card ? 'id'
        and not exists (
          select 1 from public.flashcards f
          where f.id = (item.card ->> 'id')::uuid
            and f.collection_id = v_collection_id
        )
    ) then
      raise exception 'invalid_flashcard_id' using errcode = '22023';
    end if;
    update public.flashcard_collections
    set course_id = p_course_id,
        title = btrim(p_title),
        description = btrim(coalesce(p_description, '')),
        is_public = p_is_public
    where id = v_collection_id;
    update public.flashcards
    set position = position + 200
    where collection_id = v_collection_id;
    delete from public.flashcards f
    where f.collection_id = v_collection_id
      and not exists (
        select 1
        from jsonb_array_elements(p_cards) as item(card)
        where item.card ->> 'id' = f.id::text
      );
    update public.flashcards f
    set prompt = btrim(item.card ->> 'prompt'),
        answer = btrim(item.card ->> 'answer'),
        position = item.position::integer
    from jsonb_array_elements(p_cards) with ordinality as item(card, position)
    where item.card ? 'id'
      and f.id = (item.card ->> 'id')::uuid
      and f.collection_id = v_collection_id;
  end if;

  insert into public.flashcards (collection_id, prompt, answer, position)
  select v_collection_id,
         btrim(item.card ->> 'prompt'),
         btrim(item.card ->> 'answer'),
         item.position::integer
  from jsonb_array_elements(p_cards) with ordinality as item(card, position)
  where not (item.card ? 'id');

  return v_collection_id;
end;
$function$;

create function public.record_flashcard_review(
  p_flashcard_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or public.account_effective_status(v_uid) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('known', 'needs_practice', 'review_again') then
    raise exception 'invalid_flashcard_review_status' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.flashcards f
    join public.flashcard_collections c on c.id = f.collection_id
    where f.id = p_flashcard_id
      and (c.owner_id = v_uid or c.is_public)
  ) then
    raise exception 'flashcard_not_found' using errcode = 'P0002';
  end if;

  insert into public.flashcard_progress (user_id, flashcard_id, status)
  values (v_uid, p_flashcard_id, p_status)
  on conflict (user_id, flashcard_id) do update
  set status = excluded.status,
      review_count = public.flashcard_progress.review_count + 1,
      updated_at = now();
end;
$function$;

revoke all on function public.save_flashcard_collection(uuid, uuid, text, text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_flashcard_collection(uuid, uuid, text, text, boolean, jsonb)
  to authenticated;
revoke all on function public.record_flashcard_review(uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_flashcard_review(uuid, text)
  to authenticated;

do $postflight$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.flashcard_collections'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.flashcards'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.flashcard_progress'::regclass) then
    raise exception 'Flashcard RLS postflight failed';
  end if;
  if has_table_privilege('authenticated', 'public.flashcards', 'INSERT')
     or has_table_privilege('authenticated', 'public.flashcards', 'UPDATE')
     or has_table_privilege('authenticated', 'public.flashcard_progress', 'INSERT')
     or has_table_privilege('authenticated', 'public.flashcard_progress', 'UPDATE') then
    raise exception 'Flashcard writes must go through the checked RPCs';
  end if;
  if has_function_privilege('anon', 'public.save_flashcard_collection(uuid,uuid,text,text,boolean,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.record_flashcard_review(uuid,text)', 'execute') then
    raise exception 'Anonymous flashcard RPC access remains enabled';
  end if;
end;
$postflight$;

commit;
