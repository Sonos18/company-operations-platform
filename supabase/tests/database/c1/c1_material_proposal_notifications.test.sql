begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(22);

-- Proposal notifications and order labels (20261017090100, spec section 7). Rollback-only
-- fixture with prefix c136. Project 101 "Notify project"; materials 251 Alpha, 252 Bravo,
-- 253 Charlie.
--   P1  engineer E: lines 311 Alpha, 312 Bravo, 313 Charlie. Submitted, returned, submitted
--       again and approved; order 351 takes lines 312 and 313 and gets a quotation-only record.
--   P2  engineer E: one line. Submitted, then E loses material.read before the approval.
--   P3  self-decider S: one line. S submits and approves it.
-- Users: engineer E (901, no employee profile), buyer B (902, employee "Buyer Full Name")
-- decides and orders, accountant K (903) records contracts, self-decider S (904) submits
-- and decides, blind decider X (905) holds material.proposal.decide without material.read.
-- Labels: "submitted:", "decision:", "resubmit:", "actor:", "order:", "contract:",
-- "lost access:", "label:", "read:", "name:", "privileges:", "schema:".

insert into auth.users(id,email) values
('c1360000-0000-4000-8000-000000000901','notify-engineer@test.invalid'),
('c1360000-0000-4000-8000-000000000902','notify-buyer@test.invalid'),
('c1360000-0000-4000-8000-000000000903','notify-accountant@test.invalid'),
('c1360000-0000-4000-8000-000000000904','notify-self@test.invalid'),
('c1360000-0000-4000-8000-000000000905','notify-blind@test.invalid');
insert into public.tenants(id,code,name)
values('c1360000-0000-4000-8000-000000000010','C1NOTIFY','Proposal notifications tenant');
insert into public.companies(id,tenant_id,code,name)
values('c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000010','C1NOTIFY','Proposal notifications company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select id,'c1360000-0000-4000-8000-000000000010',array['member']
from auth.users where id::text like 'c1360000-0000-4000-8000-00000000090_';
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select id,'c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020',array['member'],true
from auth.users where id::text like 'c1360000-0000-4000-8000-00000000090_';
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system)
select role_row.id,'c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020',role_row.code,role_row.code,'rollback fixture',false
from (values
 ('c1360000-0000-4000-8000-000000000911'::uuid,'notify_engineer'),
 ('c1360000-0000-4000-8000-000000000912'::uuid,'notify_buyer'),
 ('c1360000-0000-4000-8000-000000000913'::uuid,'notify_accountant'),
 ('c1360000-0000-4000-8000-000000000914'::uuid,'notify_self'),
 ('c1360000-0000-4000-8000-000000000915'::uuid,'notify_blind')
) as role_row(id,code);
insert into public.role_permissions(role_id,permission_code) values
('c1360000-0000-4000-8000-000000000911','material.read'),
('c1360000-0000-4000-8000-000000000911','material.proposal.submit'),
('c1360000-0000-4000-8000-000000000912','material.read'),
('c1360000-0000-4000-8000-000000000912','material.proposal.decide'),
('c1360000-0000-4000-8000-000000000912','material.order.manage'),
('c1360000-0000-4000-8000-000000000913','material.read'),
('c1360000-0000-4000-8000-000000000913','material.contract.record'),
('c1360000-0000-4000-8000-000000000913','material.finance.read'),
('c1360000-0000-4000-8000-000000000914','material.read'),
('c1360000-0000-4000-8000-000000000914','material.proposal.submit'),
('c1360000-0000-4000-8000-000000000914','material.proposal.decide'),
('c1360000-0000-4000-8000-000000000915','material.proposal.decide');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason)
select 'c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020',
  ('c1360000-0000-4000-8000-00000000090'||suffix)::uuid,('c1360000-0000-4000-8000-00000000091'||suffix)::uuid,
  'c1360000-0000-4000-8000-000000000902','rollback fixture'
