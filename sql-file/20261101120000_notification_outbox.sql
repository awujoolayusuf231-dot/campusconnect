-- ============================================================================
-- Migration C: notification channels (push / email) on top of the EXISTING in-app notifications
-- STATUS: PREPARED FOR REVIEW. NOT APPLIED to any database. NOT executed anywhere (no Postgres in the authoring environment).
-- Independent of migrations A and B (no dependency either way).
--
-- Purely additive: 6 tables, 14 functions, 1 AFTER INSERT trigger on public.notifications. It does NOT replace
-- internal_notify (already redefined once in migration 0012) and changes no existing table, column, constraint or policy.
-- No backfill: only notifications created AFTER this migration produce deliveries, so applying it cannot cause a send storm.
-- Rollback: supabase/rollbacks/20261101120000_notification_outbox_down.sql
--
-- HOW IT FITS
--   event -> existing triggers/RPCs -> internal_notify() [self-skip, blocks both ways, account status, in-app prefs, dedupe]
--         -> INSERT into notifications (unchanged, in-app stays the source of truth)
--         -> NEW trigger notifications_enqueue_outbox: per channel (push, email) checks the user's channel preference,
--            channel availability (an active push token / a verified email), blocks/standing again (defence in depth for
--            direct inserts such as announcements), collapsing/cooldown, and hourly/daily caps, then writes an outbox row.
--         -> a scheduled Edge Function (service role) claims rows, sends via FCM HTTP v1 / Resend, reports the outcome.
--   * A failure anywhere in the trigger is caught: the in-app notification and the business action are never affected.
--   * The trigger only writes to the outbox, which has no triggers, so no notification loop is possible.
--   * The outbox stores ids only (never message text, never an email address, never a push token copy).
--   * Optional types default to OFF for email and for noisy types on push (opt-in); "important" types (moderation_warning)
--     cannot be disabled and bypass caps, matching "do not silently override essential notices".
--   * New notification types: adding one to notifications.type (needs your approval) must be paired with an INSERT into
--     notification_type_config; an unconfigured type stays in-app only (safe default).
-- ============================================================================

-- ===== configuration tables (seeded here; editable only by the database owner / a future admin RPC) =====
create table public.notification_type_config (
  type text primary key check (type ~ '^[a-z][a-z_]{1,39}$'),
  description text not null check (char_length(description) between 3 and 200),
  optional boolean not null default true,              -- false = user cannot disable, caps are bypassed
  push_default boolean not null default false,
  email_default boolean not null default false,
  send_delay_seconds int not null default 0 check (send_delay_seconds between 0 and 3600),   -- lets collapsing accumulate
  collapse_minutes int not null default 0 check (collapse_minutes between 0 and 1440),       -- 0 = never collapse
  created_at timestamptz not null default now()
);
insert into public.notification_type_config (type, description, optional, push_default, email_default, send_delay_seconds, collapse_minutes) values
  ('message',            'New direct message',                      true,  true,  false,  20, 10),
  ('comment',            'Comment on your post',                    true,  true,  false,   0,  0),
  ('like',               'Like on your post',                       true,  false, false, 300, 60),
  ('repost',             'Repost of your post',                     true,  false, false, 300, 60),
  ('follow',             'New follower',                            true,  false, false,   0,  0),
  ('community_join',     'Someone joined your community',           true,  false, false, 300, 60),
  ('announcement',       'Platform announcement',                   true,  true,  false,   0,  0),
  ('moderation_warning', 'Important account notice from moderators', false, true,  true,    0,  0);

create table public.notification_limits (
  channel text primary key check (channel in ('push', 'email')),
  per_hour int not null check (per_hour between 1 and 1000),
  per_day int not null check (per_day between 1 and 10000)
);
insert into public.notification_limits (channel, per_hour, per_day) values ('push', 12, 60), ('email', 2, 8);

-- ===== user data =====
create table public.notification_channel_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('push', 'email')),
  type text not null references public.notification_type_config(type) on delete cascade,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, channel, type)
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique check (char_length(token) between 20 and 4096 and token ~ '^[A-Za-z0-9_:.-]+$'),
  platform text not null check (platform in ('web', 'android', 'ios')),
  device_label text check (device_label is null or char_length(device_label) <= 80),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  failure_count int not null default 0
);
create index push_tokens_user_active_idx on public.push_tokens (user_id) where revoked_at is null;
create index push_tokens_user_created_idx on public.push_tokens (user_id, created_at desc);
create index push_tokens_purge_idx on public.push_tokens (last_seen_at);

