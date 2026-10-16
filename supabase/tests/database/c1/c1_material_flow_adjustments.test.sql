begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(44);

-- A4/A5 finance flow adjustments (20261016100100, C2-C4). Rollback-only fixture with prefix c134.
-- Every order has one allocation of quantity 1, so the order subtotal is the unit price:
--   351  4000000 VND  recorded as quotation_only with VAT 300000 (total 4300000); draft and
--                     official invoices, payment requests and the officialize command run on it
--   352  4000000 VND  recorded as quotation_only without VAT; a request without an invoice fails
--   353  4800000 VND  quotation_only with VAT 500000 (total 5300000): CONTRACT_REQUIRED
--   355  4000000 VND  contract row written directly for the version CHECK and a legacy invoice row
-- Users: accountant K (901) records contracts and invoices, requests and records payments;
-- treasurer Q (903) approves; KQ (904) requests and approves; buyer B (905) owns the orders;
-- R (906) holds material.contract.record without material.read.
-- Labels: "C2:", "invoice required:", "C3:", "C4:", "facts:", "legacy:", "privileges:".

insert into auth.users(id,email) values
('c1340000-0000-4000-8000-000000000901','flow-k@test.invalid'),
('c1340000-0000-4000-8000-000000000903','flow-q@test.invalid'),
('c1340000-0000-4000-8000-000000000904','flow-kq@test.invalid'),
('c1340000-0000-4000-8000-000000000905','flow-buyer@test.invalid'),
('c1340000-0000-4000-8000-000000000906','flow-record-only@test.invalid');
insert into public.tenants(id,code,name)
values('c1340000-0000-4000-8000-000000000010','C1FLOW','Flow adjustment tenant');
insert into public.companies(id,tenant_id,code,name)
values('c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000010','C1FLOW','Flow adjustment company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select id,'c1340000-0000-4000-8000-000000000010',array['member']
from auth.users where id::text like 'c1340000-0000-4000-8000-00000000090_';
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select id,'c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020',array['member'],true
from auth.users where id::text like 'c1340000-0000-4000-8000-00000000090_';
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system)
select role_row.id,'c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020',role_row.code,role_row.code,'rollback fixture',false
from (values
 ('c1340000-0000-4000-8000-000000000911'::uuid,'flow_accountant'),
 ('c1340000-0000-4000-8000-000000000913'::uuid,'flow_treasurer'),
 ('c1340000-0000-4000-8000-000000000914'::uuid,'flow_request_approve'),
 ('c1340000-0000-4000-8000-000000000915'::uuid,'flow_buyer'),
 ('c1340000-0000-4000-8000-000000000916'::uuid,'flow_record_only')
) as role_row(id,code);
insert into public.role_permissions(role_id,permission_code) values
('c1340000-0000-4000-8000-000000000911','material.read'),
('c1340000-0000-4000-8000-000000000911','material.finance.read'),
('c1340000-0000-4000-8000-000000000911','material.contract.record'),
('c1340000-0000-4000-8000-000000000911','material.payment.request'),
('c1340000-0000-4000-8000-000000000911','material.payment.execute'),
('c1340000-0000-4000-8000-000000000913','material.read'),
('c1340000-0000-4000-8000-000000000913','material.finance.read'),
('c1340000-0000-4000-8000-000000000913','material.payment.approve'),
('c1340000-0000-4000-8000-000000000914','material.read'),
('c1340000-0000-4000-8000-000000000914','material.payment.request'),
('c1340000-0000-4000-8000-000000000914','material.payment.approve'),
('c1340000-0000-4000-8000-000000000915','material.read'),
('c1340000-0000-4000-8000-000000000915','material.order.manage'),
('c1340000-0000-4000-8000-000000000916','material.contract.record');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason)
select 'c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020',
  ('c1340000-0000-4000-8000-00000000090'||suffix)::uuid,('c1340000-0000-4000-8000-00000000091'||suffix)::uuid,
  'c1340000-0000-4000-8000-000000000901','rollback fixture'
