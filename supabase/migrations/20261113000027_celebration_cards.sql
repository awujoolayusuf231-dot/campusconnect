-- Celebrations: private drafts, public published cards, image access, and feed integration.
-- Review and apply manually in Supabase SQL Editor. This file is never executed by the app.
begin;

do $preflight$
begin
  if to_regclass('public.posts') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.notifications') is null
     or to_regprocedure('public.account_effective_status(uuid)') is null
     or to_regprocedure('public.current_institution_id()') is null then
    raise exception 'Celebrations require the existing social, notification, and account foundations';
  end if;
  if to_regclass('public.celebration_cards') is not null then
    raise exception 'Celebration cards already exist; inspect the schema before applying this migration';
  end if;
end;
$preflight$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('celebration-images', 'celebration-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create table public.celebration_cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  category text not null check (category in (
    'birthday', 'convocation', 'graduation', 'induction', 'sign_out',
    'naming_ceremony', 'wedding', 'anniversary', 'achievement', 'other'
  )),
  celebrant_name text not null check (char_length(btrim(celebrant_name)) between 1 and 100),
  celebration_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 64),
  message text not null default '' check (char_length(message) <= 2000),
  venue text check (venue is null or char_length(venue) <= 200),
  whiteshirt_url text check (
    whiteshirt_url is null or (
      whiteshirt_url ~* '^https://(www\.)?whiteshirt\.fun(/[A-Za-z0-9._~%/-]*)?$'
      and char_length(whiteshirt_url) <= 200
    )
  ),
  template_id text not null default 'birthday-balloons',
  customization jsonb not null default '{}'::jsonb check (jsonb_typeof(customization) = 'object'),
  photo_path text,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    photo_path is null or photo_path ~ (
      '^' || owner_id::text || '/' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
    )
  ),
  check ((status = 'published') = (published_at is not null))
);

create index celebration_cards_public_feed_idx on public.celebration_cards (published_at desc, id desc)
  where status = 'published';
create index celebration_cards_owner_idx on public.celebration_cards (owner_id, updated_at desc);
create index celebration_cards_event_idx on public.celebration_cards (celebration_at)
  where status = 'published';
create trigger celebration_cards_updated_at before update on public.celebration_cards
  for each row execute function public.set_updated_at();

create table public.celebration_reminders (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.celebration_cards(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  remind_before_minutes integer not null check (remind_before_minutes in (0, 1440, 10080)),
  reminder_at timestamptz not null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (card_id, user_id, remind_before_minutes)
);
create index celebration_reminders_due_idx on public.celebration_reminders (reminder_at)
  where notified_at is null;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'like', 'comment', 'community_join', 'message', 'announcement',
    'moderation_warning', 'repost', 'discussion_reply', 'celebration_reminder'));

alter table public.celebration_cards enable row level security;
alter table public.celebration_reminders enable row level security;

grant select, delete on public.celebration_cards to authenticated;
grant select, delete on public.celebration_reminders to authenticated;
create policy celebration_cards_read on public.celebration_cards
  for select to authenticated
  using (
    public.account_effective_status((select auth.uid())) = 'active'
    and (owner_id = (select auth.uid()) or status = 'published')
  );
create policy celebration_cards_delete_own on public.celebration_cards
  for delete to authenticated
  using (owner_id = (select auth.uid()));
create policy celebration_reminders_read_own on public.celebration_reminders
  for select to authenticated using (user_id = (select auth.uid()));
create policy celebration_reminders_delete_own on public.celebration_reminders
  for delete to authenticated using (user_id = (select auth.uid()));

create policy celebration_images_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'celebration-images'
    and exists (
      select 1 from public.celebration_cards c
      where c.photo_path = name
        and (c.owner_id = (select auth.uid()) or c.status = 'published')
    )
  );
create policy celebration_images_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'celebration-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.celebration_cards c
      where c.id::text = (storage.foldername(name))[2]
        and c.owner_id = (select auth.uid())
        and c.status in ('draft', 'published')
    )
    and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
  );
create policy celebration_images_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'celebration-images'
    and exists (
      select 1 from public.celebration_cards c
      where c.id::text = (storage.foldername(name))[2]
        and c.owner_id = (select auth.uid())
    )
  );