from unnest(array['1','2','3','4','5']) as suffix;
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000010',true,'c1360000-0000-4000-8000-000000000902');
insert into public.projects(id,tenant_id,company_id,code,name,operational_state,origin,created_by)
values('c1360000-0000-4000-8000-000000000101','c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020','NOTIFY-P','Notify project','active','manual','c1360000-0000-4000-8000-000000000902');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c1360000-0000-4000-8000-000000000201','c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020','NOTIFY-S','Notify supplier','organization','c1360000-0000-4000-8000-000000000902');
insert into public.material_items(id,tenant_id,company_id,code,name,specification,unit,created_by) values
('c1360000-0000-4000-8000-000000000251','c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020','NOTIFY-A','Alpha','A1','kg','c1360000-0000-4000-8000-000000000902'),
('c1360000-0000-4000-8000-000000000252','c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020','NOTIFY-B','Bravo','B1','kg','c1360000-0000-4000-8000-000000000902'),
('c1360000-0000-4000-8000-000000000253','c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020','NOTIFY-C','Charlie','C1','kg','c1360000-0000-4000-8000-000000000902');
-- Only the buyer has an employee profile.
insert into public.departments(id,tenant_id,company_id,code,name)
values('c1360000-0000-4000-8000-000000000261','c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020','NOTIFY-D','Purchasing');
insert into public.employees(id,tenant_id,company_id,user_id,employee_code,full_name,work_email,department_id,employment_status,created_by)
values('c1360000-0000-4000-8000-000000000271','c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000902',
  'EMP-NOTIFY-B','Buyer Full Name','notify-buyer@test.invalid','c1360000-0000-4000-8000-000000000261','active','c1360000-0000-4000-8000-000000000902');

create temporary table notify_ids(name text primary key, id uuid not null);
create temporary table notify_acks(name text primary key, body jsonb not null);
grant select,insert on notify_ids,notify_acks to authenticated;

-- Proposals ------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1360000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into notify_ids
select 'p1',(public.c1_material_create_proposal(
  'c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',
  '{"neededOn":"2026-12-30","deliveryAddress":"Site N","lines":[
    {"lineId":"c1360000-0000-4000-8000-000000000311","materialId":"c1360000-0000-4000-8000-000000000251","quantity":"10.0000"},
    {"lineId":"c1360000-0000-4000-8000-000000000312","materialId":"c1360000-0000-4000-8000-000000000252","quantity":"10.0000"},
    {"lineId":"c1360000-0000-4000-8000-000000000313","materialId":"c1360000-0000-4000-8000-000000000253","quantity":"10.0000"}
  ]}',
  'c1360000-0000-4000-8000-000000000601','c1360000-0000-4000-8000-000000000701'
)->>'resourceId')::uuid;
insert into notify_ids
select 'p2',(public.c1_material_create_proposal(
  'c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',
  '{"neededOn":"2026-12-30","deliveryAddress":"Site N","lines":[
    {"lineId":"c1360000-0000-4000-8000-000000000321","materialId":"c1360000-0000-4000-8000-000000000251","quantity":"5.0000"}
  ]}',
  'c1360000-0000-4000-8000-000000000602','c1360000-0000-4000-8000-000000000702'
)->>'resourceId')::uuid;
select set_config('request.jwt.claims','{"sub":"c1360000-0000-4000-8000-000000000904","role":"authenticated"}',true);
insert into notify_ids
select 'p3',(public.c1_material_create_proposal(
  'c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',
  '{"neededOn":"2026-12-30","deliveryAddress":"Site N","lines":[
    {"lineId":"c1360000-0000-4000-8000-000000000331","materialId":"c1360000-0000-4000-8000-000000000252","quantity":"5.0000"}
  ]}',
  'c1360000-0000-4000-8000-000000000603','c1360000-0000-4000-8000-000000000703'
)->>'resourceId')::uuid;

-- P1 first submit (engineer) ------------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"c1360000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into notify_acks
select 'p1_submit_1',public.c1_material_submit_proposal(
  'c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',(select id from notify_ids where name='p1'),
  '{"expectedVersion":0}','c1360000-0000-4000-8000-000000000604','c1360000-0000-4000-8000-000000000704');