from unnest(array['1','3','4','5','6']) as suffix;
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000010',true,'c1340000-0000-4000-8000-000000000901');
insert into public.projects(id,tenant_id,company_id,code,name,operational_state,origin,created_by)
values('c1340000-0000-4000-8000-000000000101','c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','FLOW-P','Flow adjustment project','active','manual','c1340000-0000-4000-8000-000000000901');
insert into public.projects(id,tenant_id,company_id,code,name,operational_state,origin,created_by)
values('c1340000-0000-4000-8000-000000000102','c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','FLOW-P2','Flow adjustment other project','active','manual','c1340000-0000-4000-8000-000000000901');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c1340000-0000-4000-8000-000000000201','c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','FLOW-S','Flow supplier','organization','c1340000-0000-4000-8000-000000000905');
insert into public.material_items(id,tenant_id,company_id,code,name,specification,unit,created_by)
values('c1340000-0000-4000-8000-000000000251','c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','FLOW-STEEL','Steel','D10','kg','c1340000-0000-4000-8000-000000000905');
insert into public.material_proposals(id,tenant_id,company_id,project_id,needed_on,delivery_address,created_by)
values('c1340000-0000-4000-8000-000000000301','c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101','2026-10-30','Site A','c1340000-0000-4000-8000-000000000905');
insert into public.material_proposal_lines(id,tenant_id,company_id,project_id,proposal_id,material_id,quantity,created_by)
values('c1340000-0000-4000-8000-000000000311','c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',
  'c1340000-0000-4000-8000-000000000301','c1340000-0000-4000-8000-000000000251',100,'c1340000-0000-4000-8000-000000000905');
insert into public.material_proposal_revisions(id,tenant_id,company_id,project_id,proposal_id,revision_no,needed_on,delivery_address,submitted_by)
values('c1340000-0000-4000-8000-000000000401','c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101','c1340000-0000-4000-8000-000000000301',1,'2026-10-30','Site A','c1340000-0000-4000-8000-000000000905');
insert into public.material_proposal_revision_lines(revision_id,proposal_line_id,proposal_id,tenant_id,company_id,project_id,material_id,material_name,specification,unit,quantity)
values('c1340000-0000-4000-8000-000000000401','c1340000-0000-4000-8000-000000000311','c1340000-0000-4000-8000-000000000301',
  'c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',
  'c1340000-0000-4000-8000-000000000251','Steel','D10','kg',100);
update public.material_proposals
set review_state='approved',current_revision_id='c1340000-0000-4000-8000-000000000401',approved_revision_id='c1340000-0000-4000-8000-000000000401'
where id='c1340000-0000-4000-8000-000000000301';

-- Finalized evidence. 711 is a photo of a draft invoice; 712 and 714 are official PDFs;
-- 713 backs the second invoice; 811 and 812 are transfer receipts.
insert into public.cost_evidence_files(
 id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
 verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version
)
select
 file.id,'c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',
 'c1340000-0000-4000-8000-000000000010/c1340000-0000-4000-8000-000000000020/c1340000-0000-4000-8000-000000000101/'||file.id::text,
 'file-'||file.hash_seed,file.mime,8,lpad(to_hex(file.hash_seed),64,'0'),file.mime,8,lpad(to_hex(file.hash_seed),64,'0'),'finalized',
 now()+interval '15 minutes','c1340000-0000-4000-8000-000000000901','c1340000-0000-4000-8000-000000000901',now(),1
from (values
 ('c1340000-0000-4000-8000-000000000501'::uuid,13501,'application/pdf'),
 ('c1340000-0000-4000-8000-000000000511'::uuid,13511,'image/png'),
 ('c1340000-0000-4000-8000-000000000521'::uuid,13521,'image/png'),
 ('c1340000-0000-4000-8000-000000000531'::uuid,13531,'image/png'),
 ('c1340000-0000-4000-8000-000000000551'::uuid,13551,'image/png'),
 ('c1340000-0000-4000-8000-000000000552'::uuid,13552,'image/png'),
 ('c1340000-0000-4000-8000-000000000711'::uuid,13711,'image/jpeg'),
 ('c1340000-0000-4000-8000-000000000712'::uuid,13712,'application/pdf'),
 ('c1340000-0000-4000-8000-000000000713'::uuid,13713,'application/pdf'),
 ('c1340000-0000-4000-8000-000000000714'::uuid,13714,'application/pdf'),
 ('c1340000-0000-4000-8000-000000000721'::uuid,13721,'application/pdf'),
 ('c1340000-0000-4000-8000-000000000811'::uuid,13811,'image/png'),
 ('c1340000-0000-4000-8000-000000000812'::uuid,13812,'image/png')
) as file(id,hash_seed,mime);

insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
)
select order_row.id,'c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',
  'c1340000-0000-4000-8000-000000000301','c1340000-0000-4000-8000-000000000401','c1340000-0000-4000-8000-000000000201','VND',
  'c1340000-0000-4000-8000-000000000501','c1340000-0000-4000-8000-000000000905'
from (values
 ('c1340000-0000-4000-8000-000000000351'::uuid),('c1340000-0000-4000-8000-000000000352'::uuid),
 ('c1340000-0000-4000-8000-000000000353'::uuid),('c1340000-0000-4000-8000-000000000355'::uuid)
) as order_row(id);
insert into public.material_order_allocations(
  tenant_id,company_id,project_id,order_id,proposal_id,approved_revision_id,proposal_line_id,quantity,unit_price,quotation_material_name,mapping_confirmed
)
select 'c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',
  allocation.order_id,'c1340000-0000-4000-8000-000000000301','c1340000-0000-4000-8000-000000000401','c1340000-0000-4000-8000-000000000311',
  1,allocation.unit_price,'Quoted steel',true
from (values
 ('c1340000-0000-4000-8000-000000000351'::uuid,4000000::numeric),
 ('c1340000-0000-4000-8000-000000000352'::uuid,4000000::numeric),
 ('c1340000-0000-4000-8000-000000000353'::uuid,4800000::numeric),
 ('c1340000-0000-4000-8000-000000000355'::uuid,4000000::numeric)
) as allocation(order_id,unit_price);

insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,order_id,evidence_role,created_by)
select scope_row.file_id,'c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',
  'material_order',scope_row.order_id,'signed_quotation','c1340000-0000-4000-8000-000000000901'
from (values
 ('c1340000-0000-4000-8000-000000000511'::uuid,'c1340000-0000-4000-8000-000000000351'::uuid),
 ('c1340000-0000-4000-8000-000000000521'::uuid,'c1340000-0000-4000-8000-000000000352'::uuid),
 ('c1340000-0000-4000-8000-000000000531'::uuid,'c1340000-0000-4000-8000-000000000353'::uuid)
) as scope_row(file_id,order_id);

-- Order 355 holds a record without a contract written directly, for the table checks.
insert into public.material_contracts(id,tenant_id,company_id,project_id,order_id,supplier_id,currency_code,documentation,contract_no,signed_on,created_by)
values('c1340000-0000-4000-8000-000000000655','c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',
  'c1340000-0000-4000-8000-000000000355','c1340000-0000-4000-8000-000000000201','VND','quotation_only',null,'2026-10-10','c1340000-0000-4000-8000-000000000901');

create temporary table flow_refs(name text primary key, id uuid not null);
create temporary table flow_acks(name text primary key, body jsonb not null);
grant select,insert on flow_refs,flow_acks to authenticated;

-- C2: VAT on a record without a contract ----------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1340000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_record_contract(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101','c1340000-0000-4000-8000-000000000351',
    '{"documentation":"quotation_only","expectedOrderVersion":1,"signedOn":"2026-10-10","subtotal":"4000000","vatAmount":"300000","total":"4400000","varianceReason":null,"signedQuotationFileId":"c1340000-0000-4000-8000-000000000511"}',
    'c1340000-0000-4000-8000-000000000d01','c1340000-0000-4000-8000-000000000c00')
$$,'P0001','CONTRACT_TOTAL_MISMATCH','C2: a total that differs from subtotal + VAT is CONTRACT_TOTAL_MISMATCH');
select throws_ok($$
  select public.c1_material_record_contract(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101','c1340000-0000-4000-8000-000000000353',
    '{"documentation":"quotation_only","expectedOrderVersion":1,"signedOn":"2026-10-10","subtotal":"4800000","vatAmount":"500000","varianceReason":null,"signedQuotationFileId":"c1340000-0000-4000-8000-000000000531"}',
    'c1340000-0000-4000-8000-000000000d02','c1340000-0000-4000-8000-000000000c00')
$$,'P0001','CONTRACT_REQUIRED','C2: an order of 4800000 with VAT 500000 (5300000 after VAT) needs a contract');
select is((
  public.c1_material_record_contract(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101','c1340000-0000-4000-8000-000000000351',
    '{"documentation":"quotation_only","expectedOrderVersion":1,"signedOn":"2026-10-10","subtotal":"4000000","vatAmount":"300000","varianceReason":null,"signedQuotationFileId":"c1340000-0000-4000-8000-000000000511"}',
    'c1340000-0000-4000-8000-000000000d03','c1340000-0000-4000-8000-000000000c00') - 'resourceId'
),'{"version":1,"replayed":false}'::jsonb,'C2: a record without a contract is saved with VAT and a derived total');
select is((
  public.c1_material_record_contract(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101','c1340000-0000-4000-8000-000000000352',
    '{"documentation":"quotation_only","expectedOrderVersion":1,"signedOn":"2026-10-10","subtotal":"4000000","varianceReason":null,"signedQuotationFileId":"c1340000-0000-4000-8000-000000000521"}',
    'c1340000-0000-4000-8000-000000000d04','c1340000-0000-4000-8000-000000000c00') - 'resourceId'
),'{"version":1,"replayed":false}'::jsonb,'C2: a record without a contract and without VAT is still saved');

