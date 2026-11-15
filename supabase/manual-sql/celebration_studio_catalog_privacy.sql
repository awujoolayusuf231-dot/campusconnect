-- CampusConnect Celebration Studio repair for the reported legacy schema.
-- MANUAL REVIEW ONLY. Never run automatically or against production without reviewing the target project.
-- Adapts the existing legacy celebration_templates table; do not use on a fresh database.
begin;

do $preflight$
declare
  v_legacy_columns text[] := array[
    'id','category_slug','label','layout','background','accent','text_color','font',
    'text_align','motif','backdrop','is_enabled','featured','sort_order','created_at','updated_at'
  ];
begin
  if to_regclass('public.celebration_cards') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.follows') is null
     or to_regprocedure('public.has_permission(text)') is null
     or to_regprocedure('public.account_effective_status(uuid)') is null
     or to_regprocedure('public.internal_blocked_either(uuid,uuid)') is null
     or to_regnamespace('campusconnect_private') is null
     or not has_schema_privilege('authenticated','campusconnect_private','USAGE') then
    raise exception 'The existing social and celebration foundations are incomplete; verify them before this legacy repair';
  end if;
  if to_regclass('public.celebration_templates') is null then
    raise exception 'The legacy celebration_templates table is missing; this repair is only for the reported legacy schema';
  end if;
  if (
    select count(distinct c.column_name)
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'celebration_templates'
      and c.column_name = any(v_legacy_columns)
  ) <> cardinality(v_legacy_columns) then
    raise exception 'celebration_templates does not match the reported legacy column set; inspect its schema before proceeding';
  end if;
  if to_regclass('public.celebration_occasions') is not null
     or to_regprocedure('public.save_celebration_studio_card(uuid,jsonb)') is not null then
    raise exception 'Studio occasions or save RPC already exist; inspect the partially upgraded schema instead of applying this repair';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'celebration_cards' and column_name = 'whiteshirt_url'
  ) then
    raise exception 'celebration_cards.whiteshirt_url is missing; apply the existing celebration-card migration first';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'celebration_cards'
      and column_name = 'visibility' and data_type <> 'text'
  ) then
    raise exception 'celebration_cards.visibility exists but is not text; inspect that column before applying the Studio repair';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'celebration_cards'
      and column_name = 'details' and udt_name <> 'jsonb'
  ) then
    raise exception 'celebration_cards.details exists but is not jsonb; inspect that column before applying the Studio repair';
  end if;
end;
$preflight$;

alter table public.celebration_cards
  add column if not exists details jsonb,
  add column if not exists visibility text;

update public.celebration_cards set details = '{}'::jsonb where details is null;
update public.celebration_cards set visibility = 'public' where visibility is null;

do $studio_card_data_preflight$
begin
  if exists (
    select 1 from public.celebration_cards
    where visibility not in ('public','followers','institution','private')
       or jsonb_typeof(details) is distinct from 'object'
  ) then
    raise exception 'Existing celebration cards contain unsupported visibility or details values; correct them before applying this repair';
  end if;
end;
$studio_card_data_preflight$;

alter table public.celebration_cards
  alter column details set default '{}'::jsonb,
  alter column details set not null,
  alter column visibility set default 'public',
  alter column visibility set not null;

do $drop_category_checks$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.celebration_cards'::regclass
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%category%'
  loop
    execute format('alter table public.celebration_cards drop constraint %I', v_constraint.conname);
  end loop;
end;
$drop_category_checks$;

update public.celebration_cards
set category = case category
  when 'cultural' then 'cultural_celebration'
  when 'achievement' then 'promotion_achievement'
  else category
end
where category in ('cultural','achievement');

alter table public.celebration_cards
  add constraint celebration_cards_category_check check (category in (
    'birthday', 'induction', 'convocation', 'sign_out', 'wedding', 'engagement',
    'naming_ceremony', 'graduation', 'anniversary', 'promotion_achievement',
    'award_recognition', 'housewarming', 'baby_shower', 'retirement',
    'cultural_celebration', 'other'
  ));

do $drop_studio_card_checks$
declare
  v_constraint record;
  v_definition text;
begin
  for v_constraint in
    select c.conname, c.oid
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.celebration_cards'::regclass
      and c.contype = 'c'
  loop
    v_definition := pg_catalog.pg_get_constraintdef(v_constraint.oid);
    if v_definition ilike '%visibility%' or v_definition ilike '%details%' then
      execute format('alter table public.celebration_cards drop constraint %I', v_constraint.conname);
    end if;
  end loop;
