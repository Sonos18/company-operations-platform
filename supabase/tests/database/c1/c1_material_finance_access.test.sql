begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(17);

-- A4/A5 T8 access fixes (20261015090600). Rollback-only fixture with prefix c12a.
-- Order 351 (buyer B) of proposal 301 (engineer E) has contract 601 totalling 110:
-- installment A (key a0a, advance) 33 and B (key a0b) 77.
-- Users: B (901) buyer, E (902) engineer, T (903) treasurer, D (904) director,
-- K (905) accountant recording contracts, R (906) accountant with payment.request only.
-- Labels: "order access:" (C1), "contract status:" (I1), "reminders:" (M4),
-- "cancel:" (M6), "invoice recheck:" (M7).

insert into auth.users(id,email) values
('c12a0000-0000-4000-8000-000000000901','acc-buyer@test.invalid'),
('c12a0000-0000-4000-8000-000000000902','acc-engineer@test.invalid'),
('c12a0000-0000-4000-8000-000000000903','acc-treasurer@test.invalid'),
('c12a0000-0000-4000-8000-000000000904','acc-director@test.invalid'),
('c12a0000-0000-4000-8000-000000000905','acc-recorder@test.invalid'),
('c12a0000-0000-4000-8000-000000000906','acc-requester@test.invalid');
insert into public.tenants(id,code,name)
values('c12a0000-0000-4000-8000-000000000010','C1ACC','Material access tenant');
insert into public.companies(id,tenant_id,code,name)
values('c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000010','C1ACC','Material access company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select id,'c12a0000-0000-4000-8000-000000000010',array['member']
from auth.users where id::text like 'c12a0000-0000-4000-8000-00000000090_';
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select id,'c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020',array['member'],true
from auth.users where id::text like 'c12a0000-0000-4000-8000-00000000090_';
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system)
select role_row.id,'c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020',role_row.code,role_row.code,'rollback fixture',false
from (values
 ('c12a0000-0000-4000-8000-000000000911'::uuid,'acc_buyer'),
 ('c12a0000-0000-4000-8000-000000000912'::uuid,'acc_engineer'),
 ('c12a0000-0000-4000-8000-000000000913'::uuid,'acc_treasurer'),
 ('c12a0000-0000-4000-8000-000000000914'::uuid,'acc_director'),
 ('c12a0000-0000-4000-8000-000000000915'::uuid,'acc_recorder'),
 ('c12a0000-0000-4000-8000-000000000916'::uuid,'acc_requester')
) as role_row(id,code);
insert into public.role_permissions(role_id,permission_code) values
('c12a0000-0000-4000-8000-000000000911','material.read'),
('c12a0000-0000-4000-8000-000000000911','material.order.manage'),
('c12a0000-0000-4000-8000-000000000912','material.read'),
('c12a0000-0000-4000-8000-000000000912','material.proposal.submit'),
('c12a0000-0000-4000-8000-000000000913','material.read'),
('c12a0000-0000-4000-8000-000000000913','material.finance.read'),
('c12a0000-0000-4000-8000-000000000913','material.payment.approve'),
('c12a0000-0000-4000-8000-000000000913','material.payment.execute'),
('c12a0000-0000-4000-8000-000000000914','material.read'),
('c12a0000-0000-4000-8000-000000000914','material.finance.read'),
('c12a0000-0000-4000-8000-000000000915','material.read'),
('c12a0000-0000-4000-8000-000000000915','material.contract.record'),
('c12a0000-0000-4000-8000-000000000916','material.read'),
('c12a0000-0000-4000-8000-000000000916','material.payment.request');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason)
select 'c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020',
  ('c12a0000-0000-4000-8000-00000000090'||suffix)::uuid,('c12a0000-0000-4000-8000-00000000091'||suffix)::uuid,
  'c12a0000-0000-4000-8000-000000000905','rollback fixture'
