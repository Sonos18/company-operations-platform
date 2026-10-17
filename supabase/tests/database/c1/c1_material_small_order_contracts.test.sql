begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(35);

-- Small orders without a contract (20261016090000). Rollback-only fixture with prefix c131.
-- Every order has one allocation of quantity 1, so the order subtotal is the unit price:
--   351  4999999.9999 VND  recorded as quotation_only with a PNG quotation (511); its payment
--                         request needs an invoice (513) since 20261016100100 (C2)
--   352  5000000      VND  exactly the threshold: CONTRACT_REQUIRED
--   353  48000000     VND  subtotal entered as 4900000 with a variance reason: CONTRACT_REQUIRED
--   354  100          USD  created while the company default currency was USD: CONTRACT_REQUIRED
--   355  4000000      VND  contract record with a PNG quotation (EVIDENCE_INVALID), input checks, upload intent
--   356  3000000      VND  recorded as contract with PDF files; its non-advance installment needs an invoice
--   357  2000000      VND  legacy contract row written directly, without the documentation column
-- Users: engineer E (901) owns the proposal, buyer B (902), accountant K (903) records
-- contracts and requests payments, treasurer T (904) approves, director D (905).

insert into auth.users(id,email) values
('c1310000-0000-4000-8000-000000000901','small-engineer@test.invalid'),
('c1310000-0000-4000-8000-000000000902','small-buyer@test.invalid'),
('c1310000-0000-4000-8000-000000000903','small-accountant@test.invalid'),
('c1310000-0000-4000-8000-000000000904','small-treasurer@test.invalid'),
('c1310000-0000-4000-8000-000000000905','small-director@test.invalid');
insert into public.tenants(id,code,name)
values('c1310000-0000-4000-8000-000000000010','C1SMALL','Small order tenant');
insert into public.companies(id,tenant_id,code,name)
values('c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000010','C1SMALL','Small order company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select id,'c1310000-0000-4000-8000-000000000010',array['member']
from auth.users where id::text like 'c1310000-0000-4000-8000-00000000090_';
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select id,'c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020',array['member'],true
from auth.users where id::text like 'c1310000-0000-4000-8000-00000000090_';
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system)
select role_row.id,'c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020',role_row.code,role_row.code,'rollback fixture',false
from (values
 ('c1310000-0000-4000-8000-000000000911'::uuid,'small_engineer'),
 ('c1310000-0000-4000-8000-000000000912'::uuid,'small_buyer'),
 ('c1310000-0000-4000-8000-000000000913'::uuid,'small_accountant'),
 ('c1310000-0000-4000-8000-000000000914'::uuid,'small_treasurer'),
 ('c1310000-0000-4000-8000-000000000915'::uuid,'small_director')
) as role_row(id,code);
insert into public.role_permissions(role_id,permission_code) values
('c1310000-0000-4000-8000-000000000911','material.read'),
('c1310000-0000-4000-8000-000000000911','material.proposal.submit'),
('c1310000-0000-4000-8000-000000000912','material.read'),
('c1310000-0000-4000-8000-000000000912','material.order.manage'),
('c1310000-0000-4000-8000-000000000913','material.read'),
('c1310000-0000-4000-8000-000000000913','material.contract.record'),
('c1310000-0000-4000-8000-000000000913','material.finance.read'),
('c1310000-0000-4000-8000-000000000913','material.payment.request'),
('c1310000-0000-4000-8000-000000000914','material.read'),
('c1310000-0000-4000-8000-000000000914','material.finance.read'),
('c1310000-0000-4000-8000-000000000914','material.payment.approve'),
('c1310000-0000-4000-8000-000000000914','material.payment.execute'),
('c1310000-0000-4000-8000-000000000915','material.read');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason)
select 'c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020',
  ('c1310000-0000-4000-8000-00000000090'||suffix)::uuid,('c1310000-0000-4000-8000-00000000091'||suffix)::uuid,
  'c1310000-0000-4000-8000-000000000905','rollback fixture'
