# Migration C: notification outbox (push + email channels on top of the existing in-app notifications)

STATUS: prepared for your review. NOT applied to any database. The SQL has NOT been executed (no Postgres/Docker in the authoring
environment). No Edge Function, Firebase or Resend code exists yet; this migration is only the database foundation they need.
It does not depend on migrations A or B and they do not depend on it.

Files: `supabase/migrations/20261101120000_notification_outbox.sql`, `supabase/rollbacks/20261101120000_notification_outbox_down.sql`,
`supabase/tests/notification_outbox.sql` (127 assertions).

## 1. What the existing system already does (verified in the repo)
`internal_notify()` is the single chokepoint for in-app notifications. It already skips self-notifications, skips blocked pairs in both
directions, requires the recipient to be active/restricted, honours the user's five in-app toggles (`user_preferences`), and de-duplicates on
`(user_id, dedupe_key)`. It carries ids only (a message notification holds the conversation id, never the text). Only `admin_publish_announcement` bulk-inserts into `notifications` directly, bypassing `internal_notify` (checked: line 449 of migration 0009; the other insert is inside `internal_notify` itself). `internal_notify` was already redefined once (migration 0012),
so replacing it again would be fragile.

## 2. Design (what C adds)
An AFTER INSERT trigger on `notifications` turns each new in-app notification into zero, one or two outbox rows (push, email). Nothing existing is replaced.
- Per channel it checks: the user's channel preference (optional types only), that a destination exists (an active push token / a verified email), the
  recipient's standing and blocks again (this protects the direct-insert paths), collapsing/cooldown, and hourly/daily caps.
- A failure inside the trigger is caught and only logged as a WARNING, so the in-app notification and the business action can never fail because of a delivery
  channel. Tested by forcing every outbox insert to fail.
- No loop is possible: the trigger writes only to the outbox, which has no triggers. Tested (exactly one notification row is created).
- Only notifications created after C is applied produce deliveries (no backfill, so no send storm on deployment).
- Storage: ids only. No message text, no email address, no copy of a push token in the outbox; the delivery log stores an outcome and a sanitised error code (max 60 chars).

Tables (all RLS-on, no policies, no client grants): `notification_type_config`, `notification_limits`, `notification_channel_prefs`, `push_tokens`,
`notification_outbox`, `notification_delivery_log`.

Defaults (editable in `notification_type_config`, no code change):

| type | push default | email default | user can disable | delay / collapse window |
|---|---|---|---|---|
| message | on | off | yes | 20 s / 10 min (at most one push per conversation per 10 min) |
| comment | on | off | yes | none |
| like, repost | off | off | yes | 5 min / 60 min (folded into "N people liked ...") |
| follow | off | off | yes | none |
| community_join | off | off | yes | 5 min / 60 min |
| announcement | on | off | yes | none |
| moderation_warning | on | on | NO (essential; also bypasses caps) | none |

Caps for optional types: push 12/hour and 60/day per user; email 2/hour and 8/day per user. Excess stays in-app only.
"Opt-in" principle: nothing optional is emailed unless the user turns it on; noisy push types are off until the user turns them on.

User RPCs (authenticated): `get_my_notification_settings`, `get_my_notification_channels`, `set_my_notification_pref`, `register_push_token`,
`revoke_push_token`, `list_my_devices`, `remove_my_device`. Service-role RPCs (Edge Function only): `claim_notification_outbox`,
`complete_notification_outbox`, `invalidate_push_token`, `purge_notification_outbox`.

## 3. Contract for the (future) Edge Function `process-outbox`
Authenticated by the `X-Cron-Secret` header (see SCHEDULER_AND_KEEPALIVE.md). Per run, for each channel:
1. `claim_notification_outbox(channel, 50)`. The function takes due rows with `FOR UPDATE SKIP LOCKED` (overlapping runs are safe), re-checks standing, blocks,
   preference and destination at claim time (a block created while a row waited cancels it), marks non-qualifying rows `skipped`, and returns for each row: ids,
   the actor's public display name, `collapsed_count`, attempt number, and the destination (up to 10 push tokens, or the verified email). A claimed row is locked for 5 minutes; a crashed worker's rows are re-claimed after that.
2. Build generic text from the type and the actor's name, for example "Ada commented on your post", "3 people liked your post". Never include message or post text on a lock screen.
3. Push: send via FCM HTTP v1 to each token. Permanent token errors (UNREGISTERED, invalid token) call `invalidate_push_token(token)`. Report `sent` if at least one token succeeded,
   `retry` for temporary errors (UNAVAILABLE, INTERNAL, QUOTA) with an optional `Retry-After` hint, otherwise `failed`.
4. Email: send via Resend using an idempotency key derived from the outbox id, so a retry cannot double-send. Optional emails must carry a working unsubscribe link and header (a signed-link endpoint is still to be designed). Essential emails (moderation) do not depend on optional preferences.
5. `complete_notification_outbox(id, 'sent' | 'retry' | 'failed', error_code)`. Retry back-off: 1 min, 5 min, 30 min, 2 h; the 5th failed attempt becomes `dead`. A late or duplicate completion for a row that is no longer `sending` is ignored.
6. Finish with `purge_notification_outbox()` in a loop while it returns `"more": true` (finished rows after 30 days; revoked tokens after 90 days; tokens unseen for 270 days).
To verify before relying on them (I could not test any of this): the Edge Function runtime can sign the Google OAuth JWT FCM v1 needs (the Admin SDK may not run there, so plan on plain `fetch`), Resend's current free limits and idempotency header support, and Edge Function execution time limits (size batches to finish well inside them).