end;
$drop_studio_card_checks$;

alter table public.celebration_cards
  add constraint celebration_cards_visibility_check check (visibility in ('public', 'followers', 'institution', 'private')),
  add constraint celebration_cards_details_check check (jsonb_typeof(details) = 'object');

do $whiteshirt_check$
declare
  v_constraint oid;
begin
  select c.oid into v_constraint
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.celebration_cards'::regclass
    and c.conname = 'celebration_cards_whiteshirt_required_check';

  if v_constraint is null then
    alter table public.celebration_cards
      add constraint celebration_cards_whiteshirt_required_check
      check (whiteshirt_url is not null) not valid;
  elsif lower(pg_catalog.pg_get_constraintdef(v_constraint)) not like '%whiteshirt_url is not null%' then
    raise exception 'The Whiteshirt-required constraint has a different definition; inspect it before proceeding';
  end if;
end;
$whiteshirt_check$;

create table public.celebration_occasions (
  id text primary key check (id ~ '^[a-z][a-z0-9_-]{1,39}$'),
  label text not null check (char_length(label) between 2 and 80),
  eyebrow text not null check (char_length(eyebrow) between 2 and 100),
  primary_name text not null check (char_length(primary_name) between 2 and 80),
  title_placeholder text not null check (char_length(title_placeholder) between 2 and 120),
  message_placeholder text not null check (char_length(message_placeholder) between 2 and 220),
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  palette text[] not null check (cardinality(palette) = 4),
  accent text not null check (accent ~* '^#[0-9a-f]{6}$'),
  text_color text not null check (text_color ~* '^#[0-9a-f]{6}$'),
  image text not null check (image ~ '^/celebrations/[a-z0-9_-]+[.]jpg$'),
  icon text not null check (icon in ('party','academic','heart','award','home','baby','culture','spark')),
  emotional_line text not null check (char_length(emotional_line) between 2 and 160),
  is_active boolean not null default true,
  sort_order smallint not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.celebration_templates
  add column if not exists occasion_id text,
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists preview_image_url text,
  add column if not exists is_active boolean,
  add column if not exists is_featured boolean;

alter table public.celebration_templates
  alter column sort_order set default 100,
  alter column created_at set default now(),
  alter column updated_at set default now();

create trigger celebration_occasions_updated_at before update on public.celebration_occasions
  for each row execute function public.set_updated_at();

alter table public.celebration_occasions enable row level security;
alter table public.celebration_templates enable row level security;
grant select, insert, update, delete on public.celebration_occasions, public.celebration_templates to authenticated;

create policy celebration_occasions_read on public.celebration_occasions
  for select to authenticated using (is_active or (select public.has_permission('settings.manage')));
create policy celebration_occasions_manage on public.celebration_occasions
  for all to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));

insert into public.celebration_occasions
  (id,label,eyebrow,primary_name,title_placeholder,message_placeholder,fields,palette,accent,text_color,image,icon,emotional_line,sort_order)