from unnest(array['1','2','3','4','5']) as suffix;
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000010',true,'c1310000-0000-4000-8000-000000000905');
insert into public.projects(id,tenant_id,company_id,code,name,operational_state,origin,created_by)
values('c1310000-0000-4000-8000-000000000101','c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','SMALL-P','Small order project','active','manual','c1310000-0000-4000-8000-000000000905');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c1310000-0000-4000-8000-000000000201','c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','SMALL-S','Small supplier','organization','c1310000-0000-4000-8000-000000000902');
insert into public.material_items(id,tenant_id,company_id,code,name,specification,unit,created_by)
values('c1310000-0000-4000-8000-000000000251','c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','SMALL-STEEL','Steel','D10','kg','c1310000-0000-4000-8000-000000000902');
insert into public.material_proposals(id,tenant_id,company_id,project_id,needed_on,delivery_address,created_by)
values('c1310000-0000-4000-8000-000000000301','c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101','2026-10-30','Site A','c1310000-0000-4000-8000-000000000901');
insert into public.material_proposal_lines(id,tenant_id,company_id,project_id,proposal_id,material_id,quantity,created_by)
values('c1310000-0000-4000-8000-000000000311','c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
  'c1310000-0000-4000-8000-000000000301','c1310000-0000-4000-8000-000000000251',100,'c1310000-0000-4000-8000-000000000901');
insert into public.material_proposal_revisions(id,tenant_id,company_id,project_id,proposal_id,revision_no,needed_on,delivery_address,submitted_by)
values('c1310000-0000-4000-8000-000000000401','c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101','c1310000-0000-4000-8000-000000000301',1,'2026-10-30','Site A','c1310000-0000-4000-8000-000000000901');
insert into public.material_proposal_revision_lines(revision_id,proposal_line_id,proposal_id,tenant_id,company_id,project_id,material_id,material_name,specification,unit,quantity)
values('c1310000-0000-4000-8000-000000000401','c1310000-0000-4000-8000-000000000311','c1310000-0000-4000-8000-000000000301',
  'c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
  'c1310000-0000-4000-8000-000000000251','Steel','D10','kg',100);
update public.material_proposals
set review_state='approved',current_revision_id='c1310000-0000-4000-8000-000000000401',approved_revision_id='c1310000-0000-4000-8000-000000000401'
where id='c1310000-0000-4000-8000-000000000301';

-- Finalized evidence. Signed quotations of quotation-only candidates are images.
insert into public.cost_evidence_files(
 id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
 verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version
)
select
 file.id,'c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
 'c1310000-0000-4000-8000-000000000010/c1310000-0000-4000-8000-000000000020/c1310000-0000-4000-8000-000000000101/'||file.id::text,
 'file-'||file.hash_seed,file.mime,8,lpad(to_hex(file.hash_seed),64,'0'),file.mime,8,lpad(to_hex(file.hash_seed),64,'0'),'finalized',
 now()+interval '15 minutes','c1310000-0000-4000-8000-000000000903','c1310000-0000-4000-8000-000000000903',now(),1
from (values
 ('c1310000-0000-4000-8000-000000000501'::uuid,3501,'application/pdf'),
 ('c1310000-0000-4000-8000-000000000511'::uuid,3511,'image/png'),
 ('c1310000-0000-4000-8000-000000000513'::uuid,3513,'application/pdf'),
 ('c1310000-0000-4000-8000-000000000521'::uuid,3521,'image/png'),
 ('c1310000-0000-4000-8000-000000000531'::uuid,3531,'image/png'),
 ('c1310000-0000-4000-8000-000000000541'::uuid,3541,'image/png'),
 ('c1310000-0000-4000-8000-000000000551'::uuid,3551,'application/pdf'),
 ('c1310000-0000-4000-8000-000000000552'::uuid,3552,'image/png'),
 ('c1310000-0000-4000-8000-000000000561'::uuid,3561,'application/pdf'),
 ('c1310000-0000-4000-8000-000000000562'::uuid,3562,'application/pdf'),
 ('c1310000-0000-4000-8000-000000000571'::uuid,3571,'application/pdf'),
 ('c1310000-0000-4000-8000-000000000572'::uuid,3572,'application/pdf')
) as file(id,hash_seed,mime);

insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
)
select order_row.id,'c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
  'c1310000-0000-4000-8000-000000000301','c1310000-0000-4000-8000-000000000401','c1310000-0000-4000-8000-000000000201','VND',
  'c1310000-0000-4000-8000-000000000501','c1310000-0000-4000-8000-000000000902'
