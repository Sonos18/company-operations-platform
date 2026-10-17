begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(20);

-- Mark all notifications read (20261017100000, spec section 6). Rollback-only fixture with
-- prefix c137. One tenant with company X (020) and company Y (021), project 101 in X.
-- Users: A (901) material.read + cost.notification.read, B (902) material.read only,
-- C (903) cost.notification.read only, D (904) member without permissions,
-- E (905) tenant member who does not belong to company X.
-- Times: t0 08:00, t1 09:00, t2 10:00 (the cutoff), t3 11:00 on 2026-10-01 UTC.
--   Material notifications in X: A has m1 (t1), m2 (t2), m3 (t3, after the cutoff) and mr (t0,
--   already read at 09:00); B and C have one unread each (t1); A also has one unread in Y.
--   Cost notifications in X: A has c1 (t1, available), c2 (t1, undelivered), c3 (t3, available);
--   B and C have one available (t1) each.
-- Costs need a decision -> submitted version -> request -> manager assignment, so the rows are
-- inserted directly: one request with three submitted versions and one decision per version.

insert into auth.users(id,email) values
('c1370000-0000-4000-8000-000000000901','read-all-a@test.invalid'),
('c1370000-0000-4000-8000-000000000902','read-all-b@test.invalid'),
('c1370000-0000-4000-8000-000000000903','read-all-c@test.invalid'),
('c1370000-0000-4000-8000-000000000904','read-all-d@test.invalid'),
('c1370000-0000-4000-8000-000000000905','read-all-e@test.invalid');
insert into public.tenants(id,code,name) values('c1370000-0000-4000-8000-000000000010','C1READALL','Read all tenant');
insert into public.companies(id,tenant_id,code,name) values
('c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000010','C1READALLX','Read all company X'),
('c1370000-0000-4000-8000-000000000021','c1370000-0000-4000-8000-000000000010','C1READALLY','Read all company Y');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select id,'c1370000-0000-4000-8000-000000000010',array['member'] from auth.users where id::text like 'c1370000-0000-4000-8000-00000000090_';
-- A, B, C and D belong to X; E belongs to neither company.
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select id,'c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020',array['member'],true
from auth.users where id::text in ('c1370000-0000-4000-8000-000000000901','c1370000-0000-4000-8000-000000000902','c1370000-0000-4000-8000-000000000903','c1370000-0000-4000-8000-000000000904');
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system)
select role_row.id,'c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020',role_row.code,role_row.code,'rollback fixture',false
from (values
 ('c1370000-0000-4000-8000-000000000911'::uuid,'read_all_a'),
 ('c1370000-0000-4000-8000-000000000912'::uuid,'read_all_b'),
 ('c1370000-0000-4000-8000-000000000913'::uuid,'read_all_c')
) as role_row(id,code);
insert into public.role_permissions(role_id,permission_code) values
('c1370000-0000-4000-8000-000000000911','material.read'),
('c1370000-0000-4000-8000-000000000911','cost.notification.read'),
('c1370000-0000-4000-8000-000000000912','material.read'),
('c1370000-0000-4000-8000-000000000913','cost.notification.read');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values
('c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000901','c1370000-0000-4000-8000-000000000911','c1370000-0000-4000-8000-000000000901','rollback fixture'),
('c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000902','c1370000-0000-4000-8000-000000000912','c1370000-0000-4000-8000-000000000901','rollback fixture'),
('c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000903','c1370000-0000-4000-8000-000000000913','c1370000-0000-4000-8000-000000000901','rollback fixture');
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000010',true,'c1370000-0000-4000-8000-000000000901');
insert into public.projects(id,tenant_id,company_id,code,name,origin,created_by)
values('c1370000-0000-4000-8000-000000000101','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','READALL-P','Read all project','manual','c1370000-0000-4000-8000-000000000901');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c1370000-0000-4000-8000-000000000201','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','READALL-S','Read all supplier','organization','c1370000-0000-4000-8000-000000000901');

