-- Student portfolio, CV, and timetable persistence.
-- Apply manually after reviewing; this migration is not executed by the app.
begin;

do $preflight$
begin
  if to_regclass('public.feature_flags') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.academic_courses') is null
     or to_regclass('storage.objects') is null
     or to_regclass('storage.buckets') is null
     or to_regprocedure('public.feature_enabled(text)') is null
     or to_regprocedure('public.account_effective_status(uuid)') is null
     or to_regprocedure('public.set_updated_at()') is null then
    raise exception 'Student portfolio, CV, and timetable require the existing identity, academic catalog, and Storage migrations';
  end if;
  if to_regclass('public.student_portfolios') is not null
     or to_regclass('public.student_portfolio_items') is not null
     or to_regclass('public.student_cvs') is not null
     or to_regclass('public.student_timetable_events') is not null then
    raise exception 'Student feature tables already exist; inspect the schema before applying this migration';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) then
    raise exception 'Storage object row-level security must remain enabled';
  end if;
end
$preflight$;

insert into public.feature_flags (key, enabled, description)
values
  ('student_portfolio', true, 'Student portfolios and public portfolio sharing'),
  ('student_cv_builder', true, 'Private student CV builder'),
  ('student_timetable', true, 'Private student timetable planner')
on conflict (key) do nothing;