from (values
 ('c1310000-0000-4000-8000-000000000351'::uuid),('c1310000-0000-4000-8000-000000000352'::uuid),('c1310000-0000-4000-8000-000000000353'::uuid),
 ('c1310000-0000-4000-8000-000000000355'::uuid),('c1310000-0000-4000-8000-000000000356'::uuid),('c1310000-0000-4000-8000-000000000357'::uuid)
) as order_row(id);
-- Order 354 is created while the company works in USD; its currency follows the company default.
update public.company_cost_settings set default_currency_code='USD' where company_id='c1310000-0000-4000-8000-000000000020';
insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
)
select 'c1310000-0000-4000-8000-000000000354','c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
  'c1310000-0000-4000-8000-000000000301','c1310000-0000-4000-8000-000000000401','c1310000-0000-4000-8000-000000000201',settings.default_currency_code,
  'c1310000-0000-4000-8000-000000000501','c1310000-0000-4000-8000-000000000902'
from public.company_cost_settings as settings where settings.company_id='c1310000-0000-4000-8000-000000000020';
update public.company_cost_settings set default_currency_code='VND' where company_id='c1310000-0000-4000-8000-000000000020';

insert into public.material_order_allocations(
  tenant_id,company_id,project_id,order_id,proposal_id,approved_revision_id,proposal_line_id,quantity,unit_price,quotation_material_name,mapping_confirmed
)
select 'c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
  allocation.order_id,'c1310000-0000-4000-8000-000000000301','c1310000-0000-4000-8000-000000000401','c1310000-0000-4000-8000-000000000311',
  1,allocation.unit_price,'Quoted steel',true
from (values
 ('c1310000-0000-4000-8000-000000000351'::uuid,4999999.9999::numeric),
 ('c1310000-0000-4000-8000-000000000352'::uuid,5000000::numeric),
 ('c1310000-0000-4000-8000-000000000353'::uuid,48000000::numeric),
 ('c1310000-0000-4000-8000-000000000354'::uuid,100::numeric),
 ('c1310000-0000-4000-8000-000000000355'::uuid,4000000::numeric),
 ('c1310000-0000-4000-8000-000000000356'::uuid,3000000::numeric),
 ('c1310000-0000-4000-8000-000000000357'::uuid,2000000::numeric)
) as allocation(order_id,unit_price);

insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,order_id,evidence_role,created_by)
select scope_row.file_id,'c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
  'material_order',scope_row.order_id,scope_row.role,'c1310000-0000-4000-8000-000000000903'
from (values
 ('c1310000-0000-4000-8000-000000000511'::uuid,'c1310000-0000-4000-8000-000000000351'::uuid,'signed_quotation'),
 ('c1310000-0000-4000-8000-000000000521'::uuid,'c1310000-0000-4000-8000-000000000352'::uuid,'signed_quotation'),
 ('c1310000-0000-4000-8000-000000000531'::uuid,'c1310000-0000-4000-8000-000000000353'::uuid,'signed_quotation'),
 ('c1310000-0000-4000-8000-000000000541'::uuid,'c1310000-0000-4000-8000-000000000354'::uuid,'signed_quotation'),
 ('c1310000-0000-4000-8000-000000000551'::uuid,'c1310000-0000-4000-8000-000000000355'::uuid,'signed_contract'),
 ('c1310000-0000-4000-8000-000000000552'::uuid,'c1310000-0000-4000-8000-000000000355'::uuid,'signed_quotation'),
 ('c1310000-0000-4000-8000-000000000561'::uuid,'c1310000-0000-4000-8000-000000000356'::uuid,'signed_contract'),
 ('c1310000-0000-4000-8000-000000000562'::uuid,'c1310000-0000-4000-8000-000000000356'::uuid,'signed_quotation')
) as scope_row(file_id,order_id,role);

-- Order 357 holds a contract written before the documentation column existed.
insert into public.material_contracts(id,tenant_id,company_id,project_id,order_id,supplier_id,currency_code,contract_no,signed_on,created_by)
values('c1310000-0000-4000-8000-000000000657','c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
  'c1310000-0000-4000-8000-000000000357','c1310000-0000-4000-8000-000000000201','VND','HD-LEGACY','2026-10-01','c1310000-0000-4000-8000-000000000903');
