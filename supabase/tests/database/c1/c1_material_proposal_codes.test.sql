begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(30);

-- Proposal numbers and order codes (20261017090000, N1-N4). Rollback-only fixture with prefix c135.
-- Project X (101) gets proposals x1 and x2 through the public command and 304 by a direct insert;
-- project Y (102) gets y1. x1 has three lines: 311 Charlie, 312 Alpha, 313 Bravo.
-- Orders from x1 (direct inserts, as in the finance fixtures):
--   351  lines 311 + 312, 2000000 each; recorded as quotation_only (subtotal 4000000)
--   352  line 313; cancelled through the public command
--   353  line 313; created after the cancellation, still waiting for a contract
-- Users: engineer E (901) creates and submits; buyer B (902) decides, cancels and reads orders;
-- accountant K (903) records the contract and reads finance.
-- Labels: "numbering:", "immutable:", "summary:", "read:", "orders:", "finance:", "privileges:", "schema:".

insert into auth.users(id,email) values
('c1350000-0000-4000-8000-000000000901','codes-engineer@test.invalid'),
('c1350000-0000-4000-8000-000000000902','codes-buyer@test.invalid'),
('c1350000-0000-4000-8000-000000000903','codes-accountant@test.invalid');
insert into public.tenants(id,code,name)
values('c1350000-0000-4000-8000-000000000010','C1CODES','Proposal codes tenant');
insert into public.companies(id,tenant_id,code,name)
values('c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000010','C1CODES','Proposal codes company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select id,'c1350000-0000-4000-8000-000000000010',array['member']
from auth.users where id::text like 'c1350000-0000-4000-8000-00000000090_';
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select id,'c1350000-0000-4000-8000-000000000010','c1350000-0000-4000-8000-000000000020',array['member'],true
from auth.users where id::text like 'c1350000-0000-4000-8000-00000000090_';
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system)
select role_row.id,'c1350000-0000-4000-8000-000000000010','c1350000-0000-4000-8000-000000000020',role_row.code,role_row.code,'rollback fixture',false
from (values
 ('c1350000-0000-4000-8000-000000000911'::uuid,'codes_engineer'),
 ('c1350000-0000-4000-8000-000000000912'::uuid,'codes_buyer'),
 ('c1350000-0000-4000-8000-000000000913'::uuid,'codes_accountant')
) as role_row(id,code);
insert into public.role_permissions(role_id,permission_code) values
('c1350000-0000-4000-8000-000000000911','material.read'),
('c1350000-0000-4000-8000-000000000911','material.proposal.submit'),
('c1350000-0000-4000-8000-000000000912','material.read'),
('c1350000-0000-4000-8000-000000000912','material.proposal.decide'),
('c1350000-0000-4000-8000-000000000912','material.order.manage'),
('c1350000-0000-4000-8000-000000000913','material.read'),
('c1350000-0000-4000-8000-000000000913','material.finance.read'),
('c1350000-0000-4000-8000-000000000913','material.contract.record');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason)
select 'c1350000-0000-4000-8000-000000000010','c1350000-0000-4000-8000-000000000020',
  ('c1350000-0000-4000-8000-00000000090'||suffix)::uuid,('c1350000-0000-4000-8000-00000000091'||suffix)::uuid,
  'c1350000-0000-4000-8000-000000000902','rollback fixture'
from unnest(array['1','2','3']) as suffix;
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000010',true,'c1350000-0000-4000-8000-000000000902');
insert into public.projects(id,tenant_id,company_id,code,name,operational_state,origin,created_by) values
('c1350000-0000-4000-8000-000000000101','c1350000-0000-4000-8000-000000000010','c1350000-0000-4000-8000-000000000020','CODES-X','Codes project X','active','manual','c1350000-0000-4000-8000-000000000902'),
('c1350000-0000-4000-8000-000000000102','c1350000-0000-4000-8000-000000000010','c1350000-0000-4000-8000-000000000020','CODES-Y','Codes project Y','active','manual','c1350000-0000-4000-8000-000000000902');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c1350000-0000-4000-8000-000000000201','c1350000-0000-4000-8000-000000000010','c1350000-0000-4000-8000-000000000020','CODES-S','Codes supplier','organization','c1350000-0000-4000-8000-000000000902');
insert into public.material_items(id,tenant_id,company_id,code,name,specification,unit,created_by) values
('c1350000-0000-4000-8000-000000000251','c1350000-0000-4000-8000-000000000010','c1350000-0000-4000-8000-000000000020','CODES-A','Alpha','A1','kg','c1350000-0000-4000-8000-000000000902'),
('c1350000-0000-4000-8000-000000000252','c1350000-0000-4000-8000-000000000010','c1350000-0000-4000-8000-000000000020','CODES-B','Bravo','B1','kg','c1350000-0000-4000-8000-000000000902'),
('c1350000-0000-4000-8000-000000000253','c1350000-0000-4000-8000-000000000010','c1350000-0000-4000-8000-000000000020','CODES-C','Charlie','C1','kg','c1350000-0000-4000-8000-000000000902');

