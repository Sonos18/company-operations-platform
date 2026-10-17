begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(7);

-- Notification realtime (20261017110000, spec 2026-10-17 notification realtime). Rollback-only
-- fixture with prefix c138. Project 101 "Realtime project"; materials 251 Alpha and 252 Bravo.
-- Two approved proposals (P1, P2, one line each, made by the self-decider) and two orders:
--   O1 351 on P1, created by buyer A (901, has an employee profile "Buyer Full Name").
--   O2 352 on P2, created by buyer B (902, no employee profile, so the sign-in email is used).
-- Users: buyer A (901) and buyer B (902) hold material.contract.record, accountant K (903)
-- holds material.contract.record, self-decider S (904) submits and decides, reader R (905)
-- holds material.read only (never a recipient).
-- Labels: "publication:", "deferred:", "recipients:", "payload:", "trigger:".

insert into auth.users(id,email) values
('c1380000-0000-4000-8000-000000000901','realtime-buyer-a@test.invalid'),
('c1380000-0000-4000-8000-000000000902','realtime-buyer-b@test.invalid'),
('c1380000-0000-4000-8000-000000000903','realtime-accountant@test.invalid'),
('c1380000-0000-4000-8000-000000000904','realtime-self@test.invalid'),
('c1380000-0000-4000-8000-000000000905','realtime-reader@test.invalid');
insert into public.tenants(id,code,name)
values('c1380000-0000-4000-8000-000000000010','C1REALTIME','Realtime tenant');
insert into public.companies(id,tenant_id,code,name)
values('c1380000-0000-4000-8000-000000000020','c1380000-0000-4000-8000-000000000010','C1REALTIME','Realtime company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select id,'c1380000-0000-4000-8000-000000000010',array['member']
from auth.users where id::text like 'c1380000-0000-4000-8000-00000000090_';
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select id,'c1380000-0000-4000-8000-000000000010','c1380000-0000-4000-8000-000000000020',array['member'],true
from auth.users where id::text like 'c1380000-0000-4000-8000-00000000090_';
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system)
select role_row.id,'c1380000-0000-4000-8000-000000000010','c1380000-0000-4000-8000-000000000020',role_row.code,role_row.code,'rollback fixture',false
from (values
 ('c1380000-0000-4000-8000-000000000911'::uuid,'realtime_buyer_a'),
 ('c1380000-0000-4000-8000-000000000912'::uuid,'realtime_buyer_b'),
 ('c1380000-0000-4000-8000-000000000913'::uuid,'realtime_accountant'),
 ('c1380000-0000-4000-8000-000000000914'::uuid,'realtime_self'),
 ('c1380000-0000-4000-8000-000000000915'::uuid,'realtime_reader')
) as role_row(id,code);
insert into public.role_permissions(role_id,permission_code) values
('c1380000-0000-4000-8000-000000000911','material.read'),
('c1380000-0000-4000-8000-000000000911','material.order.manage'),
('c1380000-0000-4000-8000-000000000911','material.contract.record'),
('c1380000-0000-4000-8000-000000000912','material.read'),
('c1380000-0000-4000-8000-000000000912','material.order.manage'),
('c1380000-0000-4000-8000-000000000912','material.contract.record'),
('c1380000-0000-4000-8000-000000000913','material.read'),
('c1380000-0000-4000-8000-000000000913','material.contract.record'),
('c1380000-0000-4000-8000-000000000913','material.finance.read'),
('c1380000-0000-4000-8000-000000000914','material.read'),
('c1380000-0000-4000-8000-000000000914','material.proposal.submit'),
('c1380000-0000-4000-8000-000000000914','material.proposal.decide'),
('c1380000-0000-4000-8000-000000000915','material.read');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason)
select 'c1380000-0000-4000-8000-000000000010','c1380000-0000-4000-8000-000000000020',
  ('c1380000-0000-4000-8000-00000000090'||suffix)::uuid,('c1380000-0000-4000-8000-00000000091'||suffix)::uuid,
  'c1380000-0000-4000-8000-000000000904','rollback fixture'