insert into public.material_contract_versions(
  tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
  order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
) values (
  'c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
  'c1310000-0000-4000-8000-000000000657',1,'original',2000000,0,2000000,2000000,null,
  'c1310000-0000-4000-8000-000000000571','c1310000-0000-4000-8000-000000000572',null,'c1310000-0000-4000-8000-000000000903'
);
insert into public.material_order_contracts(order_id,tenant_id,company_id,project_id,contract_id,created_by)
values('c1310000-0000-4000-8000-000000000357','c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020',
  'c1310000-0000-4000-8000-000000000101','c1310000-0000-4000-8000-000000000657','c1310000-0000-4000-8000-000000000903');

create temporary table small_refs(name text primary key, id uuid not null);
create temporary table small_acks(name text primary key, body jsonb not null);
grant select,insert on small_refs,small_acks to authenticated;

-- legacy rows -------------------------------------------------------------------
select is((
  select documentation from public.material_contracts where id='c1310000-0000-4000-8000-000000000657'
),'contract','legacy: a contract row written without documentation reads documentation = contract');

-- threshold: CONTRACT_REQUIRED --------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1310000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_record_contract(
    'c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101','c1310000-0000-4000-8000-000000000352',
    '{"documentation":"quotation_only","expectedOrderVersion":1,"signedOn":"2026-10-10","subtotal":"5000000.0000","varianceReason":null,"signedQuotationFileId":"c1310000-0000-4000-8000-000000000521"}',
    'c1310000-0000-4000-8000-000000000601','c1310000-0000-4000-8000-000000000701')
$$,'P0001','CONTRACT_REQUIRED','threshold: an order of exactly 5000000 VND needs a contract');
select throws_ok($$
  select public.c1_material_record_contract(
    'c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101','c1310000-0000-4000-8000-000000000353',
    '{"documentation":"quotation_only","expectedOrderVersion":1,"signedOn":"2026-10-10","subtotal":"4900000.0000","varianceReason":"Giam gia","signedQuotationFileId":"c1310000-0000-4000-8000-000000000531"}',
    'c1310000-0000-4000-8000-000000000602','c1310000-0000-4000-8000-000000000702')
$$,'P0001','CONTRACT_REQUIRED','threshold: a 48000000 order entered as 4900000 with a variance reason still needs a contract');
select throws_ok($$
  select public.c1_material_record_contract(
    'c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101','c1310000-0000-4000-8000-000000000354',
    '{"documentation":"quotation_only","expectedOrderVersion":1,"signedOn":"2026-10-10","subtotal":"100.0000","varianceReason":null,"signedQuotationFileId":"c1310000-0000-4000-8000-000000000541"}',
    'c1310000-0000-4000-8000-000000000603','c1310000-0000-4000-8000-000000000703')
$$,'P0001','CONTRACT_REQUIRED','threshold: an order in a currency other than VND needs a contract');

-- input shape ----------------------------------------------------------------------
select throws_ok($$
  select public.c1_material_record_contract(
    'c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101','c1310000-0000-4000-8000-000000000355',
    '{"documentation":"quotation_only","expectedOrderVersion":1,"contractNo":"HD-X","signedOn":"2026-10-10","subtotal":"4000000.0000","varianceReason":null,"signedQuotationFileId":"c1310000-0000-4000-8000-000000000552"}',
    'c1310000-0000-4000-8000-000000000604','c1310000-0000-4000-8000-000000000704')
$$,'P0001','INPUT_INVALID','input: quotation_only rejects a contractNo');
select throws_ok($$
  select public.c1_material_record_contract(
    'c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101','c1310000-0000-4000-8000-000000000355',
    '{"documentation":"quotation_only","expectedOrderVersion":1,"signedOn":"2026-10-10","subtotal":"4000000.0000","varianceReason":null,"signedQuotationFileId":"c1310000-0000-4000-8000-000000000552","installments":[{"installmentKey":"c1310000-0000-4000-8000-000000000a55","name":"Dot 1","amount":"4000000.0000","dueOn":"2026-10-10","isAdvance":false}]}',
    'c1310000-0000-4000-8000-000000000605','c1310000-0000-4000-8000-000000000705')
$$,'P0001','INPUT_INVALID','input: quotation_only rejects an installment schedule');

