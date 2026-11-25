create function public.dispatch_push_outbox_immediately()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_project_url text;
  v_worker_secret text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'campusconnect_project_url';

  select decrypted_secret into v_worker_secret
  from vault.decrypted_secrets
  where name = 'campusconnect_push_worker_secret';

  if nullif(btrim(v_project_url), '') is null
     or nullif(btrim(v_worker_secret), '') is null then
    return new;
  end if;

  perform net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/process-outbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_worker_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  return new;
exception
  when others then
    return new;
end
$function$;

revoke execute on function public.dispatch_push_outbox_immediately()
  from public, anon, authenticated;

create trigger push_outbox_dispatch_immediately
  after insert on public.push_outbox
  for each row execute function public.dispatch_push_outbox_immediately();