values
('birthday','Birthday','Another year, celebrated','Birthday celebrant','A new year to shine','Write a birthday wish or share what makes this year special.','[{"key":"age","label":"Age (optional)","type":"number"}]','{"#172c3c","#8d2536","#192f36","#f0d7b4"}','#f4c769','#fffaf2','/celebrations/birthday.jpg','party','A brighter year begins here.',10),
('induction','Induction','A new chapter begins','Inductee''s name','Welcome to the profession','Celebrate the dedication and new responsibilities of this milestone.','[{"key":"institution","label":"Institution"},{"key":"faculty","label":"Faculty"},{"key":"department","label":"Department"},{"key":"session","label":"Academic session"}]','{"#142b41","#16493e","#6a3b2c","#e7e0ce"}','#d8b260','#fffaf0','/celebrations/achievement.jpg','academic','Earned with purpose. Carried with pride.',20),
('convocation','Convocation','The next chapter starts','Graduate''s name','A day years in the making','Honor the hard work, late nights, and people behind this achievement.','[{"key":"institution","label":"Institution"},{"key":"degree","label":"Degree or qualification"},{"key":"faculty","label":"Faculty"},{"key":"department","label":"Department"},{"key":"honour","label":"Class or distinction"}]','{"#142c4d","#552637","#254944","#efe4d2"}','#dfbd74','#fffaf3','/celebrations/graduation.jpg','academic','A degree earned. A future opened.',30),
('sign_out','Sign-out','The memories stay','Graduate''s name','One last walk across campus','Share a note about the friendships, lessons, and memories made.','[{"key":"institution","label":"Institution"},{"key":"department","label":"Department"},{"key":"journey","label":"A line from your journey"},{"key":"session","label":"Graduating session"}]','{"#412631","#243d4a","#623a2b","#f2dfc9"}','#e5aa73','#fff9f0','/celebrations/graduation.jpg','academic','Every ending carries a beginning.',40),
('wedding','Wedding','Together, always','Couple''s names','A celebration of love','Invite loved ones to share a beautiful beginning.','[{"key":"partner_name","label":"Partner''s name"},{"key":"venue","label":"Venue"},{"key":"personal_link","label":"Invitation link","type":"url"}]','{"#583242","#7d3e48","#394338","#f0e2d3"}','#e7c39a','#fff9f2','/celebrations/wedding.jpg','heart','Two stories, one beautiful future.',50),
('engagement','Engagement','A promise worth celebrating','Your names','The beginning of forever','Share the joy of a promise made and a future imagined.','[{"key":"partner_name","label":"Fiancé(e)''s name"},{"key":"venue","label":"Celebration venue"},{"key":"personal_link","label":"Personal link","type":"url"}]','{"#483448","#3c4b42","#75404b","#f0ded0"}','#e4bd8e','#fffaf4','/celebrations/wedding.jpg','heart','A joyful yes. A lifetime ahead.',60),
('naming_ceremony','Naming ceremony','A precious new name','Baby''s name','Welcome to the world','Send a warm welcome to the newest member of the family.','[{"key":"parents","label":"Parents"},{"key":"venue","label":"Ceremony venue"}]','{"#b98272","#748b87","#836b83","#efe0d0"}','#f5d6a6','#fffaf4','/celebrations/birthday.jpg','baby','A little life. A world of possibility.',70),
('graduation','Graduation','The cap. The gown. The moment.','Graduate''s name','A milestone made meaningful','Celebrate a hard-earned milestone and what comes next.','[{"key":"institution","label":"Institution"},{"key":"degree","label":"Degree or qualification"},{"key":"faculty","label":"Faculty"},{"key":"department","label":"Department"},{"key":"honour","label":"Class or distinction"}]','{"#182c49","#713343","#2e4c47","#eee1cf"}','#dfbd74','#fffaf4','/celebrations/graduation.jpg','academic','The work was yours. The moment is yours.',80),
('anniversary','Anniversary','Still choosing each other','Names to celebrate','Another year, side by side','Celebrate the moments and memories shared along the way.','[{"key":"years","label":"Years together","type":"number"},{"key":"partner_name","label":"Partner''s name"},{"key":"venue","label":"Venue"}]','{"#362940","#77404b","#374741","#eee0cf"}','#dfbd83','#fff9f2','/celebrations/wedding.jpg','heart','A love story, still unfolding.',90),
('promotion_achievement','Promotion & achievement','Progress worth celebrating','Achiever''s name','A well-earned next step','Recognize the effort, growth, and courage behind this achievement.','[{"key":"achievement","label":"Achievement or new role"},{"key":"institution","label":"Organization"}]','{"#3b2c28","#16433e","#283c5a","#f0dec6"}','#e9bd67','#fffaf2','/celebrations/achievement.jpg','award','The next level looks good on you.',100),
('award_recognition','Award & recognition','Excellence seen and celebrated','Honoree''s name','Recognition well deserved','Celebrate the contribution and excellence being recognized.','[{"key":"award","label":"Award or recognition"},{"key":"organization","label":"Awarding organization"},{"key":"category","label":"Award category"}]','{"#1d3046","#532c42","#4a3b23","#eee2cf"}','#e5c16e','#fffaf2','/celebrations/achievement.jpg','award','A moment of excellence. A legacy in motion.',110),
('housewarming','Housewarming','A place to call your own','Host''s name','A new home, a warm welcome','Invite friends and family to celebrate your new place.','[{"key":"venue","label":"New home address or venue"},{"key":"personal_link","label":"Map or invitation link","type":"url"}]','{"#54634c","#9a593b","#374f62","#efe0c9"}','#e8c27d','#fffaf1','/celebrations/achievement.jpg','home','Come in. Stay awhile.',120),
('baby_shower','Baby shower','A little one on the way','Parent-to-be','A little wonder is on the way','Share the excitement as family and friends get ready to welcome a new arrival.','[{"key":"parents","label":"Parents-to-be"},{"key":"venue","label":"Shower venue"},{"key":"personal_link","label":"Registry link","type":"url"}]','{"#a6818c","#778a82","#9a775e","#f4e3d4"}','#f1d29a','#fffaf4','/celebrations/birthday.jpg','baby','The sweetest adventure is almost here.',130),
('retirement','Retirement','A career well lived','Honoree''s name','Thank you for the years','Honor a career, a mentor, and all the lives made better along the way.','[{"key":"organization","label":"Organization"},{"key":"years","label":"Years of service","type":"number"},{"key":"role","label":"Role or title"}]','{"#34464b","#624344","#465338","#eee1d0"}','#dfbd78','#fffaf2','/celebrations/achievement.jpg','award','The work may pause. The impact never will.',140),
('cultural_celebration','Cultural celebration','Tradition, joy, togetherness','Name or community','Celebrating our culture','Share the meaning, traditions, and joy of this cultural occasion.','[{"key":"occasion_detail","label":"Celebration or tradition"},{"key":"community","label":"Community or cultural group"},{"key":"venue","label":"Venue"}]','{"#49394a","#314a3e","#7a4538","#ebddc6"}','#e9bd69','#fff9f0','/celebrations/achievement.jpg','culture','Our stories make us who we are.',150),
('other','Other celebration','Your moment, your way','Name to celebrate','A moment worth remembering','Tell the story behind this special occasion.','[{"key":"occasion_detail","label":"What are you celebrating?"},{"key":"venue","label":"Venue"},{"key":"personal_link","label":"Personal link","type":"url"}]','{"#392d42","#31474b","#6f413c","#edddc9"}','#e8bc72','#fffaf2','/celebrations/achievement.jpg','spark','Every good moment deserves its own page.',160);
;

