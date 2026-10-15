begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(43);

-- Fixture: engineer owns the proposal, buyer creates orders, accountant records
-- contracts, finance reader only reads, director is the legacy notification recipient.
insert into auth.users(id,email) values
('c1260000-0000-4000-8000-000000000901','c126-engineer@test.invalid'),
('c1260000-0000-4000-8000-000000000902','c126-buyer@test.invalid'),
('c1260000-0000-4000-8000-000000000903','c126-accountant@test.invalid'),
('c1260000-0000-4000-8000-000000000904','c126-finance@test.invalid'),
('c1260000-0000-4000-8000-000000000905','c126-director@test.invalid');
insert into public.tenants(id,code,name) values('c1260000-0000-4000-8000-000000000010','C126','Contract test tenant');
insert into public.companies(id,tenant_id,code,name) values('c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000010','C126','Contract test company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select member.user_id,'c1260000-0000-4000-8000-000000000010',array['member']
from (values ('c1260000-0000-4000-8000-000000000901'::uuid),('c1260000-0000-4000-8000-000000000902'::uuid),('c1260000-0000-4000-8000-000000000903'::uuid),('c1260000-0000-4000-8000-000000000904'::uuid),('c1260000-0000-4000-8000-000000000905'::uuid)) as member(user_id);
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select member.user_id,'c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020',array['member'],true
from (values ('c1260000-0000-4000-8000-000000000901'::uuid),('c1260000-0000-4000-8000-000000000902'::uuid),('c1260000-0000-4000-8000-000000000903'::uuid),('c1260000-0000-4000-8000-000000000904'::uuid),('c1260000-0000-4000-8000-000000000905'::uuid)) as member(user_id);
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values
('c1260000-0000-4000-8000-000000000911','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c126_engineer','Engineer','test',false),
('c1260000-0000-4000-8000-000000000912','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c126_buyer','Buyer','test',false),
('c1260000-0000-4000-8000-000000000913','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c126_accountant','Accountant','test',false),
('c1260000-0000-4000-8000-000000000914','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c126_finance','Finance reader','test',false),
('c1260000-0000-4000-8000-000000000915','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c126_director','Director','test',false);
insert into public.role_permissions(role_id,permission_code) values
('c1260000-0000-4000-8000-000000000911','material.read'),
('c1260000-0000-4000-8000-000000000911','material.proposal.submit'),
('c1260000-0000-4000-8000-000000000912','material.read'),
('c1260000-0000-4000-8000-000000000912','material.order.manage'),
('c1260000-0000-4000-8000-000000000913','material.read'),
('c1260000-0000-4000-8000-000000000913','material.contract.record'),
('c1260000-0000-4000-8000-000000000913','material.finance.read'),
('c1260000-0000-4000-8000-000000000914','material.read'),
('c1260000-0000-4000-8000-000000000914','material.finance.read'),
('c1260000-0000-4000-8000-000000000915','material.read'),
('c1260000-0000-4000-8000-000000000915','cost.notification.read');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values
('c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000901','c1260000-0000-4000-8000-000000000911','c1260000-0000-4000-8000-000000000905','test'),
('c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000902','c1260000-0000-4000-8000-000000000912','c1260000-0000-4000-8000-000000000905','test'),
('c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000903','c1260000-0000-4000-8000-000000000913','c1260000-0000-4000-8000-000000000905','test'),
('c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000904','c1260000-0000-4000-8000-000000000914','c1260000-0000-4000-8000-000000000905','test'),
('c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000905','c1260000-0000-4000-8000-000000000915','c1260000-0000-4000-8000-000000000905','test');
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by) values('c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000010',true,'c1260000-0000-4000-8000-000000000905');
insert into public.cost_workflow_companies(company_id,tenant_id,mode,notification_recipient_id)
values('c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000010','document_backed_v1','c1260000-0000-4000-8000-000000000905');
insert into public.projects(id,tenant_id,company_id,code,name,location_text,operational_state,origin,created_by)
values('c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','C126-P','Contract project','Site A','active','manual','c1260000-0000-4000-8000-000000000905');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c1260000-0000-4000-8000-000000000201','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','C126-S','Supplier A','organization','c1260000-0000-4000-8000-000000000902');
insert into public.material_items(id,tenant_id,company_id,code,name,specification,unit,created_by)
values('c1260000-0000-4000-8000-000000000211','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','C126-M','Steel','D10','bag','c1260000-0000-4000-8000-000000000902');
insert into public.material_proposals(id,tenant_id,company_id,project_id,needed_on,delivery_address,created_by)
values('c1260000-0000-4000-8000-000000000301','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','2026-10-30','Site A','c1260000-0000-4000-8000-000000000901');
insert into public.material_proposal_lines(id,tenant_id,company_id,project_id,proposal_id,material_id,quantity,created_by)
values('c1260000-0000-4000-8000-000000000311','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000301','c1260000-0000-4000-8000-000000000211',100,'c1260000-0000-4000-8000-000000000901');
insert into public.material_proposal_revisions(id,tenant_id,company_id,project_id,proposal_id,revision_no,needed_on,delivery_address,submitted_by)
values('c1260000-0000-4000-8000-000000000401','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000301',1,'2026-10-30','Site A','c1260000-0000-4000-8000-000000000901');
insert into public.material_proposal_revision_lines(
  revision_id,proposal_line_id,proposal_id,tenant_id,company_id,project_id,material_id,material_name,specification,unit,quantity
) values('c1260000-0000-4000-8000-000000000401','c1260000-0000-4000-8000-000000000311','c1260000-0000-4000-8000-000000000301','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000211','Steel','D10','bag',100);
update public.material_proposals
set review_state='approved',current_revision_id='c1260000-0000-4000-8000-000000000401',approved_revision_id='c1260000-0000-4000-8000-000000000401',version=2
where id='c1260000-0000-4000-8000-000000000301';

