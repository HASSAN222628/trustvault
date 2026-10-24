-- Run: supabase test db   (pgTAP). Everything is rolled back at the end.
begin;
select no_plan();

-- fixtures (as postgres): A,B owners, C reader, D editor, E admin, X outsider
insert into auth.users (id, email, instance_id, aud, role) values
 ('a0000000-0000-4000-8000-00000000000a','a@t.test','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('b0000000-0000-4000-8000-00000000000b','b@t.test','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('c0000000-0000-4000-8000-00000000000c','c@t.test','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('d0000000-0000-4000-8000-00000000000d','d@t.test','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('e0000000-0000-4000-8000-00000000000e','e@t.test','00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('f0000000-0000-4000-8000-00000000000f','x@t.test','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
update public.profiles set role = 'admin' where email = 'e@t.test';

select is((select role from public.profiles where email='a@t.test'), 'owner', 'new accounts default to owner, never admin');

select public.rpc_document_create('a0000000-0000-4000-8000-00000000000a','11111111-1111-4111-8111-111111111111','Doc A','','a.pdf','k/a','contract','application/pdf',10,repeat('a',64),'t1');
select public.rpc_document_create('b0000000-0000-4000-8000-00000000000b','22222222-2222-4222-8222-222222222222','Doc B','','b.pdf','k/b','salary','application/pdf',10,repeat('b',64),'t2');
select public.rpc_document_grant('a0000000-0000-4000-8000-00000000000a','11111111-1111-4111-8111-111111111111','c@t.test','read','t3');
select public.rpc_document_grant('a0000000-0000-4000-8000-00000000000a','11111111-1111-4111-8111-111111111111','d@t.test','edit','t4');

-- ---- authorisation matrix via the trusted RPC (postgres context)
select is((public.rpc_authorize_document('c0000000-0000-4000-8000-00000000000c','11111111-1111-4111-8111-111111111111','read','t5')->>'ok')::boolean, true, 'read grant may preview');
select is(public.rpc_authorize_document('c0000000-0000-4000-8000-00000000000c','11111111-1111-4111-8111-111111111111','download','t5b')->>'code', 'forbidden', 'read grant cannot download');
select is((public.rpc_authorize_document('d0000000-0000-4000-8000-00000000000d','11111111-1111-4111-8111-111111111111','download','t5c')->>'ok')::boolean, true, 'edit grant may download');
select is(public.rpc_authorize_document('c0000000-0000-4000-8000-00000000000c','11111111-1111-4111-8111-111111111111','edit','t6')->>'code', 'forbidden', 'read grant may NOT edit');
select is(public.rpc_authorize_document('d0000000-0000-4000-8000-00000000000d','11111111-1111-4111-8111-111111111111','edit','t7')->>'ok', 'true', 'edit grant may edit');
select is(public.rpc_authorize_document('d0000000-0000-4000-8000-00000000000d','11111111-1111-4111-8111-111111111111','delete','t8')->>'code', 'forbidden', 'editor may NOT delete');
select is(public.rpc_authorize_document('c0000000-0000-4000-8000-00000000000c','11111111-1111-4111-8111-111111111111','grant','t9')->>'code', 'forbidden', 'viewer may NOT grant');
select is(public.rpc_authorize_document('f0000000-0000-4000-8000-00000000000f','11111111-1111-4111-8111-111111111111','download','t10')->>'code', 'not_found', 'outsider gets not_found (no existence leak)');
select is(public.rpc_authorize_document('e0000000-0000-4000-8000-00000000000e','11111111-1111-4111-8111-111111111111','download','t11')->>'code', 'not_found', 'ADMIN cannot download others documents');
select is(public.rpc_authorize_document('b0000000-0000-4000-8000-00000000000b','11111111-1111-4111-8111-111111111111','download','t12')->>'code', 'not_found', 'other owner cannot download');
select is(public.rpc_document_revoke('c0000000-0000-4000-8000-00000000000c','11111111-1111-4111-8111-111111111111','d0000000-0000-4000-8000-00000000000d','t13')->>'code', 'forbidden', 'viewer cannot revoke');
select public.rpc_document_revoke('a0000000-0000-4000-8000-00000000000a','11111111-1111-4111-8111-111111111111','c0000000-0000-4000-8000-00000000000c','t14');
select is(public.rpc_authorize_document('c0000000-0000-4000-8000-00000000000c','11111111-1111-4111-8111-111111111111','download','t15')->>'code', 'not_found', 'revoked user is denied on the very next request');
select is((select count(*)::int from public.document_permissions where document_id='11111111-1111-4111-8111-111111111111' and user_id='c0000000-0000-4000-8000-00000000000c'), 1, 'revocation keeps history row');
select is((select count(*)::int from public.audit_events where outcome='denied' and request_id in ('t5b','t6','t8','t9','t10','t11','t12','t15')), 8, 'every denial was audited');
select is((select ok from public.rpc_audit_verify()), true, 'hash chain verifies');

-- ---- RLS as authenticated users
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.documents), 0, 'C (revoked) sees no documents');
select is((select count(*)::int from public.search_documents('Doc')), 0, 'search leaks nothing to C');
select is((select count(*)::int from public.rpc_search_share_recipients('a@')), 1, 'signed-in users can search registered share recipients');
select is((select count(*)::int from public.rpc_search_share_recipients('c@')), 0, 'recipient search excludes the current user');
select is((select count(*)::int from public.rpc_search_share_recipients('a')), 0, 'recipient search requires at least two characters');
update public.profiles set is_active = false where email = 'd@t.test';
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.documents), 0, 'banned user cannot read shared document metadata');
select is((select count(*)::int from public.rpc_search_share_recipients('a@')), 0, 'banned user cannot search sharing recipients');
reset role;
update public.profiles set is_active = true where email = 'd@t.test';
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
select throws_ok($$insert into public.documents (owner_id,title,original_filename,storage_key,mime_type,size_bytes,sha256) values ('c0000000-0000-4000-8000-00000000000c','x','x','x','application/pdf',1,repeat('a',64))$$, '42501', null, 'clients cannot insert documents');
select throws_ok($$update public.profiles set role='admin' where id='c0000000-0000-4000-8000-00000000000c'$$, '42501', null, 'user cannot self-promote');
select lives_ok($$update public.profiles set display_name='Chen' where id='c0000000-0000-4000-8000-00000000000c'$$, 'user may rename self');
select throws_ok($$insert into public.audit_events (actor_id,action,outcome,request_id,prev_hash,event_hash) values (null,'x.y','success','r','0','0')$$, '42501', null, 'clients cannot forge audit rows');
select throws_ok($$delete from public.audit_events$$, '42501', null, 'clients cannot delete audit rows');
select throws_ok($$select public.rpc_audit_log(null,null,'a.b','success','r','{}')$$, '42501', null, 'clients cannot call trusted audit RPC');
select throws_ok($$select public.rpc_authorize_document('c0000000-0000-4000-8000-00000000000c','11111111-1111-4111-8111-111111111111','download','r')$$, '42501', null, 'clients cannot call trusted authorize RPC');
reset role;

