# Feature implementation standard (admin-first)

No feature ships as student UI only. Before writing code, answer these 13 questions in the pull request:

1. What can students do? 2. What data is stored? 3. Who can read it (RLS)? 4. What can the **owner** manage?
5. What can an **admin**? 6. What can a **moderator**? 7. What can the student control (privacy, delete, mute)?
8. Abuse scenarios and reports? 9. Which actions go in the audit log? 10. Settings / feature flag needed?
11. Migrations needed? 12. RLS policies needed? 13. Which tests prove allowed AND denied paths?

## Checklist per feature
- **Migration** (new file, never edit applied ones): tables with FKs, CHECK constraints, indexes, `updated_at`; RLS enabled; **explicit column grants** (insert/update only the columns clients may set); writes that need rules go through `SECURITY DEFINER` RPCs with `set search_path = ''`, permission check, input validation, rate limit, audit entry; end with `revoke execute ... from public, anon, authenticated` + targeted grants.
- **Backend enforcement of feature flags** (`public.feature_enabled('key')`) in RPCs/policies, not only in the UI. Flags are not authorization.
- **Admin module**: a page under `src/features/admin/pages/`, a nav entry in `src/features/admin/nav.ts` with the permission key, list + search + pagination, destructive actions behind a reason dialog (min 5 characters) and audit logging. Do not add menu items for unfinished pages.
- **Reports**: add the new target type to `reports.target_type`, `submit_report` (snapshot + visibility check), and the reports queue UI.
- **Privacy**: never put private content (messages) in analytics, audit metadata, snapshots beyond the reported item, or error reports.
- **Tests**: a SQL suite in `supabase/tests/` (rolled back, `PASS`/`FAIL` lines) covering student allowed, student denied, anonymous denied, moderator/admin limits, owner-only paths and abuse limits; unit tests for pure frontend helpers; an e2e smoke where a UI flow is critical.
- **Docs**: update `docs/STATUS.md` honestly (applied? tested? compiled?).

## Monetisation (future, not in the MVP)
Build as its own module: separate tables (campaigns, placements, invoices, ledger), its own permission keys (`monetization.*`), financial records that are append-only, server-side payment verification (Edge Function with provider secrets, never in the browser), clear "Sponsored" labelling kept separate from organic content, admin controls, audit logs, tests. Do not sell personal data. Do not add payment dependencies before that phase is approved.