from unnest(array['1','2','3','4','5','6']) as suffix;
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000010',true,'c12a0000-0000-4000-8000-000000000905');
insert into public.projects(id,tenant_id,company_id,code,name,operational_state,origin,created_by)
values('c12a0000-0000-4000-8000-000000000101','c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020','ACC-P','Access project','active','manual','c12a0000-0000-4000-8000-000000000905');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c12a0000-0000-4000-8000-000000000201','c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020','ACC-S','Access supplier','organization','c12a0000-0000-4000-8000-000000000901');
insert into public.material_items(id,tenant_id,company_id,code,name,specification,unit,created_by) values
('c12a0000-0000-4000-8000-000000000251','c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020','ACC-STEEL','Steel','D10','kg','c12a0000-0000-4000-8000-000000000901');
insert into public.material_proposals(id,tenant_id,company_id,project_id,needed_on,delivery_address,created_by)
values('c12a0000-0000-4000-8000-000000000301','c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101','2026-10-30','Site A','c12a0000-0000-4000-8000-000000000902');
insert into public.material_proposal_lines(id,tenant_id,company_id,project_id,proposal_id,material_id,quantity,created_by)
values('c12a0000-0000-4000-8000-000000000311','c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',
  'c12a0000-0000-4000-8000-000000000301','c12a0000-0000-4000-8000-000000000251',10,'c12a0000-0000-4000-8000-000000000902');
insert into public.material_proposal_revisions(id,tenant_id,company_id,project_id,proposal_id,revision_no,needed_on,delivery_address,submitted_by)
values('c12a0000-0000-4000-8000-000000000401','c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101','c12a0000-0000-4000-8000-000000000301',1,'2026-10-30','Site A','c12a0000-0000-4000-8000-000000000902');
insert into public.material_proposal_revision_lines(revision_id,proposal_line_id,proposal_id,tenant_id,company_id,project_id,material_id,material_name,specification,unit,quantity)
values('c12a0000-0000-4000-8000-000000000401','c12a0000-0000-4000-8000-000000000311','c12a0000-0000-4000-8000-000000000301',
  'c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',
  'c12a0000-0000-4000-8000-000000000251','Material','Spec','unit',10);
update public.material_proposals
set review_state='approved',current_revision_id='c12a0000-0000-4000-8000-000000000401',approved_revision_id='c12a0000-0000-4000-8000-000000000401'
where id='c12a0000-0000-4000-8000-000000000301';

insert into public.cost_evidence_files(
 id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
 verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version
)
select
 file.id,'c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',
 'c12a0000-0000-4000-8000-000000000010/c12a0000-0000-4000-8000-000000000020/c12a0000-0000-4000-8000-000000000101/'||file.id::text,
 'file-'||file.hash_seed||'.pdf','application/pdf',8,lpad(to_hex(file.hash_seed),64,'0'),'application/pdf',8,lpad(to_hex(file.hash_seed),64,'0'),'finalized',
 now()+interval '15 minutes','c12a0000-0000-4000-8000-000000000905','c12a0000-0000-4000-8000-000000000905',now(),1
from (values
 ('c12a0000-0000-4000-8000-000000000501'::uuid,2501),
 ('c12a0000-0000-4000-8000-000000000502'::uuid,2502),
 ('c12a0000-0000-4000-8000-000000000503'::uuid,2503),
 ('c12a0000-0000-4000-8000-000000000504'::uuid,2504),
 ('c12a0000-0000-4000-8000-000000000521'::uuid,2521)
) as file(id,hash_seed);

insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
) values (
  'c12a0000-0000-4000-8000-000000000351','c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',
  'c12a0000-0000-4000-8000-000000000301','c12a0000-0000-4000-8000-000000000401','c12a0000-0000-4000-8000-000000000201','VND',
  'c12a0000-0000-4000-8000-000000000501','c12a0000-0000-4000-8000-000000000901'
);
insert into public.material_order_allocations(
  id,tenant_id,company_id,project_id,order_id,proposal_id,approved_revision_id,proposal_line_id,quantity,unit_price,quotation_material_name,mapping_confirmed
) values (
  'c12a0000-0000-4000-8000-000000000361','c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',
  'c12a0000-0000-4000-8000-000000000351','c12a0000-0000-4000-8000-000000000301','c12a0000-0000-4000-8000-000000000401','c12a0000-0000-4000-8000-000000000311',
  1,100,'Quoted material',true
);
insert into public.material_contracts(id,tenant_id,company_id,project_id,order_id,supplier_id,currency_code,contract_no,signed_on,created_by)
values('c12a0000-0000-4000-8000-000000000601','c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',
  'c12a0000-0000-4000-8000-000000000351','c12a0000-0000-4000-8000-000000000201','VND','HD-ACC-01','2026-01-05','c12a0000-0000-4000-8000-000000000905');
