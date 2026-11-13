-- LOCAL DOCKER DATABASE ONLY. Creates COMMITTED test data (concurrency needs committed rows). NEVER run on a real database.
-- Safety guard: refuses to run if any account whose email does not end in '@t.invalid' exists.
-- Creates: 10 viewers (ids ...-c0b1 + 8 digits, emails conc_vN@t.invalid), 20 authors (ids ...-c0a1 + 8 digits, emails
-- conc_aN@t.invalid) and 200 public posts (10 per author, because posts_before_write allows at most 20 per author per hour),
-- ids md5('conc-post-N')::uuid for N = 1..200, plus an error-log table public.conc_test_errors used only by these tests.
do $$ begin
  if exists (select 1 from auth.users where email is distinct from null and email not like '%@t.invalid') then
    raise exception 'REFUSING TO RUN: this database contains real accounts. Run only on a fresh LOCAL database (supabase db reset).';
  end if;
end $$;

create table if not exists public.conc_test_errors (at timestamptz not null default now(), msg text not null);

insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-c0b1' || lpad(g::text, 8, '0'))::uuid, 'conc_v' || g || '@t.invalid', jsonb_build_object('username', 'conc_v' || g)
from generate_series(1, 10) g;

insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-c0a1' || lpad(g::text, 8, '0'))::uuid, 'conc_a' || g || '@t.invalid', jsonb_build_object('username', 'conc_a' || g)
from generate_series(1, 20) g;

update public.profiles set visibility = 'public' where username like 'conc\_%';

insert into public.posts (id, author_id, body)
select md5('conc-post-' || g)::uuid,
       ('00000000-0000-0000-0000-c0a1' || lpad((((g - 1) / 10) + 1)::text, 8, '0'))::uuid,
       'concurrency post ' || g
from generate_series(1, 200) g;

select (select count(*) from auth.users where email like 'conc\_%@t.invalid') as conc_accounts,
       (select count(*) from public.posts p join public.profiles pr on pr.id = p.author_id where pr.username like 'conc\_a%') as conc_posts;   -- expect 30 and 200
