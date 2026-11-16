# CampusConnect platform upgrade handoff

## Implemented in this repository

- Discover now includes local, profile-signal recommendations and a separate
  city/state match mode. The recommendation score uses shared interests,
  institution, department, mutual connections, and opted-in location matches.
  It does not use embeddings or an external AI provider.
- A city/state entered for discovery is stored in
  `public.private_discovery_locations`, separate from the public profile.
  Authenticated clients cannot read that table directly. The owner-only
  `get_my_discovery_location` RPC reads it; `set_my_discovery_location` saves
  it or deletes it when the student opts out. Recommendation results expose a
  same-area boolean, not the entered location.
- Notifications support followed-student posts and newly published
  celebrations. Followed-post notifications are opt-in and off by default;
  celebration notifications can be disabled in notification preferences.
  Existing push delivery is reused. Each publish action is capped at 500
  follower notifications.
- The admin dashboard shows aggregate location opt-ins and notification
  counts. It does not expose private city/state text, messages, or individual
  recommendation history.
- The previously added Paystack flow and manual feed-fairness patch remain
  repository-only and are not enabled in the hosted project.

## Database and deployment status

The new migration is
[`20261116000039_local_discovery_notifications.sql`](../supabase/migrations/20261116000039_local_discovery_notifications.sql).
It requires the existing notification and social visibility foundations,
including `public.internal_post_visible_to(uuid,uuid)`. Its preflight checks
stop if those prerequisites are missing or an object already exists.

Production schema and migration history were previously found to be out of
sync. Do not apply this migration or use `supabase db push` until that drift is
reconciled. No hosted SQL, secrets, or function deployments were changed for
this implementation.

The regression suite is
[`local_discovery_notifications.sql`](../supabase/tests/local_discovery_notifications.sql).
Run it only against a disposable database after its listed prerequisites are
installed. Local database linting was unavailable in this environment because
Docker/Podman was not installed, so the SQL has not been executed or
database-validated.

The frontend build and focused tests passed. The build still reports the
existing large-chunk warning.

## Frontend continuation prompt

> Continue the CampusConnect platform upgrade using the existing React,
> TypeScript, Tailwind, Supabase, and red-and-white CampusConnect design
> system. Reuse the current Discover, Notifications, Celebration, and Admin
> components and their existing query/mutation patterns.
>
> Student recommendations must call `recommend_students`; nearby mode must
> pass only `p_location_only`, never a browser-provided location or arbitrary
> location search. Read and save the student’s private city/state only through
> `get_my_discovery_location` and `set_my_discovery_location`. Keep explicit
> opt-in, explain that only city/state should be entered, and provide a clear
> opt-out that removes the stored value. Do not add browser geolocation,
> third-party geocoding, or an embedding provider.
>
> Render `followed_post` notifications as links to the post and
> `celebration_published` notifications as links to the celebration card.
> Preserve existing preference controls and push-notification behavior.
> Admin metrics must use `admin_discovery_overview` and remain aggregate-only
> behind `analytics.view`.
>
> Add focused tests for any new behavior, run typecheck, relevant Vitest tests,
> and the production build. Do not apply or deploy SQL, modify migration
> history, or change Supabase secrets without explicit approval.
