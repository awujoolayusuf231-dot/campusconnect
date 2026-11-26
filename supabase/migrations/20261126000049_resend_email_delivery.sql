begin;

do $preflight$
begin
  if to_regclass('public.notifications') is null
     or to_regclass('public.user_preferences') is null
     or to_regclass('public.account_standing') is null
     or to_regprocedure('public.effective_status_internal(uuid)') is null
     or to_regprocedure('public.internal_blocked_either(uuid,uuid)') is null then
    raise exception 'Resend email delivery requires notification, preference, and account-security foundations';
  end if;
  if to_regclass('public.email_outbox') is not null
     or to_regclass('public.email_delivery_events') is not null
     or exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'user_preferences' and column_name = 'notify_email'
     ) then
    raise exception 'Email delivery objects already exist; inspect the schema before applying this migration';
  end if;
end
$preflight$;

alter table public.user_preferences
  add column notify_email boolean not null default false;
grant insert (user_id, notify_email) on public.user_preferences to authenticated;
grant update (notify_email) on public.user_preferences to authenticated;

create table public.email_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  message_type text not null check (message_type in ('welcome', 'activity')),
  notification_id bigint unique references public.notifications(id) on delete cascade,
  dedupe_key text not null unique check (char_length(dedupe_key) between 1 and 200),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'accepted', 'delayed', 'delivered', 'bounced', 'complained', 'suppressed', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  provider_email_id text unique,
  last_error text check (last_error is null or char_length(last_error) <= 100),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  delivered_at timestamptz,
  processed_at timestamptz,
  constraint email_outbox_message_target_check check (
    (message_type = 'activity' and notification_id is not null)
    or (message_type = 'welcome' and notification_id is null)
  )
);
create index email_outbox_pending_idx on public.email_outbox (next_attempt_at, created_at, id)
  where status in ('pending', 'sending');
create index email_outbox_user_idx on public.email_outbox (user_id, created_at desc);
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.email_outbox to service_role;
grant usage, select on sequence public.email_outbox_id_seq to service_role;

create table public.email_delivery_events (
  event_id text primary key check (char_length(event_id) between 1 and 200),
  provider_email_id text check (provider_email_id is null or char_length(provider_email_id) between 1 and 200),
  outbox_id bigint references public.email_outbox(id) on delete cascade,
  event_type text not null check (event_type in (
    'email.sent', 'email.delivered', 'email.delivery_delayed', 'email.bounced',
    'email.complained', 'email.failed', 'email.suppressed'
  )),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  check (provider_email_id is not null or outbox_id is not null)
);
create index email_delivery_events_provider_idx
  on public.email_delivery_events (provider_email_id, occurred_at desc)
  where provider_email_id is not null;
create index email_delivery_events_outbox_idx
  on public.email_delivery_events (outbox_id, occurred_at desc)
  where outbox_id is not null;
alter table public.email_delivery_events enable row level security;
revoke all on public.email_delivery_events from public, anon, authenticated;
grant select, insert on public.email_delivery_events to service_role;

create function public.enqueue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email_enabled boolean := false;
  v_category_enabled boolean := true;
  v_system_notice boolean := new.type in ('announcement', 'moderation_warning');
begin
  select
    coalesce(preferences.notify_email, false),
    coalesce(case new.type
      when 'follow' then preferences.notify_follows
      when 'like' then preferences.notify_likes
      when 'repost' then preferences.notify_likes
      when 'comment' then preferences.notify_comments
      when 'community_join' then preferences.notify_community
      when 'message' then preferences.notify_messages
      when 'discussion_reply' then preferences.notify_discussions
      when 'followed_post' then preferences.notify_followed_posts
      when 'celebration_reminder' then preferences.notify_celebrations
      when 'celebration_published' then preferences.notify_celebrations
      else true
    end, true)
  into v_email_enabled, v_category_enabled
  from public.user_preferences preferences
  where preferences.user_id = new.user_id;

  if not found then
    v_email_enabled := false;
    v_category_enabled := true;
  end if;
  if not v_category_enabled or (not v_system_notice and not v_email_enabled) then
    return new;
  end if;

  insert into public.email_outbox (user_id, message_type, notification_id, dedupe_key)
  values (new.user_id, 'activity', new.id, 'notification:' || new.id::text)
  on conflict do nothing;
  return new;
end
$function$;
create trigger notifications_enqueue_email
  after insert on public.notifications
  for each row execute function public.enqueue_notification_email();

