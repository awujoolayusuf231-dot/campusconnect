begin;

do $preflight$
begin
  if to_regclass('auth.users') is null
     or to_regprocedure('public.has_permission(text)') is null
     or to_regclass('public.subscription_plans') is not null
     or to_regclass('public.subscription_payment_attempts') is not null
     or to_regclass('public.subscriptions') is not null
     or to_regclass('public.paystack_payment_events') is not null
     or to_regprocedure('public.reserve_paystack_checkout(uuid,text,text,text)') is not null
     or to_regprocedure('public.fail_paystack_checkout(text,text)') is not null
     or to_regprocedure('public.record_paystack_event(text,text,text,text,text)') is not null
     or to_regprocedure('public.finalize_paystack_payment(text,bigint,text,bigint,text,text,text,text)') is not null
     or to_regprocedure('public.transition_subscription_status(uuid,text)') is not null
     or to_regprocedure('public.my_subscription()') is not null
     or to_regprocedure('public.admin_subscription_overview(integer)') is not null
     or to_regprocedure('public.prevent_paystack_event_mutation()') is not null then
    raise exception 'Paystack subscriptions preflight failed: auth/RBAC foundation missing or an object name is already in use';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'Paystack subscriptions require Supabase API roles';
  end if;
end
$preflight$;

create table public.subscription_plans (
  code text not null check (code in ('free', 'plus', 'pro')),
  display_name text not null,
  amount_minor bigint not null check (amount_minor between 0 and 9007199254740991),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  interval_count integer not null default 1 check (interval_count > 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (code, billing_interval),
  check (
    (code = 'free' and amount_minor = 0)
    or (code <> 'free' and (amount_minor > 0 or (amount_minor = 0 and not is_active)))
  )
);

insert into public.subscription_plans
  (code, display_name, amount_minor, currency, billing_interval, interval_count, is_active)
values
  ('free', 'Free', 0, 'NGN', 'month', 1, true),
  ('plus', 'Plus', 0, 'NGN', 'month', 1, false),
  ('plus', 'Plus', 0, 'NGN', 'year', 1, false),
  ('pro', 'Pro', 0, 'NGN', 'month', 1, false),
  ('pro', 'Pro', 0, 'NGN', 'year', 1, false);

create table public.subscription_payment_attempts (
  reference text primary key check (reference ~ '^cc_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'),
  user_id uuid references auth.users(id) on delete set null,
  plan_code text not null,
  billing_interval text not null check (billing_interval in ('month', 'year')),
  interval_count integer not null check (interval_count > 0),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'abandoned')),
  provider_transaction_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (plan_code, billing_interval)
    references public.subscription_plans(code, billing_interval) on delete restrict,
  check (provider_transaction_id is null or provider_transaction_id > 0)
);
create unique index subscription_payment_provider_transaction_idx
  on public.subscription_payment_attempts (provider_transaction_id)
  where provider_transaction_id is not null;
create index subscription_payment_user_created_idx
  on public.subscription_payment_attempts (user_id, created_at desc);

create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null,
  status text not null check (status in ('active', 'canceled', 'expired')),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (plan_code, billing_interval)
    references public.subscription_plans(code, billing_interval) on delete restrict,
  check (current_period_end > current_period_start)
);

create table public.paystack_payment_events (
  id bigint generated always as identity primary key,
  event_key text not null unique check (length(event_key) between 1 and 200),
  event_type text not null check (length(event_type) between 1 and 100),
  reference text not null check (reference ~ '^cc_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'),
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  outcome text not null check (outcome in (
    'verified', 'failed', 'abandoned', 'ignored', 'unmatched',
    'mismatch', 'already_processed'
  )),
  received_at timestamptz not null default now()
);
create index paystack_payment_events_reference_idx
  on public.paystack_payment_events (reference, received_at desc);

alter table public.subscription_plans enable row level security;
alter table public.subscription_payment_attempts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.paystack_payment_events enable row level security;
revoke all on table public.subscription_plans, public.subscription_payment_attempts,
  public.subscriptions, public.paystack_payment_events from public, anon, authenticated;
grant select on table public.subscription_plans, public.subscription_payment_attempts,
  public.subscriptions, public.paystack_payment_events to service_role;