insert into public.cost_evidence_files(
  id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
  verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version
)
select file.id,'c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000010/c1260000-0000-4000-8000-000000000020/c1260000-0000-4000-8000-000000000101/'||file.id::text,
  file.name,'application/pdf',8,repeat(file.hash_char,64),'application/pdf',8,repeat(file.hash_char,64),'finalized',
  now()+interval '15 minutes','c1260000-0000-4000-8000-000000000903','c1260000-0000-4000-8000-000000000903',now(),1
from (values
  ('c1260000-0000-4000-8000-000000000501'::uuid,'unsigned-quotation.pdf','a'),
  ('c1260000-0000-4000-8000-000000000511'::uuid,'a-contract.pdf','b'),
  ('c1260000-0000-4000-8000-000000000512'::uuid,'a-signed-quotation.pdf','c'),
  ('c1260000-0000-4000-8000-000000000521'::uuid,'c-contract.pdf','d'),
  ('c1260000-0000-4000-8000-000000000522'::uuid,'c-signed-quotation.pdf','e'),
  ('c1260000-0000-4000-8000-000000000533'::uuid,'wrong-scope.pdf','f'),
  ('c1260000-0000-4000-8000-000000000534'::uuid,'wrong-role.pdf','1'),
  ('c1260000-0000-4000-8000-000000000535'::uuid,'attached-contract.pdf','2'),
  ('c1260000-0000-4000-8000-000000000536'::uuid,'attached-quotation.pdf','3'),
  ('c1260000-0000-4000-8000-000000000541'::uuid,'amendment.pdf','4'),
  ('c1260000-0000-4000-8000-000000000551'::uuid,'invoice.pdf','5'),
  ('c1260000-0000-4000-8000-000000000561'::uuid,'payment-proof.pdf','6')
) as file(id,name,hash_char);
insert into public.cost_evidence_files(
  id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
  status,intent_expires_at,created_by,version
) values(
  'c1260000-0000-4000-8000-000000000531','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000010/c1260000-0000-4000-8000-000000000020/c1260000-0000-4000-8000-000000000101/c1260000-0000-4000-8000-000000000531',
  'pending-contract.pdf','application/pdf',8,repeat('7',64),'pending_upload',now()+interval '15 minutes','c1260000-0000-4000-8000-000000000903',0
);

-- Orders: A active (recorded in the tests), B cancelled, C active (variance and evidence cases),
-- D active without a contract, E active with a contract that already holds two files.
-- Every order has one allocation of 10 x 10 = 100.
insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,supplier_id,currency_code,
  unsigned_quotation_evidence_file_id,state,version,created_by
) values
('c1260000-0000-4000-8000-000000000351','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000301','c1260000-0000-4000-8000-000000000401','c1260000-0000-4000-8000-000000000201','VND','c1260000-0000-4000-8000-000000000501','active',1,'c1260000-0000-4000-8000-000000000902'),
('c1260000-0000-4000-8000-000000000352','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000301','c1260000-0000-4000-8000-000000000401','c1260000-0000-4000-8000-000000000201','VND','c1260000-0000-4000-8000-000000000501','cancelled',2,'c1260000-0000-4000-8000-000000000902'),
('c1260000-0000-4000-8000-000000000353','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000301','c1260000-0000-4000-8000-000000000401','c1260000-0000-4000-8000-000000000201','VND','c1260000-0000-4000-8000-000000000501','active',1,'c1260000-0000-4000-8000-000000000902'),
('c1260000-0000-4000-8000-000000000354','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000301','c1260000-0000-4000-8000-000000000401','c1260000-0000-4000-8000-000000000201','VND','c1260000-0000-4000-8000-000000000501','active',1,'c1260000-0000-4000-8000-000000000902'),
('c1260000-0000-4000-8000-000000000355','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000301','c1260000-0000-4000-8000-000000000401','c1260000-0000-4000-8000-000000000201','VND','c1260000-0000-4000-8000-000000000501','active',1,'c1260000-0000-4000-8000-000000000902');
insert into public.material_order_allocations(
  tenant_id,company_id,project_id,order_id,proposal_id,approved_revision_id,proposal_line_id,quantity,unit_price,
  quotation_material_name,mapping_confirmed
)
select 'c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',material_order.id,'c1260000-0000-4000-8000-000000000301','c1260000-0000-4000-8000-000000000401','c1260000-0000-4000-8000-000000000311',10,10,'Steel Supplier A',true
from public.material_orders as material_order;

