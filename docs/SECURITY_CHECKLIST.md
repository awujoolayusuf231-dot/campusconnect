# Security checklist (tick before launch and after major releases)

## Secrets and configuration
- [ ] Only the publishable/anon key is in the frontend build. Search `dist/` for `service_role` and `eyJ` JWTs with role `service_role` (must find none).
- [ ] `.env*` files are git-ignored; `.env.example` has placeholders only.
- [ ] No owner/admin password or credentials exist anywhere in the repo.
- [ ] The whiteshirt.fun Supabase project is not referenced by any env var, migration or code.

## Authentication
- [ ] Leaked password protection ON and minimum password length >= 8 in Auth > Password security (advisor warning `auth_leaked_password_protection` must be gone).
- [ ] Email confirmation ON; password reset works end to end; redirect URLs list only your origins.
- [ ] Bot protection / rate limits enabled for sign-up, sign-in and password reset.
- [ ] Registration and login errors never reveal whether an email exists (the app uses generic messages).

## Authorization (database is the source of truth)
- [ ] Every table in `public` has RLS enabled: `select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;` returns no rows.
- [ ] Anonymous role can execute only `is_username_available`: `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'execute');`
- [ ] No internal/trigger helper is executable by `authenticated` (names like `internal_*`, `notify_on_*`, `*_trg`, `log_admin_action`, `provision_owner`, `effective_status_internal`).
- [ ] All SQL suites in `supabase/tests/` pass (every line `PASS`).
- [ ] Students cannot change role/status/verification via crafted profile updates (covered by tests).
- [ ] Staff (incl. owner) cannot read `messages`, `conversations`, `conversation_members` (covered by tests).
- [ ] Audit log and moderation history are append-only (covered by tests).
- [ ] Every new `SECURITY DEFINER` function: `set search_path = ''`, permission check inside, `revoke ... from public, anon, authenticated` then targeted grants.

## Content and abuse
- [ ] Rate limits present: posts 20/h, comments 60/h, reports 10/day, messages 20/min and 300/h, community creation 3/day, joins 30/day, announcements 5 publishes/day.
- [ ] External URLs only `https://`; the app opens them with `rel="noopener noreferrer nofollow"`; the whiteshirt.fun link accepts only `whiteshirt.fun` / `www.whiteshirt.fun`.
- [ ] Uploads limited to JPEG/PNG/WebP, size-capped; users can only write inside their own `<uid>/` folder.
- [ ] User text is rendered as text (React escaping); no `dangerouslySetInnerHTML` anywhere: `grep -R dangerouslySetInnerHTML src` finds none.

## Privacy
- [ ] Privacy policy, terms and guidelines reviewed by a lawyer; retention periods confirmed; data location understood.
- [ ] Account deletion requests have a named person and a process (the app records requests; a human must action them).
- [ ] No message bodies in analytics, audit logs or error reports.

## Operations
- [ ] Backups enabled and a restore was tested.
- [ ] Security + performance advisors reviewed (expected leftovers: `is_username_available` callable by anon; ~58 "signed-in users can execute SECURITY DEFINER function" notices; `opportunity_clicks` RLS-without-policy INFO, all intentional); the "SECURITY DEFINER callable" notices are understood (each function checks permissions inside).
- [ ] An owner exists and a second trusted admin is documented for emergencies.
