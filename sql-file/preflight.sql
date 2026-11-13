-- READ-ONLY. Reports whether migrations A, B, C and the 0014 reconciliation file are present in the database the runner points at.
-- Output with psql -At -F'|' is one line: a|b|c|0014 (t = present, f = missing). Changes nothing.
select (to_regprocedure('public.posts_by_hashtag(text,timestamptz,uuid,integer)') is not null)::text as a_hashtags,
       (to_regprocedure('public.record_post_impressions(uuid[])') is not null)::text as b_impressions,
       (to_regprocedure('public.claim_notification_outbox(text,integer)') is not null)::text as c_outbox,
       (to_regprocedure('public.admin_complete_account_deletion(uuid,text)') is not null)::text as recon_0014;