set local role none;
select is((
  select array_agg(notification.recipient_id order by notification.recipient_id) from public.app_notifications as notification
  where notification.event_kind='material.proposal.submitted' and notification.source_id=(select id from notify_ids where name='p1')
),array['c1360000-0000-4000-8000-000000000902'::uuid,'c1360000-0000-4000-8000-000000000904'::uuid],
'submitted: each decider who can read the proposal gets one notification; not the engineer, the accountant or a decider without material.read');
select is((
  select notification.payload from public.app_notifications as notification
  where notification.event_kind='material.proposal.submitted' and notification.recipient_id='c1360000-0000-4000-8000-000000000902'
    and notification.source_id=(select id from notify_ids where name='p1')
),jsonb_build_object(
  'projectName','Notify project','proposalNo',1,'revisionNo',1,'actorName','notify-engineer@test.invalid',
  'summaryName1','Alpha','summaryName2','Bravo','summaryTotal',3),
'submitted: the payload names the project, number, revision, submitter and summary, without order labels');
select ok((
  select notification.link_path = ('/materials/c1360000-0000-4000-8000-000000000101/proposals/'||(select id::text from notify_ids where name='p1'))
    and notification.source_type = 'material_proposal'
    and notification.project_id = 'c1360000-0000-4000-8000-000000000101'
    and notification.dedupe_key = ('proposal:'||(select id::text from notify_ids where name='p1')||':sub:1')
  from public.app_notifications as notification
  where notification.event_kind='material.proposal.submitted' and notification.recipient_id='c1360000-0000-4000-8000-000000000902'
    and notification.source_id=(select id from notify_ids where name='p1')
),'submitted: the notification links to the proposal page with the per-revision dedupe key');

-- P1 returned (buyer) ------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1360000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into notify_acks
select 'p1_return',public.c1_material_decide_proposal(
  'c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',(select id from notify_ids where name='p1'),
  '{"expectedVersion":1,"decision":"return","reason":"Missing specification"}','c1360000-0000-4000-8000-000000000605','c1360000-0000-4000-8000-000000000705');

set local role none;
select is((
  select notification.payload from public.app_notifications as notification
  where notification.event_kind='material.proposal.returned' and notification.recipient_id='c1360000-0000-4000-8000-000000000901'
    and notification.dedupe_key=('proposal:'||(select id::text from notify_ids where name='p1')||':ret:1')
),jsonb_build_object(
  'projectName','Notify project','proposalNo',1,'revisionNo',1,'actorName','Buyer Full Name',
  'summaryName1','Alpha','summaryName2','Bravo','summaryTotal',3,'reason','Missing specification'),
'decision: the engineer is told who returned revision 1 and why, read from the returned snapshot');
select is((
  select count(*) from public.app_notifications as notification
  where notification.recipient_id='c1360000-0000-4000-8000-000000000902'
    and notification.event_kind in ('material.proposal.approved','material.proposal.returned')
),0::bigint,'decision: the deciding buyer is not notified of their own decision');

-- P1 submitted again, then approved ----------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1360000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into notify_acks
select 'p1_submit_2',public.c1_material_submit_proposal(
  'c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',(select id from notify_ids where name='p1'),
  '{"expectedVersion":2}','c1360000-0000-4000-8000-000000000606','c1360000-0000-4000-8000-000000000706');

set local role none;
select is((
  select array_agg(notification.payload->>'revisionNo' order by notification.dedupe_key) from public.app_notifications as notification
  where notification.event_kind='material.proposal.submitted' and notification.recipient_id='c1360000-0000-4000-8000-000000000902'
    and notification.source_id=(select id from notify_ids where name='p1')
),array['1','2'],'resubmit: submitting again after a return adds a notification for revision 2');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1360000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into notify_acks
select 'p1_approve',public.c1_material_decide_proposal(
  'c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',(select id from notify_ids where name='p1'),
  '{"expectedVersion":3,"decision":"approve"}','c1360000-0000-4000-8000-000000000607','c1360000-0000-4000-8000-000000000707');

set local role none;
select ok((
  select notification.payload->'revisionNo' = '2'::jsonb
    and notification.payload->'proposalNo' = '1'::jsonb
    and notification.payload->>'actorName' = 'Buyer Full Name'
    and notification.payload->'summaryTotal' = '3'::jsonb
    and not (notification.payload ? 'reason')
  from public.app_notifications as notification
  where notification.event_kind='material.proposal.approved' and notification.recipient_id='c1360000-0000-4000-8000-000000000901'
    and notification.dedupe_key=('proposal:'||(select id::text from notify_ids where name='p1')||':appr:2')
),'decision: the engineer is told who approved revision 2, without a reason');