do $legacy_catalog_preflight$
begin
  if (select count(*) from public.celebration_templates) <> 64
     or (select count(distinct category_slug) from public.celebration_templates) <> 16
     or exists (
       select 1 from public.celebration_templates
       where category_slug not in (
         'achievement','anniversary','award_recognition','baby_shower','birthday','convocation',
         'cultural','engagement','graduation','housewarming','induction','naming_ceremony',
         'other','retirement','sign_out','wedding'
       )
       or layout not in ('countdown','editorial','minimal','photo')
       or id !~ '^[a-z0-9][a-z0-9_-]{1,79}$'
     )
     or exists (
       select 1 from (
         select category_slug, count(*) as template_count, count(distinct layout) as layout_count
         from public.celebration_templates
         group by category_slug
       ) grouped
       where grouped.template_count <> 4 or grouped.layout_count <> 4
     ) then
    raise exception 'The legacy catalog no longer matches the verified 64-template, 16-category layout; stop and inspect before migrating';
  end if;
end;
$legacy_catalog_preflight$;

do $drop_legacy_template_checks$
declare
  v_constraint record;
  v_definition text;
begin
  for v_constraint in
    select c.conname, c.oid
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.celebration_templates'::regclass
      and c.contype = 'c'
  loop
    v_definition := pg_catalog.pg_get_constraintdef(v_constraint.oid);
    if v_definition ilike '%category_slug%' or v_definition ilike '%layout%' then
      execute format('alter table public.celebration_templates drop constraint %I', v_constraint.conname);
    end if;
  end loop;
end;
$drop_legacy_template_checks$;

update public.celebration_templates
set occasion_id = case category_slug
      when 'cultural' then 'cultural_celebration'
      when 'achievement' then 'promotion_achievement'
      else category_slug
    end,
    name = label,
    description = case layout
      when 'countdown' then 'A bold countdown-led design for the moment ahead.'
      when 'editorial' then 'A magazine-inspired layout with expressive typography.'
      when 'minimal' then 'A refined, minimalist design with generous breathing room.'
      when 'photo' then 'A photo-forward design that puts the celebrant in focus.'
    end,
    layout = case layout
      when 'countdown' then 'celebration'
      when 'editorial' then 'editorial'
      when 'minimal' then 'luxury'
      when 'photo' then 'portrait'
    end,
    is_active = is_enabled,
    is_featured = featured;

create function public.sync_celebration_template_legacy_columns()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_text_align text;
  v_motif text;
  v_backdrop text;
