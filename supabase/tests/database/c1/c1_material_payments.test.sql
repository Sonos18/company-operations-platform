begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(70);

-- A5 payment commands. Rollback-only fixture with prefix c127.
-- Contract C1 (601) totals 110: installment A (advance, key a0a) 33 and B (key a0b) 77.
-- Contract C2 (602) totals 1000 for the same supplier (duplicate invoice identity, supplier names).
-- Contract C3 (603) has installments C (a0d) 40 and D (a0e) 60; an amendment later drops C.
-- Users: K1 (901) and K2 (902) accountants, Q (903) treasurer with approve and execute,
-- KQ (904) with request and approve, B (905) buyer.
-- Contracts and amendments are written directly as the fixture owner so this suite
-- does not depend on the T1 contract commands; invoice and proof files rely on
-- private.c1_material_require_contract_file from 20261015090100.

select ok(
  has_function_privilege('authenticated',signature,'EXECUTE'),
  'authenticated executes '||signature
)
from unnest(array[
  'public.c1_material_record_invoice(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_void_invoice(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_create_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_resubmit_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_cancel_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_decide_payment_request(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_record_payment(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_list_invoices(uuid,uuid,uuid)',
  'public.c1_material_list_payment_requests(uuid,uuid,uuid)'
]) as listed(signature);
select ok(
  not has_function_privilege('authenticated','private.c1_material_require_capacity(public.material_contracts,uuid,numeric,uuid)','EXECUTE')
    and not has_function_privilege('authenticated','private.c1_material_record_payment(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
    and not has_function_privilege('anon','public.c1_material_record_payment(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE'),
  'private payment helpers and anonymous callers are denied'
);

insert into auth.users(id,email) values
('c1270000-0000-4000-8000-000000000901','pay-k1@test.invalid'),
('c1270000-0000-4000-8000-000000000902','pay-k2@test.invalid'),
('c1270000-0000-4000-8000-000000000903','pay-q@test.invalid'),
('c1270000-0000-4000-8000-000000000904','pay-kq@test.invalid'),
('c1270000-0000-4000-8000-000000000905','pay-buyer@test.invalid');
insert into public.tenants(id,code,name)
values('c1270000-0000-4000-8000-000000000010','C1PAY','Material payment tenant');
insert into public.companies(id,tenant_id,code,name)
values('c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000010','C1PAY','Material payment company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select id,'c1270000-0000-4000-8000-000000000010',array['member']
from auth.users where id::text like 'c1270000-0000-4000-8000-00000000090_';
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select id,'c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020',array['member'],true
from auth.users where id::text like 'c1270000-0000-4000-8000-00000000090_';
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system)
select role_row.id,'c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020',role_row.code,role_row.code,'rollback fixture',false
from (values
 ('c1270000-0000-4000-8000-000000000911'::uuid,'pay_accountant'),
 ('c1270000-0000-4000-8000-000000000913'::uuid,'pay_treasurer'),
 ('c1270000-0000-4000-8000-000000000914'::uuid,'pay_request_approve'),
 ('c1270000-0000-4000-8000-000000000915'::uuid,'pay_buyer'),
 ('c1270000-0000-4000-8000-000000000916'::uuid,'pay_extra_approver'),
 ('c1270000-0000-4000-8000-000000000917'::uuid,'pay_extra_executor')
) as role_row(id,code);
insert into public.role_permissions(role_id,permission_code) values
('c1270000-0000-4000-8000-000000000911','material.read'),
('c1270000-0000-4000-8000-000000000911','material.contract.record'),
('c1270000-0000-4000-8000-000000000911','material.payment.request'),
('c1270000-0000-4000-8000-000000000913','material.read'),
('c1270000-0000-4000-8000-000000000913','material.payment.approve'),
('c1270000-0000-4000-8000-000000000913','material.payment.execute'),
('c1270000-0000-4000-8000-000000000914','material.read'),
('c1270000-0000-4000-8000-000000000914','material.payment.request'),
('c1270000-0000-4000-8000-000000000914','material.payment.approve'),
('c1270000-0000-4000-8000-000000000915','material.read'),
('c1270000-0000-4000-8000-000000000915','material.order.manage'),
('c1270000-0000-4000-8000-000000000916','material.read'),
('c1270000-0000-4000-8000-000000000916','material.payment.approve'),
('c1270000-0000-4000-8000-000000000917','material.read'),
('c1270000-0000-4000-8000-000000000917','material.payment.execute');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason)
select 'c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020',assignment.user_id,assignment.role_id,
  'c1270000-0000-4000-8000-000000000901','rollback fixture'
from (values
 ('c1270000-0000-4000-8000-000000000901'::uuid,'c1270000-0000-4000-8000-000000000911'::uuid),
 ('c1270000-0000-4000-8000-000000000902'::uuid,'c1270000-0000-4000-8000-000000000911'::uuid),
 ('c1270000-0000-4000-8000-000000000903'::uuid,'c1270000-0000-4000-8000-000000000913'::uuid),
 ('c1270000-0000-4000-8000-000000000904'::uuid,'c1270000-0000-4000-8000-000000000914'::uuid),
 ('c1270000-0000-4000-8000-000000000905'::uuid,'c1270000-0000-4000-8000-000000000915'::uuid)
) as assignment(user_id,role_id);
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000010',true,'c1270000-0000-4000-8000-000000000901');
insert into public.projects(id,tenant_id,company_id,code,name,operational_state,origin,created_by)
values('c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','PAY-P','Payment project','active','manual','c1270000-0000-4000-8000-000000000901');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c1270000-0000-4000-8000-000000000201','c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','PAY-S','Payment supplier','organization','c1270000-0000-4000-8000-000000000905');
insert into public.material_items(id,tenant_id,company_id,code,name,specification,unit,created_by) values
('c1270000-0000-4000-8000-000000000251','c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','PAY-STEEL','Steel','D10','kg','c1270000-0000-4000-8000-000000000905'),
('c1270000-0000-4000-8000-000000000252','c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','PAY-CEMENT','Cement','PCB40','bag','c1270000-0000-4000-8000-000000000905');
insert into public.material_proposals(id,tenant_id,company_id,project_id,needed_on,delivery_address,created_by)
values('c1270000-0000-4000-8000-000000000301','c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','2026-10-30','Site A','c1270000-0000-4000-8000-000000000905');
insert into public.material_proposal_lines(id,tenant_id,company_id,project_id,proposal_id,material_id,quantity,created_by)
select line.id,'c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',
  'c1270000-0000-4000-8000-000000000301',line.material_id,10,'c1270000-0000-4000-8000-000000000905'