-- Evidence scopes. Contract-level scopes are added after the contract exists.
insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,order_id,evidence_role,created_by) values
('c1260000-0000-4000-8000-000000000511','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_order','c1260000-0000-4000-8000-000000000351','signed_contract','c1260000-0000-4000-8000-000000000903'),
('c1260000-0000-4000-8000-000000000512','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_order','c1260000-0000-4000-8000-000000000351','signed_quotation','c1260000-0000-4000-8000-000000000903'),
('c1260000-0000-4000-8000-000000000521','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_order','c1260000-0000-4000-8000-000000000353','signed_contract','c1260000-0000-4000-8000-000000000903'),
('c1260000-0000-4000-8000-000000000522','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_order','c1260000-0000-4000-8000-000000000353','signed_quotation','c1260000-0000-4000-8000-000000000903'),
('c1260000-0000-4000-8000-000000000531','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_order','c1260000-0000-4000-8000-000000000353','signed_contract','c1260000-0000-4000-8000-000000000903'),
('c1260000-0000-4000-8000-000000000533','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_order','c1260000-0000-4000-8000-000000000354','signed_contract','c1260000-0000-4000-8000-000000000903'),
('c1260000-0000-4000-8000-000000000534','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_order','c1260000-0000-4000-8000-000000000353','signed_quotation','c1260000-0000-4000-8000-000000000903'),
('c1260000-0000-4000-8000-000000000535','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_order','c1260000-0000-4000-8000-000000000353','signed_contract','c1260000-0000-4000-8000-000000000903'),
('c1260000-0000-4000-8000-000000000536','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_order','c1260000-0000-4000-8000-000000000353','signed_quotation','c1260000-0000-4000-8000-000000000903');

-- Order E already owns a contract version that holds the two "attached" files.
insert into public.material_contracts(id,tenant_id,company_id,project_id,order_id,supplier_id,currency_code,contract_no,signed_on,created_by)
values('c1260000-0000-4000-8000-000000000651','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000355','c1260000-0000-4000-8000-000000000201','VND','HD-E','2026-10-01','c1260000-0000-4000-8000-000000000903');
insert into public.material_contract_versions(
  tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,order_subtotal_snapshot,
  variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
) values('c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000651',1,'original',100,10,110,100,null,
  'c1260000-0000-4000-8000-000000000535','c1260000-0000-4000-8000-000000000536',null,'c1260000-0000-4000-8000-000000000903');

set local role authenticated;

-- case 7: a buyer without material.contract.record cannot record contracts
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_record_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000351',
    '{"expectedOrderVersion":1,"contractNo":"HD-A","signedOn":"2026-10-10","subtotal":"100.0000","vatAmount":"10.0000","total":"110.0000","varianceReason":null,"contractFileId":"c1260000-0000-4000-8000-000000000511","signedQuotationFileId":"c1260000-0000-4000-8000-000000000512","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"110.0000","dueOn":"2026-10-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000601','c1260000-0000-4000-8000-000000000701'
  )
$$,'P0001','PERMISSION_DENIED','case 7: buyer cannot record a contract');
select throws_ok($$
  select public.c1_material_read_contract('c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000351')
$$,'P0001','PERMISSION_DENIED','read_contract: buyer without finance permissions is denied');

-- case 4: cancelled order
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_record_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000352',
    '{"expectedOrderVersion":2,"contractNo":"HD-B","signedOn":"2026-10-10","subtotal":"100.0000","vatAmount":"10.0000","total":"110.0000","varianceReason":null,"contractFileId":"c1260000-0000-4000-8000-000000000511","signedQuotationFileId":"c1260000-0000-4000-8000-000000000512","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"110.0000","dueOn":"2026-10-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000602','c1260000-0000-4000-8000-000000000702'
  )
$$,'P0001','ORDER_NOT_ACTIVE','case 4: cancelled order is ORDER_NOT_ACTIVE');

-- case 5: variance needs a reason (money is validated before files)
select throws_ok($$
  select public.c1_material_record_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000353',
    '{"expectedOrderVersion":1,"contractNo":"HD-C","signedOn":"2026-10-10","subtotal":"90.0000","vatAmount":"9.0000","total":"99.0000","varianceReason":null,"contractFileId":"c1260000-0000-4000-8000-000000000521","signedQuotationFileId":"c1260000-0000-4000-8000-000000000522","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"99.0000","dueOn":"2026-10-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000603','c1260000-0000-4000-8000-000000000703'
  )
$$,'P0001','VARIANCE_REASON_REQUIRED','case 5: subtotal different from order total needs a variance reason');