begin
  if new.occasion_id is null then
    new.occasion_id := case new.category_slug when 'cultural' then 'cultural_celebration' else new.category_slug end;
  end if;
  if new.name is null then new.name := coalesce(new.label, new.id); end if;
  if new.description is null then
    new.description := case new.layout
      when 'celebration' then 'A bold, expressive design for a joyful milestone.'
      when 'editorial' then 'A magazine-inspired layout with expressive typography.'
      when 'luxury' then 'A refined, minimalist design with generous breathing room.'
      when 'portrait' then 'A photo-forward design that puts the celebrant in focus.'
      else 'A celebration design.'
    end;
  end if;
  new.category_slug := case new.occasion_id
    when 'cultural_celebration' then 'cultural'
    when 'promotion_achievement' then 'achievement'
    else new.occasion_id
  end;
  new.label := new.name;
  new.is_active := coalesce(new.is_active, new.is_enabled, true);
  new.is_enabled := new.is_active;
  new.is_featured := coalesce(new.is_featured, new.featured, false);
  new.featured := new.is_featured;
  if new.text_align is null or new.motif is null or new.backdrop is null then
    select t.text_align, t.motif, t.backdrop
    into v_text_align, v_motif, v_backdrop
    from public.celebration_templates t
    where t.id is distinct from new.id
      and t.text_align is not null and t.motif is not null and t.backdrop is not null
    order by t.id
    limit 1;
    new.text_align := coalesce(new.text_align, v_text_align, 'center');
    new.motif := coalesce(new.motif, v_motif, 'spark');
    new.backdrop := coalesce(new.backdrop, v_backdrop, 'gradient');
  end if;
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := coalesce(new.updated_at, now());
  return new;
end;
$function$;

create trigger celebration_templates_sync_legacy_columns
  before insert or update on public.celebration_templates
  for each row execute function public.sync_celebration_template_legacy_columns();

insert into public.celebration_templates
  (id,occasion_id,name,description,layout,background,accent,text_color,font,is_active,is_featured,sort_order)
select 'studio-' || o.id || '-' || d.layout, o.id, d.name, d.description, d.layout,
       o.palette[d.palette_index], o.accent,
       case when d.layout = 'celebration' then '#211f1d' else o.text_color end,
       d.font, true, false, d.sort_order
from public.celebration_occasions o
cross join (values
  ('portrait','The Portrait','Photo-forward full-height image with a dramatic lower title treatment.','sans',1,10),
  ('editorial','The Editorial','Magazine-inspired type hierarchy with structured event details.','display',2,20),
  ('luxury','The Signature','Quietly elegant framing, refined type and balanced whitespace.','serif',3,30),
  ('celebration','The Celebration','Expressive shapes, bright accents and a joyful finish.','display',4,40)
) as d(layout,name,description,font,palette_index,sort_order)
where not exists (
    select 1 from public.celebration_templates t
    where t.occasion_id = o.id and t.layout = d.layout and t.is_active
  )
on conflict (id) do nothing;

alter table public.celebration_templates
  alter column occasion_id set not null,
  alter column name set not null,
  alter column description set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column is_featured set default false,
  alter column is_featured set not null;

do $template_constraints$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.celebration_templates'::regclass
      and c.conname = 'celebration_templates_occasion_id_fkey'
  ) then
    alter table public.celebration_templates
      add constraint celebration_templates_occasion_id_fkey
      foreign key (occasion_id) references public.celebration_occasions(id)
      on update cascade on delete restrict;
  end if;
end;
$template_constraints$;

alter table public.celebration_templates
  add constraint celebration_templates_layout_check
  check (layout in ('portrait','editorial','luxury','celebration'));

create index if not exists celebration_templates_active_idx
  on public.celebration_templates (occasion_id, sort_order, id) where is_active;

drop trigger if exists celebration_templates_updated_at on public.celebration_templates;
create trigger celebration_templates_updated_at before update on public.celebration_templates
  for each row execute function public.set_updated_at();

do $replace_template_policies$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'celebration_templates'
  loop
    execute format('drop policy %I on public.celebration_templates', v_policy.policyname);
  end loop;
end;
$replace_template_policies$;

create policy celebration_templates_read on public.celebration_templates
  for select to authenticated using (
    (is_active and exists (
      select 1 from public.celebration_occasions o where o.id = occasion_id and o.is_active
    ))
    or (select public.has_permission('settings.manage'))
  );
