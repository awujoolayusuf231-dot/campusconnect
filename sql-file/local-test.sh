#!/usr/bin/env bash
# LOCAL TEST RUNNER v4 (bash / macOS / Linux / WSL / Git-Bash).
# Runs ONLY against the local Supabase Docker database, through `docker exec` into the local container. It never opens a
# network connection string, never uses `supabase link/db push/db pull`, and refuses to run if it cannot prove the target is local.
# Usage: scripts/local-test.sh [--reset] [--skip-existing] [--skip-concurrency]
#   --reset            rebuild the LOCAL database from supabase/migrations first (npx supabase db reset)
#   --skip-existing    do not run the pre-existing regression suites
#   --skip-concurrency do not run the pgbench concurrency kit
# Exit code: 0 only if every executed check passed AND every suite that was supposed to run did run.
set -u
DB="${DB_CONTAINER:-supabase_db_campusconnect-local}"
EXPECT_A=100; EXPECT_B=129; EXPECT_C=127      # verdict lines per suite, counted statically from the source files
RESET=0; EXISTING=1; CONC=1
for a in "$@"; do case "$a" in --reset) RESET=1;; --skip-existing) EXISTING=0;; --skip-concurrency) CONC=0;; esac; done

die() { echo "REFUSING: $*" >&2; exit 2; }
# ---- safety: prove the target is local ----
if env | grep -qiE 'supabase\.co|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|SUPABASE_DB_URL'; then die "a production-looking Supabase variable is set in this shell; open a clean terminal"; fi
docker ps --format '{{.Names}}' | grep -qx "$DB" || die "container '$DB' is not running. Run: npx supabase start (and check project_id in supabase/config.toml)"
npx supabase status 2>/dev/null | grep -qi 'supabase\.co' && die "supabase status shows a remote host"
[ -f supabase/.temp/project-ref ] && echo "NOTE: this folder is linked to a remote Supabase project (supabase/.temp/project-ref). This runner never uses that link."
echo "Local container: $DB"

FAILED=0
psql_file() {   # file [psql flags]; runs psql INSIDE the container, merges stderr there (works the same from PowerShell)
  docker cp "$1" "$DB":/tmp/runner.sql >/dev/null 2>&1 || { echo "ERROR: could not copy $1 into the container"; return 3; }
  docker exec "$DB" sh -c "psql -U postgres -d postgres ${2:-} -f /tmp/runner.sql 2>&1"
}
if [ "$RESET" = 1 ]; then echo "== db reset (LOCAL database is dropped and rebuilt from supabase/migrations)"; npx supabase db reset || { echo "db reset FAILED"; exit 1; }; fi

# ---- preflight: which migrations are present? ----
PF=$(psql_file supabase/tests/preflight.sql "-At -F'|'" | grep -E '^[tf]\|[tf]\|[tf]\|[tf]$' | tail -1)
[ -n "$PF" ] || die "preflight query returned nothing: is the local database up and built? (use --reset)"
IFS='|' read -r A_OK B_OK C_OK R_OK <<< "$PF"
echo "Preflight: A(hashtags)=$A_OK B(impressions)=$B_OK C(outbox)=$C_OK 0014(reconciliation)=$R_OK"

run_suite() {   # name file expect   (expect: a number = exact verdict count | min1 = at least one | rollback = no verdicts but must end in ROLLBACK)
  local name="$1" file="$2" expect="$3" out pass fail bad
  if [ ! -f "$file" ]; then echo "== $name: NOT RUN (file missing: $file)"; FAILED=1; return; fi
  out=$(psql_file "$file")
  pass=$(printf '%s\n' "$out" | grep -c '^PASS'); fail=$(printf '%s\n' "$out" | grep -c '^FAIL')
  echo "== $name: PASS=$pass FAIL=$fail (expected: $expect)"
  printf '%s\n' "$out" | grep '^FAIL'
  bad=$(printf '%s\n' "$out" | grep -E 'ERROR:|FATAL:' | grep -v 'RESULTS')
  if [ -n "$bad" ]; then echo "   UNEXPECTED SQL ERROR (the suite stopped early):"; echo "$bad" | head -5 | sed 's/^/     /'; FAILED=1; fi
  [ "$fail" -eq 0 ] || FAILED=1
  case "$expect" in
    min1)     [ $((pass+fail)) -ge 1 ] || { echo "   NO VERDICT LINES: the suite printed no PASS/FAIL line, so it proves nothing"; FAILED=1; } ;;
    rollback) printf '%s\n' "$out" | grep -q '^ROLLBACK' || { echo "   NO ROLLBACK SEEN: the suite did not run to its end"; FAILED=1; } ;;
    *)        [ $((pass+fail)) -eq "$expect" ] || { echo "   INCOMPLETE RUN: expected exactly $expect verdict lines"; FAILED=1; } ;;
  esac
}
skip_suite() { echo "== $1: NOT RUN ($2)"; FAILED=1; }

