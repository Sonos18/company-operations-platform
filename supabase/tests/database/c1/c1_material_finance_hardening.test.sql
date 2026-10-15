begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(24);

-- A4/A5 T8 hardening (20261015090500). Rollback-only fixture with prefix c129.
-- Contract C1 (601) totals 110: installment A (advance, key a0a) 33 and B (key a0b) 77.
-- Contract C2 (602) totals 110 with one advance installment (key a0c); used for amendments.
-- Users: K (901) accountant, Q (902) treasurer, N (903) holds contract.record,
-- payment.request, payment.approve and payment.execute but NOT material.read, B (904) buyer.
-- Labels: "material.read:" (A), "notifications:" (C), "amend replay:" (D),
-- "finance evidence:" (F). The material.read case is table-driven: one throws_ok
-- per command row (9 rows).

insert into auth.users(id,email) values
('c1290000-0000-4000-8000-000000000901','hard-k@test.invalid'),
('c1290000-0000-4000-8000-000000000902','hard-q@test.invalid'),
('c1290000-0000-4000-8000-000000000903','hard-noread@test.invalid'),
('c1290000-0000-4000-8000-000000000904','hard-buyer@test.invalid');
insert into public.tenants(id,code,name)
values('c1290000-0000-4000-8000-000000000010','C1HARD','Material hardening tenant');
insert into public.companies(id,tenant_id,code,name)
values('c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000010','C1HARD','Material hardening company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select id,'c1290000-0000-4000-8000-000000000010',array['member']
from auth.users where id::text like 'c1290000-0000-4000-8000-00000000090_';
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select id,'c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020',array['member'],true
from auth.users where id::text like 'c1290000-0000-4000-8000-00000000090_';
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system)
select role_row.id,'c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020',role_row.code,role_row.code,'rollback fixture',false
from (values
 ('c1290000-0000-4000-8000-000000000911'::uuid,'hard_accountant'),
 ('c1290000-0000-4000-8000-000000000912'::uuid,'hard_treasurer'),
 ('c1290000-0000-4000-8000-000000000913'::uuid,'hard_no_read'),
 ('c1290000-0000-4000-8000-000000000914'::uuid,'hard_buyer')
) as role_row(id,code);
insert into public.role_permissions(role_id,permission_code) values
('c1290000-0000-4000-8000-000000000911','material.read'),
('c1290000-0000-4000-8000-000000000911','material.contract.record'),
('c1290000-0000-4000-8000-000000000911','material.payment.request'),
('c1290000-0000-4000-8000-000000000912','material.read'),
('c1290000-0000-4000-8000-000000000912','material.payment.approve'),
('c1290000-0000-4000-8000-000000000912','material.payment.execute'),
('c1290000-0000-4000-8000-000000000913','material.contract.record'),
('c1290000-0000-4000-8000-000000000913','material.payment.request'),
('c1290000-0000-4000-8000-000000000913','material.payment.approve'),
('c1290000-0000-4000-8000-000000000913','material.payment.execute'),
('c1290000-0000-4000-8000-000000000914','material.read'),
('c1290000-0000-4000-8000-000000000914','material.order.manage');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason)
select 'c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020',assignment.user_id,assignment.role_id,
  'c1290000-0000-4000-8000-000000000901','rollback fixture'
from (values
 ('c1290000-0000-4000-8000-000000000901'::uuid,'c1290000-0000-4000-8000-000000000911'::uuid),
 ('c1290000-0000-4000-8000-000000000902'::uuid,'c1290000-0000-4000-8000-000000000912'::uuid),
 ('c1290000-0000-4000-8000-000000000903'::uuid,'c1290000-0000-4000-8000-000000000913'::uuid),
 ('c1290000-0000-4000-8000-000000000904'::uuid,'c1290000-0000-4000-8000-000000000914'::uuid)
) as assignment(user_id,role_id);
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000010',true,'c1290000-0000-4000-8000-000000000901');
insert into public.projects(id,tenant_id,company_id,code,name,operational_state,origin,created_by)
values('c1290000-0000-4000-8000-000000000101','c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','HARD-P','Hardening project','active','manual','c1290000-0000-4000-8000-000000000901');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c1290000-0000-4000-8000-000000000201','c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','HARD-S','Hardening supplier','organization','c1290000-0000-4000-8000-000000000904');
insert into public.material_items(id,tenant_id,company_id,code,name,specification,unit,created_by) values
('c1290000-0000-4000-8000-000000000251','c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','HARD-STEEL','Steel','D10','kg','c1290000-0000-4000-8000-000000000904');
insert into public.material_proposals(id,tenant_id,company_id,project_id,needed_on,delivery_address,created_by)
values('c1290000-0000-4000-8000-000000000301','c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101','2026-10-30','Site A','c1290000-0000-4000-8000-000000000904');
insert into public.material_proposal_lines(id,tenant_id,company_id,project_id,proposal_id,material_id,quantity,created_by)
values('c1290000-0000-4000-8000-000000000311','c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101',
  'c1290000-0000-4000-8000-000000000301','c1290000-0000-4000-8000-000000000251',10,'c1290000-0000-4000-8000-000000000904');
