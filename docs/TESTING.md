# Testing

## SQL security/behaviour suites (run against the real Supabase project; each rolls back)
Open the Supabase SQL editor for the CampusConnect project, paste a file, run it. It ends with an intentional error whose message is a list; **every line must start with `PASS`**.
| File | What it proves | Status |
|---|---|---|
| `supabase/tests/rls_foundation.sql` | roles, RLS, audit, settings, URL checks, privilege lockdown | saved; last run 75/75 |
| `supabase/tests/social_core.sql` | posts, likes, comments, follows, blocks, reports, moderation, feed, discovery | saved; last run all PASS (141) |
| `supabase/tests/phase6_opportunities.sql` | opportunities, URL safety, expiry, featured cap, saves/clicks, reports, banned list | saved (runnable); last run of the saved file: 88/88 |
| Phase 5 (communities, notifications, announcements, messaging) | ~250 assertions ran inline, all PASS after fixing a real bug | **not saved in the repo yet** |
Helper functions `pg_temp.act(user, role, sql)` and `pg_temp.ex(name, got, want)` are defined at the top of `rls_foundation.sql`; copy them above any new suite.
Re-run all suites after **every** migration that touches policies, grants or functions.

## Frontend
`npm run typecheck`, `npm test` (Vitest + Testing Library: validation helpers, route guards, admin nav permissions, time and URL helpers), `npm run build`.
Status: written; not yet run by the author (no network in the build sandbox). Run them locally and fix anything that fails.

## End-to-end (Playwright)
`npx playwright install` once, then `npm run test:e2e`. `e2e/public.spec.ts` covers public pages, redirects for anonymous users, form validation, a safe login error and mobile overflow; it needs no accounts. Authenticated journeys (register -> verify -> post -> comment; message between two accounts; admin hides a reported post) need two test accounts on a **staging** project and are not written yet. Never run e2e against production data.

## Offline checks (when you cannot `npm install`)
Stub the third-party modules as `any`, typecheck `src/` with the global TypeScript, and run pure helpers with Node after transpiling them with
`tsc --ignoreConfig --outDir out --rootDir src ...`. See docs/STATUS.md for what this covers. It catches syntax errors, wrong argument counts,
unused code and misuse of our own types; it does not validate React/Supabase/Router typings.