create table public.student_portfolios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  avatar_path text check (
    avatar_path is null
    or avatar_path ~ ('^' || owner_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$')
  ),
  headline text check (headline is null or char_length(headline) <= 120),
  summary text check (summary is null or char_length(summary) <= 2000),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  show_contact_email boolean not null default false,
  location text check (location is null or char_length(location) <= 100),
  website_url text check (website_url is null or (website_url ~* '^https://[^[:space:]]+$' and char_length(website_url) <= 300)),
  linkedin_url text check (linkedin_url is null or (linkedin_url ~* '^https://(www\.)?linkedin\.com/[^[:space:]]+$' and char_length(linkedin_url) <= 300)),
  github_url text check (github_url is null or (github_url ~* '^https://(www\.)?github\.com/[^[:space:]]+$' and char_length(github_url) <= 300)),
  template_key text not null default 'modern'
    check (template_key in ('minimal', 'modern', 'professional', 'creative', 'developer', 'academic')),
  accent_color text not null default '#c52b3a' check (accent_color ~* '^#[0-9a-f]{6}$'),
  section_order text[] not null default array['projects','skills','experience','education','achievements','certificates']::text[]
    check (
      cardinality(section_order) between 1 and 8
      and section_order <@ array['projects','skills','experience','education','achievements','certificates']::text[]
    ),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index student_portfolios_slug_lower_idx on public.student_portfolios (lower(slug));
create trigger student_portfolios_updated_at before update on public.student_portfolios
  for each row execute function public.set_updated_at();

create table public.student_portfolio_items (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.student_portfolios(id) on delete cascade,
  item_type text not null check (item_type in ('skill','project','education','experience','achievement','certificate')),
  content jsonb not null check (
    jsonb_typeof(content) = 'object'
    and octet_length(content::text) <= 24000
  ),
  image_path text,
  sort_order smallint not null default 0,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index student_portfolio_items_order_idx on public.student_portfolio_items (portfolio_id, item_type, sort_order, created_at);
create index student_portfolio_items_public_idx on public.student_portfolio_items (portfolio_id, sort_order)
  where is_public;
create trigger student_portfolio_items_updated_at before update on public.student_portfolio_items
  for each row execute function public.set_updated_at();

create table public.student_cvs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  template_key text not null default 'modern_professional'
    check (template_key in ('modern_professional','simple_minimal','graduate','student','technical','academic','creative','internship')),
  content jsonb not null check (
    jsonb_typeof(content) = 'object'
    and octet_length(content::text) <= 200000
  ),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index student_cvs_owner_updated_idx on public.student_cvs (owner_id, updated_at desc);
create unique index student_cvs_one_default_per_owner_idx on public.student_cvs (owner_id)
  where is_default;
create trigger student_cvs_updated_at before update on public.student_cvs
  for each row execute function public.set_updated_at();

create table public.student_timetable_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.academic_courses(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  event_type text not null check (event_type in (
    'lecture','practical','tutorial','seminar','personal_study','group_study',
    'assignment_deadline','examination','other'
  )),
  event_date date not null,
  start_time time not null,
  end_time time not null,
  timezone text not null check (char_length(timezone) between 1 and 64),
  venue text check (venue is null or char_length(venue) <= 200),
  instructor text check (instructor is null or char_length(instructor) <= 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  color text not null default '#c52b3a' check (color ~* '^#[0-9a-f]{6}$'),
  recurrence text not null default 'once' check (recurrence in ('once','weekly')),
  repeat_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  check (
    (recurrence = 'once' and repeat_until is null)
    or (recurrence = 'weekly' and repeat_until is not null and repeat_until >= event_date)
  )
);
create index student_timetable_events_owner_date_idx on public.student_timetable_events (owner_id, event_date, start_time);
create index student_timetable_events_course_idx on public.student_timetable_events (owner_id, course_id, event_date);
create trigger student_timetable_events_updated_at before update on public.student_timetable_events
  for each row execute function public.set_updated_at();

alter table public.student_portfolios enable row level security;
alter table public.student_portfolio_items enable row level security;
alter table public.student_cvs enable row level security;
alter table public.student_timetable_events enable row level security;

grant select, delete on public.student_portfolios to authenticated;
grant insert (owner_id, slug, display_name, avatar_path, headline, summary, contact_email, show_contact_email,
  location, website_url, linkedin_url, github_url, template_key, accent_color, section_order, is_public)
  on public.student_portfolios to authenticated;
grant update (slug, display_name, avatar_path, headline, summary, contact_email, show_contact_email,
  location, website_url, linkedin_url, github_url, template_key, accent_color, section_order, is_public)
  on public.student_portfolios to authenticated;
create policy student_portfolios_select_owner on public.student_portfolios
  for select to authenticated using (owner_id = (select auth.uid()));
create policy student_portfolios_insert_owner on public.student_portfolios
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and public.account_effective_status((select auth.uid())) = 'active'
    and (select public.feature_enabled('student_portfolio'))
  );
create policy student_portfolios_update_owner on public.student_portfolios
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and public.account_effective_status((select auth.uid())) = 'active'
    and (select public.feature_enabled('student_portfolio'))
  );
create policy student_portfolios_delete_owner on public.student_portfolios
  for delete to authenticated using (owner_id = (select auth.uid()));

grant select, delete on public.student_portfolio_items to authenticated;
grant insert (portfolio_id, item_type, content, image_path, sort_order, is_public)
  on public.student_portfolio_items to authenticated;
grant update (item_type, content, image_path, sort_order, is_public)
  on public.student_portfolio_items to authenticated;
create policy student_portfolio_items_select_owner on public.student_portfolio_items
  for select to authenticated using (
    exists (
      select 1 from public.student_portfolios p
      where p.id = portfolio_id and p.owner_id = (select auth.uid())
    )
  );
create policy student_portfolio_items_insert_owner on public.student_portfolio_items
  for insert to authenticated with check (
    public.account_effective_status((select auth.uid())) = 'active'
    and (select public.feature_enabled('student_portfolio'))
    and exists (
      select 1 from public.student_portfolios p
      where p.id = portfolio_id and p.owner_id = (select auth.uid())
    )
    and (
      image_path is null
      or image_path ~ ('^' || (select auth.uid())::text || '/' || portfolio_id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$')
    )
  );
create policy student_portfolio_items_update_owner on public.student_portfolio_items
  for update to authenticated
  using (
    exists (
      select 1 from public.student_portfolios p
      where p.id = portfolio_id and p.owner_id = (select auth.uid())
    )
  )
  with check (
    public.account_effective_status((select auth.uid())) = 'active'
    and (select public.feature_enabled('student_portfolio'))
    and exists (
      select 1 from public.student_portfolios p
      where p.id = portfolio_id and p.owner_id = (select auth.uid())
    )
    and (
      image_path is null
      or image_path ~ ('^' || (select auth.uid())::text || '/' || portfolio_id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$')
    )
  );
create policy student_portfolio_items_delete_owner on public.student_portfolio_items
  for delete to authenticated using (
    exists (
      select 1 from public.student_portfolios p
      where p.id = portfolio_id and p.owner_id = (select auth.uid())
    )
  );

grant select, delete on public.student_cvs to authenticated;
grant insert (owner_id, title, template_key, content, is_default) on public.student_cvs to authenticated;
grant update (title, template_key, content, is_default) on public.student_cvs to authenticated;
create policy student_cvs_select_owner on public.student_cvs
  for select to authenticated using (owner_id = (select auth.uid()));
create policy student_cvs_insert_owner on public.student_cvs
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and public.account_effective_status((select auth.uid())) = 'active'
    and (select public.feature_enabled('student_cv_builder'))
  );
create policy student_cvs_update_owner on public.student_cvs
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and public.account_effective_status((select auth.uid())) = 'active'
    and (select public.feature_enabled('student_cv_builder'))
  );
create policy student_cvs_delete_owner on public.student_cvs
  for delete to authenticated using (owner_id = (select auth.uid()));

create function public.set_default_student_cv(p_cv_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null
     or coalesce(public.account_effective_status(v_user), '') <> 'active'
     or not coalesce(public.feature_enabled('student_cv_builder'), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.student_cvs c where c.id = p_cv_id and c.owner_id = v_user
  ) then
    raise exception 'cv_not_found' using errcode = 'P0002';
  end if;
  update public.student_cvs set is_default = false
  where owner_id = v_user and id <> p_cv_id and is_default;
  update public.student_cvs set is_default = true
  where id = p_cv_id and owner_id = v_user;
end
$function$;
revoke all on function public.set_default_student_cv(uuid) from public, anon, authenticated;
grant execute on function public.set_default_student_cv(uuid) to authenticated;

grant select, delete on public.student_timetable_events to authenticated;
grant insert (owner_id, course_id, title, event_type, event_date, start_time, end_time, timezone,
  venue, instructor, notes, color, recurrence, repeat_until)
  on public.student_timetable_events to authenticated;
grant update (course_id, title, event_type, event_date, start_time, end_time, timezone,
  venue, instructor, notes, color, recurrence, repeat_until)
  on public.student_timetable_events to authenticated;
create policy student_timetable_events_select_owner on public.student_timetable_events
  for select to authenticated using (owner_id = (select auth.uid()));
create policy student_timetable_events_insert_owner on public.student_timetable_events
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and public.account_effective_status((select auth.uid())) = 'active'
    and (select public.feature_enabled('student_timetable'))
  );
create policy student_timetable_events_update_owner on public.student_timetable_events
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and public.account_effective_status((select auth.uid())) = 'active'
    and (select public.feature_enabled('student_timetable'))
  );