insert into public.material_proposal_revisions(id,tenant_id,company_id,project_id,proposal_id,revision_no,needed_on,delivery_address,submitted_by)
values('c1290000-0000-4000-8000-000000000401','c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101','c1290000-0000-4000-8000-000000000301',1,'2026-10-30','Site A','c1290000-0000-4000-8000-000000000904');
insert into public.material_proposal_revision_lines(revision_id,proposal_line_id,proposal_id,tenant_id,company_id,project_id,material_id,material_name,specification,unit,quantity)
values('c1290000-0000-4000-8000-000000000401','c1290000-0000-4000-8000-000000000311','c1290000-0000-4000-8000-000000000301',
  'c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101',
  'c1290000-0000-4000-8000-000000000251','Material','Spec','unit',10);
update public.material_proposals
set review_state='approved',current_revision_id='c1290000-0000-4000-8000-000000000401',approved_revision_id='c1290000-0000-4000-8000-000000000401'
where id='c1290000-0000-4000-8000-000000000301';

-- Finalized files: 501 unsigned quotation, 502-505 contract and signed quotation
-- files of C1/C2, 541/542 amendments of C2, 521 transfer proof of C1.
insert into public.cost_evidence_files(
 id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
 verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version
)
select
 file.id,'c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101',
 'c1290000-0000-4000-8000-000000000010/c1290000-0000-4000-8000-000000000020/c1290000-0000-4000-8000-000000000101/'||file.id::text,
 'file-'||file.hash_seed||'.pdf','application/pdf',8,lpad(to_hex(file.hash_seed),64,'0'),'application/pdf',8,lpad(to_hex(file.hash_seed),64,'0'),'finalized',
 now()+interval '15 minutes','c1290000-0000-4000-8000-000000000901','c1290000-0000-4000-8000-000000000901',now(),1
from (values
 ('c1290000-0000-4000-8000-000000000501'::uuid,1501),
 ('c1290000-0000-4000-8000-000000000502'::uuid,1502),
 ('c1290000-0000-4000-8000-000000000503'::uuid,1503),
 ('c1290000-0000-4000-8000-000000000504'::uuid,1504),
 ('c1290000-0000-4000-8000-000000000505'::uuid,1505),
 ('c1290000-0000-4000-8000-000000000521'::uuid,1521),
 ('c1290000-0000-4000-8000-000000000541'::uuid,1541),
 ('c1290000-0000-4000-8000-000000000542'::uuid,1542)
) as file(id,hash_seed);
-- Pending payment proofs: 551 uploaded by the accountant, 552 by the treasurer.
insert into public.cost_evidence_files(
 id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
 status,intent_expires_at,created_by
)
select
 file.id,'c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101',
 'c1290000-0000-4000-8000-000000000010/c1290000-0000-4000-8000-000000000020/c1290000-0000-4000-8000-000000000101/'||file.id::text,
 'proof-'||file.hash_seed||'.pdf','application/pdf',8,lpad(to_hex(file.hash_seed),64,'0'),
 'pending_upload',now()+interval '15 minutes',file.created_by
from (values
 ('c1290000-0000-4000-8000-000000000551'::uuid,1551,'c1290000-0000-4000-8000-000000000901'::uuid),
 ('c1290000-0000-4000-8000-000000000552'::uuid,1552,'c1290000-0000-4000-8000-000000000902'::uuid)
) as file(id,hash_seed,created_by);

insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
)
select order_row.id,'c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101',
  'c1290000-0000-4000-8000-000000000301','c1290000-0000-4000-8000-000000000401','c1290000-0000-4000-8000-000000000201','VND',
  'c1290000-0000-4000-8000-000000000501','c1290000-0000-4000-8000-000000000904'
