# Testing

## SQL security/behaviour suites (run against the real Supabase project; each rolls back)
Open the Supabase SQL editor for the CampusConnect project, paste a file, run it. It ends with an intentional error whose message is a list; **every line must start with `PASS`**.
| File | What it proves | Status |
|---|---|---|
| `supabase/tests/rls_foundation.sql` | roles, RLS, audit, settings, URL checks, privilege lockdown | saved; last run 75/75 |
| `supabase/tests/social_core.sql` | posts, likes, comments, follows, blocks, reports, moderation, feed, discovery | saved; last run all PASS (141) |
| `supabase/tests/phase6_opportunities.sql` | opportunities, URL safety, expiry, featured cap, saves/clicks, reports, banned list | saved (runnable); last run of the saved file: 88/88 |
| `supabase/tests/projects_competitions_voice_spaces.sql` | project privacy/feature gating and group Voice Space membership authorization | user ran after migration `20261115000033`; 9/9 PASS |
| Phase 5 (communities, notifications, announcements, messaging) | ~250 assertions ran inline, all PASS after fixing a real bug | **not saved in the repo yet** |
Helper functions `pg_temp.act(user, role, sql)` and `pg_temp.ex(name, got, want)` are defined at the top of `rls_foundation.sql`; copy them above any new suite.
Re-run all suites after **every** migration that touches policies, grants or functions.

## Frontend
`npm run typecheck`, `npm test` (Vitest + Testing Library: validation helpers, route guards, admin nav permissions, time and URL helpers), `npm run build`.
Current feature work: `npm run typecheck`, `npm run build`, `FeatureDialog.test.tsx`, and the push-outbox logic tests passed. The modal dialogs were checked at 320x640, 375x812, 768x1024, and 1440x900 with no horizontal overflow. The full Vitest run had 256/257 pass; the lone timeout was an unrelated Study Notes test that passed when run by itself. The collaboration SQL behavior test has now passed on the user's Supabase project.

## End-to-end (Playwright)
`npx playwright install` once, then `npm run test:e2e`. `e2e/public.spec.ts` covers public pages, redirects for anonymous users, form validation, a safe login error and mobile overflow; it needs no accounts. Authenticated journeys (register -> verify -> post -> comment; message between two accounts; admin hides a reported post) need two test accounts on a **staging** project and are not written yet. Never run e2e against production data.

## Offline checks (when you cannot `npm install`)
Stub the third-party modules as `any`, typecheck `src/` with the global TypeScript, and run pure helpers with Node after transpiling them with
`tsc --ignoreConfig --outDir out --rootDir src ...`. See docs/STATUS.md for what this covers. It catches syntax errors, wrong argument counts,
unused code and misuse of our own types; it does not validate React/Supabase/Router typings.