create function public.enqueue_verified_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_became_verified boolean := false;
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    v_became_verified := true;
  else
    v_became_verified := old.email_confirmed_at is null;
  end if;

  if v_became_verified then
    insert into public.email_outbox (user_id, message_type, dedupe_key)
    values (new.id, 'welcome', 'welcome:' || new.id::text)
    on conflict do nothing;
  end if;
  return new;
end
$function$;
create trigger auth_users_enqueue_verified_welcome
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.enqueue_verified_welcome_email();

create function public.claim_email_outbox(p_limit integer default 20)
returns table (outbox_id bigint, user_id uuid, message_type text, notification_id bigint)
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
    select outbox.id
    from public.email_outbox outbox
    where (outbox.status = 'pending' and outbox.next_attempt_at <= now())
       or (outbox.status = 'sending' and outbox.lease_expires_at < now())
    order by outbox.next_attempt_at, outbox.created_at, outbox.id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  ),
  claimed as (
    update public.email_outbox outbox
    set status = 'sending',
        attempts = outbox.attempts + 1,
        lease_expires_at = now() + interval '5 minutes'
    from eligible
    where outbox.id = eligible.id
    returning outbox.id, outbox.user_id, outbox.message_type, outbox.notification_id
  )
  select claimed.id, claimed.user_id, claimed.message_type, claimed.notification_id
  from claimed;
end
$function$;

