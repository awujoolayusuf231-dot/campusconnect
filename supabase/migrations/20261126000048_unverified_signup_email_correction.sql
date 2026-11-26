begin;

create table public.unverified_signup_email_correction_limits (
  rate_key text primary key check (rate_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null check (attempts > 0)
);
create index unverified_signup_email_correction_limits_window_idx
  on public.unverified_signup_email_correction_limits (window_started_at);
alter table public.unverified_signup_email_correction_limits enable row level security;
revoke all on public.unverified_signup_email_correction_limits from public, anon, authenticated;
grant all on public.unverified_signup_email_correction_limits to service_role;

create function public.consume_unverified_signup_email_correction_limit(p_rate_key text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempts integer;
begin
  if p_rate_key is null or p_rate_key !~ '^[0-9a-f]{64}$'
     or p_limit not between 1 and 100 then
    raise exception 'invalid_rate_limit_request' using errcode = '22023';
  end if;

  delete from public.unverified_signup_email_correction_limits
  where window_started_at < now() - interval '1 day';

  insert into public.unverified_signup_email_correction_limits as existing
    (rate_key, window_started_at, attempts)
  values (p_rate_key, now(), 1)
  on conflict (rate_key) do update
    set window_started_at = case
          when existing.window_started_at <= now() - interval '15 minutes' then now()
          else existing.window_started_at
        end,
        attempts = case
          when existing.window_started_at <= now() - interval '15 minutes' then 1
          else existing.attempts + 1
        end
  returning attempts into v_attempts;

  return v_attempts <= p_limit;
end
$function$;

revoke all on function public.consume_unverified_signup_email_correction_limit(text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_unverified_signup_email_correction_limit(text, integer)
  to service_role;

commit;
