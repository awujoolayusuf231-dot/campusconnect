# CampusConnect - build status (honest ledger, updated 2026-10-16)

## Supabase target
CampusConnect01 (ref `yfyssczefqicdpbtqmlh`, eu-west-1). The other project on the account was never touched.

## Applied to CampusConnect01 (verified via list_migrations)
1. foundation_identity_rbac  (repo: ...0001)
2. fix_signup_fallback_username  (repo: ...0003)
3. lock_down_function_execute_privileges  (repo: ...0004)  <- security fix, see below
4. storage_buckets  (repo: ...0005)
Note: repo file numbers are ordering only; the database records its own timestamps.

## Executed and passing
- `supabase/tests/rls_foundation.sql`: 69/69 PASS against the live project (rolled back; no test data remains:
  0 users, 0 institutions). Run after migrations 0001+0003+0004.
- Post-check: all public tables have RLS enabled; 26 policies; 2 storage buckets.

## Defects found by testing (and fixed)
- 0001's default-privilege revoke did not take effect: every function was executable by anon, including
  `log_admin_action` (could have forged audit rows). Fixed in 0004; verified by catalog query + new tests.
- Fallback username could collide on similar user ids. Fixed in 0003.

## NOT done / NOT verified
- Supabase security+performance advisors: call was not approved, so NOT run. Run them in the dashboard.
- Storage policies: applied but not yet behaviour-tested (needs signed-in uploads).
- Frontend: `npm install`, typecheck, vitest, build NOT run (sandbox has no network). Unit tests are written only.
- Not started: posts/comments/follows/blocks, communities, messaging, notifications, opportunities, reports,
  announcements tables; all UI; admin dashboard; owner-facing docs; e2e tests.
- Brand tokens: only #F8F8F4 (theme-color) verified from whiteshirt.fun. Rest needs the site's CSS.
- Email verification / password reset: depends on Auth settings in the Supabase dashboard (not configured by me).

## Phase 3 - database (APPLIED and TESTED)
- 0006 admin_overview_and_user_search + 0007 guard_account_status_visibility applied.
- Admin read-layer checks: 23/23 PASS. Foundation suite re-run after 0007: 75/75 PASS. All rolled back (0 test users remain).
- Security advisor: only WARN-level "SECURITY DEFINER callable" notices for functions that are intentionally callable
  and permission-check internally. It exposed one real leak (account status of any user) -> fixed by 0007.
  Residual, accepted: is_username_available (anon) allows username enumeration; account_is_listed(uuid) reveals
  whether an account is listed. Add rate limiting before launch.
- Performance advisor RUN: INFO-level only (8 unused indexes - expected, no traffic yet; 8 unindexed FKs on tiny
  staff/settings tables - not worth indexing). Re-check once real data exists.
- Storage-policy behaviour tests: NOT run yet (need real signed-in uploads).

## Phase 3 - frontend (WRITTEN, NOT COMPILED OR RUN - no network in author sandbox)
Auth pages, settings, admin shell, dashboard, users page with moderation dialog. Run `npm install && npm run typecheck && npm test && npm run build`
locally and send me any errors. Design tokens other than #F8F8F4 are provisional. shadcn/ui not yet installed.

## Phase 4 - database (APPLIED and TESTED)
- Migration 0008 was applied by the owner in the Supabase SQL editor (so it does not appear in the migration history table).
  Verified afterwards: 9 new tables all RLS-enabled; anon can execute only is_username_available; no internal helper exposed.
- `supabase/tests/social_core.sql`: all checks PASS (141 by tally) against the live project; rolled back, 0 rows left.
  Covers posts, visibility, likes, comments, follows, feed/keyset paging, discovery, media paths, reports (dedupe, rate limit,
  privacy), moderation (rank rules, restore rules, append-only history, audit), blocks, restricted/suspended accounts.
- Design notes: a block hides the blocked person's content from the blocker and stops the blocked person interacting with the
  blocker; the blocked person can still read the blocker's public posts (so blocks cannot be detected).
  Reporter identity is never exposed to the reported user. Deleted posts keep a wiped body; reports keep a content snapshot.
- Policy count in `public`: 35. Advisors not re-run after 0008 (tool not available this turn).

## Phase 4 - frontend (WRITTEN, NOT COMPILED OR RUN)
Feed (3 tabs, keyset "load more"), composer with up to 4 images (JPEG/PNG/WebP <= 5 MB, uploaded to the private
post-images bucket, shown via signed URLs), likes, comments, delete/report/block with confirm dialogs, discovery with filters,
profile view (follow/report/block, whiteshirt.fun link shown only if flag on + user opted in + URL re-validated), profile edit
(incl. avatar upload), student layout (bottom nav on mobile), admin Reports queue (status tabs, snapshot, notes, assign,
hide/restore, warn, history). Run `npm install && npm run typecheck && npm test && npm run build` and send me the errors.

