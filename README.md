# CampusConnect (Phase 6 build)

Student social network for Nigerian tertiary institutions. React + Vite + TypeScript (strict) + Tailwind + Supabase.

## Run locally (VS Code terminal)
```bash
npm install
cp .env.example .env.local        # then edit .env.local
npm run typecheck
npm test
npm run dev                       # http://localhost:5173
npm run build
```
`.env.local` needs only browser-safe values (Supabase dashboard > Project Settings > API Keys):
- `VITE_SUPABASE_URL` = `https://yfyssczefqicdpbtqmlh.supabase.co`  (CampusConnect01)
- `VITE_SUPABASE_PUBLISHABLE_KEY` = the **publishable** key. NEVER the service-role/secret key.

## Supabase dashboard settings you must do (cannot be done from code)
Authentication > URL Configuration: Site URL `http://localhost:5173` (and your production URL later) and add
`http://localhost:5173/**` to Redirect URLs. Authentication > Providers > Email: keep "Confirm email" ON.

### Resend email delivery

The Supabase built-in mailer is for local testing only. For a live project, verify a sending domain in Resend, then configure Supabase Auth > SMTP with host `smtp.resend.com`, port `465`, username `resend`, your Resend API key as the password, and a verified sender address. Keep the key in Supabase's SMTP settings and Edge Function secrets only—never in `.env.local`, any `VITE_` variable, or Git.

Branded Supabase Auth templates are in `supabase/templates/`; copy them to the matching hosted Auth template fields. Supabase Auth continues to create and validate account verification, email-change, and password recovery links. Welcome and opt-in activity email use the Resend outbox worker. Apply the migration, configure the secrets/webhook/cron, and deploy steps in [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) before expecting live delivery.

## Become the owner
1. Register in the app and verify your email (done for the first account on CampusConnect01).
2. Supabase dashboard > SQL editor (runs as postgres, NOT available to the API):
   `select id, email, created_at from auth.users order by created_at;`  (pick YOUR row)
   `select public.provision_owner('<your-user-id>');`
   It works once and refuses if an owner already exists. Log out and back in; `/admin` becomes available.
3. Then use Admin > Institutions to add your institutions, Admin > Staff to add moderators/admins, and Admin > Settings for the platform name, support email and registration switch.

## What works / does not (see docs/STATUS.md for the honest ledger)
Works (code written; validate locally before deployment): register, login, verify email, forgot/reset password,
settings, feed with image posts, likes, comments, follow, discover, profiles, report/block, admin shell, dashboard, user
search + moderation, admin reports queue, communities, notifications, private messaging, announcements, opportunities, institutions/settings/flags/audit/staff admin, student portfolios, private CV builder, and private timetable planner.
Still outstanding: authenticated Playwright journeys, shadcn/ui adoption, and production deployment/release verification.

## Database migrations
For a NEW Supabase project, apply `supabase/migrations/*.sql` in filename order (SQL editor or `supabase db push`). For an existing project, apply only migrations that are not already recorded as applied. Never replay a migration that has already succeeded.
Realtime: `notifications` and `messages` are added to the `supabase_realtime` publication by migration 0009.

### Group Quiz, celebrations, and Firebase push setup

For an existing database already through migration `20261113000024`, apply these SQL files in order in the Supabase SQL Editor:

1. `20261113000026_group_quiz.sql` — quiz groups, membership, publishing, attempts, scoring, and RLS.
2. `20261113000027_celebration_cards.sql` — celebration cards, private image storage, reminders, and feed integration.
3. `20261113000028_push_notifications.sql` — push subscriptions and the notification delivery queue.
4. `20261114000030_fix_celebration_jsonb_object_length.sql` — fixes the celebration save RPC for PostgreSQL, including projects where migration 27 already ran.

Migration `20261113000025_flashcards_backend.sql` is only needed for the flashcards feature. If the project is not yet through migration 24, apply the missing earlier migrations first, in filename order. Do not replay a migration that has already succeeded. These migrations create the backend objects the app calls; deploying the frontend alone is not enough.

Group Quiz publication uses `save_group_quiz` from migration 26. Active group owners and moderators can publish; active members can see a published quiz immediately and start it when its scheduled start time arrives. A database error such as a missing RPC/table means the migration has not been applied to the Supabase project used by the app.

