-- Require a Whiteshirt board URL on new or changed celebration cards.
-- Existing rows are not backfilled; owners must add a valid link before editing them.
-- MANUAL REVIEW ONLY. Run against the CampusConnect Supabase project.
begin;

do $preflight$
begin
  if to_regclass('public.celebration_cards') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'celebration_cards'
         and column_name = 'whiteshirt_url'
     ) then
    raise exception 'The existing celebration_cards.whiteshirt_url column is required';
  end if;
end
$preflight$;

do $constraint$
declare
  v_constraint oid;
begin
  select c.oid into v_constraint
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.celebration_cards'::regclass
    and c.conname = 'celebration_cards_whiteshirt_required_check';

  if v_constraint is null then
    alter table public.celebration_cards
      add constraint celebration_cards_whiteshirt_required_check
      check (whiteshirt_url is not null) not valid;
  elsif lower(pg_catalog.pg_get_constraintdef(v_constraint)) not like '%whiteshirt_url is not null%' then
    raise exception 'The Whiteshirt-required constraint exists with a different definition; inspect it before proceeding';
  end if;
end
$constraint$;

do $postflight$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.celebration_cards'::regclass
      and c.conname = 'celebration_cards_whiteshirt_required_check'
      and lower(pg_catalog.pg_get_constraintdef(c.oid)) like '%whiteshirt_url is not null%'
  ) then
    raise exception 'Whiteshirt celebration link requirement was not installed';
  end if;
end
$postflight$;

commit;