set local role none;
insert into flow_refs
select 'contract_351', contract.id from public.material_contracts as contract where contract.order_id='c1340000-0000-4000-8000-000000000351';
insert into flow_refs
select 'contract_352', contract.id from public.material_contracts as contract where contract.order_id='c1340000-0000-4000-8000-000000000352';
insert into flow_refs
select 'installment_351', item.installment_key from public.material_contract_installments as item
where item.contract_id=(select id from flow_refs where name='contract_351');
insert into flow_refs
select 'installment_352', item.installment_key from public.material_contract_installments as item
where item.contract_id=(select id from flow_refs where name='contract_352');
insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,contract_id,evidence_role,created_by)
select scope_row.file_id,'c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',
  'material_contract',(select id from flow_refs where name='contract_351'),scope_row.role,'c1340000-0000-4000-8000-000000000901'
from (values
 ('c1340000-0000-4000-8000-000000000711'::uuid,'invoice'),
 ('c1340000-0000-4000-8000-000000000712'::uuid,'invoice'),
 ('c1340000-0000-4000-8000-000000000713'::uuid,'invoice'),
 ('c1340000-0000-4000-8000-000000000714'::uuid,'invoice'),
 ('c1340000-0000-4000-8000-000000000811'::uuid,'payment_proof'),
 ('c1340000-0000-4000-8000-000000000812'::uuid,'payment_proof')
) as scope_row(file_id,role);

select is((
  select ver.subtotal::text||'|'||ver.vat_amount::text||'|'||ver.total::text||'|'||coalesce(ver.contract_file_id::text,'<null>')
  from public.material_contract_versions as ver where ver.contract_id=(select id from flow_refs where name='contract_351')
),'4000000.0000|300000.0000|4300000.0000|<null>','C2: the version stores VAT 300000 and a total of 4300000 without a contract file');
select is((
  select string_agg(item.seq::text||'|'||item.name||'|'||item.amount::text||'|'||item.is_advance::text, ',' order by item.seq)
  from public.material_contract_installments as item where item.contract_id=(select id from flow_refs where name='contract_351')
),'1|Thanh toán 100%|4300000.0000|false','C2: the generated 100% installment pays the total after VAT');
select is((
  select ver.vat_amount::text||'|'||ver.total::text
  from public.material_contract_versions as ver where ver.contract_id=(select id from flow_refs where name='contract_352')
),'0.0000|4000000.0000','C2: without vatAmount the VAT is 0 and the total equals the subtotal');
select lives_ok($$
  insert into public.material_contract_versions(
    tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
    order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
  ) values (
    'c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',
    'c1340000-0000-4000-8000-000000000655',1,'original',4000000,300000,4300000,4000000,null,null,
    'c1340000-0000-4000-8000-000000000551',null,'c1340000-0000-4000-8000-000000000901'
  )
$$,'C2: the version check accepts VAT without a contract file below the threshold');
select throws_ok($$
  insert into public.material_contract_versions(
    tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
    order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
  ) values (
    'c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',
    'c1340000-0000-4000-8000-000000000655',2,'original',4800000,500000,5300000,4800000,null,null,
    'c1340000-0000-4000-8000-000000000552',null,'c1340000-0000-4000-8000-000000000901'
  )
$$,'23514',null,'C2: the version check rejects a total of 5300000 without a contract file');

-- invoice required: a record without a contract needs an invoice ---------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1340000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok(format($$
  select public.c1_material_create_payment_request(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',%L,
    jsonb_build_object('installmentKey',%L,'amount','1000000','invoiceIds','[]'::jsonb,'note',null),
    'c1340000-0000-4000-8000-000000000d11','c1340000-0000-4000-8000-000000000c00')
$$,(select id from flow_refs where name='contract_352'),(select id from flow_refs where name='installment_352')),
'P0001','INVOICE_REQUIRED','invoice required: a request of a record without a contract needs an invoice');