create function public.save_celebration_card(
  p_card_id uuid,
  p_title text,
  p_category text,
  p_celebrant_name text,
  p_celebration_at timestamptz,
  p_timezone text,
  p_message text,
  p_venue text,
  p_whiteshirt_url text,
  p_template_id text,
  p_customization jsonb,
  p_photo_path text,
  p_status text
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_card uuid := p_card_id;
  v_theme jsonb := coalesce(p_customization, '{}'::jsonb);
  v_bg text;
  v_accent text;
  v_text text;
  v_align text;
  v_font text;
  v_x numeric;
  v_y numeric;
  v_scale numeric;
  v_theme_key_count integer;
begin
  if v_user is null or public.account_effective_status(v_user) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(v_theme) is distinct from 'object' then
    raise exception 'invalid_celebration_card' using errcode = '22023';
  end if;
  select count(*)::integer into v_theme_key_count
  from pg_catalog.jsonb_object_keys(v_theme);
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 120
     or p_category is null or p_category not in ('birthday', 'convocation', 'graduation', 'induction', 'sign_out',
       'naming_ceremony', 'wedding', 'anniversary', 'achievement', 'other')
     or char_length(btrim(coalesce(p_celebrant_name, ''))) not between 1 and 100
     or p_celebration_at is null
     or p_timezone is null or char_length(p_timezone) not between 1 and 64
     or p_timezone !~ '^[A-Za-z_+-]+(/[A-Za-z0-9_+-]+)*$'
     or not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = p_timezone)
     or char_length(coalesce(p_message, '')) > 2000
     or char_length(coalesce(p_venue, '')) > 200
     or p_status is null or p_status not in ('draft', 'published')
     or p_template_id is null or p_template_id not in (
       'birthday-balloons', 'birthday-editorial', 'birthday-confetti',
       'convocation-classic', 'graduation-honors', 'graduation-modern',
       'induction-professional', 'signout-campus', 'naming-soft',
       'wedding-romance', 'anniversary-elegant', 'achievement-bold', 'other-celebration'
     )
     or v_theme_key_count > 8 then
    raise exception 'invalid_celebration_card' using errcode = '22023';
  end if;
  if p_whiteshirt_url is not null and (
    p_whiteshirt_url !~* '^https://(www\.)?whiteshirt\.fun(/[A-Za-z0-9._~%/-]*)?$'
    or char_length(p_whiteshirt_url) > 200
  ) then raise exception 'invalid_whiteshirt_url' using errcode = '22023'; end if;
  if p_card_id is null and p_photo_path is not null then
    raise exception 'create the draft before uploading its image' using errcode = '22023';
  end if;
  if p_photo_path is not null and (
    p_photo_path !~ ('^' || v_user::text || '/' || v_card::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$')
  ) then raise exception 'invalid_celebration_photo_path' using errcode = '22023'; end if;

  v_bg := coalesce(v_theme ->> 'background', '#7b1f2b');
  v_accent := coalesce(v_theme ->> 'accent', '#e6b866');
  v_text := coalesce(v_theme ->> 'text', '#ffffff');
  v_align := coalesce(v_theme ->> 'align', 'center');
  v_font := coalesce(v_theme ->> 'font', 'serif');
  v_x := coalesce((v_theme ->> 'photoX')::numeric, 50);
  v_y := coalesce((v_theme ->> 'photoY')::numeric, 50);
  v_scale := coalesce((v_theme ->> 'photoScale')::numeric, 1);
  if v_bg !~* '^#[0-9a-f]{6}$' or v_accent !~* '^#[0-9a-f]{6}$'
     or v_text !~* '^#[0-9a-f]{6}$'
     or v_align not in ('left', 'center', 'right')
     or v_font not in ('serif', 'sans', 'display')
     or v_x not between 0 and 100 or v_y not between 0 and 100
     or v_scale not between 0.6 and 1.6 then
    raise exception 'invalid_celebration_customization' using errcode = '22023';
  end if;
  if p_status = 'published' and p_photo_path is not null and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'celebration-images' and o.name = p_photo_path
      and split_part(o.name, '/', 1) = v_user::text
  ) then raise exception 'celebration_image_not_uploaded' using errcode = '22023'; end if;

  if v_card is null then
    insert into public.celebration_cards (
      owner_id, title, category, celebrant_name, celebration_at, timezone, message,
      venue, whiteshirt_url, template_id, customization, photo_path, status, published_at
    ) values (
      v_user, btrim(p_title), p_category, btrim(p_celebrant_name), p_celebration_at,
      p_timezone, btrim(coalesce(p_message, '')), nullif(btrim(coalesce(p_venue, '')), ''),
      p_whiteshirt_url, p_template_id, v_theme, p_photo_path, p_status,
      case when p_status = 'published' then now() else null end
    ) returning id into v_card;
  else
    perform 1 from public.celebration_cards c where c.id = v_card and c.owner_id = v_user for update;
    if not found then raise exception 'celebration_card_not_found' using errcode = 'P0002'; end if;
    if p_photo_path is not null and split_part(p_photo_path, '/', 2) <> v_card::text then
      raise exception 'invalid_celebration_photo_path' using errcode = '22023';
    end if;
    update public.celebration_cards
    set title = btrim(p_title), category = p_category, celebrant_name = btrim(p_celebrant_name),
      celebration_at = p_celebration_at, timezone = p_timezone,
      message = btrim(coalesce(p_message, '')), venue = nullif(btrim(coalesce(p_venue, '')), ''),
      whiteshirt_url = p_whiteshirt_url, template_id = p_template_id,
      customization = v_theme, photo_path = p_photo_path, status = p_status,
      published_at = case when p_status = 'published' then coalesce(published_at, now()) else null end
    where id = v_card;
  end if;
  return v_card;