from (values
 ('c1270000-0000-4000-8000-000000000311'::uuid,'c1270000-0000-4000-8000-000000000251'::uuid),
 ('c1270000-0000-4000-8000-000000000312'::uuid,'c1270000-0000-4000-8000-000000000252'::uuid),
 ('c1270000-0000-4000-8000-000000000313'::uuid,'c1270000-0000-4000-8000-000000000251'::uuid)
) as line(id,material_id);
insert into public.material_proposal_revisions(id,tenant_id,company_id,project_id,proposal_id,revision_no,needed_on,delivery_address,submitted_by)
values('c1270000-0000-4000-8000-000000000401','c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000301',1,'2026-10-30','Site A','c1270000-0000-4000-8000-000000000905');
insert into public.material_proposal_revision_lines(revision_id,proposal_line_id,proposal_id,tenant_id,company_id,project_id,material_id,material_name,specification,unit,quantity)
select 'c1270000-0000-4000-8000-000000000401',line.id,'c1270000-0000-4000-8000-000000000301',
  'c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',
  line.material_id,'Material','Spec','unit',10
from public.material_proposal_lines as line where line.proposal_id='c1270000-0000-4000-8000-000000000301';
update public.material_proposals
set review_state='approved',current_revision_id='c1270000-0000-4000-8000-000000000401',approved_revision_id='c1270000-0000-4000-8000-000000000401'
where id='c1270000-0000-4000-8000-000000000301';

insert into public.cost_evidence_files(
 id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
 verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version
)
select
 file.id,'c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',
 'c1270000-0000-4000-8000-000000000010/c1270000-0000-4000-8000-000000000020/c1270000-0000-4000-8000-000000000101/'||file.id::text,
 'file-'||file.hash_seed||'.pdf','application/pdf',8,lpad(to_hex(file.hash_seed),64,'0'),'application/pdf',8,lpad(to_hex(file.hash_seed),64,'0'),'finalized',
 now()+interval '15 minutes','c1270000-0000-4000-8000-000000000901','c1270000-0000-4000-8000-000000000901',now(),1
from (values
 ('c1270000-0000-4000-8000-000000000501'::uuid,501),
 ('c1270000-0000-4000-8000-000000000502'::uuid,502),
 ('c1270000-0000-4000-8000-000000000503'::uuid,503),
 ('c1270000-0000-4000-8000-000000000504'::uuid,504),
 ('c1270000-0000-4000-8000-000000000505'::uuid,505),
 ('c1270000-0000-4000-8000-000000000506'::uuid,506),
 ('c1270000-0000-4000-8000-000000000507'::uuid,507),
 ('c1270000-0000-4000-8000-000000000508'::uuid,508),
 ('c1270000-0000-4000-8000-000000000511'::uuid,511),
 ('c1270000-0000-4000-8000-000000000512'::uuid,512),
 ('c1270000-0000-4000-8000-000000000513'::uuid,513),
 ('c1270000-0000-4000-8000-000000000514'::uuid,514),
 ('c1270000-0000-4000-8000-000000000515'::uuid,515),
 ('c1270000-0000-4000-8000-000000000521'::uuid,521),
 -- 522 is a different file carrying the same transfer proof bytes as 521.
 ('c1270000-0000-4000-8000-000000000522'::uuid,521),
 ('c1270000-0000-4000-8000-000000000523'::uuid,523),
 ('c1270000-0000-4000-8000-000000000524'::uuid,524)
) as file(id,hash_seed);

insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
)
select order_row.id,'c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',
  'c1270000-0000-4000-8000-000000000301','c1270000-0000-4000-8000-000000000401','c1270000-0000-4000-8000-000000000201','VND',
  'c1270000-0000-4000-8000-000000000501','c1270000-0000-4000-8000-000000000905'
from (values
 ('c1270000-0000-4000-8000-000000000351'::uuid),
 ('c1270000-0000-4000-8000-000000000352'::uuid),
 ('c1270000-0000-4000-8000-000000000353'::uuid)
) as order_row(id);
insert into public.material_order_allocations(
  id,tenant_id,company_id,project_id,order_id,proposal_id,approved_revision_id,proposal_line_id,quantity,unit_price,quotation_material_name,mapping_confirmed
)
select allocation.id,'c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',
  allocation.order_id,'c1270000-0000-4000-8000-000000000301','c1270000-0000-4000-8000-000000000401',allocation.line_id,
  1,allocation.unit_price,'Quoted material',true
