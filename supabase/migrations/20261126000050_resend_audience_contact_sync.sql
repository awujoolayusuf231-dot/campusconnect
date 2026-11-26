begin;

do $preflight$
begin
  if to_regclass('public.user_preferences') is null
     or to_regprocedure('public.has_permission(text)') is null
     or to_regprocedure('public.log_admin_action(uuid,text,text,text,text,jsonb)') is null then
    raise exception 'Resend contact sync requires the user preferences and admin authorization foundations';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_preferences'
      and column_name in ('marketing_email_consent', 'marketing_email_consent_at')
  ) or to_regclass('public.resend_contact_sync_state') is not null
     or to_regclass('public.resend_contact_webhook_events') is not null then
    raise exception 'Resend contact sync objects already exist; inspect the schema before applying this migration';
  end if;
end
$preflight$;

alter table public.user_preferences
  add column marketing_email_consent boolean not null default false,
  add column marketing_email_consent_at timestamptz;
grant insert (user_id, marketing_email_consent) on public.user_preferences to authenticated;
grant update (marketing_email_consent) on public.user_preferences to authenticated;

create table public.resend_contact_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'synced', 'skipped', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  revision integer not null default 1 check (revision > 0),
  claimed_revision integer,
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  provider_contact_id text check (provider_contact_id is null or char_length(provider_contact_id) between 1 and 200),
  provider_unsubscribed boolean not null default false,
  resubscribe_allowed boolean not null default false,
  last_error text check (last_error is null or char_length(last_error) <= 100),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index resend_contact_sync_pending_idx
  on public.resend_contact_sync_state (next_attempt_at, created_at, user_id)
  where status in ('pending', 'sending');
alter table public.resend_contact_sync_state enable row level security;
revoke all on public.resend_contact_sync_state from public, anon, authenticated;
grant select, insert, update, delete on public.resend_contact_sync_state to service_role;

create table public.resend_contact_webhook_events (
  event_id text primary key check (char_length(event_id) between 1 and 200),
  contact_id text not null check (char_length(contact_id) between 1 and 200),
  audience_id text not null check (char_length(audience_id) between 1 and 200),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);
alter table public.resend_contact_webhook_events enable row level security;
revoke all on public.resend_contact_webhook_events from public, anon, authenticated;
grant select, insert on public.resend_contact_webhook_events to service_role;

create function public.stamp_marketing_email_consent()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.marketing_email_consent_at := case
      when new.marketing_email_consent then now()
      else null
    end;
  elsif new.marketing_email_consent and not old.marketing_email_consent then
    new.marketing_email_consent_at := now();
  elsif not new.marketing_email_consent then
    new.marketing_email_consent_at := old.marketing_email_consent_at;
  end if;
  return new;
end
$function$;
create trigger user_preferences_stamp_marketing_consent
  before insert or update of marketing_email_consent on public.user_preferences
  for each row execute function public.stamp_marketing_email_consent();

create function public.queue_resend_contact_sync(p_user_id uuid, p_reconsent boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_user_id is null then return; end if;
  insert into public.resend_contact_sync_state (user_id, resubscribe_allowed)
  values (p_user_id, p_reconsent)
  on conflict (user_id) do update
  set revision = public.resend_contact_sync_state.revision + 1,
      status = case when public.resend_contact_sync_state.status = 'sending' then 'sending' else 'pending' end,
      attempts = case when public.resend_contact_sync_state.status = 'sending'
        then public.resend_contact_sync_state.attempts else 0 end,
      claimed_revision = case when public.resend_contact_sync_state.status = 'sending'
        then public.resend_contact_sync_state.claimed_revision else null end,
      next_attempt_at = now(),
      lease_expires_at = case when public.resend_contact_sync_state.status = 'sending'
        then public.resend_contact_sync_state.lease_expires_at else null end,
      provider_unsubscribed = case when p_reconsent
        then false else public.resend_contact_sync_state.provider_unsubscribed end,
      resubscribe_allowed = case when p_reconsent
        then true else public.resend_contact_sync_state.resubscribe_allowed end,
      last_error = null,
      updated_at = now();
end
$function$;

create function public.queue_resend_contact_sync_from_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reconsent boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_reconsent := new.marketing_email_consent and not old.marketing_email_consent;
  else
    v_reconsent := new.marketing_email_consent;
  end if;
  perform public.queue_resend_contact_sync(new.user_id, v_reconsent);
  return new;
end
$function$;
create trigger user_preferences_queue_resend_contact_sync
  after insert or update of marketing_email_consent on public.user_preferences
  for each row execute function public.queue_resend_contact_sync_from_preferences();

create function public.queue_resend_contact_sync_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.user_preferences (user_id, marketing_email_consent)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'marketing_email_consent', '') = 'true')
    on conflict (user_id) do nothing;
    if not exists (
      select 1 from public.resend_contact_sync_state where user_id = new.id
    ) then
      perform public.queue_resend_contact_sync(new.id, false);
    end if;
  else
    perform public.queue_resend_contact_sync(new.id, false);
  end if;
  return new;