select set_config('request.jwt.claims', '{"sub":"d0000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.documents), 1, 'editor D sees exactly the shared doc');
select is((select count(*)::int from public.document_permissions), 1, 'D sees only own active grant');
reset role;

select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.documents), 0, 'ADMIN sees zero documents via RLS');
select ok((select count(*)::int from public.audit_events) > 0, 'admin can read audit events');
select is((select count(*)::int from public.document_permissions), 0, 'admin sees no grants');
reset role;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.documents), 1, 'owner A sees only own doc');
select ok((select count(*)::int from public.audit_events where document_id='22222222-2222-4222-8222-222222222222') = 0, 'A cannot see B document audit');
reset role;

select is((select has_table_privilege('anon','public.documents','select')), false, 'anon has no table access');
select is((select has_function_privilege('authenticated','public.rpc_document_delete(uuid,uuid,text)','execute')), false, 'authenticated cannot execute rpc_document_delete');
select is((select has_function_privilege('authenticated','public.rpc_search_share_recipients(text)','execute')), true, 'authenticated users can search sharing recipients');
select is((select has_function_privilege('anon','public.rpc_search_share_recipients(text)','execute')), false, 'anonymous users cannot search sharing recipients');

-- ---- storage + audit immutability
select ok(exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and permissive='RESTRICTIVE'), 'restrictive storage policy present');
select is((select public from storage.buckets where id='documents'), false, 'documents bucket is private');
select throws_ok($$update public.audit_events set outcome='success'$$, '42501', null, 'audit update blocked even for postgres');
alter table public.audit_events disable trigger audit_no_update_delete;
update public.audit_events set details = '{"tampered":true}' where seq = (select min(seq) from public.audit_events);
alter table public.audit_events enable trigger audit_no_update_delete;
select is((select ok from public.rpc_audit_verify()), false, 'tampering is DETECTED by the hash chain');

select * from finish();
rollback;
