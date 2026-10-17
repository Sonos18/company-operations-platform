begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(28);

-- Cash payments for small orders (20261016090100). Rollback-only fixture with prefix c132.
-- Contracts and amendments are written directly as the fixture owner so this suite does not
-- depend on the contract commands; requests, approvals, invoices and payments use the real RPCs.
--   601  order 351  quotation_only, 4000000, installment a01; its requests link invoice I1
--                   (711), required for records without a contract since 20261016100100 (C2)
--   602  order 352  contract, 4000000 + 500000 VAT = 4500000, installment a02 (needs an invoice)
--   603  order 353  contract, 48000000, advance installment a03
--   604  order 354  contract, 4000000, advance a04; amended to 6000000 after the request is approved
--   605  order 355  contract, 3000000, advance a05; amended so a05 is no longer an advance
--   606  order 356  contract, a 48000000 order recorded as a contract of 4900000 (with a variance
--                   reason), advance a06: the contract total is small, the order is not
-- Users: accountant K (901) records invoices and requests payments, treasurer Q (903) approves
-- and pays, buyer B (905) owns the orders.

-- structure -----------------------------------------------------------------------------------
select ok((
  select column_default='''bank_transfer''::text' and is_nullable='NO'
  from information_schema.columns where table_schema='public' and table_name='material_payments' and column_name='method'
) and (
  select is_nullable='YES'
  from information_schema.columns where table_schema='public' and table_name='material_payments' and column_name='bank_reference'
),'structure: method defaults to bank_transfer and bank_reference is nullable');
select ok(
  has_function_privilege('authenticated','public.c1_material_record_payment(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.c1_material_record_payment(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_record_payment(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE'),
  'privileges: record_payment keeps its grants: authenticated through the public wrapper only'
);

-- fixture -------------------------------------------------------------------------------------
insert into auth.users(id,email) values
('c1320000-0000-4000-8000-000000000901','smallpay-k@test.invalid'),
('c1320000-0000-4000-8000-000000000903','smallpay-q@test.invalid'),
('c1320000-0000-4000-8000-000000000905','smallpay-buyer@test.invalid');
insert into public.tenants(id,code,name)
values('c1320000-0000-4000-8000-000000000010','C1SMALLPAY','Small payment tenant');
insert into public.companies(id,tenant_id,code,name)
values('c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000010','C1SMALLPAY','Small payment company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select id,'c1320000-0000-4000-8000-000000000010',array['member'] from auth.users where id::text like 'c1320000-0000-4000-8000-00000000090_';
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select id,'c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020',array['member'],true from auth.users where id::text like 'c1320000-0000-4000-8000-00000000090_';
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system)
select role_row.id,'c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020',role_row.code,role_row.code,'rollback fixture',false
from (values
 ('c1320000-0000-4000-8000-000000000911'::uuid,'smallpay_accountant'),
 ('c1320000-0000-4000-8000-000000000913'::uuid,'smallpay_treasurer'),
 ('c1320000-0000-4000-8000-000000000915'::uuid,'smallpay_buyer')
) as role_row(id,code);
insert into public.role_permissions(role_id,permission_code) values
('c1320000-0000-4000-8000-000000000911','material.read'),
('c1320000-0000-4000-8000-000000000911','material.finance.read'),
('c1320000-0000-4000-8000-000000000911','material.contract.record'),
('c1320000-0000-4000-8000-000000000911','material.payment.request'),
('c1320000-0000-4000-8000-000000000913','material.read'),
('c1320000-0000-4000-8000-000000000913','material.finance.read'),
('c1320000-0000-4000-8000-000000000913','material.payment.approve'),
('c1320000-0000-4000-8000-000000000913','material.payment.execute'),
('c1320000-0000-4000-8000-000000000915','material.read'),
('c1320000-0000-4000-8000-000000000915','material.order.manage');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason)
select 'c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020',assignment.user_id,assignment.role_id,'c1320000-0000-4000-8000-000000000901','rollback fixture'
from (values
 ('c1320000-0000-4000-8000-000000000901'::uuid,'c1320000-0000-4000-8000-000000000911'::uuid),
 ('c1320000-0000-4000-8000-000000000903'::uuid,'c1320000-0000-4000-8000-000000000913'::uuid),
 ('c1320000-0000-4000-8000-000000000905'::uuid,'c1320000-0000-4000-8000-000000000915'::uuid)
) as assignment(user_id,role_id);
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000010',true,'c1320000-0000-4000-8000-000000000901');
insert into public.projects(id,tenant_id,company_id,code,name,operational_state,origin,created_by)
values('c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','SMALLPAY-P','Small payment project','active','manual','c1320000-0000-4000-8000-000000000901');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c1320000-0000-4000-8000-000000000201','c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','SMALLPAY-S','Small payment supplier','organization','c1320000-0000-4000-8000-000000000905');
insert into public.material_items(id,tenant_id,company_id,code,name,specification,unit,created_by)
values('c1320000-0000-4000-8000-000000000251','c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','SMALLPAY-STEEL','Steel','D10','kg','c1320000-0000-4000-8000-000000000905');
insert into public.material_proposals(id,tenant_id,company_id,project_id,needed_on,delivery_address,created_by)
values('c1320000-0000-4000-8000-000000000301','c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','2026-10-30','Site A','c1320000-0000-4000-8000-000000000905');
insert into public.material_proposal_lines(id,tenant_id,company_id,project_id,proposal_id,material_id,quantity,created_by)
values('c1320000-0000-4000-8000-000000000311','c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000301','c1320000-0000-4000-8000-000000000251',10,'c1320000-0000-4000-8000-000000000905');
insert into public.material_proposal_revisions(id,tenant_id,company_id,project_id,proposal_id,revision_no,needed_on,delivery_address,submitted_by)
values('c1320000-0000-4000-8000-000000000401','c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000301',1,'2026-10-30','Site A','c1320000-0000-4000-8000-000000000905');
insert into public.material_proposal_revision_lines(revision_id,proposal_line_id,proposal_id,tenant_id,company_id,project_id,material_id,material_name,specification,unit,quantity)
values('c1320000-0000-4000-8000-000000000401','c1320000-0000-4000-8000-000000000311','c1320000-0000-4000-8000-000000000301','c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000251','Steel','D10','kg',10);
update public.material_proposals
set review_state='approved',current_revision_id='c1320000-0000-4000-8000-000000000401',approved_revision_id='c1320000-0000-4000-8000-000000000401'
where id='c1320000-0000-4000-8000-000000000301';

-- Finalized evidence. 803 carries the same bytes as 801 (same sha256 as 801).
insert into public.cost_evidence_files(
 id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
 verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version
)
select
 file.id,'c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000010/c1320000-0000-4000-8000-000000000020/c1320000-0000-4000-8000-000000000101/'||file.id::text,
 'file-'||file.hash_seed,file.mime,8,lpad(to_hex(file.hash_seed),64,'0'),file.mime,8,lpad(to_hex(file.hash_seed),64,'0'),'finalized',
 now()+interval '15 minutes','c1320000-0000-4000-8000-000000000901','c1320000-0000-4000-8000-000000000901',now(),1
from (values
 ('c1320000-0000-4000-8000-000000000501'::uuid,501,'application/pdf'),
 ('c1320000-0000-4000-8000-000000000511'::uuid,511,'image/png'),
 ('c1320000-0000-4000-8000-000000000521'::uuid,521,'application/pdf'),('c1320000-0000-4000-8000-000000000522'::uuid,522,'application/pdf'),
 ('c1320000-0000-4000-8000-000000000531'::uuid,531,'application/pdf'),('c1320000-0000-4000-8000-000000000532'::uuid,532,'application/pdf'),
 ('c1320000-0000-4000-8000-000000000541'::uuid,541,'application/pdf'),('c1320000-0000-4000-8000-000000000542'::uuid,542,'application/pdf'),
 ('c1320000-0000-4000-8000-000000000551'::uuid,551,'application/pdf'),('c1320000-0000-4000-8000-000000000552'::uuid,552,'application/pdf'),
 ('c1320000-0000-4000-8000-000000000743'::uuid,743,'application/pdf'),
 ('c1320000-0000-4000-8000-000000000753'::uuid,753,'application/pdf'),
 ('c1320000-0000-4000-8000-000000000711'::uuid,711,'application/pdf'),
 ('c1320000-0000-4000-8000-000000000721'::uuid,721,'application/pdf'),
 ('c1320000-0000-4000-8000-000000000801'::uuid,6801,'image/png'),('c1320000-0000-4000-8000-000000000802'::uuid,6802,'image/png'),('c1320000-0000-4000-8000-000000000803'::uuid,6801,'image/png'),
 ('c1320000-0000-4000-8000-000000000804'::uuid,6804,'image/png'),('c1320000-0000-4000-8000-000000000805'::uuid,6805,'image/png'),
 ('c1320000-0000-4000-8000-000000000811'::uuid,6811,'image/png'),
 ('c1320000-0000-4000-8000-000000000821'::uuid,6821,'image/png'),
 ('c1320000-0000-4000-8000-000000000831'::uuid,6831,'image/png'),
 ('c1320000-0000-4000-8000-000000000841'::uuid,6841,'image/png'),
 ('c1320000-0000-4000-8000-000000000851'::uuid,6851,'image/png'),
 ('c1320000-0000-4000-8000-000000000861'::uuid,6861,'application/pdf'),('c1320000-0000-4000-8000-000000000862'::uuid,6862,'application/pdf')
) as file(id,hash_seed,mime);

insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
)
select order_row.id,'c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000301','c1320000-0000-4000-8000-000000000401','c1320000-0000-4000-8000-000000000201','VND','c1320000-0000-4000-8000-000000000501','c1320000-0000-4000-8000-000000000905'
from (values ('c1320000-0000-4000-8000-000000000351'::uuid),('c1320000-0000-4000-8000-000000000352'::uuid),('c1320000-0000-4000-8000-000000000353'::uuid),('c1320000-0000-4000-8000-000000000354'::uuid),('c1320000-0000-4000-8000-000000000355'::uuid),('c1320000-0000-4000-8000-000000000356'::uuid)) as order_row(id);
insert into public.material_order_allocations(
  tenant_id,company_id,project_id,order_id,proposal_id,approved_revision_id,proposal_line_id,quantity,unit_price,quotation_material_name,mapping_confirmed
)
select 'c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',allocation.order_id,'c1320000-0000-4000-8000-000000000301','c1320000-0000-4000-8000-000000000401','c1320000-0000-4000-8000-000000000311',1,allocation.unit_price,'Quoted steel',true
from (values
 ('c1320000-0000-4000-8000-000000000351'::uuid,4000000::numeric),
 ('c1320000-0000-4000-8000-000000000352'::uuid,4000000::numeric),
 ('c1320000-0000-4000-8000-000000000353'::uuid,48000000::numeric),
 ('c1320000-0000-4000-8000-000000000354'::uuid,4000000::numeric),
 ('c1320000-0000-4000-8000-000000000355'::uuid,3000000::numeric),
 ('c1320000-0000-4000-8000-000000000356'::uuid,48000000::numeric)
) as allocation(order_id,unit_price);

insert into public.material_contracts(id,tenant_id,company_id,project_id,order_id,supplier_id,currency_code,documentation,contract_no,signed_on,created_by)
select contract.id,'c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',contract.order_id,'c1320000-0000-4000-8000-000000000201','VND',contract.documentation,contract.contract_no,'2026-01-05','c1320000-0000-4000-8000-000000000901'
from (values
 ('c1320000-0000-4000-8000-000000000601'::uuid,'c1320000-0000-4000-8000-000000000351'::uuid,'quotation_only',null::text),
 ('c1320000-0000-4000-8000-000000000602'::uuid,'c1320000-0000-4000-8000-000000000352'::uuid,'contract','HD-SP-02'),
 ('c1320000-0000-4000-8000-000000000603'::uuid,'c1320000-0000-4000-8000-000000000353'::uuid,'contract','HD-SP-03'),
 ('c1320000-0000-4000-8000-000000000604'::uuid,'c1320000-0000-4000-8000-000000000354'::uuid,'contract','HD-SP-04'),
 ('c1320000-0000-4000-8000-000000000605'::uuid,'c1320000-0000-4000-8000-000000000355'::uuid,'contract','HD-SP-05'),
 ('c1320000-0000-4000-8000-000000000606'::uuid,'c1320000-0000-4000-8000-000000000356'::uuid,'contract','HD-SP-06')
) as contract(id,order_id,documentation,contract_no);
insert into public.material_contract_versions(
  id,tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
  order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
)
select version_row.id,'c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',version_row.contract_id,1,'original',version_row.subtotal,version_row.vat,version_row.subtotal+version_row.vat,
  coalesce(version_row.order_subtotal,version_row.subtotal),version_row.variance_reason,
  version_row.contract_file_id,version_row.quotation_file_id,null,'c1320000-0000-4000-8000-000000000901'
from (values
 ('c1320000-0000-4000-8000-000000000611'::uuid,'c1320000-0000-4000-8000-000000000601'::uuid,4000000::numeric,0::numeric,null::uuid,'c1320000-0000-4000-8000-000000000511'::uuid,null::numeric,null::text),
 ('c1320000-0000-4000-8000-000000000621'::uuid,'c1320000-0000-4000-8000-000000000602'::uuid,4000000::numeric,500000::numeric,'c1320000-0000-4000-8000-000000000521'::uuid,'c1320000-0000-4000-8000-000000000522'::uuid,null::numeric,null::text),
 ('c1320000-0000-4000-8000-000000000631'::uuid,'c1320000-0000-4000-8000-000000000603'::uuid,48000000::numeric,0::numeric,'c1320000-0000-4000-8000-000000000531'::uuid,'c1320000-0000-4000-8000-000000000532'::uuid,null::numeric,null::text),
 ('c1320000-0000-4000-8000-000000000641'::uuid,'c1320000-0000-4000-8000-000000000604'::uuid,4000000::numeric,0::numeric,'c1320000-0000-4000-8000-000000000541'::uuid,'c1320000-0000-4000-8000-000000000542'::uuid,null::numeric,null::text),
 ('c1320000-0000-4000-8000-000000000651'::uuid,'c1320000-0000-4000-8000-000000000605'::uuid,3000000::numeric,0::numeric,'c1320000-0000-4000-8000-000000000551'::uuid,'c1320000-0000-4000-8000-000000000552'::uuid,null::numeric,null::text),
 ('c1320000-0000-4000-8000-000000000661'::uuid,'c1320000-0000-4000-8000-000000000606'::uuid,4900000::numeric,0::numeric,'c1320000-0000-4000-8000-000000000861'::uuid,'c1320000-0000-4000-8000-000000000862'::uuid,48000000::numeric,'Hop dong chi cho mot phan don')
) as version_row(id,contract_id,subtotal,vat,contract_file_id,quotation_file_id,order_subtotal,variance_reason);
insert into public.material_contract_installments(
  tenant_id,company_id,project_id,contract_id,contract_version_id,seq,installment_key,name,amount,due_on,is_advance
)
select 'c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',installment.contract_id,installment.version_id,1,installment.installment_key,installment.name,installment.amount,'2026-12-01',installment.is_advance
from (values
 ('c1320000-0000-4000-8000-000000000601'::uuid,'c1320000-0000-4000-8000-000000000611'::uuid,'c1320000-0000-4000-8000-000000000a01'::uuid,'Thanh toán 100%',4000000::numeric,false),
 ('c1320000-0000-4000-8000-000000000602'::uuid,'c1320000-0000-4000-8000-000000000621'::uuid,'c1320000-0000-4000-8000-000000000a02'::uuid,'Dot 1',4500000::numeric,false),
 ('c1320000-0000-4000-8000-000000000603'::uuid,'c1320000-0000-4000-8000-000000000631'::uuid,'c1320000-0000-4000-8000-000000000a03'::uuid,'Tam ung',48000000::numeric,true),
 ('c1320000-0000-4000-8000-000000000604'::uuid,'c1320000-0000-4000-8000-000000000641'::uuid,'c1320000-0000-4000-8000-000000000a04'::uuid,'Tam ung',4000000::numeric,true),
 ('c1320000-0000-4000-8000-000000000605'::uuid,'c1320000-0000-4000-8000-000000000651'::uuid,'c1320000-0000-4000-8000-000000000a05'::uuid,'Tam ung',3000000::numeric,true),
 ('c1320000-0000-4000-8000-000000000606'::uuid,'c1320000-0000-4000-8000-000000000661'::uuid,'c1320000-0000-4000-8000-000000000a06'::uuid,'Tam ung',4900000::numeric,true)
) as installment(contract_id,version_id,installment_key,name,amount,is_advance);

insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,contract_id,evidence_role,created_by)
select scope.file_id,'c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','material_contract',scope.contract_id,scope.evidence_role,'c1320000-0000-4000-8000-000000000901'
from (values
 ('c1320000-0000-4000-8000-000000000711'::uuid,'c1320000-0000-4000-8000-000000000601'::uuid,'invoice'),
 ('c1320000-0000-4000-8000-000000000721'::uuid,'c1320000-0000-4000-8000-000000000602'::uuid,'invoice'),
 ('c1320000-0000-4000-8000-000000000801'::uuid,'c1320000-0000-4000-8000-000000000601'::uuid,'payment_proof'),
 ('c1320000-0000-4000-8000-000000000802'::uuid,'c1320000-0000-4000-8000-000000000601'::uuid,'payment_proof'),
 ('c1320000-0000-4000-8000-000000000803'::uuid,'c1320000-0000-4000-8000-000000000601'::uuid,'payment_proof'),
 ('c1320000-0000-4000-8000-000000000804'::uuid,'c1320000-0000-4000-8000-000000000601'::uuid,'payment_proof'),
 ('c1320000-0000-4000-8000-000000000805'::uuid,'c1320000-0000-4000-8000-000000000601'::uuid,'payment_proof'),
 ('c1320000-0000-4000-8000-000000000811'::uuid,'c1320000-0000-4000-8000-000000000602'::uuid,'payment_proof'),
 ('c1320000-0000-4000-8000-000000000821'::uuid,'c1320000-0000-4000-8000-000000000603'::uuid,'payment_proof'),
 ('c1320000-0000-4000-8000-000000000831'::uuid,'c1320000-0000-4000-8000-000000000604'::uuid,'payment_proof'),
 ('c1320000-0000-4000-8000-000000000841'::uuid,'c1320000-0000-4000-8000-000000000605'::uuid,'payment_proof'),
 ('c1320000-0000-4000-8000-000000000851'::uuid,'c1320000-0000-4000-8000-000000000606'::uuid,'payment_proof')
) as scope(file_id,contract_id,evidence_role);

create temporary table sp_acks(name text primary key, body jsonb not null);
create temporary table sp_reads(element jsonb not null);
grant select,insert on sp_acks,sp_reads to authenticated;

-- requests and approvals ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1320000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into sp_acks select 'I4', public.c1_material_record_invoice(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000602',
  '{"invoiceSymbol":"1C26TAA","invoiceNo":"0000001","issuedOn":"2026-01-10","subtotal":"4000000","vatAmount":"500000","total":"4500000","fileId":"c1320000-0000-4000-8000-000000000721","lines":[{"proposalLineId":"c1320000-0000-4000-8000-000000000311","invoiceMaterialName":"Thep cuon D10"}]}',
  'c1320000-0000-4000-8000-000000000d01','c1320000-0000-4000-8000-000000000c00');
insert into sp_acks select 'I1', public.c1_material_record_invoice(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000601',
  '{"invoiceSymbol":"1C26TAA","invoiceNo":"0000011","issuedOn":"2026-01-10","subtotal":"4000000","vatAmount":"0","total":"4000000","fileId":"c1320000-0000-4000-8000-000000000711","lines":[]}',
  'c1320000-0000-4000-8000-000000000d02','c1320000-0000-4000-8000-000000000c00');
-- A quotation_only record needs an invoice for its installment, like a contract (C2).
insert into sp_acks select 'RL', public.c1_material_create_payment_request(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000601',
  jsonb_build_object('installmentKey','c1320000-0000-4000-8000-000000000a01','amount','500000','note',null,
    'invoiceIds',jsonb_build_array((select body->>'resourceId' from sp_acks where name='I1'))),
  'c1320000-0000-4000-8000-000000000d11','c1320000-0000-4000-8000-000000000c00');
insert into sp_acks select 'R1', public.c1_material_create_payment_request(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000601',
  jsonb_build_object('installmentKey','c1320000-0000-4000-8000-000000000a01','amount','1000000','note',null,
    'invoiceIds',jsonb_build_array((select body->>'resourceId' from sp_acks where name='I1'))),
  'c1320000-0000-4000-8000-000000000d12','c1320000-0000-4000-8000-000000000c00');
insert into sp_acks select 'R2', public.c1_material_create_payment_request(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000601',
  jsonb_build_object('installmentKey','c1320000-0000-4000-8000-000000000a01','amount','1000000','note',null,
    'invoiceIds',jsonb_build_array((select body->>'resourceId' from sp_acks where name='I1'))),
  'c1320000-0000-4000-8000-000000000d13','c1320000-0000-4000-8000-000000000c00');
insert into sp_acks select 'R3', public.c1_material_create_payment_request(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000601',
  jsonb_build_object('installmentKey','c1320000-0000-4000-8000-000000000a01','amount','500000','note',null,
    'invoiceIds',jsonb_build_array((select body->>'resourceId' from sp_acks where name='I1'))),
  'c1320000-0000-4000-8000-000000000d14','c1320000-0000-4000-8000-000000000c00');
insert into sp_acks select 'R4', public.c1_material_create_payment_request(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000602',
  jsonb_build_object('installmentKey','c1320000-0000-4000-8000-000000000a02','amount','4500000','invoiceIds',jsonb_build_array((select body->>'resourceId' from sp_acks where name='I4')),'note',null),
  'c1320000-0000-4000-8000-000000000d15','c1320000-0000-4000-8000-000000000c00');
insert into sp_acks select 'R6', public.c1_material_create_payment_request(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000603','{"installmentKey":"c1320000-0000-4000-8000-000000000a03","amount":"1000000","invoiceIds":[],"note":null}','c1320000-0000-4000-8000-000000000d16','c1320000-0000-4000-8000-000000000c00');
insert into sp_acks select 'R7', public.c1_material_create_payment_request(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000604','{"installmentKey":"c1320000-0000-4000-8000-000000000a04","amount":"4000000","invoiceIds":[],"note":null}','c1320000-0000-4000-8000-000000000d17','c1320000-0000-4000-8000-000000000c00');
insert into sp_acks select 'R8', public.c1_material_create_payment_request(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000605','{"installmentKey":"c1320000-0000-4000-8000-000000000a05","amount":"3000000","invoiceIds":[],"note":null}','c1320000-0000-4000-8000-000000000d18','c1320000-0000-4000-8000-000000000c00');
insert into sp_acks select 'R9', public.c1_material_create_payment_request(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000606','{"installmentKey":"c1320000-0000-4000-8000-000000000a06","amount":"1000000","invoiceIds":[],"note":null}','c1320000-0000-4000-8000-000000000d19','c1320000-0000-4000-8000-000000000c00');

select set_config('request.jwt.claims','{"sub":"c1320000-0000-4000-8000-000000000903","role":"authenticated"}',true);
insert into sp_acks select 'D_'||request.name, public.c1_material_decide_payment_request(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from sp_acks where name=request.name),
  '{"expectedVersion":1,"decision":"approve"}',request.key::uuid,'c1320000-0000-4000-8000-000000000c00')
from (values ('RL','c1320000-0000-4000-8000-000000000d21'),('R1','c1320000-0000-4000-8000-000000000d22'),('R2','c1320000-0000-4000-8000-000000000d23'),('R3','c1320000-0000-4000-8000-000000000d24'),('R4','c1320000-0000-4000-8000-000000000d25'),('R6','c1320000-0000-4000-8000-000000000d26'),('R7','c1320000-0000-4000-8000-000000000d27'),('R8','c1320000-0000-4000-8000-000000000d28'),('R9','c1320000-0000-4000-8000-000000000d29')) as request(name,key);

-- Amendments written as the fixture owner after approval:
--   604 rises from 4000000 to 6000000 (above the cash limit);
--   605 keeps its amount but a05 is no longer an advance installment.
set local role none;
insert into public.material_contract_versions(
  id,tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
  order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
) values
('c1320000-0000-4000-8000-000000000642','c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000604',2,'amendment',6000000,0,6000000,4000000,'Phat sinh','c1320000-0000-4000-8000-000000000743',null,'Tang gia tri','c1320000-0000-4000-8000-000000000905'),
('c1320000-0000-4000-8000-000000000652','c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000605',2,'amendment',3000000,0,3000000,3000000,null,'c1320000-0000-4000-8000-000000000753',null,'Bo tam ung','c1320000-0000-4000-8000-000000000905');
insert into public.material_contract_installments(
  tenant_id,company_id,project_id,contract_id,contract_version_id,seq,installment_key,name,amount,due_on,is_advance
)
select 'c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',item.contract_id,item.version_id,item.seq,item.installment_key,item.name,item.amount,'2026-12-01',item.is_advance
from (values
 ('c1320000-0000-4000-8000-000000000604'::uuid,'c1320000-0000-4000-8000-000000000642'::uuid,1,'c1320000-0000-4000-8000-000000000a04'::uuid,'Tam ung',4000000::numeric,true),
 ('c1320000-0000-4000-8000-000000000604'::uuid,'c1320000-0000-4000-8000-000000000642'::uuid,2,'c1320000-0000-4000-8000-000000000a14'::uuid,'Dot 2',2000000::numeric,true),
 ('c1320000-0000-4000-8000-000000000605'::uuid,'c1320000-0000-4000-8000-000000000652'::uuid,1,'c1320000-0000-4000-8000-000000000a05'::uuid,'Dot 1',3000000::numeric,false)
) as item(contract_id,version_id,seq,installment_key,name,amount,is_advance);
update public.material_contracts set current_version_no=2, version=2 where id in ('c1320000-0000-4000-8000-000000000604','c1320000-0000-4000-8000-000000000605');

-- a legacy payment row written without the new column ----------------------------------------------------
insert into public.material_payments(
  tenant_id,company_id,project_id,payment_request_id,contract_id,installment_key,amount,paid_on,bank_reference,proof_file_id,proof_sha256,paid_by
) values (
  'c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from sp_acks where name='RL'),'c1320000-0000-4000-8000-000000000601','c1320000-0000-4000-8000-000000000a01',500000,'2026-01-11','UNC-OLD',
  'c1320000-0000-4000-8000-000000000804',lpad(to_hex(6804),64,'0'),'c1320000-0000-4000-8000-000000000903'
);
select is((
  select method||':'||bank_reference from public.material_payments where payment_request_id=(select (body->>'resourceId')::uuid from sp_acks where name='RL')
),'bank_transfer:UNC-OLD','legacy: a payment row written without method reads method = bank_transfer');

-- cash on a record without a contract ------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1320000-0000-4000-8000-000000000903","role":"authenticated"}',true);
insert into sp_acks select 'P1', public.c1_material_record_payment(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from sp_acks where name='R1'),
  '{"expectedVersion":2,"paidOn":"2026-01-12","method":"cash","bankReference":null,"proofFileId":"c1320000-0000-4000-8000-000000000801"}',
  'c1320000-0000-4000-8000-000000000e01','c1320000-0000-4000-8000-000000000c00');
select is((
  select body - 'resourceId' from sp_acks where name='P1'
),'{"version":3,"replayed":false}'::jsonb,'cash: a quotation_only record is paid in cash with a null bank reference');
select is((
  select payment.method||':'||coalesce(payment.bank_reference,'<null>')||':'||request.state
  from public.material_payments as payment join public.material_payment_requests as request on request.id=payment.payment_request_id
  where payment.payment_request_id=(select (body->>'resourceId')::uuid from sp_acks where name='R1')
),'cash:<null>:paid','cash: the stored payment has method cash and no bank reference');
select is((
  select count(*) from public.material_payment_request_invoices
  where payment_request_id=(select (body->>'resourceId')::uuid from sp_acks where name='R1')
),1::bigint,'invoice: the paid quotation_only request links its recorded invoice');

-- cash on a contract record of 4500000 with VAT, bankReference left out entirely -------------------------------
insert into sp_acks select 'P4', public.c1_material_record_payment(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from sp_acks where name='R4'),
  '{"expectedVersion":2,"paidOn":"2026-01-12","method":"cash","proofFileId":"c1320000-0000-4000-8000-000000000811"}',
  'c1320000-0000-4000-8000-000000000e02','c1320000-0000-4000-8000-000000000c00');
select is((
  select body - 'resourceId' from sp_acks where name='P4'
),'{"version":3,"replayed":false}'::jsonb,'cash: a contract record of 4500000 with an invoice is paid in cash without a bankReference key');
select is((
  select payment.method||':'||coalesce(payment.bank_reference,'<null>')
  from public.material_payments as payment where payment.payment_request_id=(select (body->>'resourceId')::uuid from sp_acks where name='R4')
),'cash:<null>','cash: the stored payment of the contract record has method cash and no bank reference');

-- CASH_PAYMENT_NOT_ALLOWED -----------------------------------------------------------------------------
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","method":"cash","bankReference":null,"proofFileId":"c1320000-0000-4000-8000-000000000821"}',
    'c1320000-0000-4000-8000-000000000e03','c1320000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from sp_acks where name='R6')),'P0001','CASH_PAYMENT_NOT_ALLOWED','cash: a contract of 48000000 cannot be paid in cash');
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","method":"cash","bankReference":null,"proofFileId":"c1320000-0000-4000-8000-000000000831"}',
    'c1320000-0000-4000-8000-000000000e04','c1320000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from sp_acks where name='R7')),'P0001','CASH_PAYMENT_NOT_ALLOWED','cash: a contract of 4000000 amended up to 6000000 can no longer be paid in cash');
insert into sp_acks select 'P6', public.c1_material_record_payment(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from sp_acks where name='R6'),
  '{"expectedVersion":2,"paidOn":"2026-01-12","method":"bank_transfer","bankReference":"UNC-48","proofFileId":"c1320000-0000-4000-8000-000000000821"}',
  'c1320000-0000-4000-8000-000000000e05','c1320000-0000-4000-8000-000000000c00');
select is((
  select payment.method||':'||payment.bank_reference
  from public.material_payments as payment where payment.payment_request_id=(select (body->>'resourceId')::uuid from sp_acks where name='R6')
),'bank_transfer:UNC-48','cash: the 48000000 contract is still paid by bank transfer');

-- A 48000000 order recorded as a contract of 4900000: the contract total is small, but the
-- order subtotal snapshot is not, so cash is rejected for it too (R7).
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","method":"cash","bankReference":null,"proofFileId":"c1320000-0000-4000-8000-000000000851"}',
    'c1320000-0000-4000-8000-000000000e17','c1320000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from sp_acks where name='R9')),'P0001','CASH_PAYMENT_NOT_ALLOWED','cash: a 48000000 order recorded as a contract of 4900000 cannot be paid in cash');

-- INPUT_INVALID ----------------------------------------------------------------------------------------
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","method":"cash","bankReference":"UNC-1","proofFileId":"c1320000-0000-4000-8000-000000000802"}',
    'c1320000-0000-4000-8000-000000000e06','c1320000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from sp_acks where name='R2')),'P0001','INPUT_INVALID','input: cash with a bank reference');
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","method":"cash","bankReference":"","proofFileId":"c1320000-0000-4000-8000-000000000802"}',
    'c1320000-0000-4000-8000-000000000e07','c1320000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from sp_acks where name='R2')),'P0001','INPUT_INVALID','input: cash with an empty bank reference');
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","method":"cash","bankReference":"   ","proofFileId":"c1320000-0000-4000-8000-000000000802"}',
    'c1320000-0000-4000-8000-000000000e08','c1320000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from sp_acks where name='R2')),'P0001','INPUT_INVALID','input: cash with a blank bank reference');
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","method":"bank_transfer","bankReference":null,"proofFileId":"c1320000-0000-4000-8000-000000000802"}',
    'c1320000-0000-4000-8000-000000000e09','c1320000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from sp_acks where name='R2')),'P0001','INPUT_INVALID','input: bank transfer without a bank reference (null)');
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","method":"bank_transfer","proofFileId":"c1320000-0000-4000-8000-000000000802"}',
    'c1320000-0000-4000-8000-000000000e10','c1320000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from sp_acks where name='R2')),'P0001','INPUT_INVALID','input: bank transfer without a bankReference key');
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","bankReference":null,"proofFileId":"c1320000-0000-4000-8000-000000000802"}',
    'c1320000-0000-4000-8000-000000000e11','c1320000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from sp_acks where name='R2')),'P0001','INPUT_INVALID','input: a missing method means bank transfer, so a null bank reference is rejected');
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","method":"card","bankReference":"UNC-1","proofFileId":"c1320000-0000-4000-8000-000000000802"}',
    'c1320000-0000-4000-8000-000000000e12','c1320000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from sp_acks where name='R2')),'P0001','INPUT_INVALID','input: an unknown method');
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","method":7,"bankReference":"UNC-1","proofFileId":"c1320000-0000-4000-8000-000000000802"}',
    'c1320000-0000-4000-8000-000000000e13','c1320000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from sp_acks where name='R2')),'P0001','INPUT_INVALID','input: a method that is not a string');

-- a missing method key means bank transfer --------------------------------------------------------------
insert into sp_acks select 'P2', public.c1_material_record_payment(
  'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from sp_acks where name='R2'),
  '{"expectedVersion":2,"paidOn":"2026-01-12","bankReference":"UNC-2","proofFileId":"c1320000-0000-4000-8000-000000000802"}',
  'c1320000-0000-4000-8000-000000000e14','c1320000-0000-4000-8000-000000000c00');
select is((
  select payment.method||':'||payment.bank_reference
  from public.material_payments as payment where payment.payment_request_id=(select (body->>'resourceId')::uuid from sp_acks where name='R2')
),'bank_transfer:UNC-2','input: a payment without a method key is stored as a bank transfer');

-- invoices and proofs -----------------------------------------------------------------------------------
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","method":"cash","bankReference":null,"proofFileId":"c1320000-0000-4000-8000-000000000841"}',
    'c1320000-0000-4000-8000-000000000e15','c1320000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from sp_acks where name='R8')),'P0001','INVOICE_REQUIRED','invoice: a contract record whose installment is no longer an advance still needs an invoice, in cash too');
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","method":"cash","bankReference":null,"proofFileId":"c1320000-0000-4000-8000-000000000803"}',
    'c1320000-0000-4000-8000-000000000e16','c1320000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from sp_acks where name='R3')),'P0001','PROOF_ALREADY_USED','proof: a cash payment cannot reuse a proof that backs another payment');

-- reads ---------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"c1320000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into sp_reads
select element from jsonb_array_elements(public.c1_material_list_payment_requests('c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101','c1320000-0000-4000-8000-000000000601')) as listed(element);
select is((
  select jsonb_build_object('method',element->'payment'->'method','bankReference',element->'payment'->'bankReference')
  from sp_reads where element->>'id'=(select body->>'resourceId' from sp_acks where name='R1')
),'{"method":"cash","bankReference":null}'::jsonb,'reads: the payment of a cash request carries method cash and a null bankReference');
select is((
  select jsonb_build_object('method',element->'payment'->'method','bankReference',element->'payment'->'bankReference')
  from sp_reads where element->>'id'=(select body->>'resourceId' from sp_acks where name='R2')
),'{"method":"bank_transfer","bankReference":"UNC-2"}'::jsonb,'reads: the payment of a bank transfer request carries method bank_transfer and its reference');

-- table checks ---------------------------------------------------------------------------------------------
set local role none;
select throws_ok(format($$
  insert into public.material_payments(
    tenant_id,company_id,project_id,payment_request_id,contract_id,installment_key,amount,paid_on,method,bank_reference,proof_file_id,proof_sha256,paid_by
  ) values (
    'c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,'c1320000-0000-4000-8000-000000000601','c1320000-0000-4000-8000-000000000a01',500000,'2026-01-12','cash','UNC-1','c1320000-0000-4000-8000-000000000805',lpad(to_hex(6805),64,'0'),'c1320000-0000-4000-8000-000000000903')
$$,(select body->>'resourceId' from sp_acks where name='R3')),'23514',null,'checks: a cash payment with a bank reference violates the method check');
select throws_ok(format($$
  insert into public.material_payments(
    tenant_id,company_id,project_id,payment_request_id,contract_id,installment_key,amount,paid_on,method,bank_reference,proof_file_id,proof_sha256,paid_by
  ) values (
    'c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,'c1320000-0000-4000-8000-000000000601','c1320000-0000-4000-8000-000000000a01',500000,'2026-01-12','bank_transfer',null,'c1320000-0000-4000-8000-000000000805',lpad(to_hex(6805),64,'0'),'c1320000-0000-4000-8000-000000000903')
$$,(select body->>'resourceId' from sp_acks where name='R3')),'23514',null,'checks: a bank transfer without a bank reference violates the method check');
select throws_ok(format($$
  insert into public.material_payments(
    tenant_id,company_id,project_id,payment_request_id,contract_id,installment_key,amount,paid_on,method,bank_reference,proof_file_id,proof_sha256,paid_by
  ) values (
    'c1320000-0000-4000-8000-000000000010','c1320000-0000-4000-8000-000000000020','c1320000-0000-4000-8000-000000000101',%L,'c1320000-0000-4000-8000-000000000601','c1320000-0000-4000-8000-000000000a01',500000,'2026-01-12','card','UNC-1','c1320000-0000-4000-8000-000000000805',lpad(to_hex(6805),64,'0'),'c1320000-0000-4000-8000-000000000903')
$$,(select body->>'resourceId' from sp_acks where name='R3')),'23514',null,'checks: an unknown method violates the method check');

select * from finish(true);
rollback;