end
$function$;

create function public.add_celebration_reminder(p_card_id uuid, p_remind_before_minutes integer)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_event_at timestamptz;
begin
  if v_user is null or public.account_effective_status(v_user) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_remind_before_minutes not in (0, 1440, 10080) then
    raise exception 'invalid_reminder_time' using errcode = '22023';
  end if;
  select celebration_at into v_event_at
  from public.celebration_cards where id = p_card_id and status = 'published';
  if not found or v_event_at <= now() then raise exception 'celebration_not_upcoming' using errcode = '22023'; end if;
  if v_event_at - make_interval(mins => p_remind_before_minutes) <= now() then
    raise exception 'reminder_time_has_passed' using errcode = '22023';
  end if;
  insert into public.celebration_reminders (card_id, user_id, remind_before_minutes, reminder_at)
  values (p_card_id, v_user, p_remind_before_minutes, v_event_at - make_interval(mins => p_remind_before_minutes))
  on conflict (card_id, user_id, remind_before_minutes) do update
    set reminder_at = excluded.reminder_at
  returning id into v_id;
  return v_id;
end
$function$;

create function public.cancel_celebration_reminder(p_card_id uuid, p_remind_before_minutes integer)
returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.celebration_reminders
  where card_id = p_card_id and user_id = (select auth.uid())
    and remind_before_minutes = p_remind_before_minutes;
end
$function$;

create function public.queue_due_celebration_reminders()
returns integer
language plpgsql security definer set search_path = ''
as $function$
declare
  v_reminder record;
  v_title text;
  v_processed integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for v_reminder in
    select r.id, r.user_id, r.card_id, r.remind_before_minutes
    from public.celebration_reminders r
    where r.notified_at is null and r.reminder_at <= now()
    order by r.reminder_at, r.id
    for update skip locked
    limit 100
  loop
    select c.title into v_title
    from public.celebration_cards c
    where c.id = v_reminder.card_id and c.status = 'published' and c.celebration_at > now();
    if found then
      perform public.internal_notify(
        v_reminder.user_id,
        'celebration_reminder',
        null,
        'celebration',
        v_reminder.card_id,
        'celebration-reminder:' || v_reminder.id::text,
        jsonb_build_object('title', v_title, 'remind_before_minutes', v_reminder.remind_before_minutes)
      );
    end if;
    update public.celebration_reminders set notified_at = now() where id = v_reminder.id;
    v_processed := v_processed + 1;
  end loop;
  return v_processed;
end
$function$;