from unnest(array['1','2','3','4','5']) as suffix;
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1380000-0000-4000-8000-000000000020','c1380000-0000-4000-8000-000000000010',true,'c1380000-0000-4000-8000-000000000904');
insert into public.projects(id,tenant_id,company_id,code,name,operational_state,origin,created_by)
values('c1380000-0000-4000-8000-000000000101','c1380000-0000-4000-8000-000000000010','c1380000-0000-4000-8000-000000000020','REALTIME-P','Realtime project','active','manual','c1380000-0000-4000-8000-000000000904');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c1380000-0000-4000-8000-000000000201','c1380000-0000-4000-8000-000000000010','c1380000-0000-4000-8000-000000000020','REALTIME-S','Realtime supplier','organization','c1380000-0000-4000-8000-000000000904');
insert into public.material_items(id,tenant_id,company_id,code,name,specification,unit,created_by) values
('c1380000-0000-4000-8000-000000000251','c1380000-0000-4000-8000-000000000010','c1380000-0000-4000-8000-000000000020','REALTIME-A','Alpha','A1','kg','c1380000-0000-4000-8000-000000000904'),
('c1380000-0000-4000-8000-000000000252','c1380000-0000-4000-8000-000000000010','c1380000-0000-4000-8000-000000000020','REALTIME-B','Bravo','B1','kg','c1380000-0000-4000-8000-000000000904');
-- Only buyer A has an employee profile.
insert into public.departments(id,tenant_id,company_id,code,name)
values('c1380000-0000-4000-8000-000000000261','c1380000-0000-4000-8000-000000000010','c1380000-0000-4000-8000-000000000020','REALTIME-D','Purchasing');
insert into public.employees(id,tenant_id,company_id,user_id,employee_code,full_name,work_email,department_id,employment_status,created_by)
values('c1380000-0000-4000-8000-000000000271','c1380000-0000-4000-8000-000000000010','c1380000-0000-4000-8000-000000000020','c1380000-0000-4000-8000-000000000901',
  'EMP-REALTIME-A','Buyer Full Name','realtime-buyer-a@test.invalid','c1380000-0000-4000-8000-000000000261','active','c1380000-0000-4000-8000-000000000904');

create temporary table realtime_ids(name text primary key, id uuid not null);
create temporary table realtime_acks(name text primary key, body jsonb not null);
grant select,insert on realtime_ids,realtime_acks to authenticated;

-- Proposals P1 and P2: the self-decider creates, submits and approves both ----------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1380000-0000-4000-8000-000000000904","role":"authenticated"}',true);
insert into realtime_ids
select 'p1',(public.c1_material_create_proposal(
  'c1380000-0000-4000-8000-000000000020','c1380000-0000-4000-8000-000000000101',
  '{"neededOn":"2026-12-30","deliveryAddress":"Site R","lines":[
    {"lineId":"c1380000-0000-4000-8000-000000000311","materialId":"c1380000-0000-4000-8000-000000000251","quantity":"10.0000"}
  ]}',
  'c1380000-0000-4000-8000-000000000601','c1380000-0000-4000-8000-000000000701'
)->>'resourceId')::uuid;
insert into realtime_ids
select 'p2',(public.c1_material_create_proposal(
  'c1380000-0000-4000-8000-000000000020','c1380000-0000-4000-8000-000000000101',
  '{"neededOn":"2026-12-30","deliveryAddress":"Site R","lines":[
    {"lineId":"c1380000-0000-4000-8000-000000000321","materialId":"c1380000-0000-4000-8000-000000000252","quantity":"10.0000"}
  ]}',
  'c1380000-0000-4000-8000-000000000602','c1380000-0000-4000-8000-000000000702'
)->>'resourceId')::uuid;
insert into realtime_acks
select 'p1_submit',public.c1_material_submit_proposal(
  'c1380000-0000-4000-8000-000000000020','c1380000-0000-4000-8000-000000000101',(select id from realtime_ids where name='p1'),
  '{"expectedVersion":0}','c1380000-0000-4000-8000-000000000603','c1380000-0000-4000-8000-000000000703');
