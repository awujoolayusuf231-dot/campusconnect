-- LOCAL DOCKER DATABASE ONLY. Removes ONLY the concurrency-test accounts and their data.
-- Matches emails with the exact pattern conc_a<digits>@t.invalid / conc_v<digits>@t.invalid; deleting those auth users
-- cascades to their profiles, posts, analytics rows and dedupe ledgers. Nothing else is selected.
-- Safety guards: refuses if any real (non @t.invalid) account exists, and aborts if the pattern matches more than 30 users.
do $$
declare n int;
begin
  if exists (select 1 from auth.users where email is distinct from null and email not like '%@t.invalid') then
    raise exception 'REFUSING TO RUN: this database contains real accounts. Run only on a fresh LOCAL database.';
  end if;
  select count(*) into n from auth.users where email ~ '^conc_[av][0-9]+@t\.invalid$';
  if n > 30 then raise exception 'ABORTING: % accounts match the concurrency-test pattern (expected at most 30)', n; end if;
  delete from auth.users where email ~ '^conc_[av][0-9]+@t\.invalid$';
  raise notice 'deleted % concurrency-test accounts', n;
end $$;
drop table if exists public.conc_test_errors;
select (select count(*) from auth.users where email ~ '^conc_[av][0-9]+@t\.invalid$') as conc_accounts_left,
       (select count(*) from public.post_impression_seen) as impression_rows_left,
       (select count(*) from public.post_impression_daily) as daily_rows_left;   -- all should be 0 on a fresh local DB