-- case 6: evidence must be finalized, in scope, in role and not attached yet
select throws_ok($$
  select public.c1_material_record_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000353',
    '{"expectedOrderVersion":1,"contractNo":"HD-C","signedOn":"2026-10-10","subtotal":"100.0000","vatAmount":"10.0000","total":"110.0000","varianceReason":null,"contractFileId":"c1260000-0000-4000-8000-000000000531","signedQuotationFileId":"c1260000-0000-4000-8000-000000000522","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"110.0000","dueOn":"2026-10-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000604','c1260000-0000-4000-8000-000000000704'
  )
$$,'P0001','EVIDENCE_INVALID','case 6: contract file that is not finalized is EVIDENCE_INVALID');
select throws_ok($$
  select public.c1_material_record_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000353',
    '{"expectedOrderVersion":1,"contractNo":"HD-C","signedOn":"2026-10-10","subtotal":"100.0000","vatAmount":"10.0000","total":"110.0000","varianceReason":null,"contractFileId":"c1260000-0000-4000-8000-000000000533","signedQuotationFileId":"c1260000-0000-4000-8000-000000000522","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"110.0000","dueOn":"2026-10-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000605','c1260000-0000-4000-8000-000000000705'
  )
$$,'P0001','EVIDENCE_INVALID','case 6: contract file scoped to another order is EVIDENCE_INVALID');
select throws_ok($$
  select public.c1_material_record_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000353',
    '{"expectedOrderVersion":1,"contractNo":"HD-C","signedOn":"2026-10-10","subtotal":"100.0000","vatAmount":"10.0000","total":"110.0000","varianceReason":null,"contractFileId":"c1260000-0000-4000-8000-000000000534","signedQuotationFileId":"c1260000-0000-4000-8000-000000000522","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"110.0000","dueOn":"2026-10-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000606','c1260000-0000-4000-8000-000000000706'
  )
$$,'P0001','EVIDENCE_INVALID','case 6: contract file with the wrong evidence role is EVIDENCE_INVALID');
select throws_ok($$
  select public.c1_material_record_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000353',
    '{"expectedOrderVersion":1,"contractNo":"HD-C","signedOn":"2026-10-10","subtotal":"100.0000","vatAmount":"10.0000","total":"110.0000","varianceReason":null,"contractFileId":"c1260000-0000-4000-8000-000000000535","signedQuotationFileId":"c1260000-0000-4000-8000-000000000536","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"110.0000","dueOn":"2026-10-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000607','c1260000-0000-4000-8000-000000000707'
  )
$$,'P0001','EVIDENCE_INVALID','case 6: contract file already attached to another version is EVIDENCE_INVALID');

-- case 1: accountant records the contract for active order A
select is((
  select result - 'resourceId'
  from (select public.c1_material_record_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000351',
    '{"expectedOrderVersion":1,"contractNo":"HD-A","signedOn":"2026-10-10","subtotal":"100.0000","vatAmount":"10.0000","total":"110.0000","varianceReason":null,"contractFileId":"c1260000-0000-4000-8000-000000000511","signedQuotationFileId":"c1260000-0000-4000-8000-000000000512","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"50.0000","dueOn":"2026-10-10","isAdvance":true},{"installmentKey":"c1260000-0000-4000-8000-000000000a02","name":"Dot 2","amount":"40.0000","dueOn":"2026-11-10","isAdvance":false},{"installmentKey":"c1260000-0000-4000-8000-000000000a03","name":"Quyet toan","amount":"20.0000","dueOn":"2026-12-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000608','c1260000-0000-4000-8000-000000000708'
  ) as result) as recorded
),'{"version":1,"replayed":false}'::jsonb,'case 1: accountant records a contract for an active order');

set local role none;
select is((
  select count(*) from public.material_contracts as contract
  join public.material_contract_versions as ver on ver.contract_id=contract.id and ver.kind='original' and ver.version_no=1
  where contract.order_id='c1260000-0000-4000-8000-000000000351' and contract.contract_no='HD-A' and contract.current_version_no=1 and contract.version=1
    and ver.total=110 and ver.order_subtotal_snapshot=100 and ver.variance_reason is null
    and ver.contract_file_id='c1260000-0000-4000-8000-000000000511' and ver.signed_quotation_file_id='c1260000-0000-4000-8000-000000000512'
),1::bigint,'case 1: one contract with one original version is stored');
select is((
  select string_agg(item.seq::text||':'||item.installment_key::text||':'||item.amount::text||':'||item.is_advance::text, ',' order by item.seq)
  from public.material_contract_installments as item
  join public.material_contracts as contract on contract.id=item.contract_id
  where contract.order_id='c1260000-0000-4000-8000-000000000351'
),'1:c1260000-0000-4000-8000-000000000a01:50.0000:true,2:c1260000-0000-4000-8000-000000000a02:40.0000:false,3:c1260000-0000-4000-8000-000000000a03:20.0000:false','case 1: installments are stored in order with their amounts');
select is((
  select count(*) from public.material_order_contracts as link
  join public.material_contracts as contract on contract.id=link.contract_id
  where link.order_id='c1260000-0000-4000-8000-000000000351' and contract.order_id='c1260000-0000-4000-8000-000000000351'
),1::bigint,'case 1: the order is flagged signed in material_order_contracts');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is((
  select (public.c1_material_read_proposal('c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000301')->'lines'->0->>'signedQuantity')::numeric
),10::numeric,'case 1: proposal shows signedQuantity equal to the order quantity');