end
$function$;
create trigger auth_users_queue_resend_contact_sync
  after insert or update of email, email_confirmed_at, raw_user_meta_data on auth.users
  for each row execute function public.queue_resend_contact_sync_from_auth_user();

create function public.claim_resend_contact_sync(p_limit integer default 20)
returns table (
  user_id uuid,
  revision integer,
  marketing_email_consent boolean,
  provider_unsubscribed boolean,
  resubscribe_allowed boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with eligible as (
    select sync.user_id
    from public.resend_contact_sync_state sync
    where (sync.status = 'pending' and sync.next_attempt_at <= now())
       or (sync.status = 'sending' and sync.lease_expires_at < now())
    order by sync.next_attempt_at, sync.created_at, sync.user_id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  ),
  claimed as (
    update public.resend_contact_sync_state sync
    set status = 'sending',
        attempts = sync.attempts + 1,
        claimed_revision = sync.revision,
        lease_expires_at = now() + interval '5 minutes',
        updated_at = now()
    from eligible
    where sync.user_id = eligible.user_id
    returning sync.user_id, sync.revision, sync.provider_unsubscribed
  )
  select
    claimed.user_id,
    claimed.revision,
    coalesce(preferences.marketing_email_consent, false),
    claimed.provider_unsubscribed,
    sync.resubscribe_allowed
  from claimed
  join public.resend_contact_sync_state sync on sync.user_id = claimed.user_id
  left join public.user_preferences preferences on preferences.user_id = claimed.user_id;
end
$function$;

create function public.finish_resend_contact_sync(
  p_user_id uuid,
  p_revision integer,
  p_result text,
  p_error text default null,
  p_provider_contact_id text default null,
  p_observed_unsubscribed boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sync public.resend_contact_sync_state%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_result is null or p_result not in ('synced', 'retry', 'failed', 'skipped')
     or p_error is not null and char_length(p_error) > 100
     or p_provider_contact_id is not null and char_length(p_provider_contact_id) not between 1 and 200 then
    raise exception 'invalid_contact_sync_result' using errcode = '22023';
  end if;

  select * into v_sync
  from public.resend_contact_sync_state
  where user_id = p_user_id and status = 'sending' and claimed_revision = p_revision
  for update;
  if not found then return; end if;

  if v_sync.revision <> p_revision then
    update public.resend_contact_sync_state
    set status = 'pending',
        claimed_revision = null,
        lease_expires_at = null,
        next_attempt_at = now(),
        updated_at = now()
    where user_id = p_user_id;
    return;
  end if;

  if p_result = 'synced' then
    update public.resend_contact_sync_state
    set status = 'synced',
        provider_contact_id = coalesce(p_provider_contact_id, provider_contact_id),
        provider_unsubscribed = provider_unsubscribed or coalesce(p_observed_unsubscribed, false),
        resubscribe_allowed = false,
        claimed_revision = null,
        lease_expires_at = null,
        last_error = null,
        last_synced_at = now(),
        updated_at = now()
    where user_id = p_user_id;
  elsif p_result = 'skipped' then
    update public.resend_contact_sync_state
    set status = 'skipped',
        claimed_revision = null,
        lease_expires_at = null,
        last_error = left(coalesce(p_error, 'contact_not_eligible'), 100),
        updated_at = now()
    where user_id = p_user_id;
  elsif p_result = 'failed' or v_sync.attempts >= 8 then
    update public.resend_contact_sync_state
    set status = 'failed',
        claimed_revision = null,
        lease_expires_at = null,
        last_error = left(coalesce(p_error, 'contact_sync_failed'), 100),
        updated_at = now()
    where user_id = p_user_id;
  else
    update public.resend_contact_sync_state
    set status = 'pending',
        claimed_revision = null,
        lease_expires_at = null,
        next_attempt_at = now() + make_interval(secs => least(3600, 15 * power(2, v_sync.attempts - 1)::integer)),
        last_error = left(coalesce(p_error, 'contact_sync_failed'), 100),
        updated_at = now()
    where user_id = p_user_id;
  end if;
end
$function$;

create function public.record_resend_contact_unsubscribe(
  p_event_id text,
  p_contact_id text,
  p_audience_id text,
  p_email text,
  p_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_consent_at timestamptz;
  v_verified_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_event_id is null or char_length(p_event_id) not between 1 and 200
     or p_contact_id is null or char_length(p_contact_id) not between 1 and 200
     or p_audience_id is null or char_length(p_audience_id) not between 1 and 200
     or p_email is null or char_length(btrim(p_email)) not between 3 and 320
     or p_occurred_at is null then
    raise exception 'invalid_contact_webhook_event' using errcode = '22023';
  end if;

  insert into public.resend_contact_webhook_events (event_id, contact_id, audience_id, occurred_at)
  values (p_event_id, p_contact_id, p_audience_id, p_occurred_at)
  on conflict (event_id) do nothing;
  if not found then return; end if;

  select auth_user.id, preferences.marketing_email_consent_at, auth_user.email_confirmed_at
  into v_user_id, v_consent_at, v_verified_at
  from auth.users auth_user
  left join public.user_preferences preferences on preferences.user_id = auth_user.id
  where lower(auth_user.email) = lower(btrim(p_email))
  limit 1;
  if v_user_id is null then return; end if;

  if p_occurred_at <= greatest(
    coalesce(v_consent_at, '-infinity'::timestamptz),
    coalesce(v_verified_at, '-infinity'::timestamptz)
  ) then
    return;
  end if;

  insert into public.resend_contact_sync_state (user_id, provider_contact_id, provider_unsubscribed)
  values (v_user_id, p_contact_id, true)
  on conflict (user_id) do update
  set provider_contact_id = excluded.provider_contact_id,
      provider_unsubscribed = true,
      resubscribe_allowed = false,
      revision = public.resend_contact_sync_state.revision + 1,
      status = 'pending',
      attempts = 0,
      claimed_revision = null,
      lease_expires_at = null,
      next_attempt_at = now(),
      last_error = null,
      updated_at = now();
end
$function$;

create function public.admin_queue_resend_contact_backfill()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_eligible integer;
  v_missing_email integer;
  v_skipped_consent integer;
  v_skipped_unverified integer;
  v_queued integer;
begin
  if v_actor is null or not public.has_permission('settings.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*) filter (
      where nullif(btrim(auth_user.email), '') is not null
        and auth_user.email_confirmed_at is not null
        and coalesce(preferences.marketing_email_consent, false)
    ),
    count(*) filter (
      where nullif(btrim(auth_user.email), '') is null
    ),
    count(*) filter (
      where nullif(btrim(auth_user.email), '') is not null
        and not coalesce(preferences.marketing_email_consent, false)
    ),
    count(*) filter (
      where nullif(btrim(auth_user.email), '') is not null
        and coalesce(preferences.marketing_email_consent, false)
        and auth_user.email_confirmed_at is null
    )
  into v_eligible, v_missing_email, v_skipped_consent, v_skipped_unverified
  from auth.users auth_user
  left join public.user_preferences preferences on preferences.user_id = auth_user.id;

  insert into public.resend_contact_sync_state (user_id)
  select auth_user.id
  from auth.users auth_user
  join public.user_preferences preferences on preferences.user_id = auth_user.id
  where nullif(btrim(auth_user.email), '') is not null
    and auth_user.email_confirmed_at is not null
    and preferences.marketing_email_consent
  on conflict (user_id) do update
  set revision = public.resend_contact_sync_state.revision + 1,
      status = case when public.resend_contact_sync_state.status = 'sending' then 'sending' else 'pending' end,
      attempts = case when public.resend_contact_sync_state.status = 'sending'
        then public.resend_contact_sync_state.attempts else 0 end,
      claimed_revision = case when public.resend_contact_sync_state.status = 'sending'
        then public.resend_contact_sync_state.claimed_revision else null end,
      next_attempt_at = now(),
      lease_expires_at = case when public.resend_contact_sync_state.status = 'sending'
        then public.resend_contact_sync_state.lease_expires_at else null end,
      last_error = null,
      updated_at = now()
  where public.resend_contact_sync_state.status <> 'sending';
  get diagnostics v_queued = row_count;

  perform public.log_admin_action(
    v_actor,
    'resend.contacts.backfill',
    'email_audience',
    null,
    null,
    jsonb_build_object(
      'eligible', v_eligible,
      'queued', v_queued,
      'skipped_missing_email', v_missing_email,
      'skipped_consent', v_skipped_consent,
      'skipped_unverified', v_skipped_unverified
    )
  );
  return jsonb_build_object(
    'total_eligible', v_eligible,
    'queued', v_queued,
    'skipped_missing_email', v_missing_email,
    'skipped_consent', v_skipped_consent,
    'skipped_unverified', v_skipped_unverified
  );
end
$function$;

create function public.admin_resend_contact_sync_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_stats jsonb;
begin
  if auth.uid() is null or not public.has_permission('settings.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'total_eligible', count(*) filter (
      where coalesce(preferences.marketing_email_consent, false)
        and nullif(btrim(auth_user.email), '') is not null
        and auth_user.email_confirmed_at is not null
    ),
    'synced', count(*) filter (where sync.status = 'synced'),
    'failed', count(*) filter (where sync.status = 'failed'),
    'pending', count(*) filter (where sync.status in ('pending', 'sending')),
    'skipped_missing_email', count(*) filter (
      where nullif(btrim(auth_user.email), '') is null
    ),
    'skipped_consent', count(*) filter (
      where nullif(btrim(auth_user.email), '') is not null
        and not coalesce(preferences.marketing_email_consent, false)
    ),
    'skipped_unverified', count(*) filter (
      where nullif(btrim(auth_user.email), '') is not null
        and coalesce(preferences.marketing_email_consent, false)
        and auth_user.email_confirmed_at is null
    )
  )
  into v_stats
  from auth.users auth_user
  left join public.user_preferences preferences on preferences.user_id = auth_user.id
  left join public.resend_contact_sync_state sync on sync.user_id = auth_user.id;
  return v_stats;
end
$function$;

create function public.dispatch_resend_contact_sync()
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
  from vault.decrypted_secrets where name = 'campusconnect_project_url';
  select decrypted_secret into v_worker_secret
  from vault.decrypted_secrets where name = 'campusconnect_contact_sync_secret';
  if nullif(btrim(v_project_url), '') is null or nullif(btrim(v_worker_secret), '') is null then
    return new;
  end if;
  perform net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/sync-resend-contacts',
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
    raise log 'Resend contact sync dispatch failed; queued contacts remain available for scheduled retry.';
    return new;
end
$function$;
create trigger resend_contact_sync_dispatch
  after insert or update of status on public.resend_contact_sync_state
  for each row when (new.status = 'pending')
  execute function public.dispatch_resend_contact_sync();

revoke all on function public.stamp_marketing_email_consent(),
  public.queue_resend_contact_sync(uuid, boolean),
  public.queue_resend_contact_sync_from_preferences(),
  public.queue_resend_contact_sync_from_auth_user(),
  public.dispatch_resend_contact_sync()
  from public, anon, authenticated, service_role;
revoke all on function public.claim_resend_contact_sync(integer),
  public.finish_resend_contact_sync(uuid, integer, text, text, text, boolean),
  public.record_resend_contact_unsubscribe(text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_resend_contact_sync(integer),
  public.finish_resend_contact_sync(uuid, integer, text, text, text, boolean),
  public.record_resend_contact_unsubscribe(text, text, text, text, timestamptz)
  to service_role;
revoke all on function public.admin_queue_resend_contact_backfill(),
  public.admin_resend_contact_sync_stats()
  from public, anon;
grant execute on function public.admin_queue_resend_contact_backfill(),
  public.admin_resend_contact_sync_stats()
  to authenticated;

do $postflight$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.resend_contact_sync_state'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.resend_contact_webhook_events'::regclass)
     or has_table_privilege('authenticated', 'public.resend_contact_sync_state', 'select,insert,update,delete')
     or has_table_privilege('anon', 'public.resend_contact_webhook_events', 'select,insert,update,delete')
     or has_function_privilege('anon', 'public.admin_queue_resend_contact_backfill()', 'execute')
     or has_function_privilege('authenticated', 'public.claim_resend_contact_sync(integer)', 'execute') then
    raise exception 'Resend contact sync security postflight failed';
  end if;
end
$postflight$;

commit;
