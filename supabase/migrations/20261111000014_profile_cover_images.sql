alter table public.profiles
  add column cover_path text
  check (cover_path is null or (
    cover_path like id::text || '/%'
    and cover_path !~ '\.\.'
    and char_length(cover_path) <= 200
  ));

grant update (cover_path) on public.profiles to authenticated;