-- evidence: a contract record needs a PDF quotation (no documentation key means contract)
select throws_ok($$
  select public.c1_material_record_contract(
    'c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101','c1310000-0000-4000-8000-000000000355',
    '{"expectedOrderVersion":1,"contractNo":"HD-355","signedOn":"2026-10-10","subtotal":"4000000.0000","vatAmount":"0.0000","total":"4000000.0000","varianceReason":null,"contractFileId":"c1310000-0000-4000-8000-000000000551","signedQuotationFileId":"c1310000-0000-4000-8000-000000000552","installments":[{"installmentKey":"c1310000-0000-4000-8000-000000000a55","name":"Dot 1","amount":"4000000.0000","dueOn":"2026-10-10","isAdvance":false}]}',
    'c1310000-0000-4000-8000-000000000606','c1310000-0000-4000-8000-000000000706')
$$,'P0001','EVIDENCE_INVALID','evidence: a contract record with an image quotation is EVIDENCE_INVALID');

-- quotation_only success at 4999999.9999 --------------------------------------------
select is((
  public.c1_material_record_contract(
    'c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101','c1310000-0000-4000-8000-000000000351',
    '{"documentation":"quotation_only","expectedOrderVersion":1,"signedOn":"2026-10-10","subtotal":"4999999.9999","varianceReason":null,"signedQuotationFileId":"c1310000-0000-4000-8000-000000000511"}',
    'c1310000-0000-4000-8000-000000000607','c1310000-0000-4000-8000-000000000707') - 'resourceId'
),'{"version":1,"replayed":false}'::jsonb,'quotation_only: an order of 4999999.9999 VND is recorded with a PNG quotation');

-- contract success with PDF files on order 356 ---------------------------------------
select is((
  public.c1_material_record_contract(
    'c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101','c1310000-0000-4000-8000-000000000356',
    '{"documentation":"contract","expectedOrderVersion":1,"contractNo":"HD-356","signedOn":"2026-10-11","subtotal":"3000000.0000","vatAmount":"0.0000","total":"3000000.0000","varianceReason":null,"contractFileId":"c1310000-0000-4000-8000-000000000561","signedQuotationFileId":"c1310000-0000-4000-8000-000000000562","installments":[{"installmentKey":"c1310000-0000-4000-8000-000000000a61","name":"Dot 1","amount":"3000000.0000","dueOn":"2026-10-11","isAdvance":false}]}',
    'c1310000-0000-4000-8000-000000000608','c1310000-0000-4000-8000-000000000708') - 'resourceId'
),'{"version":1,"replayed":false}'::jsonb,'contract: a small order can still be recorded with a contract and PDF files');

set local role none;
insert into small_refs
select 'quotation_contract', contract.id from public.material_contracts as contract where contract.order_id='c1310000-0000-4000-8000-000000000351';
insert into small_refs
select 'quotation_installment', item.installment_key from public.material_contract_installments as item
join public.material_contracts as contract on contract.id=item.contract_id
where contract.order_id='c1310000-0000-4000-8000-000000000351';
insert into small_refs
select 'contract_356', contract.id from public.material_contracts as contract where contract.order_id='c1310000-0000-4000-8000-000000000356';
insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,contract_id,evidence_role,created_by)
select 'c1310000-0000-4000-8000-000000000513','c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
  'material_contract',id,'invoice','c1310000-0000-4000-8000-000000000903'
from small_refs where name='quotation_contract';