create policy celebration_templates_manage on public.celebration_templates
  for all to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('celebration-template-previews','celebration-template-previews',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists celebration_template_previews_read on storage.objects;
drop policy if exists celebration_template_previews_insert on storage.objects;
drop policy if exists celebration_template_previews_update on storage.objects;
drop policy if exists celebration_template_previews_delete on storage.objects;
create policy celebration_template_previews_read on storage.objects
  for select to public using (bucket_id = 'celebration-template-previews');
create policy celebration_template_previews_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'celebration-template-previews'
    and (select public.has_permission('settings.manage'))
  );
create policy celebration_template_previews_update on storage.objects
  for update to authenticated using (
    bucket_id = 'celebration-template-previews'
    and (select public.has_permission('settings.manage'))
  ) with check (
    bucket_id = 'celebration-template-previews'
    and (select public.has_permission('settings.manage'))
  );
create policy celebration_template_previews_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'celebration-template-previews'
    and (select public.has_permission('settings.manage'))
  );

do $replace_card_read_policies$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'celebration_cards'
      and cmd in ('SELECT','ALL')
  loop
    execute format('drop policy %I on public.celebration_cards', v_policy.policyname);
  end loop;
end;
$replace_card_read_policies$;

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
create policy celebration_cards_read on public.celebration_cards
  for select to authenticated using (
    campusconnect_private.internal_current_celebration_visible(id)
  );

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