## Phase 5 - database (APPLIED and TESTED)
- Applied to CampusConnect01 as: communities, notifications_and_announcements, messaging_reports_and_stats, fix_community_null_role_checks.
  Repo file `20261022000009_phase5_communities_notifications_messaging.sql` is the MERGED equivalent (fix folded in).
- Covers: communities (public, owner/moderator/member roles, ban list, archive, platform disable, community moderation log),
  community posts (members only; main feed excludes them), notifications (dedupe, per-user preferences, realtime),
  announcements (draft -> publish needs the exact recipient count typed back; max 5 publishes/24h; audited),
  private 1:1 messaging (participants only; NO staff read access, not even the owner), message/community reports
  (moderators see only the single reported message), aggregate-only admin stats.
- Test run: all checks PASS (about 250) after fixing one real bug found by the tests: community_set_member and
  community_set_post_state let a NON-member pass the role check (NULL NOT IN (...) is not true in SQL). Fixed with coalesce
  and re-tested (new tests: outsider cannot ban/remove/hide). Also hardened the "who hid this post" session setting.
  Rolled back; test data left behind was NOT re-verified this turn (the Supabase tool dropped before the check; the
  rollback is by design, and the earlier phases' identical pattern left 0 rows).
- NOT re-run: security/performance advisors after Phase 5; catalog verification (RLS on all tables, function privileges,
  realtime publication contents). Run `supabase/tests` style checks or the advisors next turn.
- The Phase 5 test script is NOT saved in the repo (it was executed inline). Ask me to save it as supabase/tests/phase5.sql.

## Phase 5 verification (done this turn)
- Catalog check after Phase 5: 0 test rows left (users/communities/messages/notifications/announcements/institutions all 0);
  no table without RLS; 47 policies in public (before Phase 6); anon can execute only is_username_available;
  no internal/trigger helper executable by authenticated; realtime publication = messages, notifications only.
- Security advisor: only the expected "SECURITY DEFINER function is callable" notices (functions that check permissions inside).
  No RLS gaps, no mutable search_path. Performance advisor: INFO only; added the 3 FK indexes that matter (notifications.actor_id,
  communities.institution_id, reports.resolved_by).

## Phase 6a - database (APPLIED and TESTED): opportunities
- Migration `20261023000010_phase6_opportunities_and_banned_list.sql` (applied as phase6_opportunities_and_banned_list).
- Opportunities: draft/published/archived, https-only external URLs validated in the database, deadlines (expired hidden from
  students automatically), max 5 featured, saves (private), click tracking (distinct users), feature flag enforced in the backend,
  reports of opportunities, admin stats, "archive expired" job, all admin actions audited. No student submissions and no paid
  placement (deliberately out of the MVP).
- Fixed the known gap: `community_banned_list` lets owners/moderators see banned members so they can unban.
- Tests: `supabase/tests/phase6_opportunities.sql`: 93 checks, all PASS; rolled back.
- The Phase 5 test script (about 250 checks) is still not saved in the repo.

## Live state check after Phase 6a (this turn)
- Catalog: no table without RLS; 51 policies in public; anon can execute only is_username_available; no internal/trigger helper
  executable by signed-in users. Test data: none left (communities/opportunities/saves/reports/institutions all 0).
- 1 REAL user exists (username ecomedge01, email verified): the signup + email verification + profile-trigger path works for real.
  No owner exists yet (owners_in_system = 0). See README "Become the owner". I did not promote anyone.
- Advisors after Phase 6a not re-run (ran after Phase 5; Phase 6a only adds the same kind of functions/tables).

## Phase 6b - frontend (WRITTEN, NOT COMPILED OR RUN)
Student: Opportunities (search, category, saved-only, featured, deadline countdown, detail dialog that states the external host,
 opens only https links with rel=noopener noreferrer nofollow, records a distinct-user click, report). Community moderators get a
 Banned members list with Unban. Mobile header with Discover/Profile/Settings; bottom nav: Feed, Communities, Opportunities, Messages, Alerts.
Admin: Opportunities (stats, create/edit, publish/unpublish/feature/archive with reasons, archive-expired job), Institutions
 (add/edit/search/activate/deactivate; aliases; duplicate detection by the database), Platform settings + Feature flags (typed inputs,
 confirmation for flags, Campus Celebrations count + note that it is link-only), Audit log (filter by action prefix, paged, metadata
 viewer), Staff (list, grant moderator/admin, revoke, extra permissions; owner role not assignable), reports queue can unpublish a reported opportunity.
Known gaps: institution page has no per-institution user counts (needs a small RPC); staff page lists permissions by key only;
 no Announcements/Settings public landing banner wiring on the public home page; public info pages (features, about, guidelines,
 privacy, terms, contact) are NOT built; no e2e tests; no shadcn/ui; image optimisation is size/type limits only (no resizing).

## Phase 5 - frontend (WRITTEN, NOT COMPILED OR RUN)
Communities (browse/search/create, community page with posts/members/moderation tabs, join/leave, owner archive/edit,
community-moderator hide/restore/ban/remove/promote, report), notifications page + unread badges (realtime nudges refetch),
notification preferences, messaging (two-column desktop; dedicated full-screen chat on mobile that hides the bottom nav and
uses dvh/safe-area insets so the composer stays above the keyboard; connection state; delete own / report / block),
announcement banner, "Message" button on profiles, admin: Communities (disable/restore with reason), Announcements
(draft, preview, audience count confirm, publish, unpublish), dashboard content stats, reports queue handles community/message.
Known gaps: moderators cannot see/unban banned members in the UI (banned rows are hidden from everyone but the member and
platform staff; unban needs a UI-visible list - add a moderator-only RPC); older messages beyond the latest 60 are not paged;
community name/slug cannot be edited; no email notifications (none configured); Opportunities and Campus Celebrations admin
settings, institutions admin UI, feature-flag UI, audit-log UI and settings UI are still not built.

## Still not built
Opportunities (+ admin), institutions admin UI, platform settings / feature flags UI, audit-log UI, staff management UI,
public info pages (features/about/guidelines/privacy/terms/contact), shadcn/ui, Playwright e2e, deployment + security guides.

## Phase 7 (this turn)
- DB: migration 0011 `admin_institution_user_counts` applied; 5 checks PASS (student forbidden, anon denied, moderator/admin ok, count correct).
- Written, NOT compiled/run: public pages (home, features, about, community guidelines, privacy, terms, contact) with a public-settings hook
  (maintenance message, announcement banner, support email, registration-open notice); Institutions page shows student counts;
  Playwright config + smoke specs; docs: DEPLOYMENT, SECURITY_CHECKLIST, FEATURE_STANDARD, TESTING.
- The legal pages are DRAFTS describing current behaviour; they must be reviewed by a lawyer; they claim no legal compliance.

## Still not built / open
Playwright authenticated journeys; saved runnable copies of the Phase 5 and Phase 6 SQL suites; error-reporting provider; shadcn/ui;
image resizing/optimisation (only type/size limits); email notifications (no SMTP provider configured); a human process for
account-deletion requests; per-environment (staging) Supabase project.

## Advisors after Phase 6/7 (run this turn)
- Security: (1) `auth_leaked_password_protection` DISABLED - a Supabase dashboard setting you must turn on (Auth > Password security);
  I cannot change it from here. (2) INFO `opportunity_clicks`: RLS on, no policy = deliberate (no direct access; written by a definer function).
  (3) anon can execute `is_username_available` = deliberate (needed at sign-up; add CAPTCHA/rate limits to curb username guessing).
  (4) 58 "signed-in users can execute SECURITY DEFINER function" notices = each function validates permissions inside; verified by the SQL suites.
- Performance advisor NOT re-run after Phase 6 (last clean run was after Phase 5: INFO only).

## Owner provisioned (2026-10-24)
`ecomedge01` was promoted to OWNER on CampusConnect01 via public.provision_owner (user confirmed the account is theirs; email already verified).
Audit log entry `owner.provision` recorded; owners_in_system = 1. Further staff are added from Admin > Staff by the owner.
No passwords were used or stored by the assistant. A password was pasted in chat earlier by the user; it should be changed.

## Whiteshirt pop-up (this turn) - WRITTEN, NOT COMPILED OR RUN
Profile > Edit: "Create my celebration board on whiteshirt.fun" opens an in-app dialog embedding the fixed address https://www.whiteshirt.fun/
(sandboxed iframe; address is a constant, never user input). The student creates the board there, pastes the link (or clipboard), and
"Use this link" fills the profile field after the same strict whiteshirt.fun validation used by the database. Hidden when the
campus_celebrations flag is off. Fallback: "Open in a small window" (window.open popup, not a tab).
UNVERIFIED: whether whiteshirt.fun permits framing (X-Frame-Options / frame-ancestors). I cannot read response headers from here.
CampusConnect cannot read what happens inside the frame (cross-origin), so it cannot detect the new board automatically: the student pastes the link.
Unit/component tests written (link extraction incl. lookalike domains, fixed src + sandbox, button enable/disable, Escape/close).

## Reposts, share, premium profile (this turn)
- DB (APPLIED, 68 checks PASS, rolled back): migration 0012 - reposts (30/hour cap, no own/community/private/hidden/blocked posts,
  notification with dedupe), Following feed now includes reposts with "X reposted" (deduped with originals, ordered by when the repost
  happened), profile stats (followers, following, posts, reposts, is_following, follows_me; private profiles hidden), followers/following
  lists (private and blocked people excluded), profile Reposts tab. feed_posts/community_posts changed shape (drop+recreate).
- Catalog after 0012: no table without RLS; 52 policies; anon executes only is_username_available; new functions locked down correctly.
- Real data now exists (3 users, 3 posts, 4 follows): people have started using the app. Tests only ever touch rolled-back rows.
- Frontend (WRITTEN, NOT COMPILED OR RUN): premium profile (banner, large avatar, bio, chips, tappable Posts/Reposts/Followers/Following
  stats with compact numbers, Follow / Follow back / Message / More menu, "Follows you" badge, Posts and Reposts tabs, skeleton loading),
  followers/following dialog (full-screen on mobile, follow buttons, load more), PostCard with Like, Comment, Repost (undo, count,
  disabled on own/community posts) and Share (phone share sheet or copy link), "X reposted" label, shared-post page /app/p/:id,
  notifications text for reposts. Share != Repost: Share sends a link outside the app; Repost shows the post to your followers.
- Not done: Quote-reposts (repost with your own comment); repost count list ("who reposted"); pagination on profile tabs (latest 20 only);
  shared post links require login (private network by design).

## Offline verification I could do this turn (no npm registry access in my sandbox)
- TypeScript 6.0.3 is installed in the sandbox but React/Vite/Supabase/etc. are NOT. I generated stub type declarations for the third-party
  modules (everything `any`) and ran the compiler over ALL of src/ and e2e/ with `strict` + `noUncheckedIndexedAccess` + `noUnusedLocals/Parameters`
  (noImplicitAny off, because stubs make callback parameters untyped). Result after fixes: 0 errors. It found and I fixed:
  (1) ReportDialog/submitReport only allowed 3 of 6 report target types (real type bug, 3 call sites);
  (2) 5 files relied on the global `React.` namespace / `JSX.Element` types without importing them;
  (3) `baseUrl` in tsconfig (deprecated in TS 6; `paths` works without it) - removed.
  Zero syntax errors across the whole codebase.
- This is NOT a substitute for `npm run typecheck`: real third-party types can still surface errors (props, hook generics, router/query types).
- Executed with Node on the project's own compiled helpers: 29 + 13 = 42 checks PASS: formatCount/pluralize, timeAgo, admin nav permissions,
  the whiteshirt.fun URL pattern + link extraction (lookalike/userinfo/http/javascript rejected), the opportunity URL pattern, fitWithin (image sizing),
  and the error scrubber. The scrubber test found a REAL bug (Authorization: Bearer <token> left the token in the text); fixed and re-verified.
- NOT run: Vitest/Testing-Library component tests (need packages), Playwright (needs browsers + packages), `vite build`.

## Added this turn (frontend; typechecked against stubs only)
- Client-side image optimisation (src/lib/image.ts): photos are shrunk to <=1600px (avatars 512px), re-encoded to WebP (JPEG fallback),
  which also strips EXIF/GPS metadata. Students may now pick files up to 15 MB; the optimised file must fit the storage limits (5 MB / 2 MB).
  If optimisation fails the original is uploaded and the server limits still apply.
- Error boundary + global handlers + scrubbed error reporting (src/lib/observability.ts, src/app/AppErrorBoundary.tsx); pluggable sinks;
  no third-party service wired. React Query errors are reported too (key name only, never data).
- Profile Posts/Reposts tabs: "Show more" (20 -> up to 100).

## Onboarding, accessibility, saved tests (latest)
- Onboarding checklist on the feed (photo, institution, bio, follow 3 students, join a community, first post), progress bar, dismissible per user
  (stored in the browser only). Pure step logic checked in Node (4 checks PASS). Component not run in a browser.
- Skip-to-content links and `<main id="main">` landmarks on public, student and admin layouts.
- `scripts/offline-typecheck-stubs.py` + `scripts/offline-tsconfig.json`: how I typecheck without npm access (see docs/TESTING.md). Own-code typecheck: 0 errors.
- `supabase/tests/phase6_opportunities.sql` is now the full runnable script; executed AS SAVED on 2026-10-26: 88/88 PASS (rolled back).
  Still NOT saved as runnable SQL: the Phase 5 suite (~250 assertions) and the reposts/stats/connections suite (68 assertions): both passed inline.