-- C3: draft invoices ----------------------------------------------------------------------
select lives_ok($$
  select public.c1_material_create_evidence_intent('c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',
    jsonb_build_object('originalFilename','hoa-don-nhap.jpg','mimeType','image/jpeg','sizeBytes',8,'sha256',repeat('c',64),'evidenceRole','invoice',
      'target',jsonb_build_object('kind','material_contract','contractId',(select id from flow_refs where name='contract_351'))),
    'c1340000-0000-4000-8000-000000000d12','c1340000-0000-4000-8000-000000000c00')
$$,'C3: a JPEG invoice upload intent is accepted');
select throws_ok(format($$
  select public.c1_material_record_invoice(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',%L,
    '{"invoiceSymbol":"1C26TAA","invoiceNo":"0000001","issuedOn":"2026-10-11","subtotal":"2000000","vatAmount":"150000","total":"2150000","fileId":"c1340000-0000-4000-8000-000000000711","lines":[],"stage":"final"}',
    'c1340000-0000-4000-8000-000000000d13','c1340000-0000-4000-8000-000000000c00')
$$,(select id from flow_refs where name='contract_351')),'P0001','INPUT_INVALID','C3: an unknown invoice stage is INPUT_INVALID');
insert into flow_acks select 'I1', public.c1_material_record_invoice(
  'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',(select id from flow_refs where name='contract_351'),
  '{"invoiceSymbol":"1C26TAA","invoiceNo":"0000001","issuedOn":"2026-10-11","subtotal":"2000000","vatAmount":"150000","total":"2150000","fileId":"c1340000-0000-4000-8000-000000000711","lines":[{"proposalLineId":"c1340000-0000-4000-8000-000000000311","invoiceMaterialName":"Thep cuon D10"}],"stage":"draft"}',
  'c1340000-0000-4000-8000-000000000d14','c1340000-0000-4000-8000-000000000c00');
insert into flow_acks select 'I2', public.c1_material_record_invoice(
  'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',(select id from flow_refs where name='contract_351'),
  '{"invoiceSymbol":"1C26TAA","invoiceNo":"0000002","issuedOn":"2026-10-11","subtotal":"1000000","vatAmount":"0","total":"1000000","fileId":"c1340000-0000-4000-8000-000000000713","lines":[]}',
  'c1340000-0000-4000-8000-000000000d15','c1340000-0000-4000-8000-000000000c00');
select is((
  select body - 'resourceId' from flow_acks where name='I1'
),'{"version":1,"replayed":false}'::jsonb,'C3: a draft invoice with a JPEG file is recorded');
select is((
  select string_agg(invoice.stage, '|' order by invoice.invoice_no) from public.material_invoices as invoice
  where invoice.id in (select (body->>'resourceId')::uuid from flow_acks where name in ('I1','I2'))
),'draft|official','C3: the draft keeps stage draft and an invoice without a stage key is official');

insert into flow_acks select 'R1', public.c1_material_create_payment_request(
  'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',(select id from flow_refs where name='contract_351'),
  jsonb_build_object('installmentKey',(select id from flow_refs where name='installment_351'),'amount','2150000','note',null,
    'invoiceIds',jsonb_build_array((select body->>'resourceId' from flow_acks where name='I1'))),
  'c1340000-0000-4000-8000-000000000d16','c1340000-0000-4000-8000-000000000c00');
select is((
  select request.state||':'||(select count(*) from public.material_payment_request_invoices as link where link.payment_request_id=request.id)::text
  from public.material_payment_requests as request where request.id=(select (body->>'resourceId')::uuid from flow_acks where name='R1')
),'submitted:1','C3: a request linked only to a draft invoice is submitted');

-- C4: the submitter cannot approve; the accountant records the payment --------------------
select set_config('request.jwt.claims','{"sub":"c1340000-0000-4000-8000-000000000904","role":"authenticated"}',true);
insert into flow_acks select 'R2', public.c1_material_create_payment_request(
  'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',(select id from flow_refs where name='contract_351'),
  jsonb_build_object('installmentKey',(select id from flow_refs where name='installment_351'),'amount','100000','note',null,
    'invoiceIds',jsonb_build_array((select body->>'resourceId' from flow_acks where name='I2'))),
  'c1340000-0000-4000-8000-000000000d21','c1340000-0000-4000-8000-000000000c00');