insert into realtime_acks
select 'p1_approve',public.c1_material_decide_proposal(
  'c1380000-0000-4000-8000-000000000020','c1380000-0000-4000-8000-000000000101',(select id from realtime_ids where name='p1'),
  '{"expectedVersion":1,"decision":"approve"}','c1380000-0000-4000-8000-000000000604','c1380000-0000-4000-8000-000000000704');
insert into realtime_acks
select 'p2_submit',public.c1_material_submit_proposal(
  'c1380000-0000-4000-8000-000000000020','c1380000-0000-4000-8000-000000000101',(select id from realtime_ids where name='p2'),
  '{"expectedVersion":0}','c1380000-0000-4000-8000-000000000605','c1380000-0000-4000-8000-000000000705');
insert into realtime_acks
select 'p2_approve',public.c1_material_decide_proposal(
  'c1380000-0000-4000-8000-000000000020','c1380000-0000-4000-8000-000000000101',(select id from realtime_ids where name='p2'),
  '{"expectedVersion":1,"decision":"approve"}','c1380000-0000-4000-8000-000000000606','c1380000-0000-4000-8000-000000000706');

-- Orders O1 (buyer A) and O2 (buyer B), inserted as owner like the order command does --------
set local role none;
insert into public.cost_evidence_files(
 id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
 verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version
)
select
 file.id,'c1380000-0000-4000-8000-000000000010','c1380000-0000-4000-8000-000000000020','c1380000-0000-4000-8000-000000000101',
 'c1380000-0000-4000-8000-000000000010/c1380000-0000-4000-8000-000000000020/c1380000-0000-4000-8000-000000000101/'||file.id::text,
 'file-'||file.hash_base,'application/pdf',8,lpad(to_hex(file.hash_base),64,'0'),'application/pdf',8,lpad(to_hex(file.hash_base),64,'0'),'finalized',
 now()+interval '15 minutes','c1380000-0000-4000-8000-000000000903','c1380000-0000-4000-8000-000000000903',now(),1
from (values
 ('c1380000-0000-4000-8000-000000000501'::uuid,1380501),
 ('c1380000-0000-4000-8000-000000000502'::uuid,1380502)
) as file(id,hash_base);
-- The acting user at commit time is the order creator, as in a real create_order request.
select set_config('request.jwt.claims','{"sub":"c1380000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
)
select 'c1380000-0000-4000-8000-000000000351',proposal.tenant_id,proposal.company_id,proposal.project_id,proposal.id,proposal.approved_revision_id,
  'c1380000-0000-4000-8000-000000000201','VND','c1380000-0000-4000-8000-000000000501','c1380000-0000-4000-8000-000000000901'
from public.material_proposals as proposal where proposal.id=(select id from realtime_ids where name='p1');
insert into public.material_order_allocations(
  tenant_id,company_id,project_id,order_id,proposal_id,approved_revision_id,proposal_line_id,quantity,unit_price,quotation_material_name,mapping_confirmed
)
select proposal.tenant_id,proposal.company_id,proposal.project_id,'c1380000-0000-4000-8000-000000000351',proposal.id,proposal.approved_revision_id,
  'c1380000-0000-4000-8000-000000000311',1,1500000,'Quoted item',true
from public.material_proposals as proposal where proposal.id=(select id from realtime_ids where name='p1');
select is((
  select array_agg(publication_table.tablename::text order by publication_table.tablename)
  from pg_catalog.pg_publication_tables as publication_table
  where publication_table.pubname='supabase_realtime' and publication_table.schemaname='public'
    and publication_table.tablename in ('app_notifications','cost_workflow_notifications')
),array['app_notifications','cost_workflow_notifications'],
'publication: both notification tables are published through supabase_realtime');

