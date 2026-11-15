-- Firebase push delivery for existing in-app notifications.
-- Apply manually in Supabase SQL Editor; this migration is additive.
begin;

do $preflight$
begin
  if to_regclass('public.notifications') is null
     or to_regclass('public.user_preferences') is null
     or to_regprocedure('public.account_effective_status(uuid)') is null then
    raise exception 'Push notifications require the existing notification and account foundations';
  end if;
  if to_regclass('public.push_subscriptions') is not null
     or to_regclass('public.push_outbox') is not null
     or exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'user_preferences' and column_name = 'notify_push'
     ) then
    raise exception 'Push notification objects already exist; inspect the schema before applying this migration';
  end if;
end
$preflight$;

alter table public.user_preferences
  add column notify_push boolean not null default true;

grant insert (user_id, notify_follows, notify_likes, notify_comments, notify_community, notify_messages, notify_discussions, notify_push)
  on public.user_preferences to authenticated;
grant update (notify_follows, notify_likes, notify_comments, notify_community, notify_messages, notify_discussions, notify_push)
  on public.user_preferences to authenticated;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fcm_token text not null unique check (char_length(fcm_token) between 32 and 4096),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id, last_seen_at desc);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

create function public.register_push_subscription(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null or public.account_effective_status(v_user) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) not between 32 and 4096 then
    raise exception 'invalid_push_token' using errcode = '22023';
  end if;
  insert into public.push_subscriptions (user_id, fcm_token)
  values (v_user, p_token)
  on conflict (fcm_token) do update
    set user_id = excluded.user_id, last_seen_at = now()
  returning id into v_id;
  delete from public.push_subscriptions
  where user_id = v_user and id in (
    select id from public.push_subscriptions
    where user_id = v_user
    order by last_seen_at desc, id
    offset 10
  );
  return v_id;
end
$function$;

create function public.unregister_push_subscription(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_token is null or char_length(p_token) > 4096 then return; end if;
  delete from public.push_subscriptions
  where user_id = (select auth.uid()) and fcm_token = p_token;
end
$function$;

create function public.has_push_subscription()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.push_subscriptions s where s.user_id = (select auth.uid())
  )
$function$;

create table public.push_outbox (
  id bigint generated always as identity primary key,
  notification_id bigint not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  entity_type text,
  entity_id uuid,
  status text not null default 'pending' check (status in ('pending', 'sending', 'delivered', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index push_outbox_pending_idx on public.push_outbox (next_attempt_at, created_at)
  where status in ('pending', 'sending');
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.push_outbox to service_role;
grant usage, select on sequence public.push_outbox_id_seq to service_role;

create function public.enqueue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enabled boolean;
begin
  select coalesce(p.notify_push, true) into v_enabled
  from public.user_preferences p
  where p.user_id = new.user_id;
  if found and not v_enabled then return new; end if;
  insert into public.push_outbox (notification_id, user_id, notification_type, entity_type, entity_id)
  values (new.id, new.user_id, new.type, new.entity_type, new.entity_id)
  on conflict (notification_id) do nothing;
  return new;
end
$function$;
create trigger notifications_enqueue_push
  after insert on public.notifications
  for each row execute function public.enqueue_notification_push();

create function public.claim_push_outbox(p_limit integer default 50)
returns table (outbox_id bigint, user_id uuid, notification_type text, entity_type text, entity_id uuid, tokens text[])
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
    select o.id
    from public.push_outbox o
    where (o.status = 'pending' and o.next_attempt_at <= now())
       or (o.status = 'sending' and o.lease_expires_at < now())
    order by o.created_at, o.id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ),
  claimed as (
    update public.push_outbox o
    set status = 'sending', attempts = o.attempts + 1,
        lease_expires_at = now() + interval '5 minutes'
    from eligible e
    where o.id = e.id
    returning o.id, o.user_id, o.notification_type, o.entity_type, o.entity_id
  )
  select c.id, c.user_id, c.notification_type, c.entity_type, c.entity_id,
    coalesce(array_agg(s.fcm_token) filter (where s.fcm_token is not null), '{}'::text[])
  from claimed c
  left join public.push_subscriptions s on s.user_id = c.user_id
  group by c.id, c.user_id, c.notification_type, c.entity_type, c.entity_id;
end
$function$;

create function public.finish_push_outbox(p_outbox_id bigint, p_result text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempts integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_result is null or p_result not in ('delivered', 'retry', 'failed') then
    raise exception 'invalid_push_result' using errcode = '22023';
  end if;
  select attempts into v_attempts from public.push_outbox
  where id = p_outbox_id and status = 'sending'
  for update;
  if not found then return; end if;

  if p_result = 'delivered' then
    update public.push_outbox
    set status = 'delivered', lease_expires_at = null, last_error = null, processed_at = now()
    where id = p_outbox_id;
  elsif p_result = 'failed' or v_attempts >= 8 then
    update public.push_outbox
    set status = 'failed', lease_expires_at = null,
        last_error = left(coalesce(p_error, 'Push delivery failed'), 500), processed_at = now()
    where id = p_outbox_id;
  else
    update public.push_outbox
    set status = 'pending', lease_expires_at = null,
        next_attempt_at = now() + make_interval(secs => least(3600, 15 * power(2, v_attempts - 1)::integer)),
        last_error = left(coalesce(p_error, 'Push delivery failed'), 500)
    where id = p_outbox_id;
  end if;
end
$function$;

revoke all on function public.register_push_subscription(text) from public, anon, authenticated;
revoke all on function public.unregister_push_subscription(text) from public, anon, authenticated;
revoke all on function public.has_push_subscription() from public, anon, authenticated;
revoke all on function public.enqueue_notification_push() from public, anon, authenticated, service_role;
revoke all on function public.claim_push_outbox(integer) from public, anon, authenticated;
revoke all on function public.finish_push_outbox(bigint, text, text) from public, anon, authenticated;
grant execute on function public.register_push_subscription(text) to authenticated;
grant execute on function public.unregister_push_subscription(text) to authenticated;
grant execute on function public.has_push_subscription() to authenticated;
grant execute on function public.claim_push_outbox(integer) to service_role;
grant execute on function public.finish_push_outbox(bigint, text, text) to service_role;

do $postflight$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.push_outbox'::regclass) then
    raise exception 'Push notification RLS postflight failed';
  end if;
  if has_table_privilege('authenticated', 'public.push_subscriptions', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.push_outbox', 'select,insert,update,delete')
     or has_function_privilege('anon', 'public.register_push_subscription(text)', 'execute')
     or has_function_privilege('authenticated', 'public.claim_push_outbox(integer)', 'execute') then
    raise exception 'Push notification objects have unexpected client privileges';
  end if;
end
$postflight$;

commit;
