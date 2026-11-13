-- Align discussion author foreign keys with the profiles relations embedded by PostgREST.
begin;

alter table public.assignment_discussions
  drop constraint assignment_discussions_author_id_fkey,
  add constraint assignment_discussions_author_id_fkey
    foreign key (author_id) references public.profiles(id) on delete cascade;

alter table public.assignment_discussion_replies
  drop constraint assignment_discussion_replies_author_id_fkey,
  add constraint assignment_discussion_replies_author_id_fkey
    foreign key (author_id) references public.profiles(id) on delete cascade;

notify pgrst, 'reload schema';

commit;