create function public.save_celebration_studio_card(p_card_id uuid, p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_card uuid := p_card_id;
  v_status text := p_payload ->> 'status';
  v_category text := p_payload ->> 'category';
  v_visibility text := coalesce(p_payload ->> 'visibility', 'public');
  v_template text := p_payload ->> 'template_id';
  v_theme jsonb := coalesce(p_payload -> 'customization', '{}'::jsonb);
  v_details jsonb := coalesce(p_payload -> 'details', '{}'::jsonb);
  v_photo text := nullif(p_payload ->> 'photo_path', '');
  v_title text := btrim(coalesce(p_payload ->> 'title', ''));
  v_name text := btrim(coalesce(p_payload ->> 'celebrant_name', ''));
  v_event timestamptz := (p_payload ->> 'celebration_at')::timestamptz;
  v_timezone text := p_payload ->> 'timezone';
  v_message text := coalesce(p_payload ->> 'message', '');
  v_venue text := nullif(btrim(coalesce(p_payload ->> 'venue', '')), '');
  v_whiteshirt text := nullif(btrim(coalesce(p_payload ->> 'whiteshirt_url', '')), '');
  v_bg text;
  v_accent text;
  v_text text;
  v_align text;
  v_font text;
  v_x numeric;
  v_y numeric;
  v_scale numeric;
  v_theme_keys integer;
begin
  if v_user is null or public.account_effective_status(v_user) <> 'active' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
     or jsonb_typeof(v_theme) is distinct from 'object'
     or jsonb_typeof(v_details) is distinct from 'object' then
    raise exception 'invalid_celebration_card' using errcode = '22023';
  end if;
  if v_whiteshirt is null then
    raise exception 'whiteshirt_celebration_link_required' using errcode = '22023';
  end if;
  select count(*) into v_theme_keys from pg_catalog.jsonb_object_keys(v_theme);
  if char_length(v_title) not between 3 and 120
     or char_length(v_name) not between 1 and 100
     or v_event is null
     or v_timezone is null or char_length(v_timezone) not between 1 and 64
     or not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = v_timezone)
     or char_length(v_message) > 2000
     or char_length(coalesce(v_venue, '')) > 200
     or (v_whiteshirt is not null and (
       v_whiteshirt !~* '^https://(www[.])?whiteshirt[.]fun(/[A-Za-z0-9._~%/-]*)?$'
       or char_length(v_whiteshirt) > 200
     ))
     or v_status is null or v_status not in ('draft','published')
     or v_visibility not in ('public','followers','institution','private')
     or v_category is null
     or not exists (select 1 from public.celebration_occasions o where o.id = v_category and o.is_active)
     or v_template is null
     or not exists (select 1 from public.celebration_templates t where t.id = v_template and t.occasion_id = v_category and t.is_active)
     or jsonb_typeof(v_theme) is distinct from 'object'
     or jsonb_typeof(v_details) is distinct from 'object' then
    raise exception 'invalid_celebration_card' using errcode = '22023';
  end if;
  if v_theme_keys > 20
     or (select count(*) from pg_catalog.jsonb_object_keys(v_details)) > 20
     or exists (
       select 1 from pg_catalog.jsonb_each_text(v_details) d
       where d.key !~ '^[a-z][a-z0-9_]{0,39}$' or char_length(d.value) > 300
     ) then
    raise exception 'invalid_celebration_details' using errcode = '22023';
  end if;

  v_bg := coalesce(v_theme ->> 'background', '#172c3c');
  v_accent := coalesce(v_theme ->> 'accent', '#f4c769');
  v_text := coalesce(v_theme ->> 'text', '#fffaf2');
  v_align := coalesce(v_theme ->> 'align', 'center');
  v_font := coalesce(v_theme ->> 'font', 'sans');
  if coalesce(v_theme ->> 'photoX', '50') !~ '^[0-9]+([.][0-9]+)?$'
     or coalesce(v_theme ->> 'photoY', '50') !~ '^[0-9]+([.][0-9]+)?$'
     or coalesce(v_theme ->> 'photoScale', '1') !~ '^[0-9]+([.][0-9]+)?$' then
    raise exception 'invalid_celebration_customization' using errcode = '22023';
  end if;
  v_x := coalesce((v_theme ->> 'photoX')::numeric, 50);
  v_y := coalesce((v_theme ->> 'photoY')::numeric, 50);
  v_scale := coalesce((v_theme ->> 'photoScale')::numeric, 1);
  if v_bg !~* '^#[0-9a-f]{6}$' or v_accent !~* '^#[0-9a-f]{6}$'
     or v_text !~* '^#[0-9a-f]{6}$'
     or v_align not in ('left','center','right')
     or v_font not in ('serif','sans','display')
     or v_x not between 0 and 100 or v_y not between 0 and 100 or v_scale not between 0.6 and 1.6
     or char_length(coalesce(v_theme ->> 'extraText','')) > 300
     or char_length(coalesce(v_theme ->> 'institutionName','')) > 120
     or (nullif(v_theme ->> 'qrValue','') is not null and v_theme ->> 'qrValue' !~* '^https://[^[:space:]]{1,490}$')
     or coalesce(v_theme ->> 'layout','portrait') not in ('portrait','editorial','luxury','celebration')
     or coalesce(v_theme ->> 'titleSize','large') not in ('small','medium','large') then
    raise exception 'invalid_celebration_customization' using errcode = '22023';
  end if;
  if v_photo is not null and v_photo !~ ('^' || v_user::text || '/' || coalesce(v_card::text, '[0-9a-f-]{36}') ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$') then
    raise exception 'invalid_celebration_photo_path' using errcode = '22023';
  end if;

  if v_card is null then
    insert into public.celebration_cards
      (owner_id,title,category,celebrant_name,celebration_at,timezone,message,venue,whiteshirt_url,
       template_id,customization,details,visibility,photo_path,status,published_at)
    values
      (v_user,v_title,v_category,v_name,v_event,v_timezone,v_message,v_venue,v_whiteshirt,
       v_template,v_theme,v_details,v_visibility,v_photo,v_status,case when v_status = 'published' then now() else null end)
    returning id into v_card;
  else
    perform 1 from public.celebration_cards c where c.id = v_card and c.owner_id = v_user for update;
    if not found then raise exception 'celebration_card_not_found' using errcode = 'P0002'; end if;
    if v_photo is not null and split_part(v_photo, '/', 2) <> v_card::text then
      raise exception 'invalid_celebration_photo_path' using errcode = '22023';
    end if;
    update public.celebration_cards
    set title=v_title, category=v_category, celebrant_name=v_name, celebration_at=v_event, timezone=v_timezone,
        message=v_message, venue=v_venue, whiteshirt_url=v_whiteshirt, template_id=v_template,
        customization=v_theme, details=v_details, visibility=v_visibility, photo_path=v_photo,
        status=v_status, published_at=case when v_status='published' then coalesce(published_at,now()) else null end
    where id=v_card;
  end if;
  if v_status = 'published' and v_photo is not null and not exists (
    select 1 from storage.objects o where o.bucket_id='celebration-images' and o.name=v_photo
      and split_part(o.name,'/',1)=v_user::text
  ) then raise exception 'celebration_image_not_uploaded' using errcode = '22023'; end if;
  return v_card;
end;
$function$;
revoke all on function public.save_celebration_studio_card(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_celebration_studio_card(uuid,jsonb) to authenticated;

create or replace function public.feed_timeline(
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
          select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.followee_id = p.author_id
        ))
        or (p_scope = 'institution' and pr.institution_id is not null
          and pr.institution_id = (select public.current_institution_id())))
    union all
    select p.id, r.created_at, r.user_id
    from public.reposts r join public.posts p on p.id = r.post_id
    where p_scope = 'following' and p.status = 'visible' and p.community_id is null
      and exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.followee_id = r.user_id)
  ),
  latest_posts as (
    select distinct on (activity.id) activity.id, activity.activity_at, activity.reposter_id
    from post_activity activity order by activity.id, activity.activity_at desc
  ),
  post_items as (
    select 'post'::text as item_type, p.id as item_id, latest.activity_at,
      jsonb_build_object(
        'id',p.id,'author_id',p.author_id,'body',p.body,'created_at',p.created_at,'edited_at',p.edited_at,
        'like_count',p.like_count,'comment_count',p.comment_count,'repost_count',p.repost_count,
        'liked_by_me',exists(select 1 from public.post_likes l where l.post_id=p.id and l.user_id=(select auth.uid())),
        'reposted_by_me',exists(select 1 from public.reposts r where r.post_id=p.id and r.user_id=(select auth.uid())),
        'username',author.username,'display_name',author.display_name,'avatar_path',author.avatar_path,
        'activity_at',latest.activity_at,'reposter_username',reposter.username,'reposter_name',reposter.display_name
      ) as item
    from latest_posts latest join public.posts p on p.id=latest.id
    join public.profiles author on author.id=p.author_id
    left join public.profiles reposter on reposter.id=latest.reposter_id
  ),
  celebration_items as (
    select 'celebration'::text as item_type,c.id as item_id,c.published_at as activity_at,
      jsonb_build_object(
        'id',c.id,'title',c.title,'category',c.category,'celebrant_name',c.celebrant_name,
        'celebration_at',c.celebration_at,'timezone',c.timezone,'message',c.message,'venue',c.venue,
        'whiteshirt_url',c.whiteshirt_url,'template_id',c.template_id,'customization',c.customization,
        'details',c.details,'visibility',c.visibility,'photo_path',c.photo_path,'created_at',c.created_at,
        'published_at',c.published_at,'creator_name',coalesce(author.display_name,'CampusConnect student'),
        'creator_username',author.username
      ) as item
    from public.celebration_cards c left join public.profiles author on author.id=c.owner_id
    where p_scope='all' and c.status='published'
  ),
  timeline as (select * from post_items union all select * from celebration_items)
  select t.item_type,t.item_id,t.activity_at,t.item
  from timeline t
  where p_before is null or (t.activity_at,t.item_type,t.item_id) < (
    p_before,coalesce(p_before_type,'post'),coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
  )
  order by t.activity_at desc,t.item_type desc,t.item_id desc
  limit least(greatest(coalesce(p_limit,20),1),50)