create temporary table codes_ids(name text primary key, id uuid not null);
create temporary table codes_acks(name text primary key, body jsonb not null);
grant select,insert on codes_ids,codes_acks to authenticated;

-- Proposals through the public command -----------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1350000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into codes_ids
select 'x1',(public.c1_material_create_proposal(
  'c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
  '{"neededOn":"2026-12-30","deliveryAddress":"Site X","lines":[
    {"lineId":"c1350000-0000-4000-8000-000000000311","materialId":"c1350000-0000-4000-8000-000000000253","quantity":"10.0000"},
    {"lineId":"c1350000-0000-4000-8000-000000000312","materialId":"c1350000-0000-4000-8000-000000000251","quantity":"10.0000"},
    {"lineId":"c1350000-0000-4000-8000-000000000313","materialId":"c1350000-0000-4000-8000-000000000252","quantity":"10.0000"}
  ]}',
  'c1350000-0000-4000-8000-000000000601','c1350000-0000-4000-8000-000000000701'
)->>'resourceId')::uuid;
insert into codes_ids
select 'x2',(public.c1_material_create_proposal(
  'c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
  '{"neededOn":"2026-12-30","deliveryAddress":"Site X","lines":[
    {"lineId":"c1350000-0000-4000-8000-000000000321","materialId":"c1350000-0000-4000-8000-000000000251","quantity":"5.0000"}
  ]}',
  'c1350000-0000-4000-8000-000000000602','c1350000-0000-4000-8000-000000000702'
)->>'resourceId')::uuid;
insert into codes_ids
select 'y1',(public.c1_material_create_proposal(
  'c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000102',
  '{"neededOn":"2026-12-30","deliveryAddress":"Site Y","lines":[
    {"lineId":"c1350000-0000-4000-8000-000000000331","materialId":"c1350000-0000-4000-8000-000000000252","quantity":"5.0000"}
  ]}',
  'c1350000-0000-4000-8000-000000000603','c1350000-0000-4000-8000-000000000703'
)->>'resourceId')::uuid;

-- Numbering and immutability (as owner) -----------------------------------------------------
set local role none;
select is((select proposal_no from public.material_proposals where id=(select id from codes_ids where name='x1')),1,
  'numbering: the first proposal of project X is 1');
select is((select proposal_no from public.material_proposals where id=(select id from codes_ids where name='x2')),2,
  'numbering: the second proposal of project X is 2');
select is((select proposal_no from public.material_proposals where id=(select id from codes_ids where name='y1')),1,
  'numbering: project Y counts on its own and starts at 1');
-- 304: a draft without lines, inserted directly with a number of its own choosing.
insert into public.material_proposals(id,tenant_id,company_id,project_id,needed_on,delivery_address,created_by,proposal_no)
values('c1350000-0000-4000-8000-000000000304','c1350000-0000-4000-8000-000000000010','c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
  '2026-12-30','Site X','c1350000-0000-4000-8000-000000000901',99);
select is((select proposal_no from public.material_proposals where id='c1350000-0000-4000-8000-000000000304'),3,
  'numbering: a proposal_no sent with the insert is replaced by the next number of the project');
select throws_ok($$
  update public.material_proposals set proposal_no = 5 where id = 'c1350000-0000-4000-8000-000000000304'
$$,'P0001','MATERIAL_CODE_IMMUTABLE','immutable: changing proposal_no is rejected');
select lives_ok($$
  update public.material_proposals set notes = 'Edited note' where id = 'c1350000-0000-4000-8000-000000000304'
$$,'immutable: an update that keeps proposal_no still succeeds');
select is(private.c1_material_proposal_summary('c1350000-0000-4000-8000-000000000304'),'{"names":[],"total":0}'::jsonb,
  'summary: a draft without lines has no names and total 0');