# ---- existing regression suites, in migration order ----
if [ "$EXISTING" = 1 ]; then
  run_suite "existing rls_foundation (0001-0007)"            supabase/tests/rls_foundation.sql          min1
  run_suite "existing social_core (0008)"                    supabase/tests/social_core.sql             min1
  run_suite "existing phase6_opportunities (0010)"           supabase/tests/phase6_opportunities.sql    min1
  run_suite "existing google_oauth_usernames (0013)"         supabase/tests/google_oauth_usernames.sql  rollback
  echo "== existing admin_read_layer.sql: NOT RUN (contains only comments, no executable SQL; its checks were run inline in 2026-10-18)"
  echo "== existing reposts/phase-5 suites: NOT RUN (never saved as SQL; only supabase/tests/reposts_stats_connections.md exists)"
fi
# ---- new suites ----
if [ "$A_OK" = t ]; then run_suite "hashtags (A)" supabase/tests/hashtags.sql "$EXPECT_A"; else skip_suite "hashtags (A)" "migration A not applied"; fi
if [ "$A_OK" = t ] && [ "$B_OK" = t ]; then run_suite "impressions + profile views (B)" supabase/tests/post_impressions_profile_views.sql "$EXPECT_B"; else skip_suite "impressions + profile views (B)" "migration A and/or B not applied"; fi
if [ "$C_OK" = t ]; then run_suite "notification outbox (C)" supabase/tests/notification_outbox.sql "$EXPECT_C"; else skip_suite "notification outbox (C)" "migration C not applied"; fi

# ---- concurrency ----
if [ "$CONC" = 1 ]; then
  if [ "$A_OK" != t ] || [ "$B_OK" != t ]; then skip_suite "concurrency" "migrations A and B not applied"
  elif docker exec "$DB" which pgbench >/dev/null 2>&1; then
    echo "== concurrency"
    psql_file supabase/tests/concurrency/setup.sql | grep -E 'ERROR:|REFUSING' && { echo "   setup failed"; FAILED=1; }
    docker cp supabase/tests/concurrency/one_viewer.pgbench "$DB":/tmp/one_viewer.pgbench >/dev/null
    docker cp supabase/tests/concurrency/many_viewers.pgbench "$DB":/tmp/many_viewers.pgbench >/dev/null
    docker exec "$DB" pgbench -U postgres -d postgres -n -c 20 -j 4 -T 10 -f /tmp/one_viewer.pgbench 2>&1 | tail -4
    OUT=$(psql_file supabase/tests/concurrency/verify.sql "-At -F'|'"); echo "$OUT" | grep -E '\|[tf]$'
    echo "$OUT" | grep -E '\|f$' && { echo "   CONCURRENCY CHECK FAILED (one_viewer)"; FAILED=1; }
    echo "$OUT" | grep -qE '\|t$' || { echo "   verify printed no result rows"; FAILED=1; }
    psql_file supabase/tests/concurrency/cleanup.sql >/dev/null; psql_file supabase/tests/concurrency/setup.sql >/dev/null
    docker exec "$DB" pgbench -U postgres -d postgres -n -c 20 -j 4 -T 20 -f /tmp/many_viewers.pgbench 2>&1 | tail -4
    OUT=$(psql_file supabase/tests/concurrency/verify.sql "-At -F'|'"); echo "$OUT" | grep -E '\|[tf]$'
    echo "$OUT" | grep -E '\|f$' && { echo "   CONCURRENCY CHECK FAILED (many_viewers)"; FAILED=1; }
    echo "$OUT" | grep -qE '\|t$' || { echo "   verify printed no result rows"; FAILED=1; }
    psql_file supabase/tests/concurrency/cleanup.sql | tail -3
  else
    skip_suite "concurrency" "pgbench not found in the container; see docs/LOCAL_TESTING_GUIDE.md section 7"
  fi
fi
echo
[ "$FAILED" = 0 ] && echo "ALL EXECUTED CHECKS PASSED AND NOTHING WAS SKIPPED" || echo "NOT GREEN: at least one check failed, stopped early, or was not run. Send me the output above."
exit "$FAILED"
