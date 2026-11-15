-- Repair Celebration RLS after celebration_studio_catalog_privacy.sql was applied.
-- The blocked-user helper is intentionally not executable by authenticated clients.
-- This current-user-only SECURITY DEFINER wrapper preserves that protection.
begin;

do $preflight$
begin
  if to_regclass('public.celebration_cards') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.follows') is null
     or to_regclass('storage.objects') is null
     or to_regnamespace('campusconnect_private') is null
     or to_regprocedure('public.account_effective_status(uuid)') is null
     or to_regprocedure('public.internal_blocked_either(uuid,uuid)') is null
     or not has_schema_privilege('authenticated','campusconnect_private','USAGE') then
    raise exception 'Apply and verify the Celebration and social security foundations before this policy repair';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'celebration_cards'
      and column_name in ('id','owner_id','status','visibility','photo_path')
    group by table_schema, table_name
    having count(distinct column_name) = 5
  ) then
    raise exception 'celebration_cards is missing columns required by this policy repair';
  end if;
end;
$preflight$;

create or replace function campusconnect_private.internal_current_celebration_visible(p_card_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select coalesce((
    select public.account_effective_status((select auth.uid())) = 'active'
      and (
        c.owner_id = (select auth.uid())
        or (
          c.status = 'published'
          and not coalesce(public.internal_blocked_either((select auth.uid()), c.owner_id), true)
          and case c.visibility
            when 'public' then true
            when 'followers' then exists (
              select 1 from public.follows f
              where f.follower_id = (select auth.uid()) and f.followee_id = c.owner_id
            )
            when 'institution' then exists (
              select 1 from public.profiles owner_profile
              join public.profiles viewer_profile on viewer_profile.id = (select auth.uid())
              where owner_profile.id = c.owner_id
                and owner_profile.institution_id is not null
                and owner_profile.institution_id = viewer_profile.institution_id
            )
            when 'private' then false
            else false
          end
        )
      )
    from public.celebration_cards c
    where c.id = p_card_id
  ), false)
$function$;
revoke all on function campusconnect_private.internal_current_celebration_visible(uuid) from public, anon, authenticated;
grant execute on function campusconnect_private.internal_current_celebration_visible(uuid) to authenticated;

alter table public.celebration_cards enable row level security;
grant select on public.celebration_cards to authenticated;
drop policy if exists celebration_cards_read on public.celebration_cards;
create policy celebration_cards_read on public.celebration_cards
  for select to authenticated
  using (campusconnect_private.internal_current_celebration_visible(id));

drop policy if exists celebration_images_read on storage.objects;
create policy celebration_images_read on storage.objects
  for select to authenticated using (
    bucket_id = 'celebration-images'
    and exists (
      select 1 from public.celebration_cards c
      where c.photo_path = name
        and campusconnect_private.internal_current_celebration_visible(c.id)
    )
  );

do $postflight$
begin
  if has_function_privilege('anon','campusconnect_private.internal_current_celebration_visible(uuid)','execute')
     or not has_function_privilege('authenticated','campusconnect_private.internal_current_celebration_visible(uuid)','execute')
     or not exists (
       select 1 from pg_catalog.pg_policies
       where schemaname = 'public'
         and tablename = 'celebration_cards'
         and policyname = 'celebration_cards_read'
         and qual like '%internal_current_celebration_visible%'
     ) then
    raise exception 'Celebration visibility policy repair postflight failed';
  end if;
end;
$postflight$;

commit;
