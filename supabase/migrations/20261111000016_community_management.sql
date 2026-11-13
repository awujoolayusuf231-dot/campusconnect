alter table public.communities
  add column cover_path text
  check (cover_path is null or (
    cover_path like id::text || '/community-cover-%'
    and cover_path !~ '\.\.'
    and char_length(cover_path) <= 200
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-covers', 'community-covers', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy community_covers_select_visible on storage.objects for select to authenticated
  using (
    bucket_id = 'community-covers'
    and exists (
      select 1 from public.communities c
      where c.id::text = (storage.foldername(name))[1]
        and c.cover_path = name
    )
  );

create policy community_covers_insert_manager on storage.objects for insert to authenticated
  with check (
    bucket_id = 'community-covers'
    and name ~ ('^' || (storage.foldername(name))[1] || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$')
    and exists (
      select 1 from public.communities c
      where c.id::text = (storage.foldername(name))[1]
        and c.status <> 'disabled'
        and (
          (select public.my_community_role(c.id)) in ('owner','moderator')
          or (select public.has_permission('communities.manage'))
        )
    )
  );

create policy community_covers_update_manager on storage.objects for update to authenticated
  using (
    bucket_id = 'community-covers'
    and name ~ ('^' || (storage.foldername(name))[1] || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$')
    and exists (
      select 1 from public.communities c
      where c.id::text = (storage.foldername(name))[1]
        and c.status <> 'disabled'
        and (
          (select public.my_community_role(c.id)) in ('owner','moderator')
          or (select public.has_permission('communities.manage'))
        )
    )
  )
  with check (
    bucket_id = 'community-covers'
    and name ~ ('^' || (storage.foldername(name))[1] || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$')
    and exists (
      select 1 from public.communities c
      where c.id::text = (storage.foldername(name))[1]
        and c.status <> 'disabled'
        and (
          (select public.my_community_role(c.id)) in ('owner','moderator')
          or (select public.has_permission('communities.manage'))
        )
    )
  );

create policy community_covers_delete_manager on storage.objects for delete to authenticated
  using (
    bucket_id = 'community-covers'
    and name ~ ('^' || (storage.foldername(name))[1] || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$')
    and exists (
      select 1 from public.communities c
      where c.id::text = (storage.foldername(name))[1]
        and c.status <> 'disabled'
        and (
          (select public.my_community_role(c.id)) in ('owner','moderator')
          or (select public.has_permission('communities.manage'))
        )
    )
  );

create function public.community_manage_update(
  p_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_institution uuid,
  p_cover_path text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text := coalesce((select public.my_community_role(p_id)), '');
  v_status text;
begin
  if v_uid is null or (
    v_role not in ('owner','moderator')
    and not (select public.has_permission('communities.manage'))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_status from public.communities where id = p_id for update;
  if v_status is null then raise exception 'not_found' using errcode = '22023'; end if;
  if v_status = 'disabled' then raise exception 'disabled_by_platform' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 3 and 60 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 500 then
    raise exception 'invalid_description' using errcode = '22023';
  end if;
  if p_category not in ('institution','department','course','interest','activity','other') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if p_institution is not null and not exists (
    select 1 from public.institutions where id = p_institution and is_active
  ) then
    raise exception 'invalid_institution' using errcode = '22023';
  end if;
  if p_cover_path is not null and p_cover_path !~ (
    '^' || p_id::text || '/community-cover-[A-Za-z0-9-]+[.](jpg|png|webp)$'
  ) then
    raise exception 'invalid_cover_path' using errcode = '22023';
  end if;
  if p_cover_path is not null and not exists (
    select 1 from storage.objects
    where bucket_id = 'community-covers' and name = p_cover_path
  ) then
    raise exception 'cover_not_found' using errcode = '22023';
  end if;

  update public.communities
  set name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      category = p_category,
      institution_id = p_institution,
      cover_path = p_cover_path
  where id = p_id;
exception
  when unique_violation then
    raise exception 'name_taken' using errcode = '23505';
end $$;

revoke execute on function public.community_manage_update(uuid, text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.community_manage_update(uuid, text, text, text, uuid, text)
  to authenticated;