select is((
  select documentation||':'||coalesce(contract_no,'<null>') from public.material_contracts where id=(select id from small_refs where name='quotation_contract')
),'quotation_only:<null>','quotation_only: the record keeps documentation and no contract number');
select is((
  select jsonb_build_object('kind',ver.kind,'subtotal',ver.subtotal::text,'vat',ver.vat_amount::text,'total',ver.total::text,
    'contractFile',ver.contract_file_id,'quotationFile',ver.signed_quotation_file_id)
  from public.material_contract_versions as ver where ver.contract_id=(select id from small_refs where name='quotation_contract')
),'{"kind":"original","subtotal":"4999999.9999","vat":"0.0000","total":"4999999.9999","contractFile":null,"quotationFile":"c1310000-0000-4000-8000-000000000511"}'::jsonb,
'quotation_only: the version has no VAT, total equal to subtotal and no contract file');
select is((
  select string_agg(item.seq::text||'|'||item.name||'|'||item.amount::text||'|'||item.due_on::text||'|'||item.is_advance::text, ',' order by item.seq)
  from public.material_contract_installments as item where item.contract_id=(select id from small_refs where name='quotation_contract')
),'1|Thanh toán 100%|4999999.9999|2026-10-10|false','quotation_only: exactly one generated installment pays 100% on the recorded date');
select is((
  select count(*) from public.material_order_contracts
  where order_id='c1310000-0000-4000-8000-000000000351' and contract_id=(select id from small_refs where name='quotation_contract')
),1::bigint,'quotation_only: the order is locked in material_order_contracts');
select is((
  select count(*) from public.app_notifications as notification
  where notification.event_kind='material.contract.recorded' and notification.recipient_id='c1310000-0000-4000-8000-000000000904'
    and notification.source_id=(select id from small_refs where name='quotation_contract')
    and notification.payload->>'documentation'='quotation_only' and notification.payload->'contractNo'='null'::jsonb
),1::bigint,'notifications: the recorded notification carries documentation and a null contract number');
select is((
  select documentation from public.material_contracts where order_id='c1310000-0000-4000-8000-000000000356'
),'contract','contract: an explicit contract record stores documentation = contract');

-- amendment ------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1310000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok(format($$
  select public.c1_material_amend_contract(
    'c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":1,"subtotal":"4999999.9999","vatAmount":"0.0000","total":"4999999.9999","varianceReason":null,"amendmentFileId":"c1310000-0000-4000-8000-000000000581","reason":"Doi lich","installments":[{"installmentKey":"c1310000-0000-4000-8000-000000000a51","name":"Dot 1","amount":"4999999.9999","dueOn":"2026-10-20","isAdvance":false}]}',
    'c1310000-0000-4000-8000-000000000609','c1310000-0000-4000-8000-000000000709')
$$,(select id from small_refs where name='quotation_contract')),'P0001','CONTRACT_AMENDMENT_UNAVAILABLE','amendment: a quotation_only record cannot be amended');

-- payment requests -------------------------------------------------------------------
-- Since 20261016100100 (C2) a record without a contract needs an invoice like a contract.
select throws_ok(format($$
  select public.c1_material_create_payment_request(
    'c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',%L,
    jsonb_build_object('installmentKey',%L,'amount','1000000','invoiceIds','[]'::jsonb,'note',null),
    'c1310000-0000-4000-8000-000000000613','c1310000-0000-4000-8000-000000000713')
$$,(select id from small_refs where name='quotation_contract'),(select id from small_refs where name='quotation_installment')),
'P0001','INVOICE_REQUIRED','invoice: a quotation_only request without an invoice is INVOICE_REQUIRED');
insert into small_acks select 'quotation_invoice', public.c1_material_record_invoice(
  'c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',(select id from small_refs where name='quotation_contract'),
  '{"invoiceSymbol":"1C26TSM","invoiceNo":"0000001","issuedOn":"2026-10-10","subtotal":"1000000","vatAmount":"0","total":"1000000","fileId":"c1310000-0000-4000-8000-000000000513","lines":[]}',
  'c1310000-0000-4000-8000-000000000614','c1310000-0000-4000-8000-000000000714');
insert into small_acks select 'quotation_request', public.c1_material_create_payment_request(
  'c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',(select id from small_refs where name='quotation_contract'),
  jsonb_build_object('installmentKey',(select id from small_refs where name='quotation_installment'),'amount','1000000','note',null,
    'invoiceIds',jsonb_build_array((select body->>'resourceId' from small_acks where name='quotation_invoice'))),
  'c1310000-0000-4000-8000-000000000610','c1310000-0000-4000-8000-000000000710');