## 4. Contract for the frontend (nothing of this exists yet)
- Never ask for notification permission on page load. Ask after an explicit tap ("Turn on notifications") or after a meaningful first action, with a sentence explaining what will be sent. Handle "denied" gracefully; never assume granted.
- After permission: get the FCM web token (VAPID public key is public configuration, a `VITE_` variable), then `register_push_token(token, 'web', label)`. Call it again on each app start when permission is already granted (it refreshes `last_seen_at`).
- Logout: call `revoke_push_token(currentToken)` BEFORE `signOut()` (the call needs the session). If the user is offline, the token is also moved automatically the next time anyone registers it, and the sender revokes tokens that FCM rejects.
- Settings screen: `get_my_notification_settings` (one row per type, effective push/email values, essential types flagged non-optional), `get_my_notification_channels` (is a device registered, is the email verified), `list_my_devices` / `remove_my_device`. Show email toggles disabled with an explanation when the email is not verified.
- The existing service worker (`public/sw.js`) caches the app shell only. It needs `push` and `notificationclick` handlers that open the right route by type. iPhone/iPad web push works only for a home-screen-installed app (iOS 16.4+); Android Chrome works in the browser.
- Environment: Firebase public web config and the VAPID public key are public (`VITE_*`). The Firebase service-account JSON and the Resend API key are Edge Function secrets only, never in the repo or any `VITE_` variable.

## 5. Security review of C
| Area | Result |
|---|---|
| Client access | 6 tables closed (RLS on, no policies, `revoke all`); all functions revoked from public/anon/authenticated first; only the 7 user RPCs granted to `authenticated`; the 4 sender RPCs to `service_role` only. Tests assert `permission denied` for each, including anon and the trigger function |
| Tokens | Device secrets: never returned to any client (`list_my_devices` returns ids/labels only; a test asserts the column list), at most 10 active per user (oldest revoked), 20 registrations per hour per user, suspended accounts cannot register, format and length validated (no dynamic SQL anywhere) |
| Shared devices | Registering a token that belongs to someone else moves it to the caller; the previous user stops receiving pushes on that device. Tested. Residual: someone who steals a device's token could move it to their own account (they could only make the victim's device show the thief's notifications) |
| Blocking | Enforced at enqueue (also for the announcement bulk insert and any future direct insert) and again at claim time; tested with a block created after queueing |
| Privacy | Outbox holds ids only; email address read from `auth.users` only at claim time and returned only to the service role; the delivery log has outcomes and sanitised codes only; lock-screen text must be generic (contract above) |
| Abuse / storms | Per-user hourly and daily caps; collapsing of likes/reposts/joins; per-conversation message cooldown; essential notices bypass caps by design |
| Failure isolation | Trigger errors never roll back the notification (tested by forcing failures) |
| Concurrency | `FOR UPDATE SKIP LOCKED` claiming, lock expiry for crashed workers, idempotent `(notification, channel)` uniqueness, late completions ignored |
| Preferences | Essential types cannot be disabled (error `not_optional`); unknown types and channels rejected |
| Retention | Batched purge; floors of 7 days enforced in code; cascades on user and notification deletion (tested) |
Two defects were found and fixed while reviewing my first draft: PostgreSQL's `greatest()`/`least()` ignore NULLs (the default retry back-off would have collapsed to 30 s), and PostgreSQL regex repetition counts are capped at 255 (a `{20,4096}` token pattern would have raised an error); both are documented behaviour that I could not re-confirm on the live engine this turn.

Residual risks and limits: caps are per user, not global (a platform-wide announcement is one row per user, so it is bounded by the user count); no quiet hours or time-zone handling yet; no digest/batching of different notification types; FCM/Resend quotas are outside the database; everything here is unverified until the SQL suite is run.

## 6. Approvals still needed before the features that use this can ship
`notifications.type` allows only 8 types. These planned types need that constraint widened (a change to an existing constraint, so I will show the exact SQL, impact and rollback first) AND a row each in `notification_type_config`: `event_reminder`, `study_reminder`, `opportunity`, `mentorship_request`, `project_request`, `celebration`, `reply` (reply-to-comment), `security`. Until then those events remain in-app only or absent.

## 7. Testing results
Run (static only): syntax balance, every function revoked, rollback drops every created object, regex repetition counts all below 255.
NOT run: the migration, the 127-assertion suite, anything that needs a real database. Commands are in LOCAL_TESTING_GUIDE.md (the runner now includes this suite and expects 127 verdicts).
Assumptions a first run will confirm: `service_role` can be assumed with `SET LOCAL ROLE` locally; direct inserts into `notifications` by the database owner are unrestricted; `alter table ... add constraint ... check (false) not valid` is accepted inside a DO block (used to force an enqueue failure).

## 8. Rollback
Stop the scheduled function first, then run `20261101120000_notification_outbox_down.sql`. It removes the trigger, 14 functions and 6 tables and nothing else; in-app notifications are unaffected. Data lost: registered push tokens (users must re-register), channel preferences, queued deliveries, delivery log.

## 9. Expected costs (estimates)
- Money: $0 for this migration. FCM is free; Resend is free only within its tier (check current limits) and requires a sender domain you control.
- Database: about 1 outbox row per channel per notification at roughly 150-200 bytes with indexes; 5,000 notifications a day would be about 1-2 MB a day, held 30 days (about 30-60 MB) before purge. At today's scale, negligible.
- Edge Function invocations: the existing plan (one scheduled run every 5-15 minutes) covers delivery and purge.