-- case 2: replay and conflict
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select is((
  select result - 'resourceId'
  from (select public.c1_material_record_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000351',
    '{"expectedOrderVersion":1,"contractNo":"HD-A","signedOn":"2026-10-10","subtotal":"100.0000","vatAmount":"10.0000","total":"110.0000","varianceReason":null,"contractFileId":"c1260000-0000-4000-8000-000000000511","signedQuotationFileId":"c1260000-0000-4000-8000-000000000512","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"50.0000","dueOn":"2026-10-10","isAdvance":true},{"installmentKey":"c1260000-0000-4000-8000-000000000a02","name":"Dot 2","amount":"40.0000","dueOn":"2026-11-10","isAdvance":false},{"installmentKey":"c1260000-0000-4000-8000-000000000a03","name":"Quyet toan","amount":"20.0000","dueOn":"2026-12-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000608','c1260000-0000-4000-8000-000000000709'
  ) as result) as replayed
),'{"version":1,"replayed":true}'::jsonb,'case 2: same key and payload replays without adding rows');
select throws_ok($$
  select public.c1_material_record_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000351',
    '{"expectedOrderVersion":1,"contractNo":"HD-A2","signedOn":"2026-10-10","subtotal":"100.0000","vatAmount":"10.0000","total":"110.0000","varianceReason":null,"contractFileId":"c1260000-0000-4000-8000-000000000511","signedQuotationFileId":"c1260000-0000-4000-8000-000000000512","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"110.0000","dueOn":"2026-10-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000608','c1260000-0000-4000-8000-000000000710'
  )
$$,'P0001','IDEMPOTENCY_CONFLICT','case 2: same key with a different payload is an idempotency conflict');
set local role none;
select is((select count(*) from public.material_contracts where order_id='c1260000-0000-4000-8000-000000000351'),1::bigint,'case 2: replay did not add a second contract');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000903","role":"authenticated"}',true);

-- case 3: second contract for the same order
select throws_ok($$
  select public.c1_material_record_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000351',
    '{"expectedOrderVersion":1,"contractNo":"HD-A3","signedOn":"2026-10-10","subtotal":"100.0000","vatAmount":"10.0000","total":"110.0000","varianceReason":null,"contractFileId":"c1260000-0000-4000-8000-000000000511","signedQuotationFileId":"c1260000-0000-4000-8000-000000000512","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"110.0000","dueOn":"2026-10-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000611','c1260000-0000-4000-8000-000000000711'
  )
$$,'P0001','CONTRACT_EXISTS','case 3: second contract for the same order is CONTRACT_EXISTS');

-- case 4 (second half): an order that already has a contract cannot be cancelled
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_cancel_order(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000351','{"expectedOrderVersion":1,"reason":"Doi y"}','c1260000-0000-4000-8000-000000000612','c1260000-0000-4000-8000-000000000712'
  )
$$,'P0001','VERSION_CONFLICT','case 4: buyer cannot cancel an order that already has a contract');

-- case 8: notifications of the recorded contract
set local role none;
select is((
  select count(*) from public.app_notifications as notification
  where notification.event_kind='material.contract.recorded' and notification.recipient_id='c1260000-0000-4000-8000-000000000904'
    and notification.source_id=(select id from public.material_contracts where order_id='c1260000-0000-4000-8000-000000000351')
    and notification.payload->>'total'='110.0000' and notification.payload->>'versionNo'='1'
),1::bigint,'case 8: finance reader gets one notification carrying the total');
select is((
  select count(*) from public.app_notifications as notification
  where notification.event_kind='material.contract.recorded' and notification.recipient_id='c1260000-0000-4000-8000-000000000902'
    and notification.source_id=(select id from public.material_contracts where order_id='c1260000-0000-4000-8000-000000000351')
    and notification.payload->>'contractNo'='HD-A' and not (notification.payload ? 'total')
),1::bigint,'case 8: buyer gets one notification without a total');
select is((
  select count(*) from public.app_notifications as notification
  where notification.event_kind='material.contract.recorded' and notification.recipient_id='c1260000-0000-4000-8000-000000000901'
    and notification.source_id=(select id from public.material_contracts where order_id='c1260000-0000-4000-8000-000000000351')
    and not (notification.payload ? 'total')
),1::bigint,'case 8: engineer gets one notification without a total');
select is((
  select notification.link_path from public.app_notifications as notification
  where notification.event_kind='material.contract.recorded' and notification.recipient_id='c1260000-0000-4000-8000-000000000901'
    and notification.source_id=(select id from public.material_contracts where order_id='c1260000-0000-4000-8000-000000000351')
),'/materials/c1260000-0000-4000-8000-000000000101/proposals/c1260000-0000-4000-8000-000000000301',
'case 8: the engineer (proposal creator) is linked to the proposal, not the order (20261015090600)');
select is((
  select count(*) from public.app_notifications as notification
  where notification.event_kind='material.contract.recorded' and notification.recipient_id='c1260000-0000-4000-8000-000000000903'
    and notification.source_id=(select id from public.material_contracts where order_id='c1260000-0000-4000-8000-000000000351')
),0::bigint,'case 8: the acting accountant is not notified');

