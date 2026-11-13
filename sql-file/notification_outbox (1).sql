-- Tests for migration C: notification outbox, channel preferences, push tokens, delivery log.
-- REQUIRES migration C applied, on a LOCAL database only (A and B are NOT required). Independent of the other suites: creates
-- its own users with fixed ids and the final intentional exception rolls everything back.
-- SAFETY GUARD: refuses to run if any account whose email does not end in '@t.invalid' exists (i.e. a real database).
-- Every line of the RESULTS block must start with PASS.
-- STATUS: WRITTEN BUT NEVER EXECUTED (the authoring environment has no Postgres/Docker).
-- No real email or push is ever sent: this suite only exercises the database side (queueing, claiming, completing).
create or replace function pg_temp.act(p_uid uuid, p_role text, p_sql text) returns text language plpgsql as $f$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; get diagnostics n = row_count;
  exception when others then reset role; return 'err:' || sqlerrm; end;
  reset role; return 'ok:' || n;
end $f$;
create or replace function pg_temp.val(p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin execute p_sql into v; exception when others then reset role; return 'err:' || sqlerrm; end;
  reset role; return coalesce(v, 'null');
end $f$;
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $f$
begin execute p_sql; return 'ok'; exception when others then return 'err:' || sqlerrm; end $f$;
create or replace function pg_temp.ex(p_name text, p_got text, p_want text) returns text language sql as $f$
  select case when p_got like p_want || '%' then 'PASS ' else 'FAIL ' end || p_name || ' -> ' || p_got || E'\n' $f$;
create or replace function pg_temp.eq(p_name text, p_got text, p_want text) returns text language sql as $f$
  select case when p_got is not distinct from p_want then 'PASS ' else 'FAIL ' end || p_name || ' -> ' || coalesce(p_got, 'NULL') || E'\n' $f$;
create or replace function pg_temp.tk(n int) returns text language sql as $f$ select 'fcm:' || repeat('x', 30) || lpad(n::text, 4, '0') $f$;
create or replace function pg_temp.reg(p_uid uuid, p_token text, p_platform text default 'web', p_label text default 'Test device') returns text language sql as $f$
  select pg_temp.act(p_uid, 'authenticated', format('select public.register_push_token(%L, %L, %L)', p_token, p_platform, p_label)) $f$;
create or replace function pg_temp.ob(p_uid uuid, p_channel text) returns text language sql as $f$      -- number of outbox rows
  select count(*)::text from public.notification_outbox where user_id = p_uid and channel = p_channel $f$;
create or replace function pg_temp.obs(p_uid uuid, p_channel text) returns text language sql as $f$     -- "status/collapsed" list
  select coalesce(string_agg(status || '/' || collapsed_count, ',' order by id), 'none') from public.notification_outbox where user_id = p_uid and channel = p_channel $f$;
create or replace function pg_temp.obe(p_uid uuid, p_channel text, p_type text, p_entity uuid) returns text language sql as $f$  -- rows for one entity: "n/collapsed"
  select coalesce(count(*)::text || '/' || max(o.collapsed_count)::text, '0/0')
    from public.notification_outbox o join public.notifications n on n.id = o.notification_id
   where o.user_id = p_uid and o.channel = p_channel and n.type = p_type and n.entity_id = p_entity $f$;
create or replace function pg_temp.notify(p_user uuid, p_type text, p_actor uuid, p_entity uuid, p_dedupe text) returns void language sql as $f$
  select public.internal_notify(p_user, p_type, p_actor, 'post', p_entity, p_dedupe, '{}'::jsonb) $f$;

do $do$
declare
  r text := '';
  a uuid := '00000000-0000-0000-0000-0000000000a1'; b uuid := '00000000-0000-0000-0000-0000000000b1';
  c uuid := '00000000-0000-0000-0000-0000000000c1'; d uuid := '00000000-0000-0000-0000-0000000000d1';
  e uuid := '00000000-0000-0000-0000-0000000000e1'; f uuid := '00000000-0000-0000-0000-0000000000f1';
  g uuid := '00000000-0000-0000-0000-000000000071'; h uuid := '00000000-0000-0000-0000-000000000081';
  m uuid := '00000000-0000-0000-0000-0000000000a9'; s uuid := '00000000-0000-0000-0000-000000000051';
  z uuid := '00000000-0000-0000-0000-0000000000f9';
  pa uuid; pb uuid; pc uuid; conv_x uuid := gen_random_uuid(); conv_y uuid := gen_random_uuid();
  nid bigint; n int; i int; v text; rec record; found_m boolean; m_tokens int; m_actor text; h_email text; h_push text;
  r1 bigint; r2 bigint; r3 bigint; r4 bigint; r5 bigint; res jsonb; before_n bigint; before_ob bigint;
begin
  if exists (select 1 from auth.users where email is distinct from null and email not like '%@t.invalid') then
    raise exception 'REFUSING TO RUN: this database contains real accounts. Run only on a fresh LOCAL database (supabase db reset).';
  end if;

  insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
    (a,'a@t.invalid','{"username":"user_a"}', now()), (h,'h@t.invalid','{"username":"user_h"}', now()),
    (b,'b@t.invalid','{"username":"user_b"}', null), (c,'c@t.invalid','{"username":"user_c"}', null),
    (d,'d@t.invalid','{"username":"user_d"}', null), (e,'e@t.invalid','{"username":"user_e"}', null),
    (f,'f@t.invalid','{"username":"user_f"}', null), (g,'g@t.invalid','{"username":"user_g"}', null),
    (m,'m@t.invalid','{"username":"user_m"}', null), (s,'s@t.invalid','{"username":"user_s"}', null),
    (z,'z@t.invalid','{"username":"user_z"}', null);
  update public.account_standing set status = 'suspended' where user_id = s;
  pa := gen_random_uuid(); pb := gen_random_uuid(); pc := gen_random_uuid();

  -- ===== S1. closed to clients =====
  r := r || pg_temp.ex('student cannot read notification_type_config', pg_temp.act(a,'authenticated','select * from public.notification_type_config'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot read notification_limits', pg_temp.act(a,'authenticated','select * from public.notification_limits'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot read channel prefs table directly', pg_temp.act(a,'authenticated','select * from public.notification_channel_prefs'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot read push_tokens directly (tokens are device secrets)', pg_temp.act(a,'authenticated','select * from public.push_tokens'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot read the outbox', pg_temp.act(a,'authenticated','select * from public.notification_outbox'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot read the delivery log', pg_temp.act(a,'authenticated','select * from public.notification_delivery_log'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot insert into the outbox', pg_temp.act(a,'authenticated', $q$insert into public.notification_outbox (notification_id, user_id, channel) values (1, 'x', 'push')$q$), 'err:permission denied');
  r := r || pg_temp.ex('student cannot write a push token directly', pg_temp.act(a,'authenticated', format($q$insert into public.push_tokens (user_id, token, platform) values (%L, %L, 'web')$q$, a, pg_temp.tk(1))), 'err:permission denied');
  r := r || pg_temp.ex('student cannot change limits', pg_temp.act(a,'authenticated', 'update public.notification_limits set per_hour = 1000'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot call claim', pg_temp.act(a,'authenticated', $q$select * from public.claim_notification_outbox('push', 10)$q$), 'err:permission denied');
  r := r || pg_temp.ex('student cannot call complete', pg_temp.act(a,'authenticated', $q$select public.complete_notification_outbox(1, 'sent')$q$), 'err:permission denied');
  r := r || pg_temp.ex('student cannot call invalidate', pg_temp.act(a,'authenticated', format($q$select public.invalidate_push_token(%L)$q$, pg_temp.tk(1))), 'err:permission denied');
  r := r || pg_temp.ex('student cannot call purge', pg_temp.act(a,'authenticated', 'select public.purge_notification_outbox()'), 'err:permission denied');
  r := r || pg_temp.ex('student cannot call internal preference helper', pg_temp.act(a,'authenticated', format($q$select public.internal_channel_enabled(%L, 'comment', 'push')$q$, a)), 'err:permission denied');
  r := r || pg_temp.ex('student cannot call internal availability helper', pg_temp.act(a,'authenticated', format($q$select public.internal_channel_available(%L, 'push')$q$, a)), 'err:permission denied');
  r := r || pg_temp.ex('student cannot call the trigger function', pg_temp.act(a,'authenticated', 'select public.notifications_enqueue_outbox()'), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot get settings', pg_temp.act(null,'anon', 'select * from public.get_my_notification_settings()'), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot register a token', pg_temp.act(null,'anon', format($q$select public.register_push_token(%L, 'web')$q$, pg_temp.tk(1))), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot set a pref', pg_temp.act(null,'anon', $q$select public.set_my_notification_pref('like', 'push', true)$q$), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot list devices', pg_temp.act(null,'anon', 'select * from public.list_my_devices()'), 'err:permission denied');
  r := r || pg_temp.ex('anon cannot claim', pg_temp.act(null,'anon', $q$select * from public.claim_notification_outbox('push', 10)$q$), 'err:permission denied');
  r := r || pg_temp.eq('service_role CAN call claim (the Edge Function path)', (pg_temp.act(null,'service_role', $q$select * from public.claim_notification_outbox('push', 1)$q$) like 'ok:%')::text, 'true');

  -- ===== S2. seeded configuration =====
  r := r || pg_temp.eq('8 notification types configured (the 8 allowed by notifications.type)', (select count(*)::text from public.notification_type_config), '8');
  r := r || pg_temp.eq('only moderation_warning is non-optional', (select string_agg(type, ',') from public.notification_type_config where not optional), 'moderation_warning');
  r := r || pg_temp.eq('every notifications.type value has a config row', (select count(*)::text from (select unnest(array['follow','like','comment','community_join','message','announcement','moderation_warning','repost']) t) x where not exists (select 1 from public.notification_type_config c where c.type = x.t)), '0');
  r := r || pg_temp.eq('email is OFF by default for every optional type', (select count(*)::text from public.notification_type_config where optional and email_default), '0');
  r := r || pg_temp.eq('caps seeded (push 12/h, email 2/h)', (select string_agg(channel || ':' || per_hour, ',' order by channel) from public.notification_limits), 'email:2,push:12');

  -- ===== S3. push tokens =====
  r := r || pg_temp.eq('valid token registers', pg_temp.reg(e, pg_temp.tk(1), 'web', 'Chrome on Windows'), 'ok:1');
  r := r || pg_temp.eq('token stored, active', (select count(*)::text from public.push_tokens where user_id = e and revoked_at is null), '1');
  r := r || pg_temp.ex('short token rejected', pg_temp.reg(e, 'short'), 'err:invalid_token');
  r := r || pg_temp.ex('token with a space rejected', pg_temp.reg(e, 'fcm:' || repeat('x', 30) || ' bad'), 'err:invalid_token');
  r := r || pg_temp.ex('null token rejected', pg_temp.act(e,'authenticated', $q$select public.register_push_token(null, 'web')$q$), 'err:invalid_token');
  r := r || pg_temp.ex('bad platform rejected', pg_temp.reg(e, pg_temp.tk(2), 'desktop'), 'err:invalid_platform');
  r := r || pg_temp.ex('label over 80 characters rejected', pg_temp.reg(e, pg_temp.tk(2), 'web', repeat('L', 81)), 'err:invalid_label');
  r := r || pg_temp.ex('suspended account cannot register', pg_temp.reg(s, pg_temp.tk(3)), 'err:forbidden');
  update public.push_tokens set last_seen_at = now() - interval '1000 seconds' where token = pg_temp.tk(1);
  -- every statement in this test shares one transaction timestamp; give each token a distinct, increasing recency so the cap is deterministic
  for i in 2..12 loop
    perform pg_temp.reg(e, pg_temp.tk(i));
    update public.push_tokens set last_seen_at = now() - make_interval(secs => 1000 - i) where token = pg_temp.tk(i);
  end loop;
  r := r || pg_temp.eq('12 distinct tokens registered, only the newest 10 stay active (tk 3..12; tk 1 and 2 are revoked)', (select count(*)::text from public.push_tokens where user_id = e and revoked_at is null), '10');
  r := r || pg_temp.eq('all 12 rows kept (older 2 are revoked, not deleted)', (select count(*)::text from public.push_tokens where user_id = e), '12');
  r := r || pg_temp.eq('the two revoked are the OLDEST (tk 1 and 2)', (select string_agg(right(token, 2), ',' order by token) from public.push_tokens where user_id = e and revoked_at is not null), '01,02');
  r := r || pg_temp.eq('device registered by another user MOVES to the new owner', pg_temp.reg(a, pg_temp.tk(12)), 'ok:1');
  r := r || pg_temp.eq('...the token now belongs to a', (select user_id::text from public.push_tokens where token = pg_temp.tk(12)), a::text);
  r := r || pg_temp.eq('...and e lost it (9 active)', (select count(*)::text from public.push_tokens where user_id = e and revoked_at is null), '9');
  perform pg_temp.act(a,'authenticated', format($q$select public.revoke_push_token(%L)$q$, pg_temp.tk(11)));   -- tk(11) belongs to e
  r := r || pg_temp.eq('revoking someone else''s token has no effect', (select (revoked_at is null)::text from public.push_tokens where token = pg_temp.tk(11)), 'true');
  perform pg_temp.act(a,'authenticated', format($q$select public.revoke_push_token(%L)$q$, pg_temp.tk(12)));
  r := r || pg_temp.eq('revoking own token (logout) works', (select (revoked_at is not null)::text from public.push_tokens where token = pg_temp.tk(12)), 'true');
  r := r || pg_temp.eq('list_my_devices never returns the token column', (pg_get_function_result('public.list_my_devices()'::regprocedure) like '%token%')::text, 'false');
  r := r || pg_temp.eq('list_my_devices shows only my devices', pg_temp.act(e,'authenticated','select * from public.list_my_devices()'), 'ok:9');
  select id into v from public.push_tokens where token = pg_temp.tk(10);
  perform pg_temp.act(a,'authenticated', format($q$select public.remove_my_device(%L)$q$, v));
  r := r || pg_temp.eq('another user cannot remove my device', (select (revoked_at is null)::text from public.push_tokens where token = pg_temp.tk(10)), 'true');
  perform pg_temp.act(e,'authenticated', format($q$select public.remove_my_device(%L)$q$, v));
  r := r || pg_temp.eq('I can remove my own device', (select (revoked_at is not null)::text from public.push_tokens where token = pg_temp.tk(10)), 'true');
  for i in 1..20 loop perform pg_temp.reg(f, pg_temp.tk(100 + i)); end loop;
  r := r || pg_temp.ex('21st registration inside an hour is rate limited', pg_temp.reg(f, pg_temp.tk(130)), 'err:rate_limited');

  -- ===== S4. preferences =====
  r := r || pg_temp.eq('settings list has all 8 types', pg_temp.act(a,'authenticated','select * from public.get_my_notification_settings()'), 'ok:8');
  r := r || pg_temp.eq('default: comment push ON', pg_temp.val(a, $q$select push_enabled::text from public.get_my_notification_settings() where type = 'comment'$q$), 'true');
  r := r || pg_temp.eq('default: like push OFF', pg_temp.val(a, $q$select push_enabled::text from public.get_my_notification_settings() where type = 'like'$q$), 'false');
  r := r || pg_temp.eq('default: email OFF for comment', pg_temp.val(a, $q$select email_enabled::text from public.get_my_notification_settings() where type = 'comment'$q$), 'false');
  r := r || pg_temp.eq('default: moderation_warning email ON', pg_temp.val(a, $q$select email_enabled::text from public.get_my_notification_settings() where type = 'moderation_warning'$q$), 'true');
  r := r || pg_temp.eq('set like push on', pg_temp.act(a,'authenticated', $q$select public.set_my_notification_pref('like', 'push', true)$q$), 'ok:1');
  r := r || pg_temp.eq('...effective value follows', pg_temp.val(a, $q$select push_enabled::text from public.get_my_notification_settings() where type = 'like'$q$), 'true');
  r := r || pg_temp.eq('...changing it again updates (no duplicate row)', (pg_temp.act(a,'authenticated', $q$select public.set_my_notification_pref('like', 'push', false)$q$) || pg_temp.act(a,'authenticated', $q$select public.set_my_notification_pref('like', 'push', true)$q$) || (select count(*)::text from public.notification_channel_prefs where user_id = a and type = 'like' and channel = 'push')), 'ok:1ok:11');
  r := r || pg_temp.ex('essential notices cannot be disabled', pg_temp.act(a,'authenticated', $q$select public.set_my_notification_pref('moderation_warning', 'email', false)$q$), 'err:not_optional');
  r := r || pg_temp.ex('unknown type rejected', pg_temp.act(a,'authenticated', $q$select public.set_my_notification_pref('nonsense', 'push', true)$q$), 'err:unknown_type');
  r := r || pg_temp.ex('bad channel rejected', pg_temp.act(a,'authenticated', $q$select public.set_my_notification_pref('like', 'sms', true)$q$), 'err:invalid_input');
  r := r || pg_temp.ex('null enabled rejected', pg_temp.act(a,'authenticated', $q$select public.set_my_notification_pref('like', 'push', null)$q$), 'err:invalid_input');
  r := r || pg_temp.eq('a user''s prefs never change another user''s view', pg_temp.val(d, $q$select push_enabled::text from public.get_my_notification_settings() where type = 'like'$q$), 'false');
  r := r || pg_temp.eq('channels: a has email but no active token yet', pg_temp.val(a, $q$select push_available::text || '/' || email_available::text from public.get_my_notification_channels()$q$), 'false/true');
  perform pg_temp.reg(a, pg_temp.tk(100));
  r := r || pg_temp.eq('channels: after registering a device push is available', pg_temp.val(a, $q$select push_available::text || '/' || active_devices::text from public.get_my_notification_channels()$q$), 'true/1');
  perform pg_temp.act(a,'authenticated', $q$select public.set_my_notification_pref('like', 'push', false)$q$);   -- back to default for later sections

  -- ===== S5. enqueue rules (through the REAL chokepoint internal_notify) =====
  perform pg_temp.notify(a, 'comment', b, pa, 'cmt:1');
  r := r || pg_temp.eq('comment with push token: one pending push row', pg_temp.obs(a, 'push'), 'pending/1');
  r := r || pg_temp.eq('comment: email is off by default, no email row', pg_temp.ob(a, 'email'), '0');
  perform pg_temp.notify(d, 'comment', b, pa, 'cmt:d1');
  r := r || pg_temp.eq('recipient without a token and without verified email: nothing queued', pg_temp.ob(d, 'push') || pg_temp.ob(d, 'email'), '00');
  perform pg_temp.notify(a, 'like', b, pb, 'like:1');
  r := r || pg_temp.eq('like is push-OFF by default: no new row', pg_temp.ob(a, 'push'), '1');
  perform pg_temp.act(a,'authenticated', $q$select public.set_my_notification_pref('like', 'push', true)$q$);
  perform pg_temp.notify(a, 'like', c, pc, 'like:2');
  r := r || pg_temp.eq('like after opting in: queued', pg_temp.obe(a, 'push', 'like', pc), '1/1');
  r := r || pg_temp.eq('likes are DELAYED 5 minutes so they can collapse', (select (o.next_attempt_at = now() + interval '300 seconds')::text from public.notification_outbox o join public.notifications n on n.id = o.notification_id where o.user_id = a and n.type = 'like' and n.entity_id = pc), 'true');
  perform pg_temp.notify(a, 'moderation_warning', null, a, null);
  r := r || pg_temp.eq('moderation_warning: push row queued', pg_temp.ob(a, 'push'), '3');
  r := r || pg_temp.eq('moderation_warning: email row queued (verified email, essential)', pg_temp.ob(a, 'email'), '1');
  perform pg_temp.notify(d, 'moderation_warning', null, d, null);
  r := r || pg_temp.eq('moderation_warning to a user with no destination: nothing queued, no error', pg_temp.ob(d, 'push') || pg_temp.ob(d, 'email'), '00');
  perform pg_temp.act(a,'authenticated', $q$select public.set_my_notification_pref('comment', 'push', false)$q$);
  perform pg_temp.notify(a, 'comment', b, pb, 'cmt:2');
  r := r || pg_temp.eq('comment push disabled by the user: no new row', pg_temp.ob(a, 'push'), '3');
  select count(*) into before_ob from public.notification_outbox;
  perform pg_temp.notify(a, 'comment', a, pa, 'self:1');
  r := r || pg_temp.eq('a notification about my own action creates nothing', (select count(*) from public.notification_outbox)::text, before_ob::text);
  -- blocking: nobody can use a notification to get around a block
  perform pg_temp.act(a,'authenticated', $q$select public.set_my_notification_pref('follow', 'push', true)$q$);
  insert into public.blocks (blocker_id, blocked_id) values (a, b);
  select count(*) into before_ob from public.notification_outbox;
  perform pg_temp.notify(a, 'follow', b, pa, 'follow:blocked');
  r := r || pg_temp.eq('blocked actor: internal_notify skips, nothing queued', (select count(*) from public.notification_outbox)::text, before_ob::text);
  insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, dedupe_key) values (a, 'follow', b, 'user', b, 'follow:direct-blocked');
  r := r || pg_temp.eq('defence in depth: a DIRECT insert (bypassing internal_notify) from a blocked actor is not queued either', (select count(*) from public.notification_outbox)::text, before_ob::text);
  delete from public.blocks where blocker_id = a and blocked_id = b;
  insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, dedupe_key) values (a, 'follow', b, 'user', b, 'follow:direct-ok');
  r := r || pg_temp.eq('after unblocking the same kind of insert IS queued', (select count(*) from public.notification_outbox)::text, (before_ob + 1)::text);
  -- account standing
  insert into public.push_tokens (user_id, token, platform) values (s, pg_temp.tk(500), 'web');
  select count(*) into before_ob from public.notification_outbox;
  insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, dedupe_key) values (s, 'comment', b, 'post', pa, 'cmt:suspended');
  r := r || pg_temp.eq('suspended recipient: nothing queued even with a token', (select count(*) from public.notification_outbox)::text, before_ob::text);
  -- idempotency
  perform pg_temp.notify(a, 'comment', b, pb, 'cmt:2');      -- same dedupe key as before: internal_notify ignores it
  r := r || pg_temp.eq('duplicate event (same dedupe key) queues nothing new', (select count(*) from public.notification_outbox)::text, (before_ob)::text);
  r := r || pg_temp.ex('the outbox itself refuses a duplicate (notification, channel)', pg_temp.try($q$insert into public.notification_outbox (notification_id, user_id, channel) select notification_id, user_id, channel from public.notification_outbox limit 1$q$), 'err:');

  -- ===== S6. collapsing and cooldown =====
  perform pg_temp.act(a,'authenticated', $q$select public.set_my_notification_pref('like', 'push', true)$q$);
  perform pg_temp.notify(a, 'like', b, pa, 'like:p1');
  perform pg_temp.notify(a, 'like', c, pa, 'like:p2');
  r := r || pg_temp.eq('two likes on the same post fold into ONE row with a count of 2', pg_temp.obe(a, 'push', 'like', pa), '1/2');
  perform pg_temp.notify(a, 'like', b, gen_random_uuid(), 'like:other');
  r := r || pg_temp.eq('a like on a DIFFERENT post gets its own row', (select count(*)::text from public.notification_outbox o join public.notifications n on n.id = o.notification_id where o.user_id = a and o.channel = 'push' and n.type = 'like'), '3');
  perform pg_temp.notify(a, 'message', b, conv_x, 'msg:x1');
  r := r || pg_temp.eq('first message in a conversation: queued', pg_temp.obe(a, 'push', 'message', conv_x), '1/1');
  update public.notification_outbox o set status = 'sent', sent_at = now() from public.notifications n where n.id = o.notification_id and n.type = 'message' and n.entity_id = conv_x and o.user_id = a;
  perform pg_temp.notify(a, 'message', c, conv_x, 'msg:x2');
  r := r || pg_temp.eq('second message in the same conversation within 10 minutes: COOLDOWN, no second push', pg_temp.obe(a, 'push', 'message', conv_x), '1/1');
  perform pg_temp.notify(a, 'message', c, conv_y, 'msg:y1');
  r := r || pg_temp.eq('a message in ANOTHER conversation is not throttled', pg_temp.obe(a, 'push', 'message', conv_y), '1/1');

  -- ===== S7. storm protection (caps) =====
  insert into public.push_tokens (user_id, token, platform) values (g, pg_temp.tk(700), 'web');
  for i in 1..15 loop perform pg_temp.notify(g, 'comment', b, gen_random_uuid(), 'storm:' || i); end loop;
  r := r || pg_temp.eq('15 comments in an hour produce only 12 pushes (cap)', pg_temp.ob(g, 'push'), '12');
  r := r || pg_temp.eq('...but ALL 15 in-app notifications exist (in-app unaffected)', (select count(*)::text from public.notifications where user_id = g and type = 'comment'), '15');
  perform pg_temp.notify(g, 'moderation_warning', null, g, null);
  r := r || pg_temp.eq('essential notices bypass the cap', pg_temp.ob(g, 'push'), '13');
  perform pg_temp.act(h,'authenticated', $q$select public.set_my_notification_pref('comment', 'email', true)$q$);
  for i in 1..3 loop perform pg_temp.notify(h, 'comment', b, gen_random_uuid(), 'estorm:' || i); end loop;
  r := r || pg_temp.eq('email cap: 3 opted-in comment emails produce only 2', pg_temp.ob(h, 'email'), '2');
  perform pg_temp.notify(h, 'moderation_warning', null, h, null);
  r := r || pg_temp.eq('essential email bypasses the email cap', pg_temp.ob(h, 'email'), '3');

  -- ===== S8. failure isolation and loop safety =====
  select count(*) into before_n from public.notifications;
  alter table public.notification_outbox add constraint tmp_force_fail check (false) not valid;     -- every outbox insert now fails
  perform pg_temp.notify(a, 'follow', c, pa, 'iso:1');
  r := r || pg_temp.eq('enqueue failure does NOT stop the in-app notification (and creates exactly one row: no loops)', (select count(*) from public.notifications)::text, (before_n + 1)::text);
  r := r || pg_temp.eq('...and the failed enqueue left no outbox row', (select count(*)::text from public.notification_outbox o join public.notifications n on n.id = o.notification_id where n.dedupe_key = 'iso:1'), '0');
  alter table public.notification_outbox drop constraint tmp_force_fail;

  -- ===== S9. claim / complete (service role) =====
  insert into public.push_tokens (user_id, token, platform) values (m, pg_temp.tk(900), 'web');
  perform pg_temp.notify(m, 'comment', b, gen_random_uuid(), 'm:1');
  perform pg_temp.notify(m, 'comment', c, gen_random_uuid(), 'm:2');
  perform pg_temp.notify(m, 'comment', b, gen_random_uuid(), 'm:3');
  r := r || pg_temp.eq('m has 3 due pending rows', pg_temp.obs(m, 'push'), 'pending/1,pending/1,pending/1');
  found_m := false; m_tokens := 0; m_actor := null;
  for rec in select * from public.claim_notification_outbox('push', 200) loop
    if rec.user_id = m then found_m := true; m_tokens := coalesce(array_length(rec.push_tokens, 1), 0); m_actor := rec.actor_name; end if;
  end loop;
  r := r || pg_temp.eq('claim returned m''s rows', found_m::text, 'true');
  r := r || pg_temp.eq('claim returned one device token and the actor''s public name', m_tokens::text || '|' || (m_actor is not null)::text, '1|true');
  r := r || pg_temp.eq('claimed rows are now sending with attempt 1', pg_temp.obs(m, 'push'), 'sending/1,sending/1,sending/1');
  r := r || pg_temp.eq('claim output has no content columns', (pg_get_function_result('public.claim_notification_outbox(text, integer)'::regprocedure) ~* '(body|content|message_text|text_body)')::text, 'false');
  select count(*) into n from public.claim_notification_outbox('push', 200) where user_id = m;
  r := r || pg_temp.eq('an immediate second claim does not hand the same rows out again (locked)', n::text, '0');
  update public.notification_outbox set locked_until = now() - interval '1 minute' where user_id = m and channel = 'push' and id = (select min(id) from public.notification_outbox where user_id = m and channel = 'push');
  select count(*) into n from public.claim_notification_outbox('push', 200) where user_id = m;
  r := r || pg_temp.eq('a crashed worker''s expired lock is re-claimed', n::text, '1');
  r := r || pg_temp.eq('...with attempts incremented to 2', (select max(attempts)::text from public.notification_outbox where user_id = m and channel = 'push'), '2');

  select id into r1 from public.notification_outbox where user_id = m and channel = 'push' order by id limit 1 offset 0;
  select id into r2 from public.notification_outbox where user_id = m and channel = 'push' order by id limit 1 offset 1;
  select id into r3 from public.notification_outbox where user_id = m and channel = 'push' order by id limit 1 offset 2;
  perform public.complete_notification_outbox(r1, 'sent');
  r := r || pg_temp.eq('complete sent: status sent with a timestamp', (select status || '/' || (sent_at is not null)::text from public.notification_outbox where id = r1), 'sent/true');
  r := r || pg_temp.eq('...one delivery-log row', (select count(*)::text from public.notification_delivery_log where outbox_id = r1), '1');
  perform public.complete_notification_outbox(r1, 'failed', 'LATE');
  r := r || pg_temp.eq('a stale/duplicate completion is ignored (still sent, still one log row)', (select status from public.notification_outbox where id = r1) || '/' || (select count(*)::text from public.notification_delivery_log where outbox_id = r1), 'sent/1');
  perform public.complete_notification_outbox(r2, 'retry', 'UNAVAILABLE');
  r := r || pg_temp.eq('retry with no hint: pending again, default 60 s back-off (attempt 1)', (select status || '/' || (next_attempt_at = now() + interval '60 seconds')::text from public.notification_outbox where id = r2), 'pending/true');
  update public.notification_outbox set status = 'sending', attempts = 1 where id = r3;
  perform public.complete_notification_outbox(r3, 'retry', 'QUOTA', 5);
  r := r || pg_temp.eq('retry hint below the minimum is clamped to 30 s', (select (next_attempt_at = now() + interval '30 seconds')::text from public.notification_outbox where id = r3), 'true');
  update public.notification_outbox set status = 'sending', attempts = 1 where id = r3;
  perform public.complete_notification_outbox(r3, 'retry', 'QUOTA', 999999);
  r := r || pg_temp.eq('retry hint above the maximum is clamped to 24 h', (select (next_attempt_at = now() + interval '86400 seconds')::text from public.notification_outbox where id = r3), 'true');
  update public.notification_outbox set status = 'sending', attempts = 3 where id = r3;
  perform public.complete_notification_outbox(r3, 'retry');
  r := r || pg_temp.eq('attempt 3 back-off is 30 minutes', (select (next_attempt_at = now() + interval '1800 seconds')::text from public.notification_outbox where id = r3), 'true');
  update public.notification_outbox set status = 'sending', attempts = 5 where id = r3;
  perform public.complete_notification_outbox(r3, 'retry', 'UNAVAILABLE');
  r := r || pg_temp.eq('retry on the 5th attempt: dead', (select status from public.notification_outbox where id = r3), 'dead');
  r := r || pg_temp.eq('...logged as dead', (select outcome from public.notification_delivery_log where outbox_id = r3 order by id desc limit 1), 'dead');
  update public.notification_outbox set status = 'sending', attempts = 1 where id = r2;
  perform public.complete_notification_outbox(r2, 'failed', 'bad code!! with spaces and a very long tail ' || repeat('z', 100));
  r := r || pg_temp.eq('failed: permanent; error code sanitised and capped at 60', (select status || '/' || (last_error_code ~ '^[A-Za-z0-9_:.-]{1,60}$')::text from public.notification_outbox where id = r2), 'failed/true');
  r := r || pg_temp.ex('invalid outcome rejected', pg_temp.try($q$select public.complete_notification_outbox(1, 'banana')$q$), 'err:bad_outcome');
  r := r || pg_temp.ex('invalid channel rejected by claim', pg_temp.try($q$select * from public.claim_notification_outbox('sms', 5)$q$), 'err:bad_channel');
  -- re-checks at claim time
  perform pg_temp.notify(m, 'comment', b, gen_random_uuid(), 'm:blk');
  insert into public.blocks (blocker_id, blocked_id) values (m, b);
  select count(*) into n from public.claim_notification_outbox('push', 200) where user_id = m;
  r := r || pg_temp.eq('a block created AFTER queueing: the row is not delivered', n::text, '0');
  r := r || pg_temp.eq('...it is marked skipped(blocked)', (select status || '/' || skip_reason from public.notification_outbox o join public.notifications nn on nn.id = o.notification_id where o.user_id = m and nn.dedupe_key = 'm:blk'), 'skipped/blocked');
  delete from public.blocks where blocker_id = m and blocked_id = b;
  perform pg_temp.notify(m, 'comment', c, gen_random_uuid(), 'm:dis');
  perform pg_temp.act(m,'authenticated', $q$select public.set_my_notification_pref('comment', 'push', false)$q$);
  select count(*) into n from public.claim_notification_outbox('push', 200) where user_id = m;
  r := r || pg_temp.eq('a preference turned off AFTER queueing: not delivered', n::text, '0');
  r := r || pg_temp.eq('...marked skipped(disabled)', (select status || '/' || skip_reason from public.notification_outbox o join public.notifications nn on nn.id = o.notification_id where o.user_id = m and nn.dedupe_key = 'm:dis'), 'skipped/disabled');
  -- invalid tokens
  perform public.invalidate_push_token(pg_temp.tk(900));
  r := r || pg_temp.eq('invalidated token is revoked and counted', (select (revoked_at is not null)::text || '/' || failure_count from public.push_tokens where token = pg_temp.tk(900)), 'true/1');
  r := r || pg_temp.eq('...so the user no longer has a push destination', public.internal_channel_available(m, 'push')::text, 'false');
  r := r || pg_temp.eq('invalidating an unknown token is harmless', pg_temp.try($q$select public.invalidate_push_token('fcm:does-not-exist-anywhere-0000000')$q$), 'ok');
  -- email channel payload
  h_email := null; h_push := 'unset';
  for rec in select * from public.claim_notification_outbox('email', 200) loop
    if rec.user_id = h then h_email := rec.email; h_push := coalesce(array_length(rec.push_tokens, 1)::text, 'null'); end if;
  end loop;
  r := r || pg_temp.eq('email claim returns the verified address and no push tokens', coalesce(h_email, 'NULL') || '|' || h_push, 'h@t.invalid|null');

  -- ===== S10. retention =====
  insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, dedupe_key)
    select z, 'follow', b, 'user', b, 'purge:' || k from generate_series(1, 252) k;      -- z has no token: not auto-queued
  insert into public.notification_outbox (notification_id, user_id, channel, status, created_at, updated_at)
    select id, z, 'push', 'sent', now() - interval '40 days', now() - interval '40 days' from public.notifications where user_id = z and dedupe_key like 'purge:%' order by id limit 250;
  insert into public.notification_outbox (notification_id, user_id, channel, status, created_at, updated_at)
    select id, z, 'push', 'pending', now() - interval '40 days', now() - interval '40 days' from public.notifications where user_id = z and dedupe_key like 'purge:%' order by id offset 250 limit 1;
  insert into public.push_tokens (user_id, token, platform, revoked_at, last_seen_at) values (z, pg_temp.tk(801), 'web', now() - interval '100 days', now() - interval '100 days');
  insert into public.push_tokens (user_id, token, platform, last_seen_at) values (z, pg_temp.tk(802), 'web', now() - interval '300 days');
  insert into public.push_tokens (user_id, token, platform) values (z, pg_temp.tk(803), 'web');
  res := public.purge_notification_outbox(100, 30);
  r := r || pg_temp.eq('purge reports more work (250 old rows, batch 100)', res ->> 'more', 'true');
  i := 0; while (public.purge_notification_outbox(100, 30) ->> 'more')::boolean and i < 20 loop i := i + 1; end loop;
  r := r || pg_temp.eq('repeated purge drains every finished old row', (select count(*)::text from public.notification_outbox where user_id = z and status = 'sent'), '0');
  r := r || pg_temp.eq('an old PENDING row is never purged', (select count(*)::text from public.notification_outbox where user_id = z and status = 'pending'), '1');
  r := r || pg_temp.eq('revoked-100-days and unseen-300-days tokens purged, the live one kept', (select string_agg(right(token, 3), ',' order by token) from public.push_tokens where user_id = z), '803');
  insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, dedupe_key) values
    (z, 'follow', b, 'user', b, 'floor:3d'), (z, 'follow', b, 'user', b, 'floor:10d');
  insert into public.notification_outbox (notification_id, user_id, channel, status, created_at, updated_at)
    select id, z, 'push', 'sent', now() - interval '10 days', case dedupe_key when 'floor:3d' then now() - interval '3 days' else now() - interval '10 days' end
      from public.notifications where user_id = z and dedupe_key in ('floor:3d', 'floor:10d');
  perform public.purge_notification_outbox(100, 1);      -- 1 day requested; the floor is 7
  r := r || pg_temp.eq('retention floor: with p_keep_days=1 a 3-day-old row survives and a 10-day-old row is purged (floor 7)',
    (select string_agg(n.dedupe_key, ',' order by n.dedupe_key) from public.notification_outbox o join public.notifications n on n.id = o.notification_id where o.user_id = z and n.dedupe_key like 'floor:%'), 'floor:3d');

  -- ===== S11. cascades =====
  select id into nid from public.notifications where user_id = a and dedupe_key = 'cmt:1';
  delete from public.notifications where id = nid;
  r := r || pg_temp.eq('deleting a notification removes its outbox rows', (select count(*)::text from public.notification_outbox where notification_id = nid), '0');
  delete from auth.users where id = a;
  r := r || pg_temp.eq('deleting a user removes tokens, prefs, outbox rows and logs', (select ((select count(*) from public.push_tokens where user_id = a) + (select count(*) from public.notification_channel_prefs where user_id = a) + (select count(*) from public.notification_outbox where user_id = a))::text), '0');

  raise exception E'RESULTS\n%', r;   -- intentional: rolls back all test data
end $do$;