select throws_ok(format($$
  select public.c1_material_decide_payment_request(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":1,"decision":"approve"}','c1340000-0000-4000-8000-000000000d22','c1340000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from flow_acks where name='R2')),'P0001','SELF_DECISION_FORBIDDEN','C4: the submitter still cannot approve their own request');
select set_config('request.jwt.claims','{"sub":"c1340000-0000-4000-8000-000000000903","role":"authenticated"}',true);
insert into flow_acks select 'D_R1', public.c1_material_decide_payment_request(
  'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from flow_acks where name='R1'),
  '{"expectedVersion":1,"decision":"approve"}','c1340000-0000-4000-8000-000000000d23','c1340000-0000-4000-8000-000000000c00');
select is((
  select state from public.material_payment_requests where id=(select (body->>'resourceId')::uuid from flow_acks where name='R1')
),'approved','C4: the treasurer confirms the bank order (approve)');
set local role none;
select is((
  select payload from public.app_notifications
  where recipient_id='c1340000-0000-4000-8000-000000000901' and event_kind='material.payment.approved'
    and dedupe_key='pr:'||(select body->>'resourceId' from flow_acks where name='R1')||':appr:1'
),jsonb_build_object('supplierName','Flow supplier','contractNo',null,'documentation','quotation_only',
  'projectId','c1340000-0000-4000-8000-000000000101','contractId',(select id from flow_refs where name='contract_351')),
'C4: the approval notifies the submitting accountant with project, contract and supplier but no money');
select is((
  select array_agg(recipient_id::text order by recipient_id) from public.app_notifications
  where event_kind='material.payment.approved' and source_id=(select (body->>'resourceId')::uuid from flow_acks where name='R1')
),array['c1340000-0000-4000-8000-000000000901'],'C4: only the submitter receives the approval notification');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1340000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into flow_acks select 'P_R1', public.c1_material_record_payment(
  'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from flow_acks where name='R1'),
  '{"expectedVersion":2,"paidOn":"2026-10-12","bankReference":"UNC-FLOW-1","proofFileId":"c1340000-0000-4000-8000-000000000811"}',
  'c1340000-0000-4000-8000-000000000d24','c1340000-0000-4000-8000-000000000c00');
select is((
  select request.state||':'||payment.paid_by::text
  from public.material_payment_requests as request
  join public.material_payments as payment on payment.payment_request_id=request.id
  where request.id=(select (body->>'resourceId')::uuid from flow_acks where name='R1')
),'paid:c1340000-0000-4000-8000-000000000901','C4: the accountant who requested the payment records it');
set local role none;
select is((
  select count(*) from public.app_notifications
  where recipient_id='c1340000-0000-4000-8000-000000000903' and event_kind='material.payment.paid'
    and dedupe_key='pr:'||(select body->>'resourceId' from flow_acks where name='R1')||':paid'
    and not (payload ? 'amount')
),1::bigint,'C4: the paid notification goes to the treasurer who approved, without money');
select is((
  select count(*) from public.app_notifications
  where recipient_id='c1340000-0000-4000-8000-000000000901' and event_kind='material.payment.paid'
    and source_id=(select (body->>'resourceId')::uuid from flow_acks where name='R1')
),0::bigint,'C4: the accountant is not notified of their own payment');

-- facts before officialize ----------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1340000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is((
  select (contract->>'invoiced')||'|'||(contract->>'draftInvoiced')
  from jsonb_array_elements(public.c1_material_finance_facts('c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101')->'contracts') as contract
  where contract->>'orderId'='c1340000-0000-4000-8000-000000000351'
),'3150000.0000|2150000.0000','facts: invoiced counts the draft and draftInvoiced holds it before officialize');
select is((
  select (facts->>'invoiced')||'|'||(facts->>'draftInvoiced')
  from (select public.c1_material_read_contract('c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101','c1340000-0000-4000-8000-000000000351') as facts) as q
),'3150000.0000|2150000.0000','facts: read_contract carries draftInvoiced before officialize');

-- C3: officialize ---------------------------------------------------------------------------
-- Access: officialize needs material.contract.record and material.read, and the invoice must
-- belong to the project of the call.
select set_config('request.jwt.claims','{"sub":"c1340000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok(format($$
  select public.c1_material_officialize_invoice(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":1,"officialFileId":"c1340000-0000-4000-8000-000000000712"}',
    'c1340000-0000-4000-8000-000000000d37','c1340000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from flow_acks where name='I1')),'P0001','PERMISSION_DENIED','C3: a treasurer without material.contract.record cannot officialize');
select set_config('request.jwt.claims','{"sub":"c1340000-0000-4000-8000-000000000906","role":"authenticated"}',true);
select throws_ok(format($$
  select public.c1_material_officialize_invoice(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":1,"officialFileId":"c1340000-0000-4000-8000-000000000712"}',
    'c1340000-0000-4000-8000-000000000d38','c1340000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from flow_acks where name='I1')),'P0001','PERMISSION_DENIED','C3: material.contract.record without material.read cannot officialize');
select set_config('request.jwt.claims','{"sub":"c1340000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok(format($$
  select public.c1_material_officialize_invoice(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000102',%L,
    '{"expectedVersion":1,"officialFileId":"c1340000-0000-4000-8000-000000000712"}',
    'c1340000-0000-4000-8000-000000000d39','c1340000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from flow_acks where name='I1')),'P0001','RESOURCE_NOT_FOUND','C3: an invoice of another project is RESOURCE_NOT_FOUND');
select throws_ok(format($$
  select public.c1_material_officialize_invoice(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":1,"officialFileId":"c1340000-0000-4000-8000-000000000713"}',
    'c1340000-0000-4000-8000-000000000d31','c1340000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from flow_acks where name='I1')),'P0001','EVIDENCE_INVALID','C3: the file of another invoice cannot be the official file');
select throws_ok(format($$
  select public.c1_material_officialize_invoice(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":1,"officialFileId":"c1340000-0000-4000-8000-000000000812"}',
    'c1340000-0000-4000-8000-000000000d32','c1340000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from flow_acks where name='I1')),'P0001','EVIDENCE_INVALID','C3: a file whose role is not invoice cannot be the official file');
insert into flow_acks select 'O_I1', public.c1_material_officialize_invoice(
  'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from flow_acks where name='I1'),
  '{"expectedVersion":1,"officialFileId":"c1340000-0000-4000-8000-000000000712"}',
  'c1340000-0000-4000-8000-000000000d33','c1340000-0000-4000-8000-000000000c00');
select is((
  select body - 'resourceId' from flow_acks where name='O_I1'
),'{"version":2,"replayed":false}'::jsonb,'C3: the draft invoice of a paid request is officialized');
select is((
  public.c1_material_officialize_invoice(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from flow_acks where name='I1'),
    '{"expectedVersion":1,"officialFileId":"c1340000-0000-4000-8000-000000000712"}',
    'c1340000-0000-4000-8000-000000000d33','c1340000-0000-4000-8000-000000000c00') - 'resourceId'
),'{"version":2,"replayed":true}'::jsonb,'C3: replaying the same key returns the stored result');
select is((
  select invoice.stage||'|'||invoice.official_file_id::text||'|'||invoice.file_id::text||'|'||invoice.version::text||'|'
    ||invoice.officialized_by::text||'|'||(invoice.officialized_at is not null)::text
  from public.material_invoices as invoice where invoice.id=(select (body->>'resourceId')::uuid from flow_acks where name='I1')
),'official|c1340000-0000-4000-8000-000000000712|c1340000-0000-4000-8000-000000000711|2|c1340000-0000-4000-8000-000000000901|true',
'C3: officialize sets stage and the official file, keeps file_id and raises the version');
select throws_ok(format($$
  select public.c1_material_officialize_invoice(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"officialFileId":"c1340000-0000-4000-8000-000000000714"}',
    'c1340000-0000-4000-8000-000000000d34','c1340000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from flow_acks where name='I1')),'P0001','VERSION_CONFLICT','C3: officializing a second time is VERSION_CONFLICT');
select throws_ok(format($$
  select public.c1_material_officialize_invoice(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":1,"officialFileId":"c1340000-0000-4000-8000-000000000714"}',
    'c1340000-0000-4000-8000-000000000d35','c1340000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from flow_acks where name='I2')),'P0001','VERSION_CONFLICT','C3: an invoice recorded as official cannot be officialized');
select throws_ok(format($$
  select public.c1_material_record_invoice(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',%L,
    '{"invoiceSymbol":"1C26TAA","invoiceNo":"0000003","issuedOn":"2026-10-11","subtotal":"100000","vatAmount":"0","total":"100000","fileId":"c1340000-0000-4000-8000-000000000712","lines":[]}',
    'c1340000-0000-4000-8000-000000000d36','c1340000-0000-4000-8000-000000000c00')
$$,(select id from flow_refs where name='contract_351')),'P0001','EVIDENCE_INVALID','C3: the official file of an invoice cannot back another invoice');
select is((
  select request.state||':'||string_agg(link.invoice_id::text, ',')
  from public.material_payment_requests as request
  join public.material_payment_request_invoices as link on link.payment_request_id=request.id
  where request.id=(select (body->>'resourceId')::uuid from flow_acks where name='R1')
  group by request.state
),'paid:'||(select body->>'resourceId' from flow_acks where name='I1'),'C3: the paid request keeps its link to the officialized invoice');

-- facts after officialize -------------------------------------------------------------------
select is((
  select (contract->>'invoiced')||'|'||(contract->>'draftInvoiced')
  from jsonb_array_elements(public.c1_material_finance_facts('c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101')->'contracts') as contract
  where contract->>'orderId'='c1340000-0000-4000-8000-000000000351'
),'3150000.0000|0','facts: invoiced is unchanged and draftInvoiced drops by the officialized total');
select is((
  select (facts->>'invoiced')||'|'||(facts->>'draftInvoiced')
  from (select public.c1_material_read_contract('c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101','c1340000-0000-4000-8000-000000000351') as facts) as q
),'3150000.0000|0.0000','facts: read_contract draftInvoiced drops after officialize');
select is((
  select jsonb_build_object('stage',element->'stage','officialFileId',element->'officialFileId','officialized',element->'officializedAt' <> 'null'::jsonb)
  from jsonb_array_elements(public.c1_material_list_invoices(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',(select id from flow_refs where name='contract_351'))) as listed(element)
  where element->>'id'=(select body->>'resourceId' from flow_acks where name='I1')
),'{"stage":"official","officialFileId":"c1340000-0000-4000-8000-000000000712","officialized":true}'::jsonb,
'C3: list_invoices exposes stage, officialFileId and officializedAt of the officialized invoice');
select is((
  select jsonb_build_object('stage',element->'stage','officialFileId',element->'officialFileId','officializedAt',element->'officializedAt')
  from jsonb_array_elements(public.c1_material_list_invoices(
    'c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',(select id from flow_refs where name='contract_351'))) as listed(element)
  where element->>'id'=(select body->>'resourceId' from flow_acks where name='I2')
),'{"stage":"official","officialFileId":null,"officializedAt":null}'::jsonb,
'C3: an invoice recorded as official lists a null officialFileId and officializedAt');

-- legacy rows -------------------------------------------------------------------------------
set local role none;
insert into public.material_invoices(
  tenant_id,company_id,project_id,contract_id,supplier_id,invoice_symbol,invoice_no,issued_on,subtotal,vat_amount,total,file_id,recorded_by
) values (
  'c1340000-0000-4000-8000-000000000010','c1340000-0000-4000-8000-000000000020','c1340000-0000-4000-8000-000000000101',
  'c1340000-0000-4000-8000-000000000655','c1340000-0000-4000-8000-000000000201','1C26TBB','0000009','2026-10-11',100000,0,100000,
  'c1340000-0000-4000-8000-000000000721','c1340000-0000-4000-8000-000000000901'
);
select is((
  select stage||'|'||coalesce(official_file_id::text,'<null>')||'|'||coalesce(officialized_at::text,'<null>')
  from public.material_invoices where file_id='c1340000-0000-4000-8000-000000000721'
),'official|<null>|<null>','legacy: an invoice row written without stage reads stage = official');
select throws_ok($$
  update public.material_invoices set stage='draft', official_file_id='c1340000-0000-4000-8000-000000000714'
  where file_id='c1340000-0000-4000-8000-000000000721'
$$,'23514',null,'legacy: a draft with an official file violates the stage check');

-- privileges ----------------------------------------------------------------------------------
select ok(
  has_function_privilege('authenticated','public.c1_material_officialize_invoice(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.c1_material_officialize_invoice(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_officialize_invoice(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE'),
  'privileges: officialize runs through its public wrapper for authenticated users only'
);
select ok(
  not has_function_privilege('authenticated','private.c1_material_record_payment(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_read_contract(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_require_contract_file(uuid,uuid,uuid,uuid,text,text,uuid,uuid)','EXECUTE'),
  'privileges: the rewritten private functions stay private'
);

select * from finish(true);
rollback;
