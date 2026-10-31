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

## Become the owner
1. Register in the app and verify your email (done for the first account on CampusConnect01).
2. Supabase dashboard > SQL editor (runs as postgres, NOT available to the API):
   `select id, email, created_at from auth.users order by created_at;`  (pick YOUR row)
   `select public.provision_owner('<your-user-id>');`
   It works once and refuses if an owner already exists. Log out and back in; `/admin` becomes available.
3. Then use Admin > Institutions to add your institutions, Admin > Staff to add moderators/admins, and Admin > Settings for the platform name, support email and registration switch.

## What works / does not (see docs/STATUS.md for the honest ledger)
Works (code written; frontend NOT yet compiled by the author): register, login, verify email, forgot/reset password,
settings, feed with image posts, likes, comments, follow, discover, profiles, report/block, admin shell, dashboard, user
search + moderation, admin reports queue, communities, notifications, private messaging, announcements, opportunities, institutions/settings/flags/audit/staff admin.
Not built yet: opportunities, institutions admin UI, settings/flags UI, audit log UI, staff management UI,
public info pages, shadcn/ui, e2e tests, deployment guide.

## Database migrations
Apply `supabase/migrations/*.sql` in filename order to a NEW Supabase project (SQL editor or `supabase db push`).
The live CampusConnect01 project already has them. Never run these against any other project.
Realtime: `notifications` and `messages` are added to the `supabase_realtime` publication by migration 0009.