insert into public.material_contract_versions(
  id,tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
  order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
) values (
  'c12a0000-0000-4000-8000-000000000611','c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',
  'c12a0000-0000-4000-8000-000000000601',1,'original',100,10,110,100,null,
  'c12a0000-0000-4000-8000-000000000502','c12a0000-0000-4000-8000-000000000503',null,'c12a0000-0000-4000-8000-000000000905'
);
insert into public.material_contract_installments(
  tenant_id,company_id,project_id,contract_id,contract_version_id,seq,installment_key,name,amount,due_on,is_advance
)
select 'c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',
  'c12a0000-0000-4000-8000-000000000601','c12a0000-0000-4000-8000-000000000611',item.seq,item.installment_key,item.name,item.amount,'2026-12-01',item.is_advance
from (values
 (1,'c12a0000-0000-4000-8000-000000000a0a'::uuid,'Tam ung A',33,true),
 (2,'c12a0000-0000-4000-8000-000000000a0b'::uuid,'Dot B',77,false)
) as item(seq,installment_key,name,amount,is_advance);
insert into public.material_order_contracts(order_id,tenant_id,company_id,project_id,contract_id,created_by)
values('c12a0000-0000-4000-8000-000000000351','c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020',
  'c12a0000-0000-4000-8000-000000000101','c12a0000-0000-4000-8000-000000000601','c12a0000-0000-4000-8000-000000000905');
insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,contract_id,evidence_role,created_by)
values('c12a0000-0000-4000-8000-000000000521','c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020',
  'c12a0000-0000-4000-8000-000000000101','material_contract','c12a0000-0000-4000-8000-000000000601','payment_proof','c12a0000-0000-4000-8000-000000000903');

create temporary table t8_access_acks(name text primary key, body jsonb not null);
grant select,insert on t8_access_acks to authenticated;

-- C1: finance readers open the order; engineers stay out --------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c12a0000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select is((
  public.c1_material_read_order('c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101','c12a0000-0000-4000-8000-000000000351')
  #>> '{contract,total}'
),'110.0000','order access: treasurer reads the order and the contract total');
select set_config('request.jwt.claims','{"sub":"c12a0000-0000-4000-8000-000000000904","role":"authenticated"}',true);
select is((
  public.c1_material_read_order('c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101','c12a0000-0000-4000-8000-000000000351')
  #>> '{contract,total}'
),'110.0000','order access: director reads the order and the contract total');
select set_config('request.jwt.claims','{"sub":"c12a0000-0000-4000-8000-000000000906","role":"authenticated"}',true);
select is(jsonb_array_length(
  public.c1_material_list_orders('c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101')
),1,'order access: an accountant with only payment.request lists the orders');
select set_config('request.jwt.claims','{"sub":"c12a0000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_read_order('c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101','c12a0000-0000-4000-8000-000000000351')
$$,'P0001','PERMISSION_DENIED','order access: the engineer still cannot read the order');
select set_config('request.jwt.claims','{"sub":"c12a0000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select ok((
  public.c1_material_read_order('c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101','c12a0000-0000-4000-8000-000000000351')
  -> 'contract' -> 'total'
) = 'null'::jsonb,'order access: the buyer reads the order without the contract total');

-- I1: the proposal creator is sent to the proposal, which shows the contract status --
set local role none;
select private.c1_material_notify_contract_saved(
  (select contract from public.material_contracts as contract where contract.id='c12a0000-0000-4000-8000-000000000601'),
  (select material_order from public.material_orders as material_order where material_order.id='c12a0000-0000-4000-8000-000000000351'),
  'c12a0000-0000-4000-8000-000000000902', 1, 110
);
select is((
  select link_path from public.app_notifications
  where recipient_id='c12a0000-0000-4000-8000-000000000902' and event_kind='material.contract.recorded'
),'/materials/c12a0000-0000-4000-8000-000000000101/proposals/c12a0000-0000-4000-8000-000000000301',
'contract status: the proposal creator is linked to the proposal');
select is((
  select link_path from public.app_notifications
  where recipient_id='c12a0000-0000-4000-8000-000000000901' and event_kind='material.contract.recorded'
),'/materials/c12a0000-0000-4000-8000-000000000101/orders/c12a0000-0000-4000-8000-000000000351',
'contract status: the buyer is linked to the order');
select ok((
  select bool_and(not (payload ? 'total')) and count(*) = 2 from public.app_notifications
  where recipient_id in ('c12a0000-0000-4000-8000-000000000901','c12a0000-0000-4000-8000-000000000902')
    and event_kind='material.contract.recorded'
),'contract status: buyer and creator notifications carry no total');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c12a0000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select is((
  public.c1_material_read_proposal('c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101','c12a0000-0000-4000-8000-000000000301')
  -> 'contractStatus'
),'[{"orderId":"c12a0000-0000-4000-8000-000000000351","contractNo":"HD-ACC-01","signedOn":"2026-01-05","documentation":"contract"}]'::jsonb,
'contract status: the engineer reads contract number and date per order, without money');

