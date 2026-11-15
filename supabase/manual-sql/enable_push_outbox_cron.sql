-- Run only after Migration 20261113000028 and after deploying process-outbox.
-- Required extensions: pg_cron, pg_net, and Supabase Vault.
-- Store these two values in Vault first; do not commit real secret values:
-- select vault.create_secret('https://<project-ref>.supabase.co', 'campusconnect_project_url');
-- select vault.create_secret('<same value as the PUSH_WORKER_SECRET Edge Function secret>', 'campusconnect_push_worker_secret');

do $preflight$
begin
  if to_regclass('cron.job') is null
     or to_regclass('net.http_request_queue') is null
     or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Enable pg_cron, pg_net, and Vault before scheduling push delivery';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'campusconnect_project_url'
  ) or not exists (
    select 1 from vault.decrypted_secrets where name = 'campusconnect_push_worker_secret'
  ) then
    raise exception 'Store the Supabase project URL and push worker secret in Vault before scheduling';
  end if;
end
$preflight$;

do $schedule$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'campusconnect-push-outbox';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'campusconnect-push-outbox',
    '* * * * *',
    $job$
      select net.http_post(
        url := rtrim(
          (select decrypted_secret from vault.decrypted_secrets where name = 'campusconnect_project_url'),
          '/'
        ) || '/functions/v1/process-outbox',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' ||
            (select decrypted_secret from vault.decrypted_secrets where name = 'campusconnect_push_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 90000
      );
    $job$
  );
end
$schedule$;