-- ===== queue and delivery log =====
create table public.notification_outbox (
  id bigint generated always as identity primary key,
  notification_id bigint not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('push', 'email')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'dead')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  collapsed_count int not null default 1 check (collapsed_count >= 1),
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 60),
  skip_reason text check (skip_reason is null or char_length(skip_reason) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (notification_id, channel)                                   -- idempotent enqueue
);
create index notification_outbox_claim_idx on public.notification_outbox (channel, next_attempt_at) where status in ('pending', 'sending');
create index notification_outbox_user_idx on public.notification_outbox (user_id, channel, created_at desc);
create index notification_outbox_purge_idx on public.notification_outbox (status, updated_at);

create table public.notification_delivery_log (
  id bigint generated always as identity primary key,
  outbox_id bigint not null references public.notification_outbox(id) on delete cascade,
  attempt int not null,
  outcome text not null check (outcome in ('sent', 'retry', 'failed', 'dead')),
  error_code text check (error_code is null or char_length(error_code) <= 60),
  at timestamptz not null default now()
);
create index notification_delivery_log_outbox_idx on public.notification_delivery_log (outbox_id);

alter table public.notification_type_config enable row level security;
alter table public.notification_limits enable row level security;
alter table public.notification_channel_prefs enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_delivery_log enable row level security;
-- NO policies and NO client grants: clients use only the RPCs below.
revoke all on table public.notification_type_config, public.notification_limits, public.notification_channel_prefs,
  public.push_tokens, public.notification_outbox, public.notification_delivery_log from public, anon, authenticated;

-- ===== internal helpers (not client-callable) =====
-- SECURITY DEFINER justification (all internal_* below): they read tables clients cannot read; empty search_path.
-- Effective PREFERENCE for (user, type, channel): the user's choice for optional types, otherwise the configured default.
create function public.internal_channel_enabled(p_user uuid, p_type text, p_channel text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select coalesce(
      case when c.optional then
        (select p.enabled from public.notification_channel_prefs p where p.user_id = p_user and p.channel = p_channel and p.type = p_type)
      end,
      case p_channel when 'push' then c.push_default when 'email' then c.email_default else false end)
    from public.notification_type_config c where c.type = p_type
  ), false)
$$;