create policy student_timetable_events_delete_owner on public.student_timetable_events
  for delete to authenticated using (owner_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-portfolio-assets', 'student-portfolio-assets', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create function public.student_portfolio_asset_read_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.student_portfolios p
    where p.owner_id::text = (storage.foldername(p_name))[1]
      and p.id::text = (storage.foldername(p_name))[2]
      and (
        p.owner_id = (select auth.uid())
        or (
          p.is_public
          and public.account_effective_status(p.owner_id) = 'active'
          and public.feature_enabled('student_portfolio')
          and exists (
            select 1 from public.student_portfolio_items i
            where i.portfolio_id = p.id
              and i.image_path = p_name
              and i.item_type = 'project'
              and i.is_public
          )
        )
      )
  )
$function$;
revoke all on function public.student_portfolio_asset_read_allowed(text) from public, anon, authenticated;
grant execute on function public.student_portfolio_asset_read_allowed(text) to anon, authenticated;

create policy student_portfolio_assets_insert_owner on storage.objects
  for insert to authenticated with check (
    bucket_id = 'student-portfolio-assets'
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$')
    and public.account_effective_status((select auth.uid())) = 'active'
    and (select public.feature_enabled('student_portfolio'))
    and exists (
      select 1 from public.student_portfolios p
      where p.owner_id = (select auth.uid())
        and p.id::text = (storage.foldername(objects.name))[2]
    )
  );
create policy student_portfolio_assets_read_scoped on storage.objects
  for select to anon, authenticated using (
    bucket_id = 'student-portfolio-assets'
    and public.student_portfolio_asset_read_allowed(objects.name)
  );
create policy student_portfolio_assets_delete_owner on storage.objects
  for delete to authenticated using (
    bucket_id = 'student-portfolio-assets'
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/')
    and exists (
      select 1 from public.student_portfolios p
      where p.owner_id = (select auth.uid())
        and p.id::text = (storage.foldername(objects.name))[2]
    )
  );

