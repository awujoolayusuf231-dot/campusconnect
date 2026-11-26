-- Run only after applying 20261126000050_resend_audience_contact_sync.sql
-- and deploying sync-resend-contacts. Store both values in Supabase Vault:
-- Replace the placeholders with the project URL and the exact secret configured
-- as CAMPUSCONNECT_CONTACT_SYNC_SECRET for the Edge Function. Do not commit the
-- replaced values to source control.
-- select vault.create_secret('https://<project-ref>.supabase.co', 'campusconnect_project_url');
-- select vault.create_secret('<same value as CAMPUSCONNECT_CONTACT_SYNC_SECRET>', 'campusconnect_contact_sync_secret');

do $preflight$
begin
  if to_regclass('cron.job') is null
     or to_regclass('net.http_request_queue') is null
     or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Enable pg_cron, pg_net, and Vault before scheduling Resend contact sync';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'campusconnect_project_url'
  ) or not exists (
    select 1 from vault.decrypted_secrets where name = 'campusconnect_contact_sync_secret'
  ) then
    raise exception 'Store the project URL and contact sync secret in Vault before scheduling';
  end if;
end
$preflight$;

do $schedule$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'campusconnect-resend-contact-sync';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'campusconnect-resend-contact-sync',
    '* * * * *',
    $job$
      select net.http_post(
        url := rtrim(
          (select decrypted_secret from vault.decrypted_secrets where name = 'campusconnect_project_url'),
          '/'
        ) || '/functions/v1/sync-resend-contacts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' ||
            (select decrypted_secret from vault.decrypted_secrets where name = 'campusconnect_contact_sync_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 90000
      );
    $job$
  );
end
$schedule$;