from (values
 ('c1270000-0000-4000-8000-000000000361'::uuid,'c1270000-0000-4000-8000-000000000351'::uuid,'c1270000-0000-4000-8000-000000000311'::uuid,60),
 ('c1270000-0000-4000-8000-000000000362'::uuid,'c1270000-0000-4000-8000-000000000351'::uuid,'c1270000-0000-4000-8000-000000000312'::uuid,40),
 ('c1270000-0000-4000-8000-000000000363'::uuid,'c1270000-0000-4000-8000-000000000352'::uuid,'c1270000-0000-4000-8000-000000000311'::uuid,1000),
 ('c1270000-0000-4000-8000-000000000364'::uuid,'c1270000-0000-4000-8000-000000000353'::uuid,'c1270000-0000-4000-8000-000000000311'::uuid,100)
) as allocation(id,order_id,line_id,unit_price);

insert into public.material_contracts(id,tenant_id,company_id,project_id,order_id,supplier_id,currency_code,contract_no,signed_on,created_by)
select contract.id,'c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',
  contract.order_id,'c1270000-0000-4000-8000-000000000201','VND',contract.contract_no,'2026-01-05','c1270000-0000-4000-8000-000000000901'
from (values
 ('c1270000-0000-4000-8000-000000000601'::uuid,'c1270000-0000-4000-8000-000000000351'::uuid,'HD-PAY-01'),
 ('c1270000-0000-4000-8000-000000000602'::uuid,'c1270000-0000-4000-8000-000000000352'::uuid,'HD-PAY-02'),
 ('c1270000-0000-4000-8000-000000000603'::uuid,'c1270000-0000-4000-8000-000000000353'::uuid,'HD-PAY-03')
) as contract(id,order_id,contract_no);
insert into public.material_contract_versions(
  id,tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
  order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
)
select version_row.id,'c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',
  version_row.contract_id,1,'original',version_row.subtotal,version_row.vat,version_row.subtotal+version_row.vat,version_row.subtotal,null,
  version_row.contract_file_id,version_row.quotation_file_id,null,'c1270000-0000-4000-8000-000000000901'
from (values
 ('c1270000-0000-4000-8000-000000000611'::uuid,'c1270000-0000-4000-8000-000000000601'::uuid,100,10,'c1270000-0000-4000-8000-000000000502'::uuid,'c1270000-0000-4000-8000-000000000503'::uuid),
 ('c1270000-0000-4000-8000-000000000621'::uuid,'c1270000-0000-4000-8000-000000000602'::uuid,1000,0,'c1270000-0000-4000-8000-000000000504'::uuid,'c1270000-0000-4000-8000-000000000505'::uuid),
 ('c1270000-0000-4000-8000-000000000631'::uuid,'c1270000-0000-4000-8000-000000000603'::uuid,100,0,'c1270000-0000-4000-8000-000000000506'::uuid,'c1270000-0000-4000-8000-000000000507'::uuid)
) as version_row(id,contract_id,subtotal,vat,contract_file_id,quotation_file_id);
insert into public.material_contract_installments(
  tenant_id,company_id,project_id,contract_id,contract_version_id,seq,installment_key,name,amount,due_on,is_advance
)
select 'c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',
  installment.contract_id,installment.version_id,installment.seq,installment.installment_key,installment.name,installment.amount,'2026-12-01',installment.is_advance
from (values
 ('c1270000-0000-4000-8000-000000000601'::uuid,'c1270000-0000-4000-8000-000000000611'::uuid,1,'c1270000-0000-4000-8000-000000000a0a'::uuid,'Tam ung A',33,true),
 ('c1270000-0000-4000-8000-000000000601'::uuid,'c1270000-0000-4000-8000-000000000611'::uuid,2,'c1270000-0000-4000-8000-000000000a0b'::uuid,'Dot B',77,false),
 ('c1270000-0000-4000-8000-000000000602'::uuid,'c1270000-0000-4000-8000-000000000621'::uuid,1,'c1270000-0000-4000-8000-000000000a0c'::uuid,'Dot 1',1000,false),
 ('c1270000-0000-4000-8000-000000000603'::uuid,'c1270000-0000-4000-8000-000000000631'::uuid,1,'c1270000-0000-4000-8000-000000000a0d'::uuid,'Dot C',40,true),
 ('c1270000-0000-4000-8000-000000000603'::uuid,'c1270000-0000-4000-8000-000000000631'::uuid,2,'c1270000-0000-4000-8000-000000000a0e'::uuid,'Dot D',60,true)
) as installment(contract_id,version_id,seq,installment_key,name,amount,is_advance);

insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,contract_id,evidence_role,created_by)
select scope.file_id,'c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',
  'material_contract',scope.contract_id,scope.evidence_role,'c1270000-0000-4000-8000-000000000901'
from (values
 ('c1270000-0000-4000-8000-000000000511'::uuid,'c1270000-0000-4000-8000-000000000601'::uuid,'invoice'),
 ('c1270000-0000-4000-8000-000000000512'::uuid,'c1270000-0000-4000-8000-000000000601'::uuid,'invoice'),
 ('c1270000-0000-4000-8000-000000000513'::uuid,'c1270000-0000-4000-8000-000000000602'::uuid,'invoice'),
 ('c1270000-0000-4000-8000-000000000514'::uuid,'c1270000-0000-4000-8000-000000000602'::uuid,'invoice'),
 ('c1270000-0000-4000-8000-000000000515'::uuid,'c1270000-0000-4000-8000-000000000602'::uuid,'invoice'),
 ('c1270000-0000-4000-8000-000000000524'::uuid,'c1270000-0000-4000-8000-000000000601'::uuid,'invoice'),
 ('c1270000-0000-4000-8000-000000000521'::uuid,'c1270000-0000-4000-8000-000000000601'::uuid,'payment_proof'),
 ('c1270000-0000-4000-8000-000000000522'::uuid,'c1270000-0000-4000-8000-000000000601'::uuid,'payment_proof'),
 ('c1270000-0000-4000-8000-000000000523'::uuid,'c1270000-0000-4000-8000-000000000601'::uuid,'payment_proof')
) as scope(file_id,contract_id,evidence_role);