grant select on table public.subscription_plans to authenticated;
create policy subscription_plans_select_active on public.subscription_plans
  for select to authenticated using (is_active);

create function public.prevent_paystack_event_mutation() returns trigger
language plpgsql set search_path = '' as $function$
begin
  raise exception 'Paystack payment events are append-only' using errcode = '42501';
end
$function$;
create trigger paystack_payment_events_append_only
before update or delete on public.paystack_payment_events
for each row execute function public.prevent_paystack_event_mutation();

create function public.reserve_paystack_checkout(
  p_user_id uuid,
  p_plan_code text,
  p_billing_interval text,
  p_reference text
) returns table (
  amount_minor bigint,
  currency text,
  billing_interval text,
  interval_count integer
)
language plpgsql security definer set search_path = '' as $function$
declare
  v_plan public.subscription_plans%rowtype;
begin
  if p_user_id is null
     or p_plan_code is null
     or p_plan_code not in ('plus', 'pro')
     or p_billing_interval is null
     or p_billing_interval not in ('month', 'year')
     or p_reference is null
     or p_reference !~ '^cc_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception 'invalid checkout request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('paystack_checkout:' || p_user_id::text, 0));
  if exists (
    select 1 from public.subscriptions subscription
    where subscription.user_id = p_user_id
      and subscription.status in ('active', 'canceled')
      and subscription.current_period_end > now()
      and subscription.plan_code <> p_plan_code
  ) then
    raise exception 'plan changes are unavailable during an active subscription' using errcode = '22023';
  end if;
  select plan.* into v_plan
  from public.subscription_plans plan
  where plan.code = p_plan_code
    and plan.billing_interval = p_billing_interval
    and plan.is_active
    and plan.amount_minor > 0;
  if not found then
    raise exception 'plan is not available' using errcode = '22023';
  end if;

  insert into public.subscription_payment_attempts (
    reference, user_id, plan_code, billing_interval, interval_count,
    amount_minor, currency
  ) values (
    p_reference, p_user_id, v_plan.code, v_plan.billing_interval,
    v_plan.interval_count, v_plan.amount_minor, v_plan.currency
  );
  return query select v_plan.amount_minor, v_plan.currency,
    v_plan.billing_interval, v_plan.interval_count;
end
$function$;

create function public.fail_paystack_checkout(p_reference text, p_reason text)
returns boolean
language plpgsql security definer set search_path = '' as $function$
begin
  if p_reason is null
     or p_reason not in ('provider_unavailable', 'provider_initialization_failed', 'invalid_plan_configuration') then
    raise exception 'invalid failure reason' using errcode = '22023';
  end if;
  update public.subscription_payment_attempts
  set status = 'failed', updated_at = now()
  where reference = p_reference and status = 'pending';
  return found;
end
$function$;

create function public.record_paystack_event(
  p_event_key text,
  p_event_type text,
  p_reference text,
  p_evidence_sha256 text,
  p_outcome text
) returns boolean
language plpgsql security definer set search_path = '' as $function$
begin
  if p_event_key is null
     or p_event_type is null
     or p_reference is null
     or p_evidence_sha256 is null
     or p_outcome is null
     or p_outcome not in ('ignored', 'unmatched', 'mismatch', 'already_processed')
     or p_reference !~ '^cc_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or p_evidence_sha256 !~ '^[0-9a-f]{64}$'
     or length(p_event_key) not between 1 and 200
     or length(p_event_type) not between 1 and 100 then
    raise exception 'invalid Paystack event' using errcode = '22023';
  end if;
  insert into public.paystack_payment_events (
    event_key, event_type, reference, evidence_sha256, outcome
  ) values (
    p_event_key, p_event_type, p_reference, p_evidence_sha256, p_outcome
  ) on conflict (event_key) do nothing;
  return found;
end
$function$;