from (values
 ('c1290000-0000-4000-8000-000000000351'::uuid),
 ('c1290000-0000-4000-8000-000000000352'::uuid)
) as order_row(id);
insert into public.material_order_allocations(
  id,tenant_id,company_id,project_id,order_id,proposal_id,approved_revision_id,proposal_line_id,quantity,unit_price,quotation_material_name,mapping_confirmed
)
select allocation.id,'c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101',
  allocation.order_id,'c1290000-0000-4000-8000-000000000301','c1290000-0000-4000-8000-000000000401','c1290000-0000-4000-8000-000000000311',
  1,100,'Quoted material',true
from (values
 ('c1290000-0000-4000-8000-000000000361'::uuid,'c1290000-0000-4000-8000-000000000351'::uuid),
 ('c1290000-0000-4000-8000-000000000362'::uuid,'c1290000-0000-4000-8000-000000000352'::uuid)
) as allocation(id,order_id);

insert into public.material_contracts(id,tenant_id,company_id,project_id,order_id,supplier_id,currency_code,contract_no,signed_on,created_by)
select contract.id,'c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101',
  contract.order_id,'c1290000-0000-4000-8000-000000000201','VND',contract.contract_no,'2026-01-05','c1290000-0000-4000-8000-000000000901'
from (values
 ('c1290000-0000-4000-8000-000000000601'::uuid,'c1290000-0000-4000-8000-000000000351'::uuid,'HD-HARD-01'),
 ('c1290000-0000-4000-8000-000000000602'::uuid,'c1290000-0000-4000-8000-000000000352'::uuid,'HD-HARD-02')
) as contract(id,order_id,contract_no);
insert into public.material_contract_versions(
  id,tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
  order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
)
select version_row.id,'c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101',
  version_row.contract_id,1,'original',100,10,110,100,null,
  version_row.contract_file_id,version_row.quotation_file_id,null,'c1290000-0000-4000-8000-000000000901'
from (values
 ('c1290000-0000-4000-8000-000000000611'::uuid,'c1290000-0000-4000-8000-000000000601'::uuid,'c1290000-0000-4000-8000-000000000502'::uuid,'c1290000-0000-4000-8000-000000000503'::uuid),
 ('c1290000-0000-4000-8000-000000000621'::uuid,'c1290000-0000-4000-8000-000000000602'::uuid,'c1290000-0000-4000-8000-000000000504'::uuid,'c1290000-0000-4000-8000-000000000505'::uuid)
) as version_row(id,contract_id,contract_file_id,quotation_file_id);
insert into public.material_contract_installments(
  tenant_id,company_id,project_id,contract_id,contract_version_id,seq,installment_key,name,amount,due_on,is_advance
)
select 'c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101',
  installment.contract_id,installment.version_id,installment.seq,installment.installment_key,installment.name,installment.amount,'2026-12-01',installment.is_advance
from (values
 ('c1290000-0000-4000-8000-000000000601'::uuid,'c1290000-0000-4000-8000-000000000611'::uuid,1,'c1290000-0000-4000-8000-000000000a0a'::uuid,'Tam ung A',33,true),
 ('c1290000-0000-4000-8000-000000000601'::uuid,'c1290000-0000-4000-8000-000000000611'::uuid,2,'c1290000-0000-4000-8000-000000000a0b'::uuid,'Dot B',77,false),
 ('c1290000-0000-4000-8000-000000000602'::uuid,'c1290000-0000-4000-8000-000000000621'::uuid,1,'c1290000-0000-4000-8000-000000000a0c'::uuid,'Tam ung C',110,true)
) as installment(contract_id,version_id,seq,installment_key,name,amount,is_advance);

insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,contract_id,evidence_role,created_by)
select scope.file_id,'c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101',
  'material_contract',scope.contract_id,scope.evidence_role,scope.created_by