create temporary table t2_acks(name text primary key, body jsonb not null);
create temporary table t2_inputs(name text primary key, body jsonb not null);
create temporary table t2_reads(element jsonb not null);
insert into t2_inputs values
('I1','{"invoiceSymbol":"1C26TAA","invoiceNo":"0000001","issuedOn":"2026-01-10","subtotal":"100","vatAmount":"10","total":"110","fileId":"c1270000-0000-4000-8000-000000000511","lines":[{"proposalLineId":"c1270000-0000-4000-8000-000000000311","invoiceMaterialName":"Thep cuon D10"}]}'),
('R1','{"installmentKey":"c1270000-0000-4000-8000-000000000a0a","amount":"20","invoiceIds":[],"note":null}'),
('R1_changed','{"installmentKey":"c1270000-0000-4000-8000-000000000a0a","amount":"19","invoiceIds":[],"note":null}'),
('D_R3','{"expectedVersion":1,"decision":"approve"}'),
('D_R3_changed','{"expectedVersion":1,"decision":"return","reason":"Doi y"}'),
('P_R1','{"expectedVersion":2,"paidOn":"2026-01-12","bankReference":"UNC-001","proofFileId":"c1270000-0000-4000-8000-000000000521"}'),
('P_R1_changed','{"expectedVersion":2,"paidOn":"2026-01-12","bankReference":"UNC-999","proofFileId":"c1270000-0000-4000-8000-000000000521"}');
grant select,insert on t2_acks,t2_inputs,t2_reads to authenticated;

-- Case 1: invoices --------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into t2_acks select 'I1', public.c1_material_record_invoice(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601',
  (select body from t2_inputs where name='I1'),'c1270000-0000-4000-8000-000000000d01','c1270000-0000-4000-8000-000000000c00');
select is(
  (select body - 'resourceId' from t2_acks where name='I1'),
  '{"version":1,"replayed":false}'::jsonb,
  'case 1: accountant records a 110 invoice'
);
select is(
  (select state||':'||total::text from public.material_invoices where id=(select (body->>'resourceId')::uuid from t2_acks where name='I1')),
  'recorded:110.0000','case 1: recorded invoice row carries the full contract total'
);
select throws_ok($$
  select public.c1_material_record_invoice(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601',
    '{"invoiceSymbol":"1C26TAA","invoiceNo":"0000002","issuedOn":"2026-01-10","subtotal":"1","vatAmount":"0","total":"1","fileId":"c1270000-0000-4000-8000-000000000512","lines":[]}',
    'c1270000-0000-4000-8000-000000000d02','c1270000-0000-4000-8000-000000000c00')
$$,'P0001','INVOICE_TOTAL_EXCEEDED','case 1: invoice total exceeded');
select throws_ok($$
  select public.c1_material_record_invoice(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000602',
    '{"invoiceSymbol":"1C26TAA","invoiceNo":"0000001","issuedOn":"2026-01-10","subtotal":"10","vatAmount":"0","total":"10","fileId":"c1270000-0000-4000-8000-000000000514","lines":[]}',
    'c1270000-0000-4000-8000-000000000d03','c1270000-0000-4000-8000-000000000c00')
$$,'P0001','INVOICE_DUPLICATE','case 1: duplicate supplier invoice identity');
select throws_ok($$
  select public.c1_material_record_invoice(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000602',
    '{"invoiceSymbol":"1C26TBB","invoiceNo":"0000003","issuedOn":"2026-01-10","subtotal":"10","vatAmount":"0","total":"10","fileId":"c1270000-0000-4000-8000-000000000515","lines":[{"proposalLineId":"c1270000-0000-4000-8000-000000000313","invoiceMaterialName":"Thep le"}]}',
    'c1270000-0000-4000-8000-000000000d04','c1270000-0000-4000-8000-000000000c00')
$$,'P0001','INPUT_INVALID','case 1: invoice line outside the order');
insert into t2_acks select 'I2', public.c1_material_record_invoice(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000602',
  '{"invoiceSymbol":"1C26TBB","invoiceNo":"0000009","issuedOn":"2026-01-11","subtotal":"50","vatAmount":"5","total":"55","fileId":"c1270000-0000-4000-8000-000000000513","lines":[{"proposalLineId":"c1270000-0000-4000-8000-000000000311","invoiceMaterialName":"Thep cuon D10"}]}',
  'c1270000-0000-4000-8000-000000000d05','c1270000-0000-4000-8000-000000000c00');
set local role none;
select is((
  select count(*) from public.material_supplier_names
  where material_id='c1270000-0000-4000-8000-000000000251' and supplier_id='c1270000-0000-4000-8000-000000000201'
    and document_kind='invoice' and name='Thep cuon D10'
),1::bigint,'case 1: supplier invoice name recorded once across repeated invoices');
select is((
  select count(*) from public.material_invoice_lines
  where invoice_id in (select (body->>'resourceId')::uuid from t2_acks where name in ('I1','I2'))
),2::bigint,'case 1: invoice lines stored for both invoices');

-- Case 2: advance request without invoice ----------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into t2_acks select 'R1', public.c1_material_create_payment_request(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601',
  (select body from t2_inputs where name='R1'),'c1270000-0000-4000-8000-000000000d11','c1270000-0000-4000-8000-000000000c00');