-- Cost category (its triggers read the acting user from these settings).
select set_config('taskovia.c1_finance.actor_id','c1370000-0000-4000-8000-000000000901',true);
select set_config('taskovia.c1_finance.request_id','c1370000-0000-4000-8000-000000000701',true);
insert into public.cost_categories(id,tenant_id,company_id,code,name,posting_strategy,created_by,updated_by)
values('c1370000-0000-4000-8000-000000000211','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','materials','Read all materials','ordinary_detail','c1370000-0000-4000-8000-000000000901','c1370000-0000-4000-8000-000000000901');

-- Cost request, three submitted versions and one decision per version.
insert into public.cost_workflow_manager_assignments(id,tenant_id,company_id,project_id,manager_user_id,assignment_version,assigned_by,reason)
values('c1370000-0000-4000-8000-000000000a01','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000101','c1370000-0000-4000-8000-000000000902',1,'c1370000-0000-4000-8000-000000000901','rollback fixture');
insert into public.cost_workflow_requests(id,tenant_id,company_id,project_id,kind,party_id,category_id,working_input,created_by)
values('c1370000-0000-4000-8000-000000000c01','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000101','installment','c1370000-0000-4000-8000-000000000201','c1370000-0000-4000-8000-000000000211','{}','c1370000-0000-4000-8000-000000000901');
insert into public.cost_workflow_request_versions(id,tenant_id,company_id,project_id,request_id,version,snapshot,amount,currency_code,evidence_file_ids,manager_assignment_id,submitted_by)
values
('c1370000-0000-4000-8000-000000000f01','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000101','c1370000-0000-4000-8000-000000000c01',1,'{}',100,'VND',array['c1370000-0000-4000-8000-000000000501'::uuid],'c1370000-0000-4000-8000-000000000a01','c1370000-0000-4000-8000-000000000901'),
('c1370000-0000-4000-8000-000000000f02','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000101','c1370000-0000-4000-8000-000000000c01',2,'{}',100,'VND',array['c1370000-0000-4000-8000-000000000501'::uuid],'c1370000-0000-4000-8000-000000000a01','c1370000-0000-4000-8000-000000000901'),
('c1370000-0000-4000-8000-000000000f03','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000101','c1370000-0000-4000-8000-000000000c01',3,'{}',100,'VND',array['c1370000-0000-4000-8000-000000000501'::uuid],'c1370000-0000-4000-8000-000000000a01','c1370000-0000-4000-8000-000000000901');
insert into public.cost_workflow_decisions(id,tenant_id,company_id,project_id,submitted_version_id,decision,manager_assignment_id,decided_by)
values
('c1370000-0000-4000-8000-000000000e01','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000101','c1370000-0000-4000-8000-000000000f01','approve','c1370000-0000-4000-8000-000000000a01','c1370000-0000-4000-8000-000000000902'),
('c1370000-0000-4000-8000-000000000e02','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000101','c1370000-0000-4000-8000-000000000f02','approve','c1370000-0000-4000-8000-000000000a01','c1370000-0000-4000-8000-000000000902'),
('c1370000-0000-4000-8000-000000000e03','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000101','c1370000-0000-4000-8000-000000000f03','approve','c1370000-0000-4000-8000-000000000a01','c1370000-0000-4000-8000-000000000902');