from (values
 ('c1290000-0000-4000-8000-000000000521'::uuid,'c1290000-0000-4000-8000-000000000601'::uuid,'payment_proof','c1290000-0000-4000-8000-000000000902'::uuid),
 ('c1290000-0000-4000-8000-000000000541'::uuid,'c1290000-0000-4000-8000-000000000602'::uuid,'contract_amendment','c1290000-0000-4000-8000-000000000901'::uuid),
 ('c1290000-0000-4000-8000-000000000542'::uuid,'c1290000-0000-4000-8000-000000000602'::uuid,'contract_amendment','c1290000-0000-4000-8000-000000000901'::uuid),
 ('c1290000-0000-4000-8000-000000000551'::uuid,'c1290000-0000-4000-8000-000000000601'::uuid,'payment_proof','c1290000-0000-4000-8000-000000000901'::uuid),
 ('c1290000-0000-4000-8000-000000000552'::uuid,'c1290000-0000-4000-8000-000000000601'::uuid,'payment_proof','c1290000-0000-4000-8000-000000000902'::uuid)
) as scope(file_id,contract_id,evidence_role,created_by);

create temporary table t8_acks(name text primary key, body jsonb not null);
create temporary table t8_inputs(name text primary key, body jsonb not null);
insert into t8_inputs values
('AMEND_A','{"expectedVersion":1,"subtotal":"100.0000","vatAmount":"10.0000","total":"110.0000","varianceReason":null,"amendmentFileId":"c1290000-0000-4000-8000-000000000541","reason":"Phu luc 1","installments":[{"installmentKey":"c1290000-0000-4000-8000-000000000a0c","name":"Tam ung C","amount":"110.0000","dueOn":"2026-12-05","isAdvance":true}]}'),
('AMEND_B','{"expectedVersion":2,"subtotal":"100.0000","vatAmount":"10.0000","total":"110.0000","varianceReason":null,"amendmentFileId":"c1290000-0000-4000-8000-000000000542","reason":"Phu luc 2","installments":[{"installmentKey":"c1290000-0000-4000-8000-000000000a0c","name":"Tam ung C","amount":"110.0000","dueOn":"2026-12-10","isAdvance":true}]}');
grant select,insert on t8_acks,t8_inputs to authenticated;

-- A: material.read is required by every A4/A5 write ------------------------------
select ok(
  private.c1_workflow_user_has_permission('c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000903','material.contract.record')
    and private.c1_workflow_user_has_permission('c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000903','material.payment.request')
    and private.c1_workflow_user_has_permission('c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000903','material.payment.approve')
    and private.c1_workflow_user_has_permission('c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000903','material.payment.execute')
    and not private.c1_workflow_user_has_permission('c1290000-0000-4000-8000-000000000010','c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000903','material.read'),
  'material.read: fixture user N holds every A4/A5 command permission but not material.read'
);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1290000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok(format($$select public.%s('c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101',%L,%L,'c1290000-0000-4000-8000-000000000d91','c1290000-0000-4000-8000-000000000c00')$$,
  command.name, command.target_id, command.body),'P0001','PERMISSION_DENIED','material.read: user without material.read denied '||command.name)
from (values
 ('c1_material_record_invoice','c1290000-0000-4000-8000-000000000601','{"invoiceSymbol":"X","invoiceNo":"1","issuedOn":"2026-01-10","subtotal":"1","vatAmount":"0","total":"1","fileId":"c1290000-0000-4000-8000-000000000521","lines":[]}'),
 ('c1_material_void_invoice','c1290000-0000-4000-8000-000000000601','{"expectedVersion":1,"reason":"x"}'),
 ('c1_material_create_payment_request','c1290000-0000-4000-8000-000000000601','{"installmentKey":"c1290000-0000-4000-8000-000000000a0a","amount":"1","invoiceIds":[],"note":null}'),
 ('c1_material_resubmit_payment_request','c1290000-0000-4000-8000-000000000601','{"expectedVersion":1,"amount":"1","invoiceIds":[],"note":null}'),
 ('c1_material_cancel_payment_request','c1290000-0000-4000-8000-000000000601','{"expectedVersion":1,"reason":"x"}'),
 ('c1_material_decide_payment_request','c1290000-0000-4000-8000-000000000601','{"expectedVersion":1,"decision":"approve"}'),
 ('c1_material_record_payment','c1290000-0000-4000-8000-000000000601','{"expectedVersion":1,"paidOn":"2026-01-12","bankReference":"x","proofFileId":"c1290000-0000-4000-8000-000000000521"}'),
 ('c1_material_record_contract','c1290000-0000-4000-8000-000000000351','{"expectedOrderVersion":1,"contractNo":"HD-X","signedOn":"2026-01-05","subtotal":"100","vatAmount":"10","total":"110","varianceReason":null,"contractFileId":"c1290000-0000-4000-8000-000000000502","signedQuotationFileId":"c1290000-0000-4000-8000-000000000503","installments":[]}'),
 ('c1_material_amend_contract','c1290000-0000-4000-8000-000000000602',(select body::text from t8_inputs where name='AMEND_A'))
) as command(name,target_id,body);