-- Draft reads (engineer) ------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1350000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select ok((
  select body->'proposalNo' = '1'::jsonb and body ? 'revisionNo' and body->'revisionNo' = 'null'::jsonb
  from (select public.c1_material_read_proposal('c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
    (select id from codes_ids where name='x1')) as body) as proposal
),'read: a draft carries proposalNo and a null revisionNo before the first submit');
select is((
  public.c1_material_read_proposal('c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
    (select id from codes_ids where name='x1'))->'summary'
),'{"names":["Alpha","Bravo"],"total":3}'::jsonb,'summary: lines created at the same time are ordered by name');
select is((
  public.c1_material_read_proposal('c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
    'c1350000-0000-4000-8000-000000000304')->'summary'
),'{"names":[],"total":0}'::jsonb,'summary: the read view of a draft without lines has an empty summary');

-- Line creation order: Charlie first, then Alpha, then Bravo.
set local role none;
update public.material_proposal_lines set created_at = now() - interval '3 minutes' where id = 'c1350000-0000-4000-8000-000000000311';
update public.material_proposal_lines set created_at = now() - interval '2 minutes' where id = 'c1350000-0000-4000-8000-000000000312';
update public.material_proposal_lines set created_at = now() - interval '1 minute' where id = 'c1350000-0000-4000-8000-000000000313';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1350000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is((
  public.c1_material_read_proposal('c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
    (select id from codes_ids where name='x1'))->'summary'
),'{"names":["Charlie","Alpha"],"total":3}'::jsonb,'summary: the two earliest lines come first, whatever their names');
insert into codes_acks
select 'submit',public.c1_material_submit_proposal(
  'c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',(select id from codes_ids where name='x1'),
  '{"expectedVersion":0}','c1350000-0000-4000-8000-000000000604','c1350000-0000-4000-8000-000000000704');
select ok((
  select body->>'reviewState' = 'submitted' and body->'proposalNo' = '1'::jsonb and body->'revisionNo' = '1'::jsonb
    and body->'summary' = '{"names":["Charlie","Alpha"],"total":3}'::jsonb
  from (select public.c1_material_read_proposal('c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
    (select id from codes_ids where name='x1')) as body) as proposal
),'read: after the first submit revisionNo is 1, the number is kept and the summary reads the snapshot');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1350000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into codes_acks
select 'approve',public.c1_material_decide_proposal(
  'c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',(select id from codes_ids where name='x1'),
  '{"expectedVersion":1,"decision":"approve"}','c1350000-0000-4000-8000-000000000605','c1350000-0000-4000-8000-000000000705');

-- Orders (as owner) -------------------------------------------------------------------------------
set local role none;
insert into public.cost_evidence_files(
 id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
 verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version
)
select
 file.id,'c1350000-0000-4000-8000-000000000010','c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
 'c1350000-0000-4000-8000-000000000010/c1350000-0000-4000-8000-000000000020/c1350000-0000-4000-8000-000000000101/'||file.id::text,
 'file-'||file.hash_base,file.mime,8,lpad(to_hex(file.hash_base),64,'0'),file.mime,8,lpad(to_hex(file.hash_base),64,'0'),'finalized',
 now()+interval '15 minutes','c1350000-0000-4000-8000-000000000903','c1350000-0000-4000-8000-000000000903',now(),1
from (values
 ('c1350000-0000-4000-8000-000000000501'::uuid,1350501,'application/pdf'),
 ('c1350000-0000-4000-8000-000000000511'::uuid,1350511,'image/png')
) as file(id,hash_base,mime);

insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
)
select 'c1350000-0000-4000-8000-000000000351',proposal.tenant_id,proposal.company_id,proposal.project_id,proposal.id,proposal.approved_revision_id,
  'c1350000-0000-4000-8000-000000000201','VND','c1350000-0000-4000-8000-000000000501','c1350000-0000-4000-8000-000000000902'
from public.material_proposals as proposal where proposal.id=(select id from codes_ids where name='x1');
insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by,order_seq
)
select 'c1350000-0000-4000-8000-000000000352',proposal.tenant_id,proposal.company_id,proposal.project_id,proposal.id,proposal.approved_revision_id,
  'c1350000-0000-4000-8000-000000000201','VND','c1350000-0000-4000-8000-000000000501','c1350000-0000-4000-8000-000000000902',42
from public.material_proposals as proposal where proposal.id=(select id from codes_ids where name='x1');
insert into public.material_order_allocations(
  tenant_id,company_id,project_id,order_id,proposal_id,approved_revision_id,proposal_line_id,quantity,unit_price,quotation_material_name,mapping_confirmed
)
select proposal.tenant_id,proposal.company_id,proposal.project_id,allocation.order_id,proposal.id,proposal.approved_revision_id,allocation.line_id,
  1,allocation.unit_price,'Quoted item',true
