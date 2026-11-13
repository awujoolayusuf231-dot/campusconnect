-- LOCAL DATABASE ONLY. Run AFTER migrations up to A are applied and BEFORE migration B is applied.
-- Simulates a platform_settings row that already existed under one of B's keys, with a distinctive value and description.
-- Migration B must skip it (ON CONFLICT DO NOTHING) and the rollback must NOT delete it.
do $$ begin
  if exists (select 1 from auth.users where email is distinct from null and email not like '%@t.invalid') then
    raise exception 'REFUSING TO RUN: this database contains real accounts. Run only on a fresh LOCAL database.';
  end if;
  if to_regprocedure('public.record_post_impressions(uuid[])') is not null then
    raise exception 'Migration B is already applied; this test must start from a database where B is NOT applied.';
  end if;
end $$;
insert into public.platform_settings (key, value, value_type, description, is_public)
values ('impression_window_minutes', '45'::jsonb, 'number', 'PRE-EXISTING (must survive rollback)', false);