-- C: no money in notifications addressed to the submitter by user id ------------
select set_config('request.jwt.claims','{"sub":"c1290000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into t8_acks select 'R1', public.c1_material_create_payment_request(
  'c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101','c1290000-0000-4000-8000-000000000601',
  '{"installmentKey":"c1290000-0000-4000-8000-000000000a0a","amount":"20","invoiceIds":[],"note":null}',
  'c1290000-0000-4000-8000-000000000d11','c1290000-0000-4000-8000-000000000c00');
select set_config('request.jwt.claims','{"sub":"c1290000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into t8_acks select 'R1_return', public.c1_material_decide_payment_request(
  'c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t8_acks where name='R1'),
  '{"expectedVersion":1,"decision":"return","reason":"Thieu chung tu"}','c1290000-0000-4000-8000-000000000d12','c1290000-0000-4000-8000-000000000c00');
select set_config('request.jwt.claims','{"sub":"c1290000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into t8_acks select 'R1_resubmit', public.c1_material_resubmit_payment_request(
  'c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t8_acks where name='R1'),
  '{"expectedVersion":2,"amount":"20","invoiceIds":[],"note":"Gui lai"}','c1290000-0000-4000-8000-000000000d13','c1290000-0000-4000-8000-000000000c00');
select set_config('request.jwt.claims','{"sub":"c1290000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into t8_acks select 'R1_approve', public.c1_material_decide_payment_request(
  'c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t8_acks where name='R1'),
  '{"expectedVersion":3,"decision":"approve"}','c1290000-0000-4000-8000-000000000d14','c1290000-0000-4000-8000-000000000c00');
insert into t8_acks select 'R1_pay', public.c1_material_record_payment(
  'c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t8_acks where name='R1'),
  '{"expectedVersion":4,"paidOn":"2026-01-12","bankReference":"UNC-H01","proofFileId":"c1290000-0000-4000-8000-000000000521"}',
  'c1290000-0000-4000-8000-000000000d15','c1290000-0000-4000-8000-000000000c00');
set local role none;
select is((
  select state||':'||version::text from public.material_payment_requests where id=(select (body->>'resourceId')::uuid from t8_acks where name='R1')
),'paid:5','notifications: request is returned, resubmitted, approved and paid');
select is((
  select payload from public.app_notifications
  where recipient_id='c1290000-0000-4000-8000-000000000901'
    and event_kind='material.payment.returned'
    and dedupe_key='pr:'||(select body->>'resourceId' from t8_acks where name='R1')||':ret:1'
),'{"supplierName":"Hardening supplier","contractNo":"HD-HARD-01","reason":"Thieu chung tu"}'::jsonb,
'notifications: returned payload carries supplier, contract and reason');
select ok((
  select bool_and(not (payload ? 'amount')) and count(*) = 1 from public.app_notifications
  where event_kind='material.payment.returned'
    and source_id=(select (body->>'resourceId')::uuid from t8_acks where name='R1')
),'notifications: returned payload has no amount key');
select is((
  select payload from public.app_notifications
  where recipient_id='c1290000-0000-4000-8000-000000000901'
    and event_kind='material.payment.paid'
    and dedupe_key='pr:'||(select body->>'resourceId' from t8_acks where name='R1')||':paid'
),'{"supplierName":"Hardening supplier","contractNo":"HD-HARD-01"}'::jsonb,
'notifications: paid payload carries supplier and contract only');
select ok((
  select bool_and(not (payload ? 'amount')) and count(*) = 1 from public.app_notifications
  where event_kind='material.payment.paid'
    and source_id=(select (body->>'resourceId')::uuid from t8_acks where name='R1')
),'notifications: paid payload has no amount key');
select is((
  select payload->>'amount' from public.app_notifications
  where recipient_id='c1290000-0000-4000-8000-000000000902'
    and event_kind='material.payment.submitted'
    and dedupe_key='pr:'||(select body->>'resourceId' from t8_acks where name='R1')||':sub:2'
),'20.0000','notifications: submitted payload for approvers keeps the request amount');