-- case 5 (second half): a variance reason lets the contract be recorded
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select is((
  select result - 'resourceId'
  from (select public.c1_material_record_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000353',
    '{"expectedOrderVersion":1,"contractNo":"HD-C","signedOn":"2026-10-10","subtotal":"90.0000","vatAmount":"9.0000","total":"99.0000","varianceReason":"Giam gia theo hop dong","contractFileId":"c1260000-0000-4000-8000-000000000521","signedQuotationFileId":"c1260000-0000-4000-8000-000000000522","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"99.0000","dueOn":"2026-10-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000613','c1260000-0000-4000-8000-000000000713'
  ) as result) as recorded
),'{"version":1,"replayed":false}'::jsonb,'case 5: variance reason lets the contract be recorded');
set local role none;
select is((
  select count(*) from public.material_contract_versions as ver
  join public.material_contracts as contract on contract.id=ver.contract_id
  where contract.order_id='c1260000-0000-4000-8000-000000000353' and ver.subtotal=90 and ver.order_subtotal_snapshot=100
    and ver.variance_reason='Giam gia theo hop dong'
),1::bigint,'case 5: variance reason and order snapshot are stored on the version');

-- Fixtures for the amendment cases: amendment evidence scope, a recorded invoice,
-- a paid request of 30 on installment 1 and a pending request of 10 on installment 2.
insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,contract_id,evidence_role,created_by)
select 'c1260000-0000-4000-8000-000000000541','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_contract',contract.id,'contract_amendment','c1260000-0000-4000-8000-000000000903'
from public.material_contracts as contract where contract.order_id='c1260000-0000-4000-8000-000000000351';
insert into public.material_invoices(
  tenant_id,company_id,project_id,contract_id,supplier_id,invoice_symbol,invoice_no,issued_on,subtotal,vat_amount,total,file_id,recorded_by
)
select 'c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',contract.id,'c1260000-0000-4000-8000-000000000201','AA/26E','0000001','2026-10-11',80,0,80,'c1260000-0000-4000-8000-000000000551','c1260000-0000-4000-8000-000000000903'
from public.material_contracts as contract where contract.order_id='c1260000-0000-4000-8000-000000000351';
insert into public.material_payment_requests(
  id,tenant_id,company_id,project_id,contract_id,installment_key,amount,state,submitted_by,created_by
)
select request.id,'c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',contract.id,request.installment_key,request.amount,request.state,'c1260000-0000-4000-8000-000000000903','c1260000-0000-4000-8000-000000000903'
from public.material_contracts as contract
cross join (values
  ('c1260000-0000-4000-8000-000000000671'::uuid,'c1260000-0000-4000-8000-000000000a01'::uuid,30::numeric,'paid'),
  ('c1260000-0000-4000-8000-000000000672'::uuid,'c1260000-0000-4000-8000-000000000a02'::uuid,10::numeric,'submitted')
) as request(id,installment_key,amount,state)
where contract.order_id='c1260000-0000-4000-8000-000000000351';
insert into public.material_payments(
  tenant_id,company_id,project_id,payment_request_id,contract_id,installment_key,amount,paid_on,bank_reference,proof_file_id,proof_sha256,paid_by
)
select 'c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000671',contract.id,'c1260000-0000-4000-8000-000000000a01',30,'2026-10-12','FT0001','c1260000-0000-4000-8000-000000000561',repeat('6',64),'c1260000-0000-4000-8000-000000000903'
from public.material_contracts as contract where contract.order_id='c1260000-0000-4000-8000-000000000351';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000903","role":"authenticated"}',true);

-- case 9: amendments
select throws_ok($$
  select public.c1_material_amend_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',(select id from public.material_contracts where order_id='c1260000-0000-4000-8000-000000000351'),
    '{"expectedVersion":1,"subtotal":"100.0000","vatAmount":"10.0000","total":"110.0000","varianceReason":null,"amendmentFileId":"c1260000-0000-4000-8000-000000000541","reason":"Giam dot 1","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"20.0000","dueOn":"2026-10-10","isAdvance":true},{"installmentKey":"c1260000-0000-4000-8000-000000000a02","name":"Dot 2","amount":"40.0000","dueOn":"2026-11-10","isAdvance":false},{"installmentKey":"c1260000-0000-4000-8000-000000000a03","name":"Quyet toan","amount":"50.0000","dueOn":"2026-12-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000614','c1260000-0000-4000-8000-000000000714'
  )
