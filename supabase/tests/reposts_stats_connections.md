# Reposts / profile stats / connections: test record (script not saved as runnable SQL yet)
LAST RUN: 2026-10-25 on CampusConnect01 after migration 0012: 68 checks, all PASS, rolled back (inline run; ask to save as supabase/tests/reposts_stats_connections.sql).
Covered: repost idempotent, counts, no self/community/private/hidden reposts, direct insert denied, anon denied, notification + dedupe,
31st repost/hour rate-limited, reposts of public users readable but private users' hidden, blocked reposters hidden, Following feed
shows "X reposted" once (deduped with original) at repost time, All feed shows no repost items, activity-cursor pagination,
hidden originals vanish from feed + profile reposts, stats counts/flags (private profile -> not_found, owner/staff ok, anon denied),
followers/following lists (private + blocked excluded, relative is_following, clamp, invalid kind), function lockdown.
KNOWN WEAK TEST: "blocked-by-author user cannot repost" hit cannot_repost_own first; the blocked-either branch of repost_post is
shared with like_post/follow_user (tested in social_core) but deserves a dedicated case.