select is((
  select state||':'||revision_no::text||':'||submitted_by::text||':'||amount::text from public.material_payment_requests
  where id=(select (body->>'resourceId')::uuid from t2_acks where name='R1')
),'submitted:1:c1270000-0000-4000-8000-000000000901:20.0000','case 2: advance request without invoice is submitted');
set local role none;
select is((
  select array_agg(notification.recipient_id order by notification.recipient_id) from public.app_notifications as notification
  where notification.event_kind='material.payment.submitted'
    and notification.source_id=(select (body->>'resourceId')::uuid from t2_acks where name='R1')
),array['c1270000-0000-4000-8000-000000000903'::uuid,'c1270000-0000-4000-8000-000000000904'::uuid],
'case 2: approvers Q and KQ are notified of the submission');
select is((
  select payload from public.app_notifications
  where recipient_id='c1270000-0000-4000-8000-000000000903'
    and dedupe_key='pr:'||(select body->>'resourceId' from t2_acks where name='R1')||':sub:1'
),'{"supplierName":"Payment supplier","contractNo":"HD-PAY-01","documentation":"contract","amount":"20.0000"}'::jsonb
  -- Order label of the request's contract, added on insert since 20261017090100. Proposal 301 is
  -- the only proposal of the project (number 1); the order number is read from the order row.
  || jsonb_build_object('projectName','Payment project','proposalNo',1,'orderSeq',(
    select material_order.order_seq
    from public.material_payment_requests as request
    join public.material_contracts as contract on contract.id=request.contract_id
    join public.material_orders as material_order on material_order.id=contract.order_id
    where request.id=(select (body->>'resourceId')::uuid from t2_acks where name='R1'))),
'case 2: submitted payload carries supplier, contract number, request amount and the order label');

-- Case 3: non-advance installment requires an invoice ---------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_create_payment_request(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601',
    '{"installmentKey":"c1270000-0000-4000-8000-000000000a0b","amount":"50","invoiceIds":[],"note":null}',
    'c1270000-0000-4000-8000-000000000d12','c1270000-0000-4000-8000-000000000c00')
$$,'P0001','INVOICE_REQUIRED','case 3: non-advance request requires an invoice');
insert into t2_acks select 'R2', public.c1_material_create_payment_request(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601',
  jsonb_build_object('installmentKey','c1270000-0000-4000-8000-000000000a0b','amount','50','note',null,
    'invoiceIds',jsonb_build_array((select body->>'resourceId' from t2_acks where name='I1'))),
  'c1270000-0000-4000-8000-000000000d13','c1270000-0000-4000-8000-000000000c00');
select is((
  select request.state||':'||(select count(*) from public.material_payment_request_invoices as link where link.payment_request_id=request.id)::text
  from public.material_payment_requests as request
  where request.id=(select (body->>'resourceId')::uuid from t2_acks where name='R2')
),'submitted:1','case 3: non-advance request with a recorded invoice is submitted');

-- Case 4: capacity ---------------------------------------------------------------
select throws_ok($$
  select public.c1_material_create_payment_request(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601',
    '{"installmentKey":"c1270000-0000-4000-8000-000000000a0a","amount":"14","invoiceIds":[],"note":null}',
    'c1270000-0000-4000-8000-000000000d14','c1270000-0000-4000-8000-000000000c00')
$$,'P0001','INSTALLMENT_CAPACITY_EXCEEDED','case 4: installment capacity exceeded (20 + 14 > 33)');

-- Case 5: concurrency ------------------------------------------------------------
-- Two concurrent create_payment_request calls for one installment need two
-- database sessions. dblink is not part of the fixture environment (the workflow
-- test runner rejects it), so T8 must run a two-session concurrency script and
-- expect exactly one request to succeed.
select skip('case 5: concurrent create_payment_request for one installment (two sessions, no dblink); T8 runs the concurrency script', 1);

-- Case 6: self approval ----------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000904","role":"authenticated"}',true);
insert into t2_acks select 'R3', public.c1_material_create_payment_request(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601',
  jsonb_build_object('installmentKey','c1270000-0000-4000-8000-000000000a0b','amount','27','note',null,
    'invoiceIds',jsonb_build_array((select body->>'resourceId' from t2_acks where name='I1'))),
  'c1270000-0000-4000-8000-000000000d21','c1270000-0000-4000-8000-000000000c00');
select throws_ok(format($$
  select public.c1_material_decide_payment_request(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":1,"decision":"approve"}','c1270000-0000-4000-8000-000000000d22','c1270000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from t2_acks where name='R3')),'P0001','SELF_DECISION_FORBIDDEN','case 6: requester cannot approve own request');
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000903","role":"authenticated"}',true);
insert into t2_acks select 'D_R3', public.c1_material_decide_payment_request(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t2_acks where name='R3'),
  (select body from t2_inputs where name='D_R3'),'c1270000-0000-4000-8000-000000000d31','c1270000-0000-4000-8000-000000000c00');
select is((
  select state from public.material_payment_requests where id=(select (body->>'resourceId')::uuid from t2_acks where name='R3')
),'approved','case 6: treasurer approves');

-- Case 7: return with reason -----------------------------------------------------
insert into t2_acks select 'D_R2_return', public.c1_material_decide_payment_request(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t2_acks where name='R2'),
  '{"expectedVersion":1,"decision":"return","reason":"Thieu chung tu"}','c1270000-0000-4000-8000-000000000d32','c1270000-0000-4000-8000-000000000c00');
select is((
  select state from public.material_payment_requests where id=(select (body->>'resourceId')::uuid from t2_acks where name='R2')
),'returned','case 7: treasurer returns with reason');
set local role none;
select is((
  select count(*) from public.app_notifications
  where recipient_id='c1270000-0000-4000-8000-000000000901'
    and event_kind='material.payment.returned'
    and dedupe_key='pr:'||(select body->>'resourceId' from t2_acks where name='R2')||':ret:1'
    and payload->>'reason'='Thieu chung tu'
),1::bigint,'case 7: returned notification to submitter with reason');
select is((
  select pending::numeric(20,4)::text from private.c1_material_installment_usage('c1270000-0000-4000-8000-000000000601')
  where installment_key='c1270000-0000-4000-8000-000000000a0b'
),'27.0000','case 7: returned request leaves pending (77 -> 27)');

-- Case 8: Review Focus 4 - the latest submitter is blocked, not the creator ------
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason)
select 'c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020',user_id,'c1270000-0000-4000-8000-000000000916',
  'c1270000-0000-4000-8000-000000000901','rollback fixture'