from public.material_proposals as proposal
cross join (values
 ('c1350000-0000-4000-8000-000000000351'::uuid,'c1350000-0000-4000-8000-000000000311'::uuid,2000000::numeric),
 ('c1350000-0000-4000-8000-000000000351'::uuid,'c1350000-0000-4000-8000-000000000312'::uuid,2000000::numeric),
 ('c1350000-0000-4000-8000-000000000352'::uuid,'c1350000-0000-4000-8000-000000000313'::uuid,1000::numeric)
) as allocation(order_id,line_id,unit_price)
where proposal.id=(select id from codes_ids where name='x1');
select is((select order_seq from public.material_orders where id='c1350000-0000-4000-8000-000000000351'),1,
  'orders: the first order of a proposal is 1');
select is((select order_seq from public.material_orders where id='c1350000-0000-4000-8000-000000000352'),2,
  'orders: the second order is 2, and an order_seq sent with the insert is replaced');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1350000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into codes_acks
select 'cancel',public.c1_material_cancel_order(
  'c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101','c1350000-0000-4000-8000-000000000352',
  '{"expectedOrderVersion":1,"reason":"Duplicate order"}','c1350000-0000-4000-8000-000000000606','c1350000-0000-4000-8000-000000000706');

set local role none;
insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
)
select 'c1350000-0000-4000-8000-000000000353',proposal.tenant_id,proposal.company_id,proposal.project_id,proposal.id,proposal.approved_revision_id,
  'c1350000-0000-4000-8000-000000000201','VND','c1350000-0000-4000-8000-000000000501','c1350000-0000-4000-8000-000000000902'
from public.material_proposals as proposal where proposal.id=(select id from codes_ids where name='x1');
insert into public.material_order_allocations(
  tenant_id,company_id,project_id,order_id,proposal_id,approved_revision_id,proposal_line_id,quantity,unit_price,quotation_material_name,mapping_confirmed
)
select proposal.tenant_id,proposal.company_id,proposal.project_id,'c1350000-0000-4000-8000-000000000353',proposal.id,proposal.approved_revision_id,
  'c1350000-0000-4000-8000-000000000313',1,1000,'Quoted item',true
from public.material_proposals as proposal where proposal.id=(select id from codes_ids where name='x1');
select ok((
  select cancelled.state = 'cancelled' and cancelled.order_seq = 2 and next_order.order_seq = 3
  from public.material_orders as cancelled, public.material_orders as next_order
  where cancelled.id = 'c1350000-0000-4000-8000-000000000352' and next_order.id = 'c1350000-0000-4000-8000-000000000353'
),'orders: a cancelled order keeps 2 and the next order takes 3 instead of reusing it');
select throws_ok($$
  update public.material_orders set order_seq = 9 where id = 'c1350000-0000-4000-8000-000000000351'
$$,'P0001','MATERIAL_CODE_IMMUTABLE','immutable: changing order_seq is rejected');
select is((select proposal_no from public.material_proposals where id=(select id from codes_ids where name='x1')),1,
  'immutable: submit, approve and orders leave the proposal number unchanged');

-- Contract on order 351 (accountant) ------------------------------------------------------------
insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,order_id,evidence_role,created_by)
values('c1350000-0000-4000-8000-000000000511','c1350000-0000-4000-8000-000000000010','c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
  'material_order','c1350000-0000-4000-8000-000000000351','signed_quotation','c1350000-0000-4000-8000-000000000903');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1350000-0000-4000-8000-000000000903","role":"authenticated"}',true);
insert into codes_acks
select 'contract',public.c1_material_record_contract(
  'c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101','c1350000-0000-4000-8000-000000000351',
  '{"documentation":"quotation_only","expectedOrderVersion":1,"signedOn":"2026-10-10","subtotal":"4000000","varianceReason":null,"signedQuotationFileId":"c1350000-0000-4000-8000-000000000511"}',
  'c1350000-0000-4000-8000-000000000607','c1350000-0000-4000-8000-000000000707');

-- Order and proposal reads (buyer) ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1350000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select ok((
  select body->'proposalNo' = '1'::jsonb and body->'orderSeq' = '1'::jsonb
  from (select public.c1_material_read_order('c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
    'c1350000-0000-4000-8000-000000000351') as body) as material_order
),'read: an order carries proposalNo and orderSeq');
select is((
  public.c1_material_read_order('c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
    'c1350000-0000-4000-8000-000000000351')->'summary'
),'{"names":["Charlie","Alpha"],"total":2}'::jsonb,'summary: an order summarizes its own allocations in line creation order');
select ok((
  select body->>'orderState' = 'cancelled' and body->'orderSeq' = '2'::jsonb
    and body->'summary' = '{"names":["Bravo"],"total":1}'::jsonb
  from (select public.c1_material_read_order('c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
    'c1350000-0000-4000-8000-000000000352') as body) as material_order
),'read: a cancelled order still reads with its orderSeq and summary');
select ok((
  select body->>'reviewState' = 'approved' and body->'proposalNo' = '1'::jsonb and body->'revisionNo' = '1'::jsonb
    and jsonb_array_length(body->'contractStatus') = 1
    and body->'contractStatus'->0->>'orderId' = 'c1350000-0000-4000-8000-000000000351'
    and body->'contractStatus'->0->'orderSeq' = '1'::jsonb
  from (select public.c1_material_read_proposal('c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
    (select id from codes_ids where name='x1')) as body) as proposal
),'read: every contractStatus row carries the orderSeq of its order');