select is((
  select count(*) from public.app_notifications as notification
  where notification.event_kind='material.order.created'
    and notification.source_id='c1380000-0000-4000-8000-000000000351'
),0::bigint,'deferred: the order-created notification waits until constraints are checked');
-- O1 fires with buyer A as the acting user.
set constraints all immediate;

select is((
  select array_agg(notification.recipient_id order by notification.recipient_id) from public.app_notifications as notification
  where notification.event_kind='material.order.created' and notification.source_id='c1380000-0000-4000-8000-000000000351'
),array['c1380000-0000-4000-8000-000000000902'::uuid,'c1380000-0000-4000-8000-000000000903'::uuid],
'recipients: contract recorders other than the creator are notified of O1; not buyer A, the self-decider or the reader');
-- O2 is created in a later request: buyer B acts, and the trigger is deferred again first.
set constraints all deferred;
select set_config('request.jwt.claims','{"sub":"c1380000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
)
select 'c1380000-0000-4000-8000-000000000352',proposal.tenant_id,proposal.company_id,proposal.project_id,proposal.id,proposal.approved_revision_id,
  'c1380000-0000-4000-8000-000000000201','VND','c1380000-0000-4000-8000-000000000502','c1380000-0000-4000-8000-000000000902'
from public.material_proposals as proposal where proposal.id=(select id from realtime_ids where name='p2');
insert into public.material_order_allocations(
  tenant_id,company_id,project_id,order_id,proposal_id,approved_revision_id,proposal_line_id,quantity,unit_price,quotation_material_name,mapping_confirmed
)
select proposal.tenant_id,proposal.company_id,proposal.project_id,'c1380000-0000-4000-8000-000000000352',proposal.id,proposal.approved_revision_id,
  'c1380000-0000-4000-8000-000000000321',1,1500000,'Quoted item',true
from public.material_proposals as proposal where proposal.id=(select id from realtime_ids where name='p2');
set constraints all immediate;

select is((
  select array_agg(notification.recipient_id order by notification.recipient_id) from public.app_notifications as notification
  where notification.event_kind='material.order.created' and notification.source_id='c1380000-0000-4000-8000-000000000352'
),array['c1380000-0000-4000-8000-000000000901'::uuid,'c1380000-0000-4000-8000-000000000903'::uuid],
'recipients: contract recorders other than the creator are notified of O2; buyer B is not told about their own order');

select ok((
  select notification.payload @> jsonb_build_object(
      'actorName','Buyer Full Name','supplierName','Realtime supplier','summaryName1','Alpha','summaryTotal',1)
    and notification.payload ? 'orderSeq'
  from public.app_notifications as notification
  where notification.event_kind='material.order.created' and notification.recipient_id='c1380000-0000-4000-8000-000000000903'
    and notification.source_id='c1380000-0000-4000-8000-000000000351'
),'payload: the creator with an employee profile is named by full name, with supplier, summary and order sequence kept');
select ok((
  select notification.payload @> jsonb_build_object(
      'actorName','realtime-buyer-b@test.invalid','supplierName','Realtime supplier','summaryName1','Bravo','summaryTotal',1)
    and notification.payload ? 'orderSeq'
  from public.app_notifications as notification
  where notification.event_kind='material.order.created' and notification.recipient_id='c1380000-0000-4000-8000-000000000903'
    and notification.source_id='c1380000-0000-4000-8000-000000000352'
),'payload: the creator without an employee profile is named by sign-in email, with supplier, summary and order sequence kept');

select ok(
  exists (select 1 from pg_catalog.pg_trigger where tgname='material_order_created_notify' and tgrelid='public.material_orders'::regclass
    and tgdeferrable and tginitdeferred)
  and not has_function_privilege('authenticated','private.c1_material_notify_order_created()','EXECUTE')
  and not has_function_privilege('anon','private.c1_material_notify_order_created()','EXECUTE')
  and not has_function_privilege('service_role','private.c1_material_notify_order_created()','EXECUTE'),
  'trigger: the order-created trigger stays deferred and its function stays private'
);

select * from finish(true);
rollback;