-- Notifications ----------------------------------------------------------------------------------
insert into public.app_notifications(id,tenant_id,company_id,recipient_id,event_kind,source_type,source_id,link_path,dedupe_key,created_at,read_at) values
('c1370000-0000-4000-8000-000000000b01','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000901','material.order.created','material_order','c1370000-0000-4000-8000-000000000b11','/materials/m1','m1','2026-10-01 09:00:00+00',null),
('c1370000-0000-4000-8000-000000000b02','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000901','material.order.created','material_order','c1370000-0000-4000-8000-000000000b12','/materials/m2','m2','2026-10-01 10:00:00+00',null),
('c1370000-0000-4000-8000-000000000b03','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000901','material.order.created','material_order','c1370000-0000-4000-8000-000000000b13','/materials/m3','m3','2026-10-01 11:00:00+00',null),
('c1370000-0000-4000-8000-000000000b04','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000901','material.order.created','material_order','c1370000-0000-4000-8000-000000000b14','/materials/mr','mr','2026-10-01 08:00:00+00','2026-10-01 09:00:00+00'),
('c1370000-0000-4000-8000-000000000b05','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000902','material.order.created','material_order','c1370000-0000-4000-8000-000000000b15','/materials/b1','b1','2026-10-01 09:00:00+00',null),
('c1370000-0000-4000-8000-000000000b06','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000903','material.order.created','material_order','c1370000-0000-4000-8000-000000000b16','/materials/c1','c1','2026-10-01 09:00:00+00',null),
('c1370000-0000-4000-8000-000000000b07','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000021','c1370000-0000-4000-8000-000000000901','material.order.created','material_order','c1370000-0000-4000-8000-000000000b17','/materials/y1','y1','2026-10-01 09:00:00+00',null);
insert into public.cost_workflow_notifications(id,tenant_id,company_id,project_id,decision_id,recipient_id,delivery_state,created_at) values
('c1370000-0000-4000-8000-000000000d01','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000101','c1370000-0000-4000-8000-000000000e01','c1370000-0000-4000-8000-000000000901','available','2026-10-01 09:00:00+00'),
('c1370000-0000-4000-8000-000000000d02','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000101','c1370000-0000-4000-8000-000000000e02','c1370000-0000-4000-8000-000000000901','undelivered','2026-10-01 09:00:00+00'),
('c1370000-0000-4000-8000-000000000d03','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000101','c1370000-0000-4000-8000-000000000e03','c1370000-0000-4000-8000-000000000901','available','2026-10-01 11:00:00+00'),
('c1370000-0000-4000-8000-000000000d04','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000101','c1370000-0000-4000-8000-000000000e01','c1370000-0000-4000-8000-000000000902','available','2026-10-01 09:00:00+00'),
('c1370000-0000-4000-8000-000000000d05','c1370000-0000-4000-8000-000000000010','c1370000-0000-4000-8000-000000000020','c1370000-0000-4000-8000-000000000101','c1370000-0000-4000-8000-000000000e01','c1370000-0000-4000-8000-000000000903','available','2026-10-01 09:00:00+00');

-- Privileges -------------------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon','private.c1_mark_notifications_read_all(uuid,timestamptz,timestamptz)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_mark_notifications_read_all(uuid,timestamptz,timestamptz)','EXECUTE')
  and not has_function_privilege('service_role','private.c1_mark_notifications_read_all(uuid,timestamptz,timestamptz)','EXECUTE'),
  'privileges: the private command is not callable by any API role'
);
select ok(
  has_function_privilege('authenticated','public.c1_mark_notifications_read_all(uuid,timestamptz,timestamptz)','EXECUTE'),
  'privileges: signed-in users can call the wrapper'
);
select ok(
  not has_function_privilege('anon','public.c1_mark_notifications_read_all(uuid,timestamptz,timestamptz)','EXECUTE')
  and not has_function_privilege('service_role','public.c1_mark_notifications_read_all(uuid,timestamptz,timestamptz)','EXECUTE'),
  'privileges: anon and service_role cannot call the wrapper'
);

-- A: null cutoffs skip both sources ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1370000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is(
  public.c1_mark_notifications_read_all('c1370000-0000-4000-8000-000000000020',null,null),
  '{"material":0,"cost":0}'::jsonb,
  'null cutoffs: a source that failed to load marks nothing'
);
reset role;
select is(
  (select count(*) from public.app_notifications where recipient_id='c1370000-0000-4000-8000-000000000901' and company_id='c1370000-0000-4000-8000-000000000020' and read_at is null),
  3::bigint,
  'null cutoffs: the three unread material notifications stay unread'
);
select is(
  (select count(*) from public.cost_workflow_notifications where recipient_id='c1370000-0000-4000-8000-000000000901' and delivery_state='available' and read_at is null),
  2::bigint,
  'null cutoffs: the two available cost notifications stay unread'
);