-- Finance reads (accountant) --------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1350000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select ok((
  select body->>'projectName' = 'Codes project X' and body->'proposalNo' = '1'::jsonb and body->'orderSeq' = '1'::jsonb
    and body->>'orderId' = 'c1350000-0000-4000-8000-000000000351'
  from (select public.c1_material_read_contract('c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
    'c1350000-0000-4000-8000-000000000351') as body) as contract
),'finance: the contract view carries projectName, proposalNo and orderSeq');
select is(
  public.c1_material_read_contract('c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101',
    'c1350000-0000-4000-8000-000000000353'),
  null::jsonb,'finance: an order without a contract still reads as null');
select ok((
  select jsonb_array_length(body->'contracts') = 1
    and body->'contracts'->0->>'orderId' = 'c1350000-0000-4000-8000-000000000351'
    and body->'contracts'->0->>'projectName' = 'Codes project X'
    and body->'contracts'->0->'proposalNo' = '1'::jsonb
    and body->'contracts'->0->'orderSeq' = '1'::jsonb
  from (select public.c1_material_finance_facts('c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101') as body) as facts
),'finance: finance_facts contracts carry proposalNo and orderSeq');
select ok((
  select jsonb_array_length(body->'awaitingContract') = 1
    and body->'awaitingContract'->0->>'orderId' = 'c1350000-0000-4000-8000-000000000353'
    and body->'awaitingContract'->0->'proposalNo' = '1'::jsonb
    and body->'awaitingContract'->0->'orderSeq' = '3'::jsonb
    and body->'returnedRequests' = '[]'::jsonb
  from (select public.c1_material_finance_inbox_facts('c1350000-0000-4000-8000-000000000020','c1350000-0000-4000-8000-000000000101') as body) as inbox
),'finance: the inbox awaitingContract rows carry proposalNo and orderSeq');

-- Privileges and schema (as owner) ---------------------------------------------------------------
set local role none;
select ok(
  not has_function_privilege('authenticated','private.c1_material_proposal_json(uuid,uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_proposal_json_core(uuid,uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_order_json(uuid,uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_order_json_core(uuid,uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_read_contract(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_read_contract_core(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_finance_facts(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_finance_facts_core(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_finance_inbox_facts(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_finance_inbox_facts_core(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_proposal_summary(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_order_summary(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_order_label(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_with_order_codes(jsonb)','EXECUTE')
  and not has_function_privilege('anon','private.c1_material_proposal_json(uuid,uuid,uuid,uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.c1_material_read_proposal(uuid,uuid,uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.c1_material_finance_facts(uuid,uuid)','EXECUTE'),
  'privileges: wrappers, cores and helpers stay private behind the public read functions'
);
select col_not_null('public','material_proposals','proposal_no','schema: proposal_no is required');
select col_not_null('public','material_orders','order_seq','schema: order_seq is required');
select ok(
  exists (select 1 from pg_catalog.pg_constraint where conname = 'material_proposals_project_proposal_no_key' and contype = 'u')
  and exists (select 1 from pg_catalog.pg_constraint where conname = 'material_orders_proposal_order_seq_key' and contype = 'u'),
  'schema: numbers are unique per project and per proposal'
);
select ok(
  exists (select 1 from pg_catalog.pg_trigger where tgname = 'material_proposal_no_assign' and tgrelid = 'public.material_proposals'::regclass)
  and exists (select 1 from pg_catalog.pg_trigger where tgname = 'material_order_seq_assign' and tgrelid = 'public.material_orders'::regclass)
  and exists (select 1 from pg_catalog.pg_trigger where tgname = 'material_codes_immutable' and tgrelid = 'public.material_proposals'::regclass)
  and exists (select 1 from pg_catalog.pg_trigger where tgname = 'material_codes_immutable' and tgrelid = 'public.material_orders'::regclass),
  'schema: assignment and immutability triggers exist on both tables'
);

select * from finish(true);
rollback;