-- P3: the self-decider submits and approves their own proposal --------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1360000-0000-4000-8000-000000000904","role":"authenticated"}',true);
insert into notify_acks
select 'p3_submit',public.c1_material_submit_proposal(
  'c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',(select id from notify_ids where name='p3'),
  '{"expectedVersion":0}','c1360000-0000-4000-8000-000000000608','c1360000-0000-4000-8000-000000000708');
insert into notify_acks
select 'p3_approve',public.c1_material_decide_proposal(
  'c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',(select id from notify_ids where name='p3'),
  '{"expectedVersion":1,"decision":"approve"}','c1360000-0000-4000-8000-000000000609','c1360000-0000-4000-8000-000000000709');

set local role none;
select is((
  select array_agg(notification.recipient_id order by notification.recipient_id) from public.app_notifications as notification
  where notification.event_kind='material.proposal.submitted' and notification.source_id=(select id from notify_ids where name='p3')
),array['c1360000-0000-4000-8000-000000000902'::uuid],'actor: a decider who submits is not notified of their own submission');
select ok((
  select proposal.review_state = 'approved' from public.material_proposals as proposal where proposal.id=(select id from notify_ids where name='p3')
) and not exists (
  select 1 from public.app_notifications as notification
  where notification.source_id=(select id from notify_ids where name='p3')
    and notification.event_kind in ('material.proposal.approved','material.proposal.returned')
),'actor: approving one''s own proposal notifies nobody');

-- Order 351 on P1 (as owner, the buyer acting) -----------------------------------------------
select set_config('request.jwt.claims','{"sub":"c1360000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into public.cost_evidence_files(
 id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
 verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version
)
select
 file.id,'c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',
 'c1360000-0000-4000-8000-000000000010/c1360000-0000-4000-8000-000000000020/c1360000-0000-4000-8000-000000000101/'||file.id::text,
 'file-'||file.hash_base,file.mime,8,lpad(to_hex(file.hash_base),64,'0'),file.mime,8,lpad(to_hex(file.hash_base),64,'0'),'finalized',
 now()+interval '15 minutes','c1360000-0000-4000-8000-000000000903','c1360000-0000-4000-8000-000000000903',now(),1
from (values
 ('c1360000-0000-4000-8000-000000000501'::uuid,1360501,'application/pdf'),
 ('c1360000-0000-4000-8000-000000000511'::uuid,1360511,'image/png')
) as file(id,hash_base,mime);
insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
)
select 'c1360000-0000-4000-8000-000000000351',proposal.tenant_id,proposal.company_id,proposal.project_id,proposal.id,proposal.approved_revision_id,
  'c1360000-0000-4000-8000-000000000201','VND','c1360000-0000-4000-8000-000000000501','c1360000-0000-4000-8000-000000000902'
from public.material_proposals as proposal where proposal.id=(select id from notify_ids where name='p1');
insert into public.material_order_allocations(
  tenant_id,company_id,project_id,order_id,proposal_id,approved_revision_id,proposal_line_id,quantity,unit_price,quotation_material_name,mapping_confirmed
)
select proposal.tenant_id,proposal.company_id,proposal.project_id,'c1360000-0000-4000-8000-000000000351',proposal.id,proposal.approved_revision_id,
  allocation.line_id,1,1500000,'Quoted item',true
from public.material_proposals as proposal
cross join (values
 ('c1360000-0000-4000-8000-000000000312'::uuid),
 ('c1360000-0000-4000-8000-000000000313'::uuid)
) as allocation(line_id)
where proposal.id=(select id from notify_ids where name='p1');

select is((
  select count(*) from public.app_notifications as notification
  where notification.event_kind='material.order.created' and notification.source_id='c1360000-0000-4000-8000-000000000351'
),0::bigint,'order: the order-created notification waits until constraints are checked (deferred to commit)');
set constraints all immediate;
select is((
  select array_agg(notification.recipient_id order by notification.recipient_id) from public.app_notifications as notification
  where notification.event_kind='material.order.created' and notification.source_id='c1360000-0000-4000-8000-000000000351'
),array['c1360000-0000-4000-8000-000000000903'::uuid],'order: contract recorders are notified once the trigger runs, not the acting buyer');
select is((
  select notification.payload from public.app_notifications as notification
  where notification.event_kind='material.order.created' and notification.recipient_id='c1360000-0000-4000-8000-000000000903'
    and notification.source_id='c1360000-0000-4000-8000-000000000351'
),jsonb_build_object(
  'actorName','Buyer Full Name','supplierName','Notify supplier','summaryName1','Bravo','summaryName2','Charlie','summaryTotal',2,
  'projectName','Notify project','proposalNo',1,'orderSeq',1),
'order: the payload carries the creator name, the summary of the order''s own lines and the order label');

