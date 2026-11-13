# Local Docker Supabase testing guide (migrations A and B) - v3

Purpose: build a throw-away LOCAL database from the repo migrations, apply A and B, and run every test on your own computer.
Nothing here touches production.

STATUS: I could not execute any of this. My environment has no Docker and no PostgreSQL (re-checked), so every command is UNRUN
and may need small fixes. Section 10 lists exactly what is verified and what is not.

## Safety rules (the scripts also enforce these)
- Never run `supabase link`, `supabase db push`, `supabase db pull` or `supabase login` for this work, and never put a production password in a command.
- After `npx supabase start`, `npx supabase status` must show only `127.0.0.1` addresses. A `*.supabase.co` host means stop.
- Every new test script refuses to run if the database contains an account whose email does not end in `@t.invalid`, so it cannot run against a real database by accident.
- The test scripts roll back their own data. Only the concurrency kit commits data, and its cleanup removes only its own accounts.

## 1. One-time prerequisites
- Docker Desktop running (Windows: WSL2 backend). Check: `docker version`.
- Node 20+. Supabase CLI through npm: `npx supabase --version`.

## 2. One-time project setup (repo root = folder with package.json)
```
npx supabase init
```
Answer N to the editor-settings questions. Then edit `supabase/config.toml`: set `project_id = "campusconnect-local"`.
The database container is then named `supabase_db_campusconnect-local` (used below and by the scripts).

## 3. Copy the delivered files into the repo (same relative paths; nothing is applied yet)
```
supabase/migrations/20261028000014_account_deletion_processing.sql   (reconciliation copy; needed on a fresh local DB)
supabase/migrations/20261101100000_hashtags.sql
supabase/migrations/20261101110000_post_impressions_profile_views.sql
supabase/migrations/20261101120000_notification_outbox.sql
supabase/rollbacks/*.sql
supabase/tests/hashtags.sql, supabase/tests/post_impressions_profile_views.sql, supabase/tests/notification_outbox.sql
supabase/tests/concurrency/*     supabase/tests/rollback/*
scripts/local-test.sh, scripts/local-test.ps1
```

## 4. Start the local stack
```
npx supabase start
npx supabase status
```
Check that every URL is `127.0.0.1`.