$$,'P0001','AMENDMENT_BELOW_COMMITTED','case 9: lowering an installment below what was paid is AMENDMENT_BELOW_COMMITTED');
select throws_ok($$
  select public.c1_material_amend_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',(select id from public.material_contracts where order_id='c1260000-0000-4000-8000-000000000351'),
    '{"expectedVersion":1,"subtotal":"100.0000","vatAmount":"10.0000","total":"110.0000","varianceReason":null,"amendmentFileId":"c1260000-0000-4000-8000-000000000541","reason":"Bo dot 2","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"50.0000","dueOn":"2026-10-10","isAdvance":true},{"installmentKey":"c1260000-0000-4000-8000-000000000a03","name":"Quyet toan","amount":"60.0000","dueOn":"2026-12-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000615','c1260000-0000-4000-8000-000000000715'
  )
$$,'P0001','AMENDMENT_BELOW_COMMITTED','case 9: dropping an installment with a pending request is AMENDMENT_BELOW_COMMITTED');
select throws_ok($$
  select public.c1_material_amend_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',(select id from public.material_contracts where order_id='c1260000-0000-4000-8000-000000000351'),
    '{"expectedVersion":1,"subtotal":"79.0000","vatAmount":"0.0000","total":"79.0000","varianceReason":"Giam gia","amendmentFileId":"c1260000-0000-4000-8000-000000000541","reason":"Giam tong","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"50.0000","dueOn":"2026-10-10","isAdvance":true},{"installmentKey":"c1260000-0000-4000-8000-000000000a02","name":"Dot 2","amount":"20.0000","dueOn":"2026-11-10","isAdvance":false},{"installmentKey":"c1260000-0000-4000-8000-000000000a03","name":"Quyet toan","amount":"9.0000","dueOn":"2026-12-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000616','c1260000-0000-4000-8000-000000000716'
  )
$$,'P0001','INVOICE_TOTAL_EXCEEDED','case 9: a new total below the recorded invoices is INVOICE_TOTAL_EXCEEDED');

-- case 10: stale expected version
select throws_ok($$
  select public.c1_material_amend_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',(select id from public.material_contracts where order_id='c1260000-0000-4000-8000-000000000351'),
    '{"expectedVersion":5,"subtotal":"90.0000","vatAmount":"0.0000","total":"90.0000","varianceReason":"Giam gia","amendmentFileId":"c1260000-0000-4000-8000-000000000541","reason":"Bo quyet toan","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"50.0000","dueOn":"2026-10-10","isAdvance":true},{"installmentKey":"c1260000-0000-4000-8000-000000000a02","name":"Dot 2","amount":"40.0000","dueOn":"2026-11-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000617','c1260000-0000-4000-8000-000000000717'
  )
$$,'P0001','VERSION_CONFLICT','case 10: a stale expectedVersion is VERSION_CONFLICT');