select is((
  select body - 'resourceId' from small_acks where name='quotation_request'
),'{"version":1,"replayed":false}'::jsonb,'invoice: a quotation_only request with a recorded invoice is submitted');
select throws_ok(format($$
  select public.c1_material_create_payment_request(
    'c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',%L,
    '{"installmentKey":"c1310000-0000-4000-8000-000000000a61","amount":"100","invoiceIds":[],"note":null}',
    'c1310000-0000-4000-8000-000000000611','c1310000-0000-4000-8000-000000000711')
$$,(select id from small_refs where name='contract_356')),'P0001','INVOICE_REQUIRED','invoice: a non-advance installment of a contract record still needs an invoice');
select set_config('request.jwt.claims','{"sub":"c1310000-0000-4000-8000-000000000904","role":"authenticated"}',true);
select is((
  public.c1_material_decide_payment_request(
    'c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
    (select (body->>'resourceId')::uuid from small_acks where name='quotation_request'),
    '{"expectedVersion":1,"decision":"approve"}','c1310000-0000-4000-8000-000000000612','c1310000-0000-4000-8000-000000000712') - 'resourceId'
),'{"version":2,"replayed":false}'::jsonb,'invoice: the treasurer approves a quotation_only request with its invoice');
set local role none;
select is((
  select count(*) from public.app_notifications as notification
  where notification.event_kind='material.payment.submitted' and notification.recipient_id='c1310000-0000-4000-8000-000000000904'
    and notification.source_id=(select (body->>'resourceId')::uuid from small_acks where name='quotation_request')
    and notification.payload->>'documentation'='quotation_only' and notification.payload->'contractNo'='null'::jsonb
),1::bigint,'notifications: the payment notification carries documentation and a null contract number');

-- table checks -----------------------------------------------------------------------
select throws_ok($$
  insert into public.material_contracts(tenant_id,company_id,project_id,order_id,supplier_id,currency_code,documentation,contract_no,signed_on,created_by)
  values('c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
    'c1310000-0000-4000-8000-000000000352','c1310000-0000-4000-8000-000000000201','VND','contract',null,'2026-10-10','c1310000-0000-4000-8000-000000000903')
$$,'23514',null,'checks: a contract record without a contract number violates the documentation check');
select throws_ok($$
  insert into public.material_contracts(tenant_id,company_id,project_id,order_id,supplier_id,currency_code,documentation,contract_no,signed_on,created_by)
  values('c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
    'c1310000-0000-4000-8000-000000000352','c1310000-0000-4000-8000-000000000201','VND','quotation_only','HD-X','2026-10-10','c1310000-0000-4000-8000-000000000903')
$$,'23514',null,'checks: a quotation_only record with a contract number violates the documentation check');
select throws_ok($$
  insert into public.material_contract_versions(
    tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
    order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
  ) values (
    'c1310000-0000-4000-8000-000000000010','c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
    'c1310000-0000-4000-8000-000000000657',2,'amendment',2000000,0,2000000,2000000,null,null,null,'Khong file','c1310000-0000-4000-8000-000000000903'
  )
$$,'23514',null,'checks: an amendment version without a contract file violates the version check');