create function public.finalize_paystack_payment(
  p_reference text,
  p_provider_transaction_id bigint,
  p_provider_status text,
  p_amount_minor bigint,
  p_currency text,
  p_event_key text,
  p_event_type text,
  p_evidence_sha256 text
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_payment public.subscription_payment_attempts%rowtype;
  v_outcome text;
  v_target_status text;
  v_now timestamptz := now();
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  if p_reference is null
     or p_currency is null
     or p_provider_status is null
     or p_event_key is null
     or p_event_type is null
     or p_evidence_sha256 is null
     or p_reference !~ '^cc_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or p_provider_transaction_id is null or p_provider_transaction_id <= 0
     or p_amount_minor is null or p_amount_minor < 0
     or p_currency !~ '^[A-Z]{3}$'
     or p_provider_status not in ('success', 'failed', 'abandoned')
     or p_event_key is null or length(p_event_key) not between 1 and 200
     or p_event_type is null or length(p_event_type) not between 1 and 100
     or p_evidence_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid verified Paystack transaction' using errcode = '22023';
  end if;

  select payment.* into v_payment
  from public.subscription_payment_attempts payment
  where payment.reference = p_reference
  for update;
  if not found then
    insert into public.paystack_payment_events (
      event_key, event_type, reference, evidence_sha256, outcome
    ) values (
      p_event_key, p_event_type, p_reference, p_evidence_sha256, 'unmatched'
    ) on conflict (event_key) do nothing;
    return jsonb_build_object('processed', false, 'outcome', 'unmatched');
  end if;

  if exists (
    select 1 from public.paystack_payment_events event
    where event.event_key = p_event_key
  ) then
    return jsonb_build_object('processed', false, 'outcome', 'replay');
  end if;
  if v_payment.amount_minor <> p_amount_minor or v_payment.currency <> p_currency then
    v_outcome := 'mismatch';
  elsif v_payment.status <> 'pending' then
    v_outcome := 'already_processed';
  else
    v_outcome := case p_provider_status
      when 'success' then 'verified'
      when 'failed' then 'failed'
      else 'abandoned'
    end;
  end if;

  insert into public.paystack_payment_events (
    event_key, event_type, reference, evidence_sha256, outcome
  ) values (
    p_event_key, p_event_type, p_reference, p_evidence_sha256, v_outcome
  ) on conflict (event_key) do nothing;
  if not found then
    return jsonb_build_object('processed', false, 'outcome', 'replay');
  end if;
  if v_outcome in ('mismatch', 'already_processed') then
    return jsonb_build_object('processed', false, 'outcome', v_outcome);
  end if;

  v_target_status := case p_provider_status
    when 'success' then 'succeeded'
    when 'failed' then 'failed'
    else 'abandoned'
  end;
  update public.subscription_payment_attempts
  set status = v_target_status,
      provider_transaction_id = p_provider_transaction_id,
      updated_at = v_now
  where reference = p_reference and status = 'pending';

  if v_target_status = 'succeeded' and v_payment.user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_payment.user_id::text, 0));
    select subscription.current_period_start, subscription.current_period_end
      into v_period_start, v_period_end
    from public.subscriptions subscription
    where subscription.user_id = v_payment.user_id
      and subscription.plan_code = v_payment.plan_code
      and subscription.status in ('active', 'canceled')
      and subscription.current_period_end > v_now
    for update;
    if not found then
      v_period_start := v_now;
      v_period_end := v_now;
    end if;
    v_period_end := v_period_end + case v_payment.billing_interval
      when 'year' then make_interval(years => v_payment.interval_count)
      else make_interval(months => v_payment.interval_count)
    end;

    insert into public.subscriptions (
      user_id, plan_code, status, billing_interval,
      current_period_start, current_period_end
    ) values (
      v_payment.user_id, v_payment.plan_code, 'active', v_payment.billing_interval,
      v_period_start, v_period_end
    ) on conflict (user_id) do update
      set plan_code = excluded.plan_code,
          status = 'active',
          billing_interval = excluded.billing_interval,
          current_period_start = excluded.current_period_start,
          current_period_end = excluded.current_period_end,
          updated_at = v_now;
  end if;
  return jsonb_build_object('processed', true, 'outcome', v_outcome);
end
$function$;

create function public.transition_subscription_status(p_user_id uuid, p_status text)
returns boolean
language plpgsql security definer set search_path = '' as $function$
begin
  if p_status is null or p_status not in ('canceled', 'expired') then
    raise exception 'invalid subscription transition' using errcode = '22023';
  end if;
  update public.subscriptions
  set status = p_status, updated_at = now()
  where user_id = p_user_id and status = 'active';
  return found;
end
$function$;