create function public.finish_email_outbox(
  p_outbox_id bigint,
  p_result text,
  p_error text default null,
  p_provider_email_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempts integer;
  v_event_type text;
  v_provider_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_result is null or p_result not in ('accepted', 'retry', 'failed', 'skipped') then
    raise exception 'invalid_email_result' using errcode = '22023';
  end if;
  if p_error is not null and char_length(p_error) > 100 then
    raise exception 'invalid_email_error' using errcode = '22023';
  end if;
  if p_result = 'accepted' and (p_provider_email_id is null or char_length(p_provider_email_id) not between 1 and 200) then
    raise exception 'invalid_provider_email_id' using errcode = '22023';
  end if;

  select attempts into v_attempts
  from public.email_outbox
  where id = p_outbox_id and status = 'sending'
  for update;
  if not found then return; end if;

  if p_result = 'accepted' then
    select event.event_type into v_event_type
    from public.email_delivery_events event
    where event.provider_email_id = p_provider_email_id or event.outbox_id = p_outbox_id
    order by event.occurred_at desc, event.received_at desc
    limit 1;
    v_provider_status := case v_event_type
      when 'email.delivery_delayed' then 'delayed'
      when 'email.delivered' then 'delivered'
      when 'email.bounced' then 'bounced'
      when 'email.complained' then 'complained'
      when 'email.suppressed' then 'suppressed'
      when 'email.failed' then 'failed'
      else 'accepted'
    end;
    update public.email_outbox
    set status = v_provider_status,
        provider_email_id = p_provider_email_id,
        accepted_at = now(),
        delivered_at = (
          select min(event.occurred_at)
          from public.email_delivery_events event
          where (event.provider_email_id = p_provider_email_id or event.outbox_id = p_outbox_id)
            and event.event_type = 'email.delivered'
        ),
        lease_expires_at = null,
        last_error = case when v_provider_status in ('accepted', 'delayed', 'delivered')
          then null else v_provider_status end,
        processed_at = case when v_provider_status in ('accepted', 'delayed', 'delivered') then now() else null end
    where id = p_outbox_id;
  elsif p_result = 'skipped' then
    update public.email_outbox
    set status = 'skipped', lease_expires_at = null,
        last_error = left(coalesce(p_error, 'not_eligible'), 100), processed_at = now()
    where id = p_outbox_id;
  elsif p_result = 'failed' or v_attempts >= 8 then
    update public.email_outbox
    set status = 'failed', lease_expires_at = null,
        last_error = left(coalesce(p_error, 'email_delivery_failed'), 100), processed_at = now()
    where id = p_outbox_id;
  else
    update public.email_outbox
    set status = 'pending',
        lease_expires_at = null,
        next_attempt_at = now() + make_interval(secs => least(3600, 15 * power(2, v_attempts - 1)::integer)),
        last_error = left(coalesce(p_error, 'email_delivery_failed'), 100)
    where id = p_outbox_id;
  end if;
end
$function$;

create function public.record_resend_email_event(
  p_event_id text,
  p_provider_email_id text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_outbox_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_latest_event_type text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_event_id is null or char_length(p_event_id) not between 1 and 200
     or (p_provider_email_id is not null and char_length(p_provider_email_id) not between 1 and 200)
     or (p_provider_email_id is null and p_outbox_id is null)
     or p_event_type is null
     or p_event_type not in (
       'email.sent', 'email.delivered', 'email.delivery_delayed', 'email.bounced',
       'email.complained', 'email.failed', 'email.suppressed'
     )
     or p_occurred_at is null then
    raise exception 'invalid_resend_event' using errcode = '22023';
  end if;
  if p_outbox_id is not null and not exists (
    select 1 from public.email_outbox where id = p_outbox_id
  ) then
    raise exception 'invalid_email_outbox_id' using errcode = '22023';
  end if;

  insert into public.email_delivery_events (event_id, provider_email_id, outbox_id, event_type, occurred_at)
  values (p_event_id, p_provider_email_id, p_outbox_id, p_event_type, p_occurred_at)
  on conflict (event_id) do nothing;
  if not found then return; end if;

  select event.event_type into v_latest_event_type
  from public.email_delivery_events event
  where (p_provider_email_id is not null and event.provider_email_id = p_provider_email_id)
     or (p_outbox_id is not null and event.outbox_id = p_outbox_id)
  order by event.occurred_at desc, event.received_at desc
  limit 1;
  v_status := case v_latest_event_type
    when 'email.sent' then 'accepted'
    when 'email.delivery_delayed' then 'delayed'
    when 'email.delivered' then 'delivered'
    when 'email.bounced' then 'bounced'
    when 'email.complained' then 'complained'
    when 'email.failed' then 'failed'
    when 'email.suppressed' then 'suppressed'
    else null
  end;
  if v_status is not null then
    update public.email_outbox
    set status = v_status,
        delivered_at = coalesce(
          delivered_at,
          (select min(event.occurred_at)
           from public.email_delivery_events event
          where ((p_provider_email_id is not null and event.provider_email_id = p_provider_email_id)
             or (p_outbox_id is not null and event.outbox_id = p_outbox_id))
            and event.event_type = 'email.delivered')
        ),
        processed_at = case when v_status in ('accepted', 'delayed', 'delivered') then coalesce(processed_at, p_occurred_at) else processed_at end,
        last_error = case when v_status in ('accepted', 'delayed', 'delivered') then null else v_status end,
        provider_email_id = coalesce(provider_email_id, p_provider_email_id)
    where (p_outbox_id is not null and id = p_outbox_id)
       or (p_provider_email_id is not null and provider_email_id = p_provider_email_id);
  end if;
end
$function$;

create function public.dispatch_email_outbox_immediately()
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
  where name = 'campusconnect_email_worker_secret';

  if nullif(btrim(v_project_url), '') is null
     or nullif(btrim(v_worker_secret), '') is null then
    return new;
  end if;

  perform net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/process-email-outbox',
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
    raise log 'Email outbox immediate dispatch request failed; queued jobs remain available for scheduled retry.';
    return new;
end
$function$;
create trigger email_outbox_dispatch_immediately
  after insert on public.email_outbox
  for each row execute function public.dispatch_email_outbox_immediately();

revoke all on function public.enqueue_notification_email(),
  public.enqueue_verified_welcome_email(),
  public.dispatch_email_outbox_immediately()
  from public, anon, authenticated, service_role;
revoke all on function public.claim_email_outbox(integer),
  public.finish_email_outbox(bigint, text, text, text),
  public.record_resend_email_event(text, text, text, timestamptz, bigint)
  from public, anon, authenticated;
grant execute on function public.claim_email_outbox(integer),
  public.finish_email_outbox(bigint, text, text, text),
  public.record_resend_email_event(text, text, text, timestamptz, bigint)
  to service_role;

do $postflight$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.email_outbox'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.email_delivery_events'::regclass)
     or has_table_privilege('authenticated', 'public.email_outbox', 'select,insert,update,delete')
     or has_table_privilege('anon', 'public.email_delivery_events', 'select,insert,update,delete')
     or has_function_privilege('authenticated', 'public.claim_email_outbox(integer)', 'execute')
     or has_function_privilege('anon', 'public.record_resend_email_event(text,text,text,timestamptz,bigint)', 'execute') then
    raise exception 'Email outbox security postflight failed';
  end if;
end
$postflight$;

commit;