-- reads --------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1310000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select is((
  select jsonb_build_object('documentation',facts->'documentation','contractNo',facts->'contractNo','contractFileId',facts->'versions'->0->'contractFileId')
  from (select public.c1_material_read_contract('c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101','c1310000-0000-4000-8000-000000000351') as facts) as q
),'{"documentation":"quotation_only","contractNo":null,"contractFileId":null}'::jsonb,'reads: read_contract returns documentation, a null contract number and a null contract file');
select is((
  select jsonb_build_object('documentation',read_order->'contract'->'documentation','contractNo',read_order->'contract'->'contractNo')
  from (select public.c1_material_read_order('c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101','c1310000-0000-4000-8000-000000000351') as read_order) as q
),'{"documentation":"quotation_only","contractNo":null}'::jsonb,'reads: the order JSON contract carries documentation and a null contract number');
select is((
  select jsonb_build_object('documentation',contract->'documentation','contractNo',contract->'contractNo')
  from jsonb_array_elements(public.c1_material_finance_facts('c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101')->'contracts') as contract
  where contract->>'orderId'='c1310000-0000-4000-8000-000000000351'
),'{"documentation":"quotation_only","contractNo":null}'::jsonb,'reads: finance facts carry documentation and a null contract number');
select is((
  select jsonb_build_object('documentation',contract->'documentation','contractNo',contract->'contractNo')
  from jsonb_array_elements(public.c1_material_finance_facts('c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101')->'contracts') as contract
  where contract->>'orderId'='c1310000-0000-4000-8000-000000000357'
),'{"documentation":"contract","contractNo":"HD-LEGACY"}'::jsonb,'reads: finance facts of a legacy contract carry documentation = contract');
select set_config('request.jwt.claims','{"sub":"c1310000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is((
  select status
  from jsonb_array_elements(
    public.c1_material_read_proposal('c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101','c1310000-0000-4000-8000-000000000301')->'contractStatus'
  ) as status
  where status->>'orderId'='c1310000-0000-4000-8000-000000000351'
),'{"orderId":"c1310000-0000-4000-8000-000000000351","contractNo":null,"signedOn":"2026-10-10","documentation":"quotation_only"}'::jsonb,
'reads: the proposal contractStatus of a quotation_only order carries documentation and a null contract number');
select is((
  select status->>'documentation'
  from jsonb_array_elements(
    public.c1_material_read_proposal('c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101','c1310000-0000-4000-8000-000000000301')->'contractStatus'
  ) as status
  where status->>'orderId'='c1310000-0000-4000-8000-000000000357'
),'contract','reads: the proposal contractStatus of a legacy contract carries documentation = contract');

-- reminders ------------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.c1_material_emit_installment_reminders('2026-10-12');
set local role none;
select is((
  select count(*) from public.app_notifications as notification
  where notification.event_kind='material.installment.overdue' and notification.recipient_id='c1310000-0000-4000-8000-000000000903'
    and notification.source_id=(select id from small_refs where name='quotation_installment')
    and notification.payload->>'documentation'='quotation_only' and notification.payload->'contractNo'='null'::jsonb
),1::bigint,'reminders: the overdue reminder of a quotation_only installment carries documentation and a null contract number');

-- evidence intents -------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1310000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select lives_ok($$
  select public.c1_material_create_evidence_intent('c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
    jsonb_build_object('originalFilename','bao-gia.jpg','mimeType','image/jpeg','sizeBytes',8,'sha256',repeat('a',64),'evidenceRole','signed_quotation',
      'target',jsonb_build_object('kind','material_order','orderId','c1310000-0000-4000-8000-000000000355')),
    'c1310000-0000-4000-8000-000000000951','c1310000-0000-4000-8000-000000000961')
$$,'evidence: a JPEG signed quotation upload intent is accepted');
select throws_ok($$
  select public.c1_material_create_evidence_intent('c1310000-0000-4000-8000-000000000020','c1310000-0000-4000-8000-000000000101',
    jsonb_build_object('originalFilename','hop-dong.jpg','mimeType','image/jpeg','sizeBytes',8,'sha256',repeat('b',64),'evidenceRole','signed_contract',
      'target',jsonb_build_object('kind','material_order','orderId','c1310000-0000-4000-8000-000000000355')),
    'c1310000-0000-4000-8000-000000000952','c1310000-0000-4000-8000-000000000962')
$$,'P0001','FILE_TYPE_UNSUPPORTED','evidence: a signed contract still accepts PDF only');

-- privileges -------------------------------------------------------------------------------
set local role none;
select ok(
  not has_function_privilege('authenticated','private.c1_material_small_order_threshold()','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_is_small_amount(numeric,text)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_installment_requires_invoice(public.material_contracts,public.material_contract_installments)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_link_request_invoices(public.material_payment_requests,jsonb,boolean)','EXECUTE'),
  'privileges: the small order helpers are private'
);
select is((
  select private.c1_material_small_order_threshold()::text||'|'
    ||private.c1_material_is_small_amount(4999999.9999,'VND')::text||'|'
    ||private.c1_material_is_small_amount(5000000,'VND')::text||'|'
    ||private.c1_material_is_small_amount(100,'USD')::text
),'5000000|true|false|false','threshold: the helpers compare strictly below 5000000 and only in VND');

select * from finish(true);
rollback;
