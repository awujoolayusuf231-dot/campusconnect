-- Run only after applying 20261126000049_resend_email_delivery.sql and deploying
-- process-email-outbox. Store both values in Supabase Vault before running:
-- select vault.create_secret('https://<project-ref>.supabase.co', 'campusconnect_project_url');
-- select vault.create_secret('<CAMPUSCONNECT_EMAIL_WORKER_SECRET value>', 'campusconnect_email_worker_secret');

do $preflight$
begin
  if to_regclass('cron.job') is null
     or to_regclass('net.http_request_queue') is null
     or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Enable pg_cron, pg_net, and Vault before scheduling email delivery';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'campusconnect_project_url'
  ) or not exists (
    select 1 from vault.decrypted_secrets where name = 'campusconnect_email_worker_secret'
  ) then
    raise exception 'Store the project URL and email worker secret in Vault before scheduling';
  end if;
end
$preflight$;

do $schedule$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'campusconnect-email-outbox';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'campusconnect-email-outbox',
    '* * * * *',
    $job$
      select net.http_post(
        url := rtrim(
          (select decrypted_secret from vault.decrypted_secrets where name = 'campusconnect_project_url'),
          '/'
        ) || '/functions/v1/process-email-outbox',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' ||
            (select decrypted_secret from vault.decrypted_secrets where name = 'campusconnect_email_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 90000
      );
    $job$
  );
end
$schedule$;