from (values ('c1270000-0000-4000-8000-000000000901'::uuid),('c1270000-0000-4000-8000-000000000902'::uuid)) as approver(user_id);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into t2_acks select 'R2_resubmit', public.c1_material_resubmit_payment_request(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t2_acks where name='R2'),
  jsonb_build_object('expectedVersion',2,'amount','50','note','Gui lai',
    'invoiceIds',jsonb_build_array((select body->>'resourceId' from t2_acks where name='I1'))),
  'c1270000-0000-4000-8000-000000000d41','c1270000-0000-4000-8000-000000000c00');
select is((
  select submitted_by::text||':'||revision_no::text||':'||state from public.material_payment_requests
  where id=(select (body->>'resourceId')::uuid from t2_acks where name='R2')
),'c1270000-0000-4000-8000-000000000902:2:submitted','case 8: latest submitter is the resubmitter (K2, revision 2)');
select is((
  select count(*) from public.material_payment_request_revisions
  where payment_request_id=(select (body->>'resourceId')::uuid from t2_acks where name='R2')
),2::bigint,'case 8: resubmission keeps both revisions');
select throws_ok(format($$
  select public.c1_material_decide_payment_request(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":3,"decision":"approve"}','c1270000-0000-4000-8000-000000000d42','c1270000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from t2_acks where name='R2')),'P0001','SELF_DECISION_FORBIDDEN','case 8: resubmitter cannot decide');
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is((
  select count(*) from public.app_notifications
  where recipient_id='c1270000-0000-4000-8000-000000000901'
    and event_kind='material.payment.submitted'
    and dedupe_key='pr:'||(select body->>'resourceId' from t2_acks where name='R2')||':sub:2'
),1::bigint,'case 8: original creator, now an approver, is notified of the resubmission');
insert into t2_acks select 'D_R2_approve', public.c1_material_decide_payment_request(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t2_acks where name='R2'),
  '{"expectedVersion":3,"decision":"approve"}','c1270000-0000-4000-8000-000000000d43','c1270000-0000-4000-8000-000000000c00');
select is((
  select state from public.material_payment_requests where id=(select (body->>'resourceId')::uuid from t2_acks where name='R2')
),'approved','case 8: original creator may approve the resubmitted revision');

-- Case 9: Review Focus 1 - amendment removed a returned request's installment ---
insert into t2_acks select 'R4', public.c1_material_create_payment_request(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000603',
  '{"installmentKey":"c1270000-0000-4000-8000-000000000a0d","amount":"40","invoiceIds":[],"note":null}',
  'c1270000-0000-4000-8000-000000000d51','c1270000-0000-4000-8000-000000000c00');
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000903","role":"authenticated"}',true);
insert into t2_acks select 'D_R4_return', public.c1_material_decide_payment_request(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t2_acks where name='R4'),
  '{"expectedVersion":1,"decision":"return","reason":"Cho phu luc"}','c1270000-0000-4000-8000-000000000d52','c1270000-0000-4000-8000-000000000c00');
set local role none;
-- Installment C has paid = pending = 0 (the request is returned), so the amendment may drop it.
insert into public.material_contract_versions(
  id,tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
  order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
) values(
  'c1270000-0000-4000-8000-000000000632','c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',
  'c1270000-0000-4000-8000-000000000603',2,'amendment',100,0,100,100,null,'c1270000-0000-4000-8000-000000000508',null,'Bo dot C',
  'c1270000-0000-4000-8000-000000000901'
);
insert into public.material_contract_installments(
  tenant_id,company_id,project_id,contract_id,contract_version_id,seq,installment_key,name,amount,due_on,is_advance
) values(
  'c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',
  'c1270000-0000-4000-8000-000000000603','c1270000-0000-4000-8000-000000000632',1,'c1270000-0000-4000-8000-000000000a0e','Dot D',100,'2026-12-01',true
);
update public.material_contracts set current_version_no=2, version=2 where id='c1270000-0000-4000-8000-000000000603';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok(format($$
  select public.c1_material_resubmit_payment_request(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"amount":"40","invoiceIds":[],"note":null}','c1270000-0000-4000-8000-000000000d53','c1270000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from t2_acks where name='R4')),'P0001','INSTALLMENT_NOT_FOUND','case 9: resubmit after amendment removed installment');

-- Case 10: record payment --------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":1,"paidOn":"2026-01-12","bankReference":"UNC-000","proofFileId":"c1270000-0000-4000-8000-000000000521"}',
    'c1270000-0000-4000-8000-000000000d60','c1270000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from t2_acks where name='R1')),'P0001','VERSION_CONFLICT','case 10: payment requires an approved request');
insert into t2_acks select 'D_R1_approve', public.c1_material_decide_payment_request(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t2_acks where name='R1'),
  '{"expectedVersion":1,"decision":"approve"}','c1270000-0000-4000-8000-000000000d33','c1270000-0000-4000-8000-000000000c00');
set local role none;
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason)
values('c1270000-0000-4000-8000-000000000010','c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000901',
  'c1270000-0000-4000-8000-000000000917','c1270000-0000-4000-8000-000000000901','rollback fixture');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","bankReference":"UNC-000","proofFileId":"c1270000-0000-4000-8000-000000000524"}',
    'c1270000-0000-4000-8000-000000000d63','c1270000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from t2_acks where name='R1')),'P0001','EVIDENCE_INVALID','case 10: proof must be a payment_proof file of the contract');