## 5. The one-command path (recommended) - runner v4
PowerShell (Windows):
```
.\scripts\local-test.ps1 -Reset
```
bash / macOS / Linux / WSL:
```
bash scripts/local-test.sh --reset
```
Flags: `-Reset`/`--reset` rebuilds the LOCAL database first; `-SkipExisting`/`--skip-existing` skips the pre-existing regression suites; `-SkipConcurrency`/`--skip-concurrency` skips the pgbench kit.
What it does, in order:
1. Safety: refuses (exit 2) if a production-looking variable is set (`SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, anything containing `supabase.co`), if the local container is not running, or if `supabase status` shows a remote host.
2. Optional `npx supabase db reset` (local database only).
3. Preflight (read-only SQL): reports whether migrations A, B, C and the 0014 reconciliation file are present. A suite whose migration is missing is reported "NOT RUN" and counts as a failure.
4. Existing regression suites in migration order: `rls_foundation`, `social_core`, `phase6_opportunities`, `google_oauth_usernames`. Each must print at least one PASS/FAIL line (the Google suite must end in ROLLBACK). `admin_read_layer.sql` (comments only) and the reposts/phase-5 suites (never saved as SQL) are reported as NOT RUN: that is a coverage gap in the existing repo, not something this runner can fix.
5. New suites: hashtags (exactly 100 verdict lines), impressions (129), notification outbox (127). A suite that stops early, prints fewer lines than expected, prints any FAIL, or hits an unexpected SQL error makes the run NOT GREEN.
6. Concurrency kit if `pgbench` exists in the container; otherwise NOT RUN, which also makes the run NOT GREEN.
Only "ALL EXECUTED CHECKS PASSED AND NOTHING WAS SKIPPED" (exit code 0) means green. psql runs inside the container, so the SQL never travels through the Windows console.

## 6. The same steps by hand
(Use this only if the runner itself has a problem. Note: when `psql` reads a file with `-f` it prefixes error lines with `psql:<file>:<line>:`; with `<` redirection it does not.)
```
# build the local database (applies every file in supabase/migrations in order)
npx supabase db reset

# variable for the container name (PowerShell; in bash use DB=supabase_db_campusconnect-local)
$DB = "supabase_db_campusconnect-local"

# existing regression suites, one at a time (each ends with an intentional error beginning RESULTS; every line below it must start with PASS)
Get-Content supabase\tests\phase6_opportunities.sql -Raw | docker exec -i $DB psql -U postgres -d postgres

# migration A suite
$out = Get-Content supabase\tests\hashtags.sql -Raw | docker exec -i $DB psql -U postgres -d postgres 2>&1
$out | Select-String "^(PASS|FAIL)"
($out | Select-String "^FAIL").Count      # must be 0; PASS count must be 100

# migration B suite
$out = Get-Content supabase\tests\post_impressions_profile_views.sql -Raw | docker exec -i $DB psql -U postgres -d postgres 2>&1
$out | Select-String "^(PASS|FAIL)"
($out | Select-String "^FAIL").Count      # must be 0; PASS count must be 129

# migration C suite
$out = Get-Content supabase\tests\notification_outbox.sql -Raw | docker exec -i $DB psql -U postgres -d postgres 2>&1
$out | Select-String "^(PASS|FAIL)"
($out | Select-String "^FAIL").Count      # must be 0; PASS count must be 127
```
bash equivalent: `docker exec -i supabase_db_campusconnect-local psql -U postgres -d postgres < supabase/tests/hashtags.sql 2>&1 | grep -E '^(PASS|FAIL)'`.
Studio alternative: http://127.0.0.1:54323, SQL editor, paste a file and run; the error text contains the RESULTS lines.
An `ERROR:` that is NOT `RESULTS` (for example "REFUSING TO RUN", a missing column, a syntax error) means the script stopped early: send me the full text. Do not edit an assertion to make it pass.

## 7. Concurrency checks (rate limits, duplicate counts, deadlocks)
```
docker exec $DB which pgbench          # if nothing is printed, pgbench is missing (see the note below)
Get-Content supabase\tests\concurrency\setup.sql -Raw | docker exec -i $DB psql -U postgres -d postgres        # expect 30 accounts, 200 posts
docker cp supabase\tests\concurrency\one_viewer.pgbench ${DB}:/tmp/one_viewer.pgbench
docker cp supabase\tests\concurrency\many_viewers.pgbench ${DB}:/tmp/many_viewers.pgbench
docker exec $DB pgbench -U postgres -d postgres -n -c 20 -j 4 -T 10 -f /tmp/one_viewer.pgbench
Get-Content supabase\tests\concurrency\verify.sql -Raw | docker exec -i $DB psql -U postgres -d postgres       # run within 60 s; every check must be true
Get-Content supabase\tests\concurrency\cleanup.sql -Raw | docker exec -i $DB psql -U postgres -d postgres
Get-Content supabase\tests\concurrency\setup.sql -Raw | docker exec -i $DB psql -U postgres -d postgres        # fresh counters for the second run
docker exec $DB pgbench -U postgres -d postgres -n -c 20 -j 4 -T 20 -f /tmp/many_viewers.pgbench
Get-Content supabase\tests\concurrency\verify.sql -Raw | docker exec -i $DB psql -U postgres -d postgres
Get-Content supabase\tests\concurrency\cleanup.sql -Raw | docker exec -i $DB psql -U postgres -d postgres
```
- The scripts catch errors inside the database call and write them to a local table, because pgbench 17 has no `--continue-on-error`. `rate_limited` entries are expected and healthy; any other message (for example `deadlock detected`) is a failure and verify.sql check 1 will be false.
- If `pgbench` is not in the container, install the PostgreSQL client tools on your machine and run the same `pgbench` commands against host `127.0.0.1`, port `54322`, user `postgres`, password `postgres`.
- cleanup.sql refuses to run on a database with real accounts, matches only emails of the exact form `conc_a<digits>@t.invalid` / `conc_v<digits>@t.invalid`, aborts if more than 30 match, and drops only its own error table.

## 8. Rollback-ownership test (a pre-existing setting must survive rolling back B)
This needs a database where B has NOT been applied, so park B's file first. PowerShell:
```
mkdir supabase\_parked
move supabase\migrations\20261101110000_post_impressions_profile_views.sql supabase\_parked\
npx supabase db reset                                   # applies everything except B
Get-Content supabase\tests\rollback\seed_preexisting.sql -Raw | docker exec -i $DB psql -U postgres -d postgres
Get-Content supabase\_parked\20261101110000_post_impressions_profile_views.sql -Raw | docker exec -i $DB psql -U postgres -d postgres
Get-Content supabase\rollbacks\20261101110000_post_impressions_profile_views_down.sql -Raw | docker exec -i $DB psql -U postgres -d postgres
Get-Content supabase\tests\rollback\verify_after_rollback.sql -Raw | docker exec -i $DB psql -U postgres -d postgres   # every row must be true (t)
move supabase\_parked\20261101110000_post_impressions_profile_views.sql supabase\migrations\
npx supabase db reset                                   # back to the full state
```
Second scenario (the safety abort): apply B, run `drop table public.analytics_setting_ownership;`, then run the rollback. It must FAIL with "relation ... does not exist" and leave everything (settings, tables, functions) in place.

## 9. Application checks (also not run by me)
```
npm ci
npm run typecheck
npm test
npm run build
```
`tsc` passed on your uploaded copy when I ran it; Vitest and the build could not run in my environment.

## 10. What is verified and what is not
Actually run by me (read-only, nothing created or changed on any database): the hashtag extraction/normalisation logic as plain SELECT expressions
on a live PostgreSQL 17 engine (29 cases, all passed); engine facts (UTF-8 / en_US.UTF-8, `lower`, NFC, `date_bin`, Lagos midnight, `hashtextextended`);
catalog checks that every existing function/enum/column/trigger the migrations and tests rely on exists with the assumed signature and that no new name collides;
`tsc -b --noEmit` on your frontend (exit 0); static syntax checks (quote/paren balance, every new function revoked, rollback drops every created object,
`posts_by_hashtag` columns identical to `feed_posts`, UUID formats, `bash -n` on the runner).
NOT run: both migrations as a whole, both SQL suites (hashtags 100 verdicts, impressions 129), the concurrency kit, the rollback test, the existing regression suites on a
rebuilt database, `supabase db reset` from the repo, Vitest, Vite build, the PowerShell runner (the bash runner was only syntax-checked).
Assumptions in the tests that a first run will confirm or refute: the `platform_settings` audit trigger accepts updates made without a signed-in actor;
direct `insert into public.communities` and `account_standing` updates are unrestricted for the database owner; the test viewers get an `account_standing` row from `handle_new_user`.
