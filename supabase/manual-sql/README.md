# Manual feed, visibility, and analytics SQL

These scripts are for **manual review and application only**. They are outside
`supabase/migrations`, are not applied by this change, and must not be run
against a database until its current state has been checked.

## What exists already

- The hashtag tables and RPCs are prepared in
  [`sql-file/20261101100000_hashtags.sql`](../../sql-file/20261101100000_hashtags.sql)
  (Migration A).
- The impression/profile-view tables and RPCs are prepared in
  [`sql-file/20261101110000_post_impressions_profile_views.sql`](../../sql-file/20261101110000_post_impressions_profile_views.sql)
  (Migration B). It enforces a minimum of three distinct viewers for returned
  analytics and keeps raw per-viewer rows inaccessible to client roles.
- These scripts are not in `supabase/migrations`. Their headers and
  [`sql-file/LOCAL_TESTING_GUIDE.md`](../../sql-file/LOCAL_TESTING_GUIDE.md)
  say they were prepared but not applied in the author's environment. That
  does **not** establish the state of your hosted Supabase project.
- The repository's existing `feed_timeline` is a chronological, security-
  invoker RPC. The frontend already records impressions through Migration B's
  `record_post_impressions`, but does not yet show author analytics.
- Existing RLS hides posts using profile visibility, account status,
  bidirectional blocks, and active community membership. There is no
  post-specific audience column or ranked-feed RPC.

Do not copy Migration A or B into this folder or apply either blindly. Use
`00_preflight.sql` first. If A or B is missing, review and apply the existing
`sql-file` version only after checking its dependencies and testing it on a
local database. If either is already present, do not apply it again.

## Order

1. Apply the repository's existing migrations required by this feature,
   including social core, community/social hardening, reposts, and celebration
   cards.
2. Run [`00_preflight.sql`](./00_preflight.sql). It is read-only.
3. If missing, review and apply Migration A, then Migration B, from `sql-file`.
   A must precede B. The prepared files contain their own preflight checks.
4. Review and apply [`01_post_visibility.sql`](./01_post_visibility.sql). It
   adds post audiences and updates the existing shared visibility helpers;
   it does not create replacement tables or policies.
5. Review and apply [`02_ranked_feed.sql`](./02_ranked_feed.sql). It adds a
   ranked-feed RPC and private numeric settings in the existing
   `platform_settings` table.
6. If the ranked-feed RPC is already installed and its prerequisites are
   confirmed, review and apply
   [`04_ranked_feed_fairness.sql`](./04_ranked_feed_fairness.sql). It adds a
   bounded recent-exposure signal to the existing RPC without changing its
   result shape. Do not apply it until production schema/migration drift has
   been reconciled.
7. Run [`03_verify.sql`](./03_verify.sql). It is read-only. Then run the
   existing local hashtag, impression, and social RLS test suites before
   enabling the new UI for users.

The scripts are transactional individually and stop if prerequisites are
missing or a patch appears to have already been applied. Do not remove the
preflight checks or run a partial excerpt.

## Security behavior

- Existing posts backfill to `public`, preserving their current audience.
- New main-feed posts support `public`, `followers`, `institution`, and
  `private`; community posts are forced to `community` and remain restricted
  to active members of an active community.
- Audience checks re-use `internal_post_visible_to`, and the hardened RLS
  helper delegates to it. Account/profile visibility and blocks in **either**
  direction are checked before a post is returned. A missing institution
  prevents selecting the institution audience.
- Hashtag autocomplete and trending aggregates count only public posts from
  public profiles. Individual hashtag results and impression recording use
  the audience-aware shared helper.
- The ranked RPC is `SECURITY DEFINER`, but applies the same per-post
  visibility helper and active-account checks before returning rows. It is
  authenticated-only.
- Ranking weights are private `platform_settings` entries. Staff with
  `settings.manage` can adjust them in Admin → Settings. The SQL clamps each
  value to a safe range; malformed values fall back to defaults.
- The fairness signal uses the previous seven complete Lagos calendar days of
  post impressions. Lower-exposure creators receive a bounded additive boost;
  no creator exposure counts are returned to clients. The weight is private
  and clamped to 0–3.
- Analytics continue to use Migration B's privacy threshold. The frontend
  must not show per-viewer data or figures below the threshold.

## Verification and rollback

`03_verify.sql` only reads schema/catalog state and does not create test data.
The existing migration A/B SQL suites and `supabase/tests/social_core.sql`
should be run against a disposable local Supabase database before production
application. No SQL or remote database behavior has been verified by this
change.

These are forward-only privacy changes. Do **not** drop the `visibility`
column or restore the older helper while non-public posts exist: that could
make private content public. To disable ranking, remove the "For you" UI or
set its weights to zero; leave the SQL in place. A full rollback of audience
controls requires an explicit data review and a separately reviewed migration.