-- Contract on order 351 (accountant) ----------------------------------------------------------
insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,order_id,evidence_role,created_by)
values('c1360000-0000-4000-8000-000000000511','c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',
  'material_order','c1360000-0000-4000-8000-000000000351','signed_quotation','c1360000-0000-4000-8000-000000000903');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1360000-0000-4000-8000-000000000903","role":"authenticated"}',true);
insert into notify_acks
select 'contract',public.c1_material_record_contract(
  'c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101','c1360000-0000-4000-8000-000000000351',
  '{"documentation":"quotation_only","expectedOrderVersion":1,"signedOn":"2026-10-10","subtotal":"3000000.0000","varianceReason":null,"signedQuotationFileId":"c1360000-0000-4000-8000-000000000511"}',
  'c1360000-0000-4000-8000-000000000610','c1360000-0000-4000-8000-000000000710');

set local role none;
insert into notify_ids
select 'contract',contract.id from public.material_contracts as contract where contract.order_id='c1360000-0000-4000-8000-000000000351';
select is((
  select array_agg(notification.recipient_id order by notification.recipient_id) from public.app_notifications as notification
  where notification.event_kind='material.contract.recorded' and notification.source_id=(select id from notify_ids where name='contract')
    and notification.payload->'orderSeq' = '1'::jsonb
    and notification.payload->'proposalNo' = '1'::jsonb
    and notification.payload->>'projectName' = 'Notify project'
    and notification.payload->>'documentation' = 'quotation_only'
),array['c1360000-0000-4000-8000-000000000901'::uuid,'c1360000-0000-4000-8000-000000000902'::uuid],
'contract: the recorded-contract notifications of the engineer and the buyer carry the order label');

-- P2: the engineer loses material.read before the approval ------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1360000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into notify_acks
select 'p2_submit',public.c1_material_submit_proposal(
  'c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',(select id from notify_ids where name='p2'),
  '{"expectedVersion":0}','c1360000-0000-4000-8000-000000000611','c1360000-0000-4000-8000-000000000711');
set local role none;
delete from public.role_permissions
where role_id='c1360000-0000-4000-8000-000000000911' and permission_code='material.read';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1360000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into notify_acks
select 'p2_approve',public.c1_material_decide_proposal(
  'c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',(select id from notify_ids where name='p2'),
  '{"expectedVersion":1,"decision":"approve"}','c1360000-0000-4000-8000-000000000612','c1360000-0000-4000-8000-000000000712');

set local role none;
select ok((
  select proposal.review_state = 'approved' from public.material_proposals as proposal where proposal.id=(select id from notify_ids where name='p2')
) and not exists (
  select 1 from public.app_notifications as notification
  where notification.source_id=(select id from notify_ids where name='p2') and notification.event_kind='material.proposal.approved'
),'lost access: a submitter who lost material.read gets no approved notification');