create function public.get_public_student_portfolio(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'slug', p.slug,
    'display_name', p.display_name,
    'avatar_path', case when p.avatar_path is not null then p.avatar_path else null end,
    'headline', p.headline,
    'summary', p.summary,
    'contact_email', case when p.show_contact_email then p.contact_email else null end,
    'location', p.location,
    'website_url', p.website_url,
    'linkedin_url', p.linkedin_url,
    'github_url', p.github_url,
    'template_key', p.template_key,
    'accent_color', p.accent_color,
    'section_order', to_jsonb(p.section_order),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'item_type', i.item_type,
          'image_path', case when i.item_type = 'project' then i.image_path else null end,
          'sort_order', i.sort_order,
          'content', case i.item_type
            when 'skill' then jsonb_strip_nulls(jsonb_build_object(
              'name', i.content ->> 'name',
              'category', i.content ->> 'category',
              'proficiency', i.content ->> 'proficiency',
              'description', i.content ->> 'description',
              'is_highlighted', case when jsonb_typeof(i.content -> 'is_highlighted') = 'boolean' then i.content -> 'is_highlighted' else null end
            ))
            when 'project' then jsonb_strip_nulls(jsonb_build_object(
              'title', i.content ->> 'title',
              'description', i.content ->> 'description',
              'category', i.content ->> 'category',
              'technologies', i.content -> 'technologies',
              'project_url', i.content ->> 'project_url',
              'github_url', i.content ->> 'github_url',
              'role', i.content ->> 'role',
              'completed_at', i.content ->> 'completed_at',
              'collaborators', i.content -> 'collaborators'
            ))
            when 'education' then jsonb_strip_nulls(jsonb_build_object(
              'institution', i.content ->> 'institution',
              'faculty', i.content ->> 'faculty',
              'department', i.content ->> 'department',
              'course', i.content ->> 'course',
              'academic_level', i.content ->> 'academic_level',
              'graduation_year', i.content ->> 'graduation_year',
              'description', i.content ->> 'description'
            ))
            when 'experience' then jsonb_strip_nulls(jsonb_build_object(
              'title', i.content ->> 'title',
              'organization', i.content ->> 'organization',
              'description', i.content ->> 'description',
              'start_date', i.content ->> 'start_date',
              'end_date', i.content ->> 'end_date',
              'location', i.content ->> 'location',
              'url', i.content ->> 'url'
            ))
            when 'achievement' then jsonb_strip_nulls(jsonb_build_object(
              'title', i.content ->> 'title',
              'organization', i.content ->> 'organization',
              'description', i.content ->> 'description',
              'achieved_at', i.content ->> 'achieved_at',
              'url', i.content ->> 'url'
            ))
            when 'certificate' then jsonb_strip_nulls(jsonb_build_object(
              'title', i.content ->> 'title',
              'issuer', i.content ->> 'issuer',
              'description', i.content ->> 'description',
              'issued_at', i.content ->> 'issued_at',
              'credential_url', i.content ->> 'credential_url'
            ))
          end
        ) order by i.sort_order, i.created_at
      )
      from public.student_portfolio_items i
      where i.portfolio_id = p.id and i.is_public
    ), '[]'::jsonb)
  )
  from public.student_portfolios p
  where p.slug = p_slug
    and p.is_public
    and public.account_effective_status(p.owner_id) = 'active'
    and public.feature_enabled('student_portfolio')
$function$;

revoke all on function public.get_public_student_portfolio(text) from public, anon, authenticated;
grant execute on function public.get_public_student_portfolio(text) to anon, authenticated;

do $postflight$
begin
  if not (
    select relrowsecurity from pg_class where oid = 'public.student_portfolios'::regclass
  ) or not (
    select relrowsecurity from pg_class where oid = 'public.student_portfolio_items'::regclass
  ) or not (
    select relrowsecurity from pg_class where oid = 'public.student_cvs'::regclass
  ) or not (
    select relrowsecurity from pg_class where oid = 'public.student_timetable_events'::regclass
  ) then
    raise exception 'RLS must be enabled for every student-owned feature table';
  end if;
  if not exists (
    select 1 from storage.buckets where id = 'student-portfolio-assets' and public = false
      and file_size_limit = 5242880
      and allowed_mime_types @> array['image/jpeg','image/png','image/webp']
  ) then
    raise exception 'Student portfolio asset bucket must remain private and type/size restricted';
  end if;
  if has_table_privilege('anon', 'public.student_cvs', 'select,insert,update,delete')
     or has_table_privilege('anon', 'public.student_timetable_events', 'select,insert,update,delete')
     or has_table_privilege('anon', 'public.student_portfolios', 'select,insert,update,delete')
     or has_table_privilege('anon', 'public.student_portfolio_items', 'select,insert,update,delete') then
    raise exception 'Anonymous direct access to private student feature tables must remain disabled';
  end if;
end
$postflight$;

commit;