-- C4 (20261016100100): the accountant who submitted the request records the payment.
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into t2_acks select 'P_R1', public.c1_material_record_payment(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t2_acks where name='R1'),
  (select body from t2_inputs where name='P_R1'),'c1270000-0000-4000-8000-000000000d61','c1270000-0000-4000-8000-000000000c00');
select is((
  select request.state||':'||count(payment.id)::text||':'||coalesce(max(payment.amount)::text,'none')||':'||max(payment.paid_by::text)
  from public.material_payment_requests as request
  left join public.material_payments as payment on payment.payment_request_id=request.id
  where request.id=(select (body->>'resourceId')::uuid from t2_acks where name='R1')
  group by request.state
),'paid:1:20.0000:c1270000-0000-4000-8000-000000000901','case 10: the submitter, holding execute, records the payment with the request amount');
set local role none;
select is((
  select count(*) from public.app_notifications
  where recipient_id='c1270000-0000-4000-8000-000000000903'
    and event_kind='material.payment.paid'
    and dedupe_key='pr:'||(select body->>'resourceId' from t2_acks where name='R1')||':paid'
),1::bigint,'case 10: paid notification to the treasurer who approved');
select is((
  select count(*) from public.app_notifications
  where recipient_id='c1270000-0000-4000-8000-000000000901'
    and event_kind='material.payment.paid'
    and source_id=(select (body->>'resourceId')::uuid from t2_acks where name='R1')
),0::bigint,'case 10: the payer is not notified of their own payment');

-- Case 11: proof hash reuse ------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","bankReference":"UNC-002","proofFileId":"c1270000-0000-4000-8000-000000000522"}',
    'c1270000-0000-4000-8000-000000000d64','c1270000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from t2_acks where name='R3')),'P0001','PROOF_ALREADY_USED','case 11: proof hash already used by another file');

-- Case 12: cancel ----------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000904","role":"authenticated"}',true);
insert into t2_acks select 'C_R3', public.c1_material_cancel_payment_request(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t2_acks where name='R3'),
  '{"expectedVersion":2,"reason":"Khong chi nua"}','c1270000-0000-4000-8000-000000000d71','c1270000-0000-4000-8000-000000000c00');