-- Order labels on direct inserts (the buyer acting, the accountant notified) -------------------
select private.c1_material_notify_users(
  'c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',
  array['c1360000-0000-4000-8000-000000000903'::uuid],
  'material.order.created','material_order','c1360000-0000-4000-8000-000000000351',
  '/materials/c1360000-0000-4000-8000-000000000101/orders/c1360000-0000-4000-8000-000000000351',
  '{"projectName":"Kept name"}'::jsonb,'label-kept'
);
select is((
  select notification.payload from public.app_notifications as notification
  where notification.recipient_id='c1360000-0000-4000-8000-000000000903' and notification.dedupe_key='label-kept'
),'{"projectName":"Kept name","proposalNo":1,"orderSeq":1}'::jsonb,'label: keys already in the payload win over the order label');
select private.c1_material_notify_users(
  'c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',
  array['c1360000-0000-4000-8000-000000000903'::uuid],
  'material.installment.due_soon','material_installment','c1360000-0000-4000-8000-000000000a01',
  '/materials/c1360000-0000-4000-8000-000000000101/orders/c1360000-0000-4000-8000-000000000351',
  '{}'::jsonb,'inst:'||(select id::text from notify_ids where name='contract')||':c1360000-0000-4000-8000-000000000a01:due_soon:2026-12-01'
);
select is((
  select notification.payload from public.app_notifications as notification
  where notification.recipient_id='c1360000-0000-4000-8000-000000000903' and notification.event_kind='material.installment.due_soon'
    and notification.source_id='c1360000-0000-4000-8000-000000000a01'
),'{"projectName":"Notify project","proposalNo":1,"orderSeq":1}'::jsonb,'label: an installment finds its order through the contract id in the dedupe key');
select private.c1_material_notify_users(
  'c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',
  array['c1360000-0000-4000-8000-000000000903'::uuid],
  'material.order.created','material_order','c1360000-0000-4000-8000-000000000399',
  '/materials/c1360000-0000-4000-8000-000000000101/orders/c1360000-0000-4000-8000-000000000399',
  '{"supplierName":"Nobody"}'::jsonb,'label-missing-order'
);
select private.c1_material_notify_users(
  'c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000101',
  array['c1360000-0000-4000-8000-000000000903'::uuid],
  'material.installment.overdue','material_installment','c1360000-0000-4000-8000-000000000a02',
  '/materials/c1360000-0000-4000-8000-000000000101/orders/c1360000-0000-4000-8000-000000000351',
  '{}'::jsonb,'inst:not-a-contract:overdue'
);
select ok((
  select notification.payload = '{"supplierName":"Nobody"}'::jsonb from public.app_notifications as notification
  where notification.recipient_id='c1360000-0000-4000-8000-000000000903' and notification.dedupe_key='label-missing-order'
) and (
  select notification.payload = '{}'::jsonb from public.app_notifications as notification
  where notification.recipient_id='c1360000-0000-4000-8000-000000000903' and notification.dedupe_key='inst:not-a-contract:overdue'
),'label: a source without an order, or a malformed installment key, is stored unchanged');

-- Recipient checks and names --------------------------------------------------------------------
select ok(
  private.c1_material_user_can_read_proposal('c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020',
    'c1360000-0000-4000-8000-000000000903',(select id from notify_ids where name='p1'))
  and not private.c1_material_user_can_read_proposal('c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020',
    'c1360000-0000-4000-8000-000000000905',(select id from notify_ids where name='p1'))
  and not private.c1_material_user_can_read_proposal('c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020',
    'c1360000-0000-4000-8000-000000000901',(select id from notify_ids where name='p1')),
  'read: recipients are checked by their own permissions (contract recorder yes; no material.read no)'
);
select is(
  private.c1_material_user_display_name('c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000901'),
  'notify-engineer@test.invalid','name: a user without an employee profile is shown by email');
select is(
  private.c1_material_user_display_name('c1360000-0000-4000-8000-000000000010','c1360000-0000-4000-8000-000000000020','c1360000-0000-4000-8000-000000000902'),
  'Buyer Full Name','name: a user with an employee profile is shown by full name');

-- Privileges and schema ------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated','private.c1_material_user_display_name(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_user_can_read_proposal(uuid,uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_summary_payload(jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_proposal_notification_payload(uuid,bigint,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_notify_proposal_submitted()','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_notify_proposal_decided()','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_label_app_notification()','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_notify_order_created()','EXECUTE')
  and not has_function_privilege('anon','private.c1_material_user_display_name(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('service_role','private.c1_material_user_can_read_proposal(uuid,uuid,uuid,uuid)','EXECUTE'),
  'privileges: the notification helpers and trigger functions stay private'
);
select ok(
  exists (select 1 from pg_catalog.pg_trigger where tgname='material_order_created_notify' and tgrelid='public.material_orders'::regclass
    and tgdeferrable and tginitdeferred)
  and exists (select 1 from pg_catalog.pg_trigger where tgname='material_proposal_submitted_notify' and tgrelid='public.material_proposal_revisions'::regclass)
  and exists (select 1 from pg_catalog.pg_trigger where tgname='material_proposal_decided_notify' and tgrelid='public.material_proposal_decisions'::regclass)
  and exists (select 1 from pg_catalog.pg_trigger where tgname='app_notifications_order_label' and tgrelid='public.app_notifications'::regclass),
  'schema: the order-created trigger is deferred and the three new triggers exist'
);

select * from finish(true);
rollback;