The celebration migration creates the private `celebration-images` bucket and its policies automatically. No manual bucket creation is required. Published cards appear in the Celebrations discovery page and upcoming list.

If a community cover upload is rejected by Storage after migration `20261112000018`, apply [migration `20261114000029_repair_community_cover_upload.sql`](./supabase/migrations/20261114000029_repair_community_cover_upload.sql) after the community migrations. It repairs the expected permissive and restrictive INSERT policies without making the bucket public or allowing non-owners to upload.

If a cover uploads but cannot be displayed or signed, apply [migration `20261114000031_repair_community_cover_read.sql`](./supabase/migrations/20261114000031_repair_community_cover_read.sql). It restores private SELECT policies for the current cover image only; the bucket remains private.

### Student portfolios, CV builder, and timetable

For a database that has already applied all required migrations through `20261114000031`, review and apply `20261115000032_student_portfolio_cv_timetable.sql` once. It creates owner-only portfolio editing, a sanitized public portfolio RPC, a private project-image bucket, private CV records, and private timetable events. It also seeds the `student_portfolio`, `student_cv_builder`, and `student_timetable` feature flags; they appear in Admin > Settings. Do not reapply a migration that has already succeeded.

The public portfolio route exposes only published portfolios and the allowlisted fields in its RPC; CVs and timetable entries have no public or staff read policy. CV PDF export uses the browser's print dialog (“Save as PDF”). Timetable push reminders are not enabled because no trusted event scheduler exists yet.

`supabase/tests/student_tools.sql` contains rollback-only RLS/behavior checks for review after migration. It has not been run. **No SQL for migration 32 or its test file has been executed or applied to Supabase.**

Firebase push requires configuration in addition to migrations 27 and 28. Migration 28 provides
`push_subscriptions`, `push_outbox`, `claim_push_outbox`, and `finish_push_outbox`; the worker also
calls `queue_due_celebration_reminders()` from migration 27 before claiming jobs.

1. In Firebase Console, create a Web App, enable Firebase Cloud Messaging, and generate a Web Push certificate key. Put the Firebase Web App values and VAPID public key in `.env.local` using the `VITE_FIREBASE_*` names from `.env.example`, and set the same values in the production frontend build environment.
2. The Firebase service-account JSON is already stored as the `FIREBASE_SERVICE_ACCOUNT` Edge Function secret. Add a long random `PUSH_WORKER_SECRET` if it is not already set, for example with `supabase secrets set PUSH_WORKER_SECRET="<long-random-value>"`. Never put either value in `.env.local`, frontend variables, or source control. The function also uses the Supabase-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Pause any existing cron job that calls the legacy `send-push-notifications` endpoint. Deploy the worker from the repository root with the exact command `supabase functions deploy process-outbox`. The function verifies the shared `PUSH_WORKER_SECRET` itself; keep `[functions.process-outbox] verify_jwt = false` in `supabase/config.toml`.
4. Store the same worker secret in Supabase Vault under the name `push_worker_secret`, then enable the `pg_cron` and `pg_net` extensions in the Supabase Dashboard. Run this SQL once, replacing `<project-ref>` with the project reference:

```sql
select cron.unschedule(jobid)
from cron.job
where jobname = 'campusconnect-push-dispatch';

select cron.schedule(
  'campusconnect-push-dispatch',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/process-outbox',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'push_worker_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb
    );
  $job$
);
```

After redeploying the frontend over HTTPS (localhost is also supported for development), sign in and use Notifications → This device → Enable on this device. Allow browser notifications. To verify delivery, create a notification-producing action and check that `public.push_outbox` changes from `pending` to `delivered`. The app can store tokens and enqueue notifications without the worker schedule, but pushes will not be sent until the Edge Function and cron job are configured.

The worker rechecks push/category preferences, account standing, and actor/recipient blocks immediately before sending. The outbox has one status per notification rather than per device: any successful device marks that notification delivered; retries occur when no device succeeds. Invalid FCM registrations are removed. Tests exercise decision logic only and do not call Firebase or send notifications.

If `send-push-notifications` was previously deployed, keep its cron paused during cutover. Its deployed copy is not changed by deploying `process-outbox`; after switching the schedule to the new endpoint, remove the legacy function or deploy the updated compatibility endpoint before enabling any old schedule.