$function$;

do $postflight$
begin
  if not (select relrowsecurity from pg_class where oid='public.celebration_cards'::regclass)
     or not (select relrowsecurity from pg_class where oid='public.celebration_occasions'::regclass)
     or not (select relrowsecurity from pg_class where oid='public.celebration_templates'::regclass)
     or (select count(*) from public.celebration_occasions where is_active) <> 16
     or (select count(*) from public.celebration_templates t join public.celebration_occasions o on o.id=t.occasion_id where t.is_active) <> 64
     or exists (
       select 1 from public.celebration_occasions o
       where o.is_active and (
         select count(*) from public.celebration_templates t
         where t.occasion_id = o.id and t.is_active
       ) <> 4
     )
     or not exists (
       select 1 from pg_catalog.pg_constraint c
       where c.conrelid = 'public.celebration_cards'::regclass
         and c.conname = 'celebration_cards_whiteshirt_required_check'
         and lower(pg_catalog.pg_get_constraintdef(c.oid)) like '%whiteshirt_url is not null%'
     )
     or has_function_privilege('anon','campusconnect_private.internal_current_celebration_visible(uuid)','execute')
     or not has_function_privilege('authenticated','campusconnect_private.internal_current_celebration_visible(uuid)','execute')
     or has_function_privilege('anon','public.save_celebration_studio_card(uuid,jsonb)','execute') then
    raise exception 'Celebration Studio postflight verification failed';
  end if;
end;
$postflight$;

commit;