-- Is there anywhere to deliver? push: an active token; email: a verified address.
create function public.internal_channel_available(p_user uuid, p_channel text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_channel
    when 'push' then exists (select 1 from public.push_tokens t where t.user_id = p_user and t.revoked_at is null)
    when 'email' then exists (select 1 from auth.users u where u.id = p_user and u.email is not null and u.email_confirmed_at is not null)
    else false end
$$;

-- ===== the enqueue trigger =====
-- Every statement that can fail sits inside one sub-block whose handler only raises a WARNING: the notifications insert
-- (and therefore the business operation that caused it) can never be rolled back by a delivery-channel problem.
create function public.notifications_enqueue_outbox() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_cfg public.notification_type_config%rowtype;
  v_ch text; v_existing bigint; v_existing_status text; v_ph int; v_pd int;
begin
  begin
    select * into v_cfg from public.notification_type_config where type = new.type;
    if not found then return null; end if;                                   -- unconfigured type: in-app only
    -- the recipient must still be in good standing, and nobody can use a notification to get around a block
    if not coalesce(public.effective_status_internal(new.user_id) in ('active', 'restricted'), false) then return null; end if;
    if new.actor_id is not null and public.internal_blocked_either(new.user_id, new.actor_id) then return null; end if;

    foreach v_ch in array array['push', 'email'] loop
      if not public.internal_channel_enabled(new.user_id, new.type, v_ch) then continue; end if;
      if not public.internal_channel_available(new.user_id, v_ch) then continue; end if;

      if v_cfg.collapse_minutes > 0 then
        select o.id, o.status into v_existing, v_existing_status
          from public.notification_outbox o join public.notifications n on n.id = o.notification_id
         where o.user_id = new.user_id and o.channel = v_ch and n.type = new.type
           and n.entity_type is not distinct from new.entity_type and n.entity_id is not distinct from new.entity_id
           and o.status in ('pending', 'sending', 'sent')
           and o.created_at > now() - make_interval(mins => v_cfg.collapse_minutes)
         order by o.id desc limit 1;
        if found then
          -- still waiting: fold into it ("N people liked ..."); already delivered: cooldown, send nothing more
          if v_existing_status = 'pending' then
            update public.notification_outbox set collapsed_count = collapsed_count + 1, updated_at = now() where id = v_existing;
          end if;
          continue;
        end if;
      end if;

      if v_cfg.optional then                                                 -- essential notices bypass the caps
        select l.per_hour, l.per_day into v_ph, v_pd from public.notification_limits l where l.channel = v_ch;
        if (select count(*) from public.notification_outbox o where o.user_id = new.user_id and o.channel = v_ch and o.created_at > now() - interval '1 hour') >= coalesce(v_ph, 0)
           or (select count(*) from public.notification_outbox o where o.user_id = new.user_id and o.channel = v_ch and o.created_at > now() - interval '1 day') >= coalesce(v_pd, 0) then
          continue;                                                          -- storm protection: in-app only
        end if;
      end if;

      insert into public.notification_outbox (notification_id, user_id, channel, next_attempt_at)
      values (new.id, new.user_id, v_ch, now() + make_interval(secs => v_cfg.send_delay_seconds))
      on conflict (notification_id, channel) do nothing;
    end loop;
  exception when others then
    raise warning 'notification outbox enqueue failed for notification %: %', new.id, sqlerrm;
  end;
  return null;
end $$;

create trigger notifications_enqueue_outbox
  after insert on public.notifications
  for each row execute function public.notifications_enqueue_outbox();

-- ===== RPCs for signed-in users: preferences =====
create function public.get_my_notification_settings()
returns table (type text, description text, optional boolean, push_enabled boolean, email_enabled boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select c.type, c.description, c.optional,
         public.internal_channel_enabled(v_uid, c.type, 'push'), public.internal_channel_enabled(v_uid, c.type, 'email')
  from public.notification_type_config c order by c.type;
end $$;

create function public.get_my_notification_channels()
returns table (push_available boolean, email_available boolean, active_devices int)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select public.internal_channel_available(v_uid, 'push'), public.internal_channel_available(v_uid, 'email'),
    (select count(*)::int from public.push_tokens t where t.user_id = v_uid and t.revoked_at is null);
end $$;

create function public.set_my_notification_pref(p_type text, p_channel text, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_optional boolean;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_channel is null or p_channel not in ('push', 'email') or p_enabled is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  select c.optional into v_optional from public.notification_type_config c where c.type = p_type;
  if not found then raise exception 'unknown_type' using errcode = '22023'; end if;
  if not v_optional then raise exception 'not_optional' using errcode = '22023'; end if;     -- essential notices cannot be turned off
  insert into public.notification_channel_prefs (user_id, channel, type, enabled) values (v_uid, p_channel, p_type, p_enabled)
  on conflict (user_id, channel, type) do update set enabled = excluded.enabled, updated_at = now();
end $$;

-- ===== RPCs for signed-in users: devices =====
-- A token is a device secret; it is never returned to any client (list_my_devices shows ids and labels only).
-- Registering a token that already belongs to someone else MOVES it to the caller (shared device, new login): the previous
-- owner stops receiving pushes on that device. At most 10 active tokens per user (oldest are revoked); at most 20
-- registrations per hour per user.
create function public.register_push_token(p_token text, p_platform text, p_label text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if not coalesce(public.effective_status_internal(v_uid) in ('active', 'restricted'), false) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_token is null or char_length(p_token) not between 20 and 4096 or p_token !~ '^[A-Za-z0-9_:.-]+$' then raise exception 'invalid_token' using errcode = '22023'; end if;
  if p_platform is null or p_platform not in ('web', 'android', 'ios') then raise exception 'invalid_platform' using errcode = '22023'; end if;
  if p_label is not null and char_length(p_label) > 80 then raise exception 'invalid_label' using errcode = '22023'; end if;
  if (select count(*) from public.push_tokens t where t.user_id = v_uid and t.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.push_tokens (user_id, token, platform, device_label) values (v_uid, p_token, p_platform, nullif(btrim(p_label), ''))
  on conflict (token) do update
    set user_id = v_uid, platform = excluded.platform, device_label = excluded.device_label,
        last_seen_at = now(), revoked_at = null, failure_count = 0
  returning id into v_id;

  update public.push_tokens set revoked_at = now()
   where user_id = v_uid and revoked_at is null
     and id not in (select t.id from public.push_tokens t where t.user_id = v_uid and t.revoked_at is null
                    order by t.last_seen_at desc, t.created_at desc limit 10);
  return v_id;
end $$;

create function public.revoke_push_token(p_token text) returns void        -- call on logout, before signing out
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.push_tokens set revoked_at = now() where token = p_token and user_id = v_uid and revoked_at is null;
end $$;

create function public.list_my_devices()
returns table (id uuid, platform text, device_label text, created_at timestamptz, last_seen_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select t.id, t.platform, t.device_label, t.created_at, t.last_seen_at
    from public.push_tokens t where t.user_id = v_uid and t.revoked_at is null order by t.last_seen_at desc;
end $$;

create function public.remove_my_device(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.push_tokens set revoked_at = now() where id = p_id and user_id = v_uid and revoked_at is null;
end $$;

-- ===== service-role RPCs (the Edge Function) =====
-- claim: takes up to p_limit due rows with FOR UPDATE SKIP LOCKED (safe for overlapping runs), RE-CHECKS everything that can
-- change while a row waits (account standing, blocks, preference, a destination still exists) and silently marks rows that
-- no longer qualify as skipped. Returns just what is needed to send: ids, the actor's public display name, and the
-- destination (push tokens or the verified email). It never returns message text.
create function public.claim_notification_outbox(p_channel text, p_limit int default 50)
returns table (outbox_id bigint, user_id uuid, notification_id bigint, type text, actor_id uuid, actor_name text,
               entity_type text, entity_id uuid, data jsonb, collapsed_count int, attempts int, push_tokens text[], email text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_lim int := least(greatest(coalesce(p_limit, 50), 1), 200);
  r record; n record; v_tokens text[]; v_email text; v_skip text;
begin
  if p_channel is null or p_channel not in ('push', 'email') then raise exception 'bad_channel' using errcode = '22023'; end if;

  update public.notification_outbox o set status = 'dead', last_error_code = 'lock_expired_max_attempts', updated_at = now()
   where o.channel = p_channel and o.status = 'sending' and o.locked_until < now() and o.attempts >= 5;

  for r in
    select o.id from public.notification_outbox o
     where o.channel = p_channel and o.attempts < 5
       and ((o.status = 'pending' and o.next_attempt_at <= now()) or (o.status = 'sending' and o.locked_until < now()))
     order by o.next_attempt_at, o.id limit v_lim for update skip locked
  loop
    select o.id as oid, o.user_id as uid, o.notification_id as nid, o.collapsed_count as cc, o.attempts as att,
           nt.type as ntype, nt.actor_id as nactor, nt.entity_type as netype, nt.entity_id as neid, nt.data as ndata
      into n
      from public.notification_outbox o join public.notifications nt on nt.id = o.notification_id where o.id = r.id;

    v_skip := null; v_tokens := '{}'; v_email := null;
    if not coalesce(public.effective_status_internal(n.uid) in ('active', 'restricted'), false) then v_skip := 'account_status';
    elsif n.nactor is not null and public.internal_blocked_either(n.uid, n.nactor) then v_skip := 'blocked';
    elsif not public.internal_channel_enabled(n.uid, n.ntype, p_channel) then v_skip := 'disabled';
    elsif p_channel = 'push' then
      select coalesce(array_agg(x.token), '{}') into v_tokens from (
        select t.token from public.push_tokens t where t.user_id = n.uid and t.revoked_at is null order by t.last_seen_at desc limit 10) x;
      if coalesce(array_length(v_tokens, 1), 0) = 0 then v_skip := 'no_destination'; end if;
    else
      select u.email into v_email from auth.users u where u.id = n.uid and u.email is not null and u.email_confirmed_at is not null;
      if v_email is null then v_skip := 'no_destination'; end if;
    end if;

    if v_skip is not null then
      update public.notification_outbox o set status = 'skipped', skip_reason = v_skip, locked_until = null, updated_at = now() where o.id = n.oid;
      continue;
    end if;

    update public.notification_outbox o set status = 'sending', attempts = o.attempts + 1, locked_until = now() + interval '5 minutes', updated_at = now() where o.id = n.oid;
    outbox_id := n.oid; user_id := n.uid; notification_id := n.nid; type := n.ntype; actor_id := n.nactor;
    actor_name := (select coalesce(p.display_name, p.username) from public.profiles p where p.id = n.nactor);
    entity_type := n.netype; entity_id := n.neid; data := n.ndata; collapsed_count := n.cc; attempts := n.att + 1;
    push_tokens := case when p_channel = 'push' then v_tokens end; email := v_email;
    return next;
  end loop;
end $$;

-- complete: outcome 'sent' | 'retry' (temporary failure: back-off 1 min, 5 min, 30 min, 2 h; dead after 5 attempts) | 'failed'
-- (permanent). A completion for a row that is not 'sending' (stale, duplicated) is ignored.
create function public.complete_notification_outbox(p_outbox_id bigint, p_outcome text, p_error_code text default null, p_retry_after_seconds int default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.notification_outbox%rowtype;
  v_code text := nullif(left(regexp_replace(coalesce(p_error_code, ''), '[^A-Za-z0-9_:.-]', '', 'g'), 60), '');
  v_wait int; v_final text;
begin
  if p_outcome is null or p_outcome not in ('sent', 'retry', 'failed') then raise exception 'bad_outcome' using errcode = '22023'; end if;
  select * into v_row from public.notification_outbox where id = p_outbox_id for update;
  if not found or v_row.status <> 'sending' then return; end if;

  if p_outcome = 'sent' then
    update public.notification_outbox set status = 'sent', sent_at = now(), locked_until = null, last_error_code = null, updated_at = now() where id = p_outbox_id;
    v_final := 'sent';
  elsif p_outcome = 'failed' then
    update public.notification_outbox set status = 'failed', locked_until = null, last_error_code = v_code, updated_at = now() where id = p_outbox_id;
    v_final := 'failed';
  elsif v_row.attempts >= 5 then
    update public.notification_outbox set status = 'dead', locked_until = null, last_error_code = v_code, updated_at = now() where id = p_outbox_id;
    v_final := 'dead';
  else
    -- NB: greatest()/least() ignore NULLs, so the default back-off must be chosen explicitly
    v_wait := case when p_retry_after_seconds is null then (array[60, 300, 1800, 7200])[least(greatest(v_row.attempts, 1), 4)]
                   else least(greatest(p_retry_after_seconds, 30), 86400) end;
    update public.notification_outbox set status = 'pending', next_attempt_at = now() + make_interval(secs => v_wait),
           locked_until = null, last_error_code = v_code, updated_at = now() where id = p_outbox_id;
    v_final := 'retry';
  end if;
  insert into public.notification_delivery_log (outbox_id, attempt, outcome, error_code) values (p_outbox_id, v_row.attempts, v_final, v_code);
end $$;

-- the sender saw FCM report this token as unregistered/invalid
create function public.invalidate_push_token(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.push_tokens set revoked_at = now(), failure_count = failure_count + 1 where token = p_token and revoked_at is null;
end $$;

-- retention (batched; call until "more" is false): finished outbox rows after p_keep_days (default 30; log cascades),
-- revoked tokens after 90 days, tokens not seen for 270 days (FCM expires inactive tokens around then).
create function public.purge_notification_outbox(p_batch int default 5000, p_keep_days int default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_batch int := least(greatest(coalesce(p_batch, 5000), 100), 50000);
  v_keep int := greatest(coalesce(p_keep_days, 30), 7);
  a bigint; b bigint; c bigint;
begin
  delete from public.notification_outbox where id in (
    select o.id from public.notification_outbox o
     where o.status in ('sent', 'failed', 'skipped', 'dead') and o.updated_at < now() - make_interval(days => v_keep) limit v_batch);
  get diagnostics a = row_count;
  delete from public.push_tokens where id in (select t.id from public.push_tokens t where t.revoked_at is not null and t.revoked_at < now() - interval '90 days' limit v_batch);
  get diagnostics b = row_count;
  delete from public.push_tokens where id in (select t.id from public.push_tokens t where t.last_seen_at < now() - interval '270 days' limit v_batch);
  get diagnostics c = row_count;
  return jsonb_build_object('outbox', a, 'tokens_revoked_old', b, 'tokens_stale', c, 'more', greatest(a, b, c) >= v_batch);
end $$;

-- ===== privileges =====
revoke execute on function
  public.internal_channel_enabled(uuid, text, text), public.internal_channel_available(uuid, text), public.notifications_enqueue_outbox(),
  public.get_my_notification_settings(), public.get_my_notification_channels(), public.set_my_notification_pref(text, text, boolean),
  public.register_push_token(text, text, text), public.revoke_push_token(text), public.list_my_devices(), public.remove_my_device(uuid),
  public.claim_notification_outbox(text, int), public.complete_notification_outbox(bigint, text, text, int),
  public.invalidate_push_token(text), public.purge_notification_outbox(int, int)
from public, anon, authenticated;

grant execute on function
  public.get_my_notification_settings(), public.get_my_notification_channels(), public.set_my_notification_pref(text, text, boolean),
  public.register_push_token(text, text, text), public.revoke_push_token(text), public.list_my_devices(), public.remove_my_device(uuid)
to authenticated;

grant execute on function
  public.claim_notification_outbox(text, int), public.complete_notification_outbox(bigint, text, text, int),
  public.invalidate_push_token(text), public.purge_notification_outbox(int, int)
to service_role;