-- A: both cutoffs at t2 ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1370000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is(
  public.c1_mark_notifications_read_all('c1370000-0000-4000-8000-000000000020','2026-10-01 10:00:00+00','2026-10-01 10:00:00+00'),
  '{"material":2,"cost":1}'::jsonb,
  'cutoff: counts the material notifications up to t2 and the available cost notification up to t2'
);
reset role;
select ok(
  (select read_at is null from public.app_notifications where id='c1370000-0000-4000-8000-000000000b03')
  and (select read_at is null from public.cost_workflow_notifications where id='c1370000-0000-4000-8000-000000000d03'),
  'cutoff: notifications created after the cutoff stay unread in both sources'
);
select ok(
  (select count(*) from public.app_notifications where id in ('c1370000-0000-4000-8000-000000000b01','c1370000-0000-4000-8000-000000000b02') and read_at = now()) = 2
  and (select read_at = now() from public.cost_workflow_notifications where id='c1370000-0000-4000-8000-000000000d01'),
  'cutoff: notifications up to the cutoff are marked read now'
);
select is(
  (select read_at from public.app_notifications where id='c1370000-0000-4000-8000-000000000b04'),
  '2026-10-01 09:00:00+00'::timestamptz,
  'already read: the original read_at is kept and the row is not counted'
);
select ok(
  (select read_at is null and delivery_state = 'undelivered' from public.cost_workflow_notifications where id='c1370000-0000-4000-8000-000000000d02'),
  'cost: an undelivered notification is neither read nor made available'
);
select is(
  (select count(*) from public.app_notifications where id in ('c1370000-0000-4000-8000-000000000b05','c1370000-0000-4000-8000-000000000b06','c1370000-0000-4000-8000-000000000b07') and read_at is null)
  + (select count(*) from public.cost_workflow_notifications where id in ('c1370000-0000-4000-8000-000000000d04','c1370000-0000-4000-8000-000000000d05') and read_at is null),
  5::bigint,
  'other people and other companies: notifications of other recipients or of company Y are unchanged'
);

-- A: repeating the call -------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1370000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is(
  public.c1_mark_notifications_read_all('c1370000-0000-4000-8000-000000000020','2026-10-01 10:00:00+00','2026-10-01 10:00:00+00'),
  '{"material":0,"cost":0}'::jsonb,
  'repeat: the second call marks nothing'
);

-- B holds material.read only ---------------------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"c1370000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select is(
  public.c1_mark_notifications_read_all('c1370000-0000-4000-8000-000000000020','2026-10-01 11:00:00+00','2026-10-01 11:00:00+00'),
  '{"material":1,"cost":0}'::jsonb,
  'permissions: without cost.notification.read the cost source is skipped'
);
reset role;
select ok(
  (select read_at is null from public.cost_workflow_notifications where id='c1370000-0000-4000-8000-000000000d04'),
  'permissions: the cost notification of a user without cost.notification.read stays unread'
);

-- C holds cost.notification.read only ------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1370000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select is(
  public.c1_mark_notifications_read_all('c1370000-0000-4000-8000-000000000020','2026-10-01 11:00:00+00','2026-10-01 11:00:00+00'),
  '{"material":0,"cost":1}'::jsonb,
  'permissions: without material.read the material source is skipped'
);
reset role;
select ok(
  (select read_at is null from public.app_notifications where id='c1370000-0000-4000-8000-000000000b06'),
  'permissions: the material notification of a user without material.read stays unread'
);

-- D is a member without permissions -------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1370000-0000-4000-8000-000000000904","role":"authenticated"}',true);
select is(
  public.c1_mark_notifications_read_all('c1370000-0000-4000-8000-000000000020','2026-10-01 11:00:00+00','2026-10-01 11:00:00+00'),
  '{"material":0,"cost":0}'::jsonb,
  'permissions: a member with neither permission marks nothing'
);

-- Membership -----------------------------------------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"c1370000-0000-4000-8000-000000000905","role":"authenticated"}',true);
select throws_ok(
  $$select public.c1_mark_notifications_read_all('c1370000-0000-4000-8000-000000000020','2026-10-01 11:00:00+00','2026-10-01 11:00:00+00')$$,
  'P0001','PERMISSION_DENIED','membership: a user outside the company is refused'
);
select set_config('request.jwt.claims','{"sub":"c1370000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok(
  $$select public.c1_mark_notifications_read_all('c1370000-0000-4000-8000-000000000021','2026-10-01 11:00:00+00','2026-10-01 11:00:00+00')$$,
  'P0001','PERMISSION_DENIED','membership: a member of company X cannot mark notifications in company Y'
);

reset role;
select * from finish(true);
rollback;