-- M4: reminder dedupe keys carry the contract id ---------------------------------
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.c1_material_emit_installment_reminders('2026-11-29');
set local role none;
select is((
  select count(*) from public.app_notifications
  where recipient_id='c12a0000-0000-4000-8000-000000000905'
    and dedupe_key in (
      'inst:c12a0000-0000-4000-8000-000000000601:c12a0000-0000-4000-8000-000000000a0a:due_soon:2026-12-01',
      'inst:c12a0000-0000-4000-8000-000000000601:c12a0000-0000-4000-8000-000000000a0b:due_soon:2026-12-01'
    )
),2::bigint,'reminders: due-soon keys include the contract id');

-- M6: only an approver cancels an approved request ---------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c12a0000-0000-4000-8000-000000000906","role":"authenticated"}',true);
insert into t8_access_acks select 'C1', public.c1_material_create_payment_request(
  'c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101','c12a0000-0000-4000-8000-000000000601',
  '{"installmentKey":"c12a0000-0000-4000-8000-000000000a0a","amount":"5","invoiceIds":[],"note":null}',
  'c12a0000-0000-4000-8000-000000000d01','c12a0000-0000-4000-8000-000000000c00');
insert into t8_access_acks select 'C2', public.c1_material_create_payment_request(
  'c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101','c12a0000-0000-4000-8000-000000000601',
  '{"installmentKey":"c12a0000-0000-4000-8000-000000000a0a","amount":"3","invoiceIds":[],"note":null}',
  'c12a0000-0000-4000-8000-000000000d02','c12a0000-0000-4000-8000-000000000c00');
select set_config('request.jwt.claims','{"sub":"c12a0000-0000-4000-8000-000000000903","role":"authenticated"}',true);
insert into t8_access_acks select 'C1_approve', public.c1_material_decide_payment_request(
  'c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t8_access_acks where name='C1'),
  '{"expectedVersion":1,"decision":"approve"}','c12a0000-0000-4000-8000-000000000d03','c12a0000-0000-4000-8000-000000000c00');
