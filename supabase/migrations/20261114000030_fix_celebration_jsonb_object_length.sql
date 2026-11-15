-- Replace the unavailable jsonb_object_length call in the celebration save RPC.
-- Existing projects can apply this without rerunning the celebration schema migration.
begin;

do $preflight$
begin
  if to_regclass('public.celebration_cards') is null
     or to_regprocedure('public.save_celebration_card(uuid,text,text,text,timestamptz,text,text,text,text,text,jsonb,text,text)') is null then
    raise exception 'Apply 20261113000027_celebration_cards.sql before this repair';
  end if;
end
$preflight$;

create or replace function public.save_celebration_card(
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

revoke all on function public.save_celebration_card(uuid, text, text, text, timestamptz, text, text, text, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.save_celebration_card(uuid, text, text, text, timestamptz, text, text, text, text, text, jsonb, text, text)
  to authenticated;

do $postflight$
declare
  v_source text;
begin
  select prosrc into v_source
  from pg_catalog.pg_proc
  where oid = 'public.save_celebration_card(uuid,text,text,text,timestamptz,text,text,text,text,text,jsonb,text,text)'::regprocedure;
  if v_source is null
     or strpos(v_source, 'jsonb_object_length') > 0
     or strpos(v_source, 'jsonb_object_keys') = 0 then
    raise exception 'Celebration save RPC was not repaired';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.save_celebration_card(uuid,text,text,text,timestamptz,text,text,text,text,text,jsonb,text,text)',
    'execute'
  ) then
    raise exception 'Authenticated celebration save access is missing';
  end if;
end
$postflight$;

commit;