create function public.delete_celebration_card(p_card_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.celebration_cards
  where id = p_card_id and owner_id = (select auth.uid());
  if not found then raise exception 'celebration_card_not_found' using errcode = 'P0002'; end if;
end
$function$;

create function public.feed_timeline(
  p_scope text default 'all',
  p_before timestamptz default null,
  p_before_type text default null,
  p_before_id uuid default null,
  p_limit integer default 20
) returns table (item_type text, item_id uuid, activity_at timestamptz, item jsonb)
language sql stable security invoker set search_path = ''
as $function$
  with post_activity as (
    select p.id, p.created_at as activity_at, null::uuid as reposter_id
    from public.posts p join public.profiles pr on pr.id = p.author_id
    where p.status = 'visible' and p.community_id is null
      and (p_scope = 'all'
        or (p_scope = 'following' and exists (
          select 1 from public.follows f
          where f.follower_id = (select auth.uid()) and f.followee_id = p.author_id
        ))
        or (p_scope = 'institution' and pr.institution_id is not null
          and pr.institution_id = (select public.current_institution_id())))
    union all
    select p.id, r.created_at, r.user_id
    from public.reposts r join public.posts p on p.id = r.post_id
    where p_scope = 'following' and p.status = 'visible' and p.community_id is null
      and exists (select 1 from public.follows f
        where f.follower_id = (select auth.uid()) and f.followee_id = r.user_id)
  ),
  latest_posts as (
    select distinct on (activity.id) activity.id, activity.activity_at, activity.reposter_id
    from post_activity activity
    order by activity.id, activity.activity_at desc
  ),
  post_items as (
    select 'post'::text as item_type, p.id as item_id, latest.activity_at,
      jsonb_build_object(
        'id', p.id, 'author_id', p.author_id, 'body', p.body, 'created_at', p.created_at,
        'edited_at', p.edited_at, 'like_count', p.like_count, 'comment_count', p.comment_count,
        'repost_count', p.repost_count,
        'liked_by_me', exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
        'reposted_by_me', exists (select 1 from public.reposts r where r.post_id = p.id and r.user_id = (select auth.uid())),
        'username', author.username, 'display_name', author.display_name, 'avatar_path', author.avatar_path,
        'activity_at', latest.activity_at, 'reposter_username', reposter.username, 'reposter_name', reposter.display_name
      ) as item
    from latest_posts latest
    join public.posts p on p.id = latest.id
    join public.profiles author on author.id = p.author_id
    left join public.profiles reposter on reposter.id = latest.reposter_id
  ),
  celebration_items as (
    select 'celebration'::text as item_type, c.id as item_id, c.published_at as activity_at,
      jsonb_build_object(
        'id', c.id, 'title', c.title, 'category', c.category, 'celebrant_name', c.celebrant_name,
        'celebration_at', c.celebration_at, 'timezone', c.timezone, 'message', c.message,
        'venue', c.venue, 'whiteshirt_url', c.whiteshirt_url, 'template_id', c.template_id,
        'customization', c.customization, 'photo_path', c.photo_path,
        'created_at', c.created_at, 'published_at', c.published_at,
        'creator_name', coalesce(author.display_name, 'CampusConnect student'),
        'creator_username', author.username
      ) as item
    from public.celebration_cards c
    left join public.profiles author on author.id = c.owner_id
    where p_scope = 'all' and c.status = 'published'
  ),
  timeline as (
    select * from post_items
    union all
    select * from celebration_items
  )
  select t.item_type, t.item_id, t.activity_at, t.item
  from timeline t
  where p_before is null
    or (t.activity_at, t.item_type, t.item_id) < (
      p_before, coalesce(p_before_type, 'post'), coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
    )
  order by t.activity_at desc, t.item_type desc, t.item_id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$function$;

revoke all on function public.save_celebration_card(uuid, text, text, text, timestamptz, text, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.add_celebration_reminder(uuid, integer) from public, anon, authenticated;
revoke all on function public.cancel_celebration_reminder(uuid, integer) from public, anon, authenticated;
revoke all on function public.queue_due_celebration_reminders() from public, anon, authenticated, service_role;
revoke all on function public.delete_celebration_card(uuid) from public, anon, authenticated;
revoke all on function public.feed_timeline(text, timestamptz, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.save_celebration_card(uuid, text, text, text, timestamptz, text, text, text, text, text, jsonb, text, text) to authenticated;
grant execute on function public.add_celebration_reminder(uuid, integer) to authenticated;
grant execute on function public.cancel_celebration_reminder(uuid, integer) to authenticated;
grant execute on function public.queue_due_celebration_reminders() to service_role;
grant execute on function public.delete_celebration_card(uuid) to authenticated;
grant execute on function public.feed_timeline(text, timestamptz, text, uuid, integer) to authenticated;

do $postflight$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.celebration_cards'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.celebration_reminders'::regclass) then
    raise exception 'Celebrations RLS postflight failed';
  end if;
  if has_table_privilege('authenticated', 'public.celebration_cards', 'insert,update')
     or has_table_privilege('anon', 'public.celebration_cards', 'select,insert,update,delete')
     or has_table_privilege('anon', 'public.celebration_reminders', 'select,insert,update,delete') then
    raise exception 'Celebration card data has unexpected client privileges';
  end if;
  if has_function_privilege('anon', 'public.save_celebration_card(uuid,text,text,text,timestamptz,text,text,text,text,text,jsonb,text,text)', 'execute') then
    raise exception 'Anonymous celebration card RPC access remains enabled';
  end if;
end
$postflight$;

commit;