create function public.my_subscription()
returns table (
  plan_code text,
  display_name text,
  status text,
  billing_interval text,
  current_period_start timestamptz,
  current_period_end timestamptz
)
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    case when subscription.status in ('active', 'canceled') and subscription.current_period_end > now()
      then subscription.plan_code else 'free' end,
    case when subscription.status in ('active', 'canceled') and subscription.current_period_end > now()
      then plan.display_name else 'Free' end,
    case when subscription.user_id is null
      then 'active'
      when subscription.status in ('active', 'canceled') and subscription.current_period_end > now()
      then subscription.status
      else 'expired' end,
    case when subscription.status in ('active', 'canceled') and subscription.current_period_end > now()
      then subscription.billing_interval else null end,
    case when subscription.status in ('active', 'canceled') and subscription.current_period_end > now()
      then subscription.current_period_start else null end,
    case when subscription.status in ('active', 'canceled') and subscription.current_period_end > now()
      then subscription.current_period_end else null end
  from (select v_uid as user_id) caller
  left join public.subscriptions subscription on subscription.user_id = caller.user_id
  left join public.subscription_plans plan
    on plan.code = subscription.plan_code
    and plan.billing_interval = subscription.billing_interval;
end
$function$;

create function public.admin_subscription_overview(p_days integer default 30)
returns table (
  currency text,
  current_subscribers bigint,
  successful_payments bigint,
  failed_payments bigint,
  gross_revenue_minor numeric
)
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  if not public.has_permission('analytics.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with currencies as (
    select distinct plan.currency
    from public.subscription_plans plan
    where plan.code in ('plus', 'pro')
    union
    select payment.currency
    from public.subscription_payment_attempts payment
    where payment.created_at >= now() - make_interval(days => v_days)
    union
    select plan.currency
    from public.subscriptions subscription
    join public.subscription_plans plan
      on plan.code = subscription.plan_code
      and plan.billing_interval = subscription.billing_interval
    where subscription.status in ('active', 'canceled')
      and subscription.current_period_end > now()
  ),
  subscriptions_by_currency as (
    select plan.currency, count(distinct subscription.user_id) as subscriber_count
    from public.subscriptions subscription
    join public.subscription_plans plan
      on plan.code = subscription.plan_code
      and plan.billing_interval = subscription.billing_interval
    where subscription.status in ('active', 'canceled')
      and subscription.current_period_end > now()
    group by plan.currency
  ),
  payments_by_currency as (
    select payment.currency,
      count(*) filter (where payment.status = 'succeeded') as successful_count,
      count(*) filter (where payment.status = 'failed') as failed_count,
      coalesce(sum(payment.amount_minor) filter (where payment.status = 'succeeded'), 0)::numeric as revenue_minor
    from public.subscription_payment_attempts payment
    where payment.created_at >= now() - make_interval(days => v_days)
    group by payment.currency
  )
  select currencies.currency,
    coalesce(subscriptions_by_currency.subscriber_count, 0),
    coalesce(payments_by_currency.successful_count, 0),
    coalesce(payments_by_currency.failed_count, 0),
    coalesce(payments_by_currency.revenue_minor, 0)
  from currencies
  left join subscriptions_by_currency using (currency)
  left join payments_by_currency using (currency)
  order by currencies.currency;
end
$function$;

revoke all on function public.prevent_paystack_event_mutation(),
  public.reserve_paystack_checkout(uuid, text, text, text),
  public.fail_paystack_checkout(text, text),
  public.record_paystack_event(text, text, text, text, text),
  public.finalize_paystack_payment(text, bigint, text, bigint, text, text, text, text),
  public.transition_subscription_status(uuid, text),
  public.my_subscription(),
  public.admin_subscription_overview(integer)
  from public, anon, authenticated;
grant execute on function public.reserve_paystack_checkout(uuid, text, text, text),
  public.fail_paystack_checkout(text, text),
  public.record_paystack_event(text, text, text, text, text),
  public.finalize_paystack_payment(text, bigint, text, bigint, text, text, text, text),
  public.transition_subscription_status(uuid, text)
  to service_role;
grant execute on function public.my_subscription() to authenticated;
grant execute on function public.admin_subscription_overview(integer) to authenticated;

commit;