-- case 9 success: dropping an untouched installment is allowed
select is((
  select result - 'resourceId'
  from (select public.c1_material_amend_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',(select id from public.material_contracts where order_id='c1260000-0000-4000-8000-000000000351'),
    '{"expectedVersion":1,"subtotal":"90.0000","vatAmount":"0.0000","total":"90.0000","varianceReason":"Giam gia","amendmentFileId":"c1260000-0000-4000-8000-000000000541","reason":"Bo quyet toan","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"50.0000","dueOn":"2026-10-10","isAdvance":true},{"installmentKey":"c1260000-0000-4000-8000-000000000a02","name":"Dot 2","amount":"40.0000","dueOn":"2026-11-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000618','c1260000-0000-4000-8000-000000000718'
  ) as result) as amended
),'{"version":2,"replayed":false}'::jsonb,'case 9: dropping an installment without payments succeeds');
select is((
  select result - 'resourceId'
  from (select public.c1_material_amend_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',(select id from public.material_contracts where order_id='c1260000-0000-4000-8000-000000000351'),
    '{"expectedVersion":1,"subtotal":"90.0000","vatAmount":"0.0000","total":"90.0000","varianceReason":"Giam gia","amendmentFileId":"c1260000-0000-4000-8000-000000000541","reason":"Bo quyet toan","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"50.0000","dueOn":"2026-10-10","isAdvance":true},{"installmentKey":"c1260000-0000-4000-8000-000000000a02","name":"Dot 2","amount":"40.0000","dueOn":"2026-11-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000618','c1260000-0000-4000-8000-000000000719'
  ) as result) as replayed
),'{"version":2,"replayed":true}'::jsonb,'case 10: amendment replay with the same key does not repeat');
select throws_ok($$
  select public.c1_material_amend_contract(
    'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',(select id from public.material_contracts where order_id='c1260000-0000-4000-8000-000000000351'),
    '{"expectedVersion":1,"subtotal":"90.0000","vatAmount":"0.0000","total":"90.0000","varianceReason":"Giam gia","amendmentFileId":"c1260000-0000-4000-8000-000000000541","reason":"Lan nua","installments":[{"installmentKey":"c1260000-0000-4000-8000-000000000a01","name":"Tam ung","amount":"50.0000","dueOn":"2026-10-10","isAdvance":true},{"installmentKey":"c1260000-0000-4000-8000-000000000a02","name":"Dot 2","amount":"40.0000","dueOn":"2026-11-10","isAdvance":false}]}',
    'c1260000-0000-4000-8000-000000000620','c1260000-0000-4000-8000-000000000720'
  )
$$,'P0001','VERSION_CONFLICT','case 10: amending with the previous version after a successful amendment is VERSION_CONFLICT');
set local role none;
select is((
  select current_version_no::text||'/'||version::text from public.material_contracts where order_id='c1260000-0000-4000-8000-000000000351'
),'2/2','case 9: amendment moves current_version_no and version to 2');
select is((
  select string_agg(item.seq::text||':'||item.installment_key::text||':'||item.amount::text, ',' order by item.seq)
  from public.material_contract_installments as item
  join public.material_contract_versions as ver on ver.id=item.contract_version_id and ver.version_no=2
  join public.material_contracts as contract on contract.id=ver.contract_id
  where contract.order_id='c1260000-0000-4000-8000-000000000351'
),'1:c1260000-0000-4000-8000-000000000a01:50.0000,2:c1260000-0000-4000-8000-000000000a02:40.0000','case 9: the amendment stores its own installment schedule');
select is((
  select count(*) from public.app_notifications as notification
  where notification.event_kind='material.contract.amended'
    and notification.dedupe_key='contract:'||(select id::text from public.material_contracts where order_id='c1260000-0000-4000-8000-000000000351')||':v2'
    and notification.recipient_id in ('c1260000-0000-4000-8000-000000000904','c1260000-0000-4000-8000-000000000902','c1260000-0000-4000-8000-000000000901')
),3::bigint,'case 10: amendment emits material.contract.amended with the versioned dedupe key');
select is((
  select count(*) from public.app_notifications as notification
  where notification.event_kind='material.contract.amended' and notification.recipient_id='c1260000-0000-4000-8000-000000000902'
    and notification.payload->>'versionNo'='2' and not (notification.payload ? 'total')
),1::bigint,'case 10: buyer amendment notification carries no total');

-- case 11: order reads
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select is((
  select jsonb_build_object('total',read_order->'contract'->>'total','cash',read_order->'cash')
  from (select public.c1_material_read_order('c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000351') as read_order) as q
),'{"total":"90.0000","cash":{"committed":"90.0000","paid":"30.0000","pending":"10.0000","remaining":"60.0000"}}'::jsonb,
'case 11: accountant order read shows the contract total and committed cash');
select is((
  select public.c1_material_read_order('c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000354')->'contract'
),'null'::jsonb,'case 11: order without a contract reads contract null');
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select is((
  select jsonb_build_object('contractNo',read_order->'contract'->>'contractNo','total',read_order->'contract'->'total','cash',read_order->'cash')
  from (select public.c1_material_read_order('c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000351') as read_order) as q
),'{"contractNo":"HD-A","total":null,"cash":null}'::jsonb,'case 11: buyer order read hides the contract total and cash');

-- read_contract
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000904","role":"authenticated"}',true);
select is((
  select jsonb_build_object(
    'current',facts->>'currentVersionNo','versions',jsonb_array_length(facts->'versions'),
    'invoiced',facts->>'invoiced','supplier',facts->>'supplierName',
    'installments',jsonb_array_length(facts->'installments'),
    'paid1',facts->'installments'->0->>'paid','pending2',facts->'installments'->1->>'pending')
  from (select public.c1_material_read_contract('c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000351') as facts) as q
),'{"current":"2","versions":2,"invoiced":"80.0000","supplier":"Supplier A","installments":2,"paid1":"30.0000","pending2":"10.0000"}'::jsonb,
'read_contract: facts hold both versions, the current schedule with paid and pending, and the invoiced total');
select ok(
  public.c1_material_read_contract('c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000354') is null,
  'read_contract: an order without a contract reads null'
);

-- Function privileges: only the three public wrappers are callable.
set local role none;
select ok(
  has_function_privilege('authenticated','public.c1_material_read_contract(uuid,uuid,uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.c1_material_amend_contract(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE'),
  'authenticated executes the three public contract wrappers'
);
select ok(
  not has_function_privilege('anon','public.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_record_contract(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_amend_contract(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_read_contract(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_require_contract_file(uuid,uuid,uuid,uuid,text,text,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_insert_installments(public.material_contracts,uuid,jsonb,numeric)','EXECUTE'),
  'private contract helpers are not callable by anon or authenticated'
);

select * from finish(true);
rollback;
