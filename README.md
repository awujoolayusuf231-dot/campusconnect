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

## Deploy to Vercel
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full production and Supabase checklist. Import this repository into Vercel using the Vite preset, `npm run build` as the build command, and `dist` as the output directory. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the deployment environments, then add each deployed origin to Supabase Authentication > URL Configuration. `vercel.json` configures the SPA rewrite required for direct links and browser refreshes.

## Become the owner
1. Register in the app and verify your email (done for the first account on CampusConnect01).
2. Supabase dashboard > SQL editor (runs as postgres, NOT available to the API):
   `select id, email, created_at from auth.users order by created_at;`  (pick YOUR row)
   `select public.provision_owner('<your-user-id>');`
   It works once and refuses if an owner already exists. Log out and back in; `/admin` becomes available.
3. Then use Admin > Institutions to add your institutions, Admin > Staff to add moderators/admins, and Admin > Settings for the platform name, support email and registration switch.

## Project status
The frontend includes public information pages, authentication, student social and community features, opportunities, and staff administration screens. The production build and test commands are `npm run build` and `npm test`; Supabase-backed functionality requires the correct project configuration and migrations. See [docs/STATUS.md](docs/STATUS.md), [docs/TESTING.md](docs/TESTING.md), and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for implementation status, verification steps, and launch requirements.

## Database migrations
Apply `supabase/migrations/*.sql` in filename order to a NEW Supabase project (SQL editor or `supabase db push`).
The live CampusConnect01 project already has them. Never run these against any other project.
Realtime: `notifications` and `messages` are added to the `supabase_realtime` publication by migration 0009.