-- D: an amendment replay answers with the version its key produced ---------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1290000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into t8_acks select 'AMEND_A', public.c1_material_amend_contract(
  'c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101','c1290000-0000-4000-8000-000000000602',
  (select body from t8_inputs where name='AMEND_A'),'c1290000-0000-4000-8000-000000000e01','c1290000-0000-4000-8000-000000000c00');
insert into t8_acks select 'AMEND_B', public.c1_material_amend_contract(
  'c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101','c1290000-0000-4000-8000-000000000602',
  (select body from t8_inputs where name='AMEND_B'),'c1290000-0000-4000-8000-000000000e02','c1290000-0000-4000-8000-000000000c00');
select is(
  (select body - 'resourceId' from t8_acks where name='AMEND_A'),
  '{"version":2,"replayed":false}'::jsonb,
  'amend replay: amendment A (key K) moves the contract to version 2'
);
select is(
  (select body - 'resourceId' from t8_acks where name='AMEND_B'),
  '{"version":3,"replayed":false}'::jsonb,
  'amend replay: amendment B moves the contract to version 3'
);
select is(
  public.c1_material_amend_contract(
    'c1290000-0000-4000-8000-000000000020','c1290000-0000-4000-8000-000000000101','c1290000-0000-4000-8000-000000000602',
    (select body from t8_inputs where name='AMEND_A'),'c1290000-0000-4000-8000-000000000e01','c1290000-0000-4000-8000-000000000c00') - 'resourceId',
  '{"version":2,"replayed":true}'::jsonb,
  'amend replay: replaying key K returns version 2, not the current version 3'
);

-- F: finance evidence finalize per role and contract-level scope visibility -----
set local role none;
set local role service_role;
select set_config('request.jwt.claims','{"sub":"c1290000-0000-4000-8000-000000000901","role":"service_role"}',true);
select throws_ok($$
  select public.c1_finalize_material_evidence_server(
    'c1290000-0000-4000-8000-000000000901','c1290000-0000-4000-8000-000000000020',
    'c1290000-0000-4000-8000-000000000101','c1290000-0000-4000-8000-000000000551',
    '{"expectedVersion":0,"mimeType":"application/pdf","sizeBytes":8,"sha256":"000000000000000000000000000000000000000000000000000000000000060f"}',
    'c1290000-0000-4000-8000-000000000f01','c1290000-0000-4000-8000-000000000c00'
  )
$$,'P0001','PERMISSION_DENIED','finance evidence: accountant without material.payment.execute cannot finalize a payment proof');
select set_config('request.jwt.claims','{"sub":"c1290000-0000-4000-8000-000000000902","role":"service_role"}',true);
select is((public.c1_finalize_material_evidence_server(
  'c1290000-0000-4000-8000-000000000902','c1290000-0000-4000-8000-000000000020',
  'c1290000-0000-4000-8000-000000000101','c1290000-0000-4000-8000-000000000552',
  '{"expectedVersion":0,"mimeType":"application/pdf","sizeBytes":8,"sha256":"0000000000000000000000000000000000000000000000000000000000000610"}'::jsonb,
  'c1290000-0000-4000-8000-000000000f02','c1290000-0000-4000-8000-000000000c00'
)->>'status'),'finalized','finance evidence: treasurer finalizes a payment proof');
set local role none;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1290000-0000-4000-8000-000000000904","role":"authenticated"}',true);
select is((
  select count(*) from public.material_evidence_scopes where target_kind='material_contract'
),0::bigint,'finance evidence: buyer sees no contract-level evidence scope rows');
select set_config('request.jwt.claims','{"sub":"c1290000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is((
  select count(*) from public.material_evidence_scopes
  where target_kind='material_contract' and project_id='c1290000-0000-4000-8000-000000000101'
),5::bigint,'finance evidence: accountant sees all five contract-level evidence scope rows');
set local role none;
select ok((
  select 'application/octet-stream' = any(allowed_mime_types)
    and not ('application/xml' = any(allowed_mime_types))
    and not ('text/xml' = any(allowed_mime_types))
    and 'application/pdf' = any(allowed_mime_types)
  from storage.buckets where id = 'c1-accounting-evidence'
),'finance evidence: the evidence bucket stores XML only as octet-stream and keeps PDF');

select * from finish(true);
rollback;
