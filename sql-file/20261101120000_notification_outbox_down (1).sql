-- ROLLBACK for 20261101120000_notification_outbox.sql. NEVER AUTO-RUN. Independent of migrations A and B.
-- Effect: removes the enqueue trigger, 14 functions and 6 tables. The in-app notifications table, internal_notify and every
-- other pre-existing object are untouched, so in-app notifications keep working exactly as before.
-- DATA LOST (permanently): registered push tokens (users must re-register), users' push/email channel preferences, any
-- queued-but-unsent deliveries, and the delivery log. Export first if you want them:
--   select * from public.notification_channel_prefs;  select id, user_id, platform, created_at from public.push_tokens;
-- Stop the scheduled Edge Function BEFORE rolling back, or it will fail every run.
begin;
drop trigger if exists notifications_enqueue_outbox on public.notifications;
drop function if exists public.purge_notification_outbox(int, int);
drop function if exists public.invalidate_push_token(text);
drop function if exists public.complete_notification_outbox(bigint, text, text, int);
drop function if exists public.claim_notification_outbox(text, int);
drop function if exists public.remove_my_device(uuid);
drop function if exists public.list_my_devices();
drop function if exists public.revoke_push_token(text);
drop function if exists public.register_push_token(text, text, text);
drop function if exists public.set_my_notification_pref(text, text, boolean);
drop function if exists public.get_my_notification_channels();
drop function if exists public.get_my_notification_settings();
drop function if exists public.notifications_enqueue_outbox();
drop function if exists public.internal_channel_available(uuid, text);
drop function if exists public.internal_channel_enabled(uuid, text, text);
drop table if exists public.notification_delivery_log;
drop table if exists public.notification_outbox;
drop table if exists public.push_tokens;
drop table if exists public.notification_channel_prefs;
drop table if exists public.notification_limits;
drop table if exists public.notification_type_config;
commit;