select is((
  select state||':'||cancel_reason from public.material_payment_requests where id=(select (body->>'resourceId')::uuid from t2_acks where name='R3')
),'cancelled:Khong chi nua','case 12: cancel approved request with reason');
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok(format($$
  select public.c1_material_cancel_payment_request(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":3,"reason":"Huy"}','c1270000-0000-4000-8000-000000000d72','c1270000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from t2_acks where name='R1')),'P0001','VERSION_CONFLICT','case 12: paid request cannot be cancelled');

-- Case 13: void invoice ----------------------------------------------------------
select throws_ok(format($$
  select public.c1_material_void_invoice(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":1,"reason":"Sai hoa don"}','c1270000-0000-4000-8000-000000000d81','c1270000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from t2_acks where name='I1')),'P0001','INVOICE_IN_USE','case 13: invoice in use by an active request cannot be voided');
insert into t2_acks select 'C_R2', public.c1_material_cancel_payment_request(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t2_acks where name='R2'),
  '{"expectedVersion":4,"reason":"Lap lai"}','c1270000-0000-4000-8000-000000000d73','c1270000-0000-4000-8000-000000000c00');
insert into t2_acks select 'V_I1', public.c1_material_void_invoice(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t2_acks where name='I1'),
  '{"expectedVersion":1,"reason":"Sai hoa don"}','c1270000-0000-4000-8000-000000000d82','c1270000-0000-4000-8000-000000000c00');
select is((
  select state||':'||version::text from public.material_invoices where id=(select (body->>'resourceId')::uuid from t2_acks where name='I1')
),'voided:2','case 13: invoice linked only to cancelled requests is voided');

-- Case 14: idempotency -----------------------------------------------------------
select is(
  public.c1_material_create_payment_request(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601',
    (select body from t2_inputs where name='R1'),'c1270000-0000-4000-8000-000000000d11','c1270000-0000-4000-8000-000000000c00'),
  (select jsonb_set(body,'{replayed}','true') from t2_acks where name='R1'),
  'case 14: create replay with the same key and payload'
);
select throws_ok($$
  select public.c1_material_create_payment_request(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601',
    (select body from t2_inputs where name='R1_changed'),'c1270000-0000-4000-8000-000000000d11','c1270000-0000-4000-8000-000000000c00')
$$,'P0001','IDEMPOTENCY_CONFLICT','case 14: create with the same key and another payload');
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select is(
  public.c1_material_decide_payment_request(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t2_acks where name='R3'),
    (select body from t2_inputs where name='D_R3'),'c1270000-0000-4000-8000-000000000d31','c1270000-0000-4000-8000-000000000c00'),
  (select jsonb_set(body,'{replayed}','true') from t2_acks where name='D_R3'),
  'case 14: decide replay with the same key and payload'
);
select throws_ok(format($$
  select public.c1_material_decide_payment_request(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',%L,
    (select body from t2_inputs where name='D_R3_changed'),'c1270000-0000-4000-8000-000000000d31','c1270000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from t2_acks where name='R3')),'P0001','IDEMPOTENCY_CONFLICT','case 14: decide with the same key and another payload');
-- Receipts belong to their actor: K recorded P_R1 (case 10), so K replays it.
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is(
  public.c1_material_record_payment(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t2_acks where name='R1'),
    (select body from t2_inputs where name='P_R1'),'c1270000-0000-4000-8000-000000000d61','c1270000-0000-4000-8000-000000000c00'),
  (select jsonb_set(body,'{replayed}','true') from t2_acks where name='P_R1'),
  'case 14: record_payment replay with the same key and payload'
);
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',%L,
    (select body from t2_inputs where name='P_R1_changed'),'c1270000-0000-4000-8000-000000000d61','c1270000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from t2_acks where name='R1')),'P0001','IDEMPOTENCY_CONFLICT','case 14: record_payment with the same key and another payload');
set local role none;
select is((
  select count(*) from public.material_payments where contract_id='c1270000-0000-4000-8000-000000000601'
),1::bigint,'case 14: replays create no extra payment');

-- Case 15: buyer -----------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000905","role":"authenticated"}',true);
select throws_ok(format($$select public.%s('c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601',%L,'c1270000-0000-4000-8000-000000000d91','c1270000-0000-4000-8000-000000000c00')$$,
  command.name, command.body),'P0001','PERMISSION_DENIED','case 15: buyer denied '||command.name)
from (values
 ('c1_material_record_invoice','{"invoiceSymbol":"X","invoiceNo":"1","issuedOn":"2026-01-10","subtotal":"1","vatAmount":"0","total":"1","fileId":"c1270000-0000-4000-8000-000000000512","lines":[]}'),
 ('c1_material_void_invoice','{"expectedVersion":1,"reason":"x"}'),
 ('c1_material_create_payment_request','{"installmentKey":"c1270000-0000-4000-8000-000000000a0a","amount":"1","invoiceIds":[],"note":null}'),
 ('c1_material_resubmit_payment_request','{"expectedVersion":1,"amount":"1","invoiceIds":[],"note":null}'),
 ('c1_material_cancel_payment_request','{"expectedVersion":1,"reason":"x"}'),
 ('c1_material_decide_payment_request','{"expectedVersion":1,"decision":"approve"}'),
 ('c1_material_record_payment','{"expectedVersion":1,"paidOn":"2026-01-12","bankReference":"x","proofFileId":"c1270000-0000-4000-8000-000000000523"}')
) as command(name,body);
select throws_ok($$
  select public.c1_material_list_payment_requests('c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601')
$$,'P0001','PERMISSION_DENIED','case 15: buyer denied payment request list');
select throws_ok($$
  select public.c1_material_list_invoices('c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601')
$$,'P0001','PERMISSION_DENIED','case 15: buyer denied invoice list');
select is((select count(*) from public.material_payments),0::bigint,'case 15: buyer selects no material_payments rows');

-- Case 16: fully paid installment ------------------------------------------------
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into t2_acks select 'R6', public.c1_material_create_payment_request(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601',
  '{"installmentKey":"c1270000-0000-4000-8000-000000000a0a","amount":"13","invoiceIds":[],"note":null}',
  'c1270000-0000-4000-8000-000000000da1','c1270000-0000-4000-8000-000000000c00');
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000903","role":"authenticated"}',true);
insert into t2_acks select 'D_R6', public.c1_material_decide_payment_request(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t2_acks where name='R6'),
  '{"expectedVersion":1,"decision":"approve"}','c1270000-0000-4000-8000-000000000da2','c1270000-0000-4000-8000-000000000c00');
insert into t2_acks select 'P_R6', public.c1_material_record_payment(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t2_acks where name='R6'),
  '{"expectedVersion":2,"paidOn":"2026-01-13","bankReference":"UNC-003","proofFileId":"c1270000-0000-4000-8000-000000000523"}',
  'c1270000-0000-4000-8000-000000000da3','c1270000-0000-4000-8000-000000000c00');
select is((
  select sum(amount)::text from public.material_payments
  where contract_id='c1270000-0000-4000-8000-000000000601' and installment_key='c1270000-0000-4000-8000-000000000a0a'
),'33.0000','case 16: installment A is fully paid (20 + 13)');
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_create_payment_request(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601',
    '{"installmentKey":"c1270000-0000-4000-8000-000000000a0a","amount":"1","invoiceIds":[],"note":null}',
    'c1270000-0000-4000-8000-000000000da4','c1270000-0000-4000-8000-000000000c00')
$$,'P0001','INSTALLMENT_CAPACITY_EXCEEDED','case 16: fully paid installment rejects a new request');

-- Reads --------------------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"c1270000-0000-4000-8000-000000000903","role":"authenticated"}',true);
insert into t2_reads
select element from jsonb_array_elements(public.c1_material_list_payment_requests(
  'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601')) as listed(element);
select is((select count(*) from t2_reads),4::bigint,'reads: contract C1 lists four payment requests');
select is((
  select element->'payment'->>'bankReference' from t2_reads
  where element->>'id'=(select body->>'resourceId' from t2_acks where name='R1')
),'UNC-001','reads: paid request exposes its payment');
select is((
  select jsonb_path_query_array(element->'decisions','$[*].decision') from t2_reads
  where element->>'id'=(select body->>'resourceId' from t2_acks where name='R2')
),'["return","approve"]'::jsonb,'reads: decisions are ordered by revision');
select is((
  select element->'invoiceIds' from t2_reads
  where element->>'id'=(select body->>'resourceId' from t2_acks where name='R2')
),jsonb_build_array((select body->>'resourceId' from t2_acks where name='I1')),'reads: request lists its linked invoices');
select ok((
  select bool_and(element->'payment'='null'::jsonb) from t2_reads
  where element->>'state'<>'paid'
),'reads: unpaid requests have a null payment');
select is((
  select jsonb_agg(element->>'state')
  from jsonb_array_elements(public.c1_material_list_invoices(
    'c1270000-0000-4000-8000-000000000020','c1270000-0000-4000-8000-000000000101','c1270000-0000-4000-8000-000000000601')) as listed(element)
),'["voided"]'::jsonb,'reads: contract C1 lists its voided invoice');

select * from finish(true);
rollback;