select set_config('request.jwt.claims','{"sub":"c12a0000-0000-4000-8000-000000000906","role":"authenticated"}',true);
select throws_ok(format($$
  select public.c1_material_cancel_payment_request(
    'c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"reason":"Huy"}','c12a0000-0000-4000-8000-000000000d04','c12a0000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from t8_access_acks where name='C1')),'P0001','PERMISSION_DENIED','cancel: a requester cannot cancel an approved request');
select is((
  public.c1_material_cancel_payment_request(
    'c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t8_access_acks where name='C2'),
    '{"expectedVersion":1,"reason":"Lap nham"}','c12a0000-0000-4000-8000-000000000d05','c12a0000-0000-4000-8000-000000000c00') - 'resourceId'
),'{"version":2,"replayed":false}'::jsonb,'cancel: a requester cancels a submitted request');
select set_config('request.jwt.claims','{"sub":"c12a0000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select is((
  public.c1_material_cancel_payment_request(
    'c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t8_access_acks where name='C1'),
    '{"expectedVersion":2,"reason":"Khong chi nua"}','c12a0000-0000-4000-8000-000000000d06','c12a0000-0000-4000-8000-000000000c00') - 'resourceId'
),'{"version":3,"replayed":false}'::jsonb,'cancel: the treasurer cancels the approved request');
select is((
  public.c1_material_cancel_payment_request(
    'c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t8_access_acks where name='C1'),
    '{"expectedVersion":2,"reason":"Khong chi nua"}','c12a0000-0000-4000-8000-000000000d06','c12a0000-0000-4000-8000-000000000c00') - 'resourceId'
),'{"version":3,"replayed":true}'::jsonb,'cancel: the treasurer repeating the same key gets the stored result, not PERMISSION_DENIED');
select set_config('request.jwt.claims','{"sub":"c12a0000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok(format($$
  select public.c1_material_cancel_payment_request(
    'c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":1,"reason":"Huy"}','c12a0000-0000-4000-8000-000000000d07','c12a0000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from t8_access_acks where name='C2')),'P0001','PERMISSION_DENIED','cancel: a buyer cannot cancel at all');

-- M7: an amendment that turns the advance into a normal installment needs an invoice --
select set_config('request.jwt.claims','{"sub":"c12a0000-0000-4000-8000-000000000906","role":"authenticated"}',true);
insert into t8_access_acks select 'X', public.c1_material_create_payment_request(
  'c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101','c12a0000-0000-4000-8000-000000000601',
  '{"installmentKey":"c12a0000-0000-4000-8000-000000000a0a","amount":"10","invoiceIds":[],"note":null}',
  'c12a0000-0000-4000-8000-000000000d11','c12a0000-0000-4000-8000-000000000c00');
insert into t8_access_acks select 'Y', public.c1_material_create_payment_request(
  'c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101','c12a0000-0000-4000-8000-000000000601',
  '{"installmentKey":"c12a0000-0000-4000-8000-000000000a0a","amount":"10","invoiceIds":[],"note":null}',
  'c12a0000-0000-4000-8000-000000000d12','c12a0000-0000-4000-8000-000000000c00');
select set_config('request.jwt.claims','{"sub":"c12a0000-0000-4000-8000-000000000903","role":"authenticated"}',true);
insert into t8_access_acks select 'Y_approve', public.c1_material_decide_payment_request(
  'c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',(select (body->>'resourceId')::uuid from t8_access_acks where name='Y'),
  '{"expectedVersion":1,"decision":"approve"}','c12a0000-0000-4000-8000-000000000d13','c12a0000-0000-4000-8000-000000000c00');
set local role none;
-- Amendment v2 written as the fixture owner: installment A keeps its key and amount but is no longer an advance.
insert into public.material_contract_versions(
  id,tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
  order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
) values (
  'c12a0000-0000-4000-8000-000000000612','c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',
  'c12a0000-0000-4000-8000-000000000601',2,'amendment',100,10,110,100,null,
  'c12a0000-0000-4000-8000-000000000504',null,'Bo tam ung','c12a0000-0000-4000-8000-000000000905'
);
insert into public.material_contract_installments(
  tenant_id,company_id,project_id,contract_id,contract_version_id,seq,installment_key,name,amount,due_on,is_advance
)
select 'c12a0000-0000-4000-8000-000000000010','c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',
  'c12a0000-0000-4000-8000-000000000601','c12a0000-0000-4000-8000-000000000612',item.seq,item.installment_key,item.name,item.amount,'2026-12-01',false
from (values
 (1,'c12a0000-0000-4000-8000-000000000a0a'::uuid,'Dot A',33),
 (2,'c12a0000-0000-4000-8000-000000000a0b'::uuid,'Dot B',77)
) as item(seq,installment_key,name,amount);
update public.material_contracts set current_version_no=2, version=2 where id='c12a0000-0000-4000-8000-000000000601';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c12a0000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok(format($$
  select public.c1_material_decide_payment_request(
    'c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":1,"decision":"approve"}','c12a0000-0000-4000-8000-000000000d14','c12a0000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from t8_access_acks where name='X')),'P0001','INVOICE_REQUIRED','invoice recheck: approving needs an invoice once the installment is no longer an advance');
select throws_ok(format($$
  select public.c1_material_record_payment(
    'c12a0000-0000-4000-8000-000000000020','c12a0000-0000-4000-8000-000000000101',%L,
    '{"expectedVersion":2,"paidOn":"2026-01-12","bankReference":"UNC-ACC-1","proofFileId":"c12a0000-0000-4000-8000-000000000521"}',
    'c12a0000-0000-4000-8000-000000000d15','c12a0000-0000-4000-8000-000000000c00')
$$,(select body->>'resourceId' from t8_access_acks where name='Y')),'P0001','INVOICE_REQUIRED','invoice recheck: paying needs an invoice once the installment is no longer an advance');
set local role none;

select * from finish(true);
rollback;
