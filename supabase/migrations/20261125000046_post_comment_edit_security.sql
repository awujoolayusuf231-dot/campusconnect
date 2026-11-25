-- Enforce post editing and post-owner comment deletion at the database boundary.

create or replace function public.posts_edit_window_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.body is distinct from old.body
     and new.author_id = (select auth.uid())
     and new.status = 'visible'
     and old.created_at < now() - interval '5 minutes'
  then
    raise exception 'edit_window_expired' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_edit_window_guard on public.posts;
create trigger posts_edit_window_guard
before update of body on public.posts
for each row execute function public.posts_edit_window_guard();

create or replace function public.edit_own_post(p_post uuid, p_body text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_created_at timestamptz;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_body is null or char_length(btrim(p_body)) < 1 or char_length(p_body) > 2000 then
    raise exception 'invalid_post_body' using errcode = '22023';
  end if;
  select created_at into v_created_at
  from public.posts
  where id = p_post and author_id = v_uid and status = 'visible'
  for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if v_created_at < now() - interval '5 minutes' then
    raise exception 'edit_window_expired' using errcode = '42501';
  end if;
  update public.posts set body = btrim(p_body) where id = p_post;
end;
$$;

create or replace function public.delete_post_comment(p_comment uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_post uuid;
  v_post_author uuid;
  v_comment_author uuid;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select c.post_id, c.author_id, p.author_id
    into v_post, v_comment_author, v_post_author
  from public.comments c
  join public.posts p on p.id = c.post_id
  where c.id = p_comment and c.status <> 'deleted'
  for update of c;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if v_comment_author <> v_uid and v_post_author <> v_uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.comments set status = 'deleted', body = '' where id = p_comment;
end;
$$;

revoke all on function public.posts_edit_window_guard() from public, anon, authenticated;
grant execute on function public.posts_edit_window_guard() to authenticated;
revoke all on function public.edit_own_post(uuid, text) from public, anon;
grant execute on function public.edit_own_post(uuid, text) to authenticated;
revoke all on function public.delete_post_comment(uuid) from public, anon;
grant execute on function public.delete_post_comment(uuid) to authenticated;
