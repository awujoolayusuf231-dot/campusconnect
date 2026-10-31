# Deployment guide

CampusConnect is a static single-page app (Vite build) plus a dedicated Supabase project. It never connects to the whiteshirt.fun project.

## 1. Supabase project (one per environment)
Use a separate Supabase project per environment (e.g. `CampusConnect01` = current; create a second for staging/production if you want isolation).
1. Apply every file in `supabase/migrations/` **in filename order** (SQL editor, or `supabase link` + `supabase db push`). Never edit an applied migration; add a new one. Migration `20261031000013_google_oauth_profile_usernames.sql` reads standard Google name metadata to create readable profile usernames and updates existing Google profiles that still have generated `user_*` handles.
2. Auth > URL Configuration: set **Site URL** to your production origin (e.g. `https://campusconnect.example.ng`) and add it plus `http://localhost:5173` to **Redirect URLs** (use `https://your-domain/**`).
3. Auth > Providers > Email: keep **Confirm email ON**. Keep "Secure password change" on.
4. **Auth > Password security (dashboard only, cannot be set from code):** turn ON **Leaked password protection** (the Supabase security advisor flags it as a WARN while off), and raise the **minimum password length** to at least 8 (the app enforces 8-72 in the form, but the server setting is the real rule).
   Auth > Rate limits and (optionally) CAPTCHA: enable bot protection for sign-up and password reset before launch.
5. Auth > SMTP: the built-in mailer is for testing only and is heavily rate-limited. Configure a real SMTP provider (credentials stay in the Supabase dashboard, never in this repo). Customise the confirm-email and reset-password templates.
6. Storage: buckets `avatars` (public, 2 MB) and `post-images` (private, 5 MB, signed URLs) are created by migration 0005. Confirm in Storage that file-size and MIME limits show.
7. Database > Replication: `messages` and `notifications` must be in the `supabase_realtime` publication (migration 0009 adds them).
8. Backups: check your Supabase plan for daily backups / point-in-time recovery and turn them on before real students sign up. Test a restore into a scratch project once.

## 2. Frontend build
```bash
npm ci
cp .env.example .env.production        # fill in the two browser-safe values
npm run typecheck && npm test && npm run build   # output in dist/
```
Environment variables (browser-safe ONLY): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable/anon key), optional `VITE_APP_URL`.
**Never** put the service-role/secret key, database password or SMTP credentials in any `VITE_` variable: everything with that prefix is public in the built JavaScript.

## 3. Hosting
Any static host works (Cloudflare Pages, Netlify, Vercel, S3+CDN). Requirements:
- **SPA fallback**: all unknown paths must serve `index.html` (e.g. Netlify `/*  /index.html  200`, Vercel rewrite to `/index.html`).
- HTTPS only; redirect HTTP to HTTPS.
- PWA support uses `public/manifest.webmanifest`, `public/sw.js`, and the CampusConnect icons. HTTPS is required in production (localhost is allowed for development). Test the browser's Install app action, installed launch, and offline app shell after deployment. On iPhone/iPad, use Safari's Share menu > Add to Home Screen.
- Keep `/sw.js`, `/manifest.webmanifest`, and `index.html` revalidated rather than long-lived immutable; hashed files under `/assets/` can use long-lived immutable caching.
- **whiteshirt.fun pop-up (Profile > Edit):** the app shows https://www.whiteshirt.fun/ inside a dialog (an iframe). If you add a CSP, include `frame-src https://www.whiteshirt.fun https://whiteshirt.fun`. The pop-up only works if **whiteshirt.fun itself allows being framed**: check with `curl -sI https://www.whiteshirt.fun/ | grep -i -E "x-frame-options|content-security-policy"`. If you see `X-Frame-Options: DENY/SAMEORIGIN` or a CSP `frame-ancestors` that does not list your CampusConnect origin, ask whoever hosts whiteshirt.fun to allow your CampusConnect domain in `frame-ancestors` (and remove X-Frame-Options). Until then the dialog shows a one-click fallback that opens a small separate window.
- Recommended response headers: `Content-Security-Policy` allowing only your origin, `https://*.supabase.co` (API/Realtime wss), and images from `https://*.supabase.co`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `X-Frame-Options: DENY`. Test the CSP in staging; Realtime needs `wss://*.supabase.co`.
- Cache `dist/assets/*` for a long time (hashed filenames); do not cache `index.html`.

## 4. First owner
See README "Become the owner". `provision_owner` is callable only from the SQL editor / postgres role and works once.

## 5. Go-live checklist
Run `docs/SECURITY_CHECKLIST.md`, run the SQL test suites (docs/TESTING.md) against the target project, run Supabase security + performance advisors, add real institutions (Admin > Institutions), set the support email (Admin > Settings), have a lawyer review the Privacy/Terms/Guidelines drafts.

## 6. Rollback
Frontend: redeploy the previous build. Database: migrations are forward-only; write a new corrective migration. For data loss, restore from backup into a scratch project first, then copy rows back deliberately.

## 7. Monitoring
Use Supabase Logs (API, Auth, Postgres) and the advisors weekly. Frontend error reporting is not wired yet: add a provider (e.g. Sentry) behind an env var and scrub message bodies from any payload.
