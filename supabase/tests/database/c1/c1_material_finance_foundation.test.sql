begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(117);

-- Structural security: every new finance table forces RLS and denies direct writes.
select ok(
  coalesce((select relation.relrowsecurity and relation.relforcerowsecurity from pg_class as relation where relation.oid=to_regclass(table_name)),false),
  table_name||' forces RLS'
)
from unnest(array[
  'public.material_contracts',
  'public.material_contract_versions',
  'public.material_contract_installments',
  'public.material_invoices',
  'public.material_invoice_lines',
  'public.material_payment_requests',
  'public.material_payment_request_revisions',
  'public.material_payment_request_invoices',
  'public.material_payment_decisions',
  'public.material_payments',
  'public.app_notifications'
]) as listed(table_name);

select ok(
  not has_table_privilege('authenticated',table_name,'INSERT,UPDATE,DELETE,TRUNCATE'),
  'direct table DML denied: '||table_name
)
from unnest(array[
  'public.material_contracts',
  'public.material_contract_versions',
  'public.material_contract_installments',
  'public.material_invoices',
  'public.material_invoice_lines',
  'public.material_payment_requests',
  'public.material_payment_request_revisions',
  'public.material_payment_request_invoices',
  'public.material_payment_decisions',
  'public.material_payments',
  'public.app_notifications'
]) as listed(table_name);

select ok(
  not has_table_privilege('anon',table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
  'anonymous access denied: '||table_name
)
from unnest(array[
  'public.material_contracts',
  'public.material_contract_versions',
  'public.material_contract_installments',
  'public.material_invoices',
  'public.material_invoice_lines',
  'public.material_payment_requests',
  'public.material_payment_request_revisions',
  'public.material_payment_request_invoices',
  'public.material_payment_decisions',
  'public.material_payments',
  'public.app_notifications'
]) as listed(table_name);

select ok(exists(
  select 1 from pg_constraint as constraint_row
  where constraint_row.conrelid='public.material_order_contracts'::regclass
    and constraint_row.confrelid='public.material_contracts'::regclass
    and constraint_row.contype='f'
),'material_order_contracts references material_contracts');
select ok(not exists(
  select 1 from pg_constraint as constraint_row
  where constraint_row.conrelid='public.material_order_contracts'::regclass
    and constraint_row.confrelid='public.cost_workflow_contracts'::regclass
    and constraint_row.contype='f'
),'material_order_contracts no longer references cost_workflow_contracts');

select ok(
  coalesce((
    select procedure.prosecdef and coalesce(procedure.proconfig, '{}') @> array['search_path=""']
    from pg_proc as procedure
    where procedure.oid=to_regprocedure(signature)
  ),false),
  signature||' is SECURITY DEFINER with empty search_path'
)
from unnest(array[
  'private.c1_material_can_read_finance(uuid,uuid)',
  'private.c1_material_can_see_contract_status(uuid,uuid,uuid,uuid)',
  'private.c1_material_installment_usage(uuid)',
  'private.c1_material_notify_users(uuid,uuid,uuid,uuid[],text,text,uuid,text,jsonb,text)',
  'private.c1_material_notify_permission(uuid,uuid,uuid,text,text,text,uuid,text,jsonb,text)',
  'private.c1_material_notify_order_created()'
]) as listed(signature);

select ok(
  has_function_privilege('authenticated','private.c1_material_can_read_finance(uuid,uuid)','EXECUTE')
    and has_function_privilege('authenticated','private.c1_material_can_see_contract_status(uuid,uuid,uuid,uuid)','EXECUTE'),
  'authenticated executes the finance RLS predicates'
);
select ok(
  not has_function_privilege('authenticated','private.c1_material_installment_usage(uuid)','EXECUTE')
    and not has_function_privilege('authenticated','private.c1_material_notify_users(uuid,uuid,uuid,uuid[],text,text,uuid,text,jsonb,text)','EXECUTE')
    and not has_function_privilege('authenticated','private.c1_material_notify_permission(uuid,uuid,uuid,text,text,text,uuid,text,jsonb,text)','EXECUTE'),
  'authenticated cannot call usage or notification helpers directly'
);
select ok(
  not has_function_privilege('anon','private.c1_material_can_read_finance(uuid,uuid)','EXECUTE')
    and not has_function_privilege('anon','private.c1_material_can_see_contract_status(uuid,uuid,uuid,uuid)','EXECUTE')
    and not has_function_privilege('anon','private.c1_material_notify_users(uuid,uuid,uuid,uuid[],text,text,uuid,text,jsonb,text)','EXECUTE'),
  'anonymous cannot execute finance helpers'
);

select is((
  select count(*) from public.permissions
  where code in ('material.payment.request','material.payment.approve','material.payment.execute','material.finance.read')
),4::bigint,'material finance permissions are seeded');

-- Fixture: engineer owns the proposal, buyer creates the order, accountant records contracts,
-- treasurer approves and executes payments.
insert into auth.users(id,email) values
('c1250000-0000-4000-8000-000000000901','finance-engineer@test.invalid'),
('c1250000-0000-4000-8000-000000000902','finance-buyer@test.invalid'),
('c1250000-0000-4000-8000-000000000903','finance-accountant@test.invalid'),
('c1250000-0000-4000-8000-000000000904','finance-treasurer@test.invalid');
insert into public.tenants(id,code,name)
values('c1250000-0000-4000-8000-000000000010','C1MF','Material finance tenant');
insert into public.companies(id,tenant_id,code,name)
values('c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000010','C1MF','Material finance company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select member.user_id,'c1250000-0000-4000-8000-000000000010',array['member']
from (values
 ('c1250000-0000-4000-8000-000000000901'::uuid),
 ('c1250000-0000-4000-8000-000000000902'::uuid),
 ('c1250000-0000-4000-8000-000000000903'::uuid),
 ('c1250000-0000-4000-8000-000000000904'::uuid)
) as member(user_id);
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select member.user_id,'c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020',array['member'],true
from (values
 ('c1250000-0000-4000-8000-000000000901'::uuid),
 ('c1250000-0000-4000-8000-000000000902'::uuid),
 ('c1250000-0000-4000-8000-000000000903'::uuid),
 ('c1250000-0000-4000-8000-000000000904'::uuid)
) as member(user_id);
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values
('c1250000-0000-4000-8000-000000000911','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','finance_engineer','Finance engineer','test',false),
('c1250000-0000-4000-8000-000000000912','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','finance_buyer','Finance buyer','test',false),
('c1250000-0000-4000-8000-000000000913','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','finance_accountant','Finance accountant','test',false),
('c1250000-0000-4000-8000-000000000914','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','finance_treasurer','Finance treasurer','test',false);
insert into public.role_permissions(role_id,permission_code) values
('c1250000-0000-4000-8000-000000000911','material.read'),
('c1250000-0000-4000-8000-000000000911','material.proposal.submit'),
('c1250000-0000-4000-8000-000000000912','material.read'),
('c1250000-0000-4000-8000-000000000912','material.order.manage'),
('c1250000-0000-4000-8000-000000000912','material.supplier.record'),
('c1250000-0000-4000-8000-000000000913','material.read'),
('c1250000-0000-4000-8000-000000000913','material.contract.record'),
('c1250000-0000-4000-8000-000000000914','material.read'),
('c1250000-0000-4000-8000-000000000914','material.payment.approve'),
('c1250000-0000-4000-8000-000000000914','material.payment.execute');
insert into public.company_role_assignments(
  tenant_id,company_id,user_id,role_id,granted_by,grant_reason
) values
('c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000901','c1250000-0000-4000-8000-000000000911','c1250000-0000-4000-8000-000000000903','test'),
('c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000902','c1250000-0000-4000-8000-000000000912','c1250000-0000-4000-8000-000000000903','test'),
('c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000903','c1250000-0000-4000-8000-000000000913','c1250000-0000-4000-8000-000000000903','test'),
('c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000904','c1250000-0000-4000-8000-000000000914','c1250000-0000-4000-8000-000000000903','test');
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000010',true,'c1250000-0000-4000-8000-000000000903');
insert into public.projects(id,tenant_id,company_id,code,name,origin,created_by)
values('c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','FIN-P','Finance project','manual','c1250000-0000-4000-8000-000000000903');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c1250000-0000-4000-8000-000000000201','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','FIN-S','Finance supplier','organization','c1250000-0000-4000-8000-000000000902');
insert into public.material_proposals(id,tenant_id,company_id,project_id,needed_on,delivery_address,created_by)
values('c1250000-0000-4000-8000-000000000301','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','2026-10-30','Site A','c1250000-0000-4000-8000-000000000901');
insert into public.material_proposal_revisions(id,tenant_id,company_id,project_id,proposal_id,revision_no,needed_on,delivery_address,submitted_by)
values('c1250000-0000-4000-8000-000000000401','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000301',1,'2026-10-30','Site A','c1250000-0000-4000-8000-000000000901');
update public.material_proposals
set review_state='approved',current_revision_id='c1250000-0000-4000-8000-000000000401',approved_revision_id='c1250000-0000-4000-8000-000000000401'
where id='c1250000-0000-4000-8000-000000000301';
insert into public.cost_evidence_files(
 id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
 verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version
)
select
 file.id,'c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',
 'c1250000-0000-4000-8000-000000000010/c1250000-0000-4000-8000-000000000020/c1250000-0000-4000-8000-000000000101/'||file.id::text,
 file.name,'application/pdf',8,repeat(file.hash_char,64),'application/pdf',8,repeat(file.hash_char,64),'finalized',
 now()+interval '15 minutes','c1250000-0000-4000-8000-000000000903','c1250000-0000-4000-8000-000000000903',now(),1
from (values
 ('c1250000-0000-4000-8000-000000000501'::uuid,'unsigned-quotation.pdf','a'),
 ('c1250000-0000-4000-8000-000000000502'::uuid,'contract.pdf','b'),
 ('c1250000-0000-4000-8000-000000000503'::uuid,'signed-quotation.pdf','c'),
 ('c1250000-0000-4000-8000-000000000504'::uuid,'invoice.pdf','d'),
 ('c1250000-0000-4000-8000-000000000505'::uuid,'misplaced-contract.pdf','e'),
 ('c1250000-0000-4000-8000-000000000506'::uuid,'amendment.pdf','f'),
 ('c1250000-0000-4000-8000-000000000507'::uuid,'second-contract.pdf','1'),
 ('c1250000-0000-4000-8000-000000000508'::uuid,'second-signed-quotation.pdf','2'),
 ('c1250000-0000-4000-8000-000000000509'::uuid,'mismatched-invoice.pdf','3'),
 ('c1250000-0000-4000-8000-000000000510'::uuid,'payment-proof.pdf','4'),
 ('c1250000-0000-4000-8000-000000000511'::uuid,'second-invoice.pdf','5')
) as file(id,name,hash_char);

-- Creating an order notifies contract recorders, never the acting buyer.
select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,
  supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
) values(
  'c1250000-0000-4000-8000-000000000351','c1250000-0000-4000-8000-000000000010',
  'c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',
  'c1250000-0000-4000-8000-000000000301','c1250000-0000-4000-8000-000000000401',
  'c1250000-0000-4000-8000-000000000201','VND','c1250000-0000-4000-8000-000000000501',
  'c1250000-0000-4000-8000-000000000902'
);
select is((
  select count(*) from public.app_notifications
  where recipient_id='c1250000-0000-4000-8000-000000000903'
    and event_kind='material.order.created'
    and source_id='c1250000-0000-4000-8000-000000000351'
),1::bigint,'contract recorder receives exactly one order-created notification');
select is((
  select count(*) from public.app_notifications
  where recipient_id='c1250000-0000-4000-8000-000000000902'
),0::bigint,'acting buyer is not notified about their own order');
select is((
  select count(*) from public.app_notifications
  where recipient_id='c1250000-0000-4000-8000-000000000904'
),0::bigint,'users without material.contract.record are not notified about new orders');

select private.c1_material_notify_users(
  'c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',
  array['c1250000-0000-4000-8000-000000000903'::uuid],
  'material.order.created','material_order','c1250000-0000-4000-8000-000000000351',
  '/materials/c1250000-0000-4000-8000-000000000101/orders/c1250000-0000-4000-8000-000000000351',
  '{}'::jsonb,'order:c1250000-0000-4000-8000-000000000351'
);
select is((
  select count(*) from public.app_notifications
  where recipient_id='c1250000-0000-4000-8000-000000000903'
    and dedupe_key='order:c1250000-0000-4000-8000-000000000351'
),1::bigint,'repeated notification with the same dedupe key is ignored');

-- Contract rows (written directly as the migration owner).
insert into public.material_contracts(
  id,tenant_id,company_id,project_id,order_id,supplier_id,currency_code,contract_no,signed_on,created_by
) values(
  'c1250000-0000-4000-8000-000000000601','c1250000-0000-4000-8000-000000000010',
  'c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',
  'c1250000-0000-4000-8000-000000000351','c1250000-0000-4000-8000-000000000201',
  'VND','HD-FIN-01','2026-10-10','c1250000-0000-4000-8000-000000000903'
);
select lives_ok($$
  insert into public.material_contract_versions(
    id,tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
    order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
  ) values(
    'c1250000-0000-4000-8000-000000000611','c1250000-0000-4000-8000-000000000010',
    'c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',
    'c1250000-0000-4000-8000-000000000601',1,'original',100,10,110,100,null,
    'c1250000-0000-4000-8000-000000000502','c1250000-0000-4000-8000-000000000503',null,
    'c1250000-0000-4000-8000-000000000903'
  )
$$,'balanced original contract version is accepted');
select throws_ok($$
  insert into public.material_contract_versions(
    tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
    order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
  ) values(
    'c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020',
    'c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000601',
    2,'amendment',90,9,99,100,null,
    'c1250000-0000-4000-8000-000000000506',null,'Supplier discount',
    'c1250000-0000-4000-8000-000000000903'
  )
$$,'23514',null,'subtotal different from the order snapshot requires a variance reason');
select throws_ok($$
  insert into public.material_contract_versions(
    tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
    order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
  ) values(
    'c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020',
    'c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000601',
    2,'amendment',100,10,111,100,null,
    'c1250000-0000-4000-8000-000000000506',null,'Wrong total',
    'c1250000-0000-4000-8000-000000000903'
  )
$$,'23514',null,'total must equal subtotal plus VAT');

-- Evidence scopes accept contract-level targets only for contract roles.
select lives_ok($$
  insert into public.material_evidence_scopes(
    evidence_file_id,tenant_id,company_id,project_id,target_kind,contract_id,evidence_role,created_by
  ) values(
    'c1250000-0000-4000-8000-000000000504','c1250000-0000-4000-8000-000000000010',
    'c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',
    'material_contract','c1250000-0000-4000-8000-000000000601','invoice',
    'c1250000-0000-4000-8000-000000000903'
  )
$$,'material_contract invoice scope with contract_id is accepted');
select throws_ok($$
  insert into public.material_evidence_scopes(
    evidence_file_id,tenant_id,company_id,project_id,target_kind,contract_id,evidence_role,created_by
  ) values(
    'c1250000-0000-4000-8000-000000000505','c1250000-0000-4000-8000-000000000010',
    'c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',
    'material_contract','c1250000-0000-4000-8000-000000000601','signed_contract',
    'c1250000-0000-4000-8000-000000000903'
  )
$$,'23514',null,'material_contract scope rejects the order-level signed_contract role');

-- Order reads no longer expose the retired cost-workflow cash shape. Since the A4 contract
-- commands (20261015090100) a contract is reported to a reader without finance permissions
-- (the buyer here) as status only: money and cash stay hidden.
select ok((
  select order_json->'contract'->>'contractNo'='HD-FIN-01'
    and order_json->'contract'->'total'='null'::jsonb
    and order_json->'cash'='null'::jsonb
  from (select private.c1_material_order_json('c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000351') as order_json) as read_order
),'order read hides contract money and cash from a reader without finance permissions');

-- Cross-row integrity: children must stay on the same contract, supplier and installment.
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c1250000-0000-4000-8000-000000000202','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','FIN-S2','Second finance supplier','organization','c1250000-0000-4000-8000-000000000902');
insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,
  supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
) values(
  'c1250000-0000-4000-8000-000000000352','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000301','c1250000-0000-4000-8000-000000000401','c1250000-0000-4000-8000-000000000202','VND','c1250000-0000-4000-8000-000000000501','c1250000-0000-4000-8000-000000000902'
);
insert into public.material_contracts(
  id,tenant_id,company_id,project_id,order_id,supplier_id,currency_code,contract_no,signed_on,created_by
) values('c1250000-0000-4000-8000-000000000602','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000352','c1250000-0000-4000-8000-000000000202','VND','HD-FIN-02','2026-10-11','c1250000-0000-4000-8000-000000000903');
insert into public.material_contract_versions(
  id,tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
  order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
) values('c1250000-0000-4000-8000-000000000621','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000602',1,'original',50,5,55,50,null,'c1250000-0000-4000-8000-000000000507','c1250000-0000-4000-8000-000000000508',null,'c1250000-0000-4000-8000-000000000903');

select lives_ok($$
  insert into public.material_contract_installments(
    tenant_id,company_id,project_id,contract_id,contract_version_id,seq,installment_key,name,amount,due_on,is_advance
  ) values('c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000601','c1250000-0000-4000-8000-000000000611',1,'c1250000-0000-4000-8000-000000000a01','Dot 1',110,'2026-11-10',false)
$$,'installment on a version of its own contract is accepted');
select throws_ok($$
  insert into public.material_contract_installments(
    tenant_id,company_id,project_id,contract_id,contract_version_id,seq,installment_key,name,amount,due_on,is_advance
  ) values('c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000601','c1250000-0000-4000-8000-000000000621',1,'c1250000-0000-4000-8000-000000000a02','Dot sai',55,'2026-11-10',false)
$$,'23503',null,'installment cannot point at a version of another contract');

select throws_ok($$
  insert into public.material_invoices(
    tenant_id,company_id,project_id,contract_id,supplier_id,invoice_symbol,invoice_no,issued_on,
    subtotal,vat_amount,total,file_id,recorded_by
  ) values('c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000601','c1250000-0000-4000-8000-000000000202','1C26TAA','0000001','2026-10-12',10,1,11,'c1250000-0000-4000-8000-000000000509','c1250000-0000-4000-8000-000000000903')
$$,'23503',null,'invoice supplier must be the contract supplier');

insert into public.material_payment_requests(
  id,tenant_id,company_id,project_id,contract_id,installment_key,amount,submitted_by,created_by
) values('c1250000-0000-4000-8000-000000000701','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000601','c1250000-0000-4000-8000-000000000a01',10,'c1250000-0000-4000-8000-000000000903','c1250000-0000-4000-8000-000000000903');
select throws_ok($$
  insert into public.material_payments(
    tenant_id,company_id,project_id,payment_request_id,contract_id,installment_key,amount,
    paid_on,bank_reference,proof_file_id,proof_sha256,paid_by
  ) values('c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000701','c1250000-0000-4000-8000-000000000601','c1250000-0000-4000-8000-000000000a02',10,'2026-10-15','UNC-01','c1250000-0000-4000-8000-000000000510',repeat('4',64),'c1250000-0000-4000-8000-000000000904')
$$,'23503',null,'payment must keep the contract and installment of its request');

insert into public.material_invoices(
  id,tenant_id,company_id,project_id,contract_id,supplier_id,invoice_symbol,invoice_no,issued_on,
  subtotal,vat_amount,total,file_id,recorded_by
) values('c1250000-0000-4000-8000-000000000801','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000602','c1250000-0000-4000-8000-000000000202','1C26TBB','0000002','2026-10-12',50,5,55,'c1250000-0000-4000-8000-000000000511','c1250000-0000-4000-8000-000000000903');
select throws_ok($$
  insert into public.material_payment_request_invoices(payment_request_id,invoice_id,tenant_id,company_id,project_id,contract_id)
  values('c1250000-0000-4000-8000-000000000701','c1250000-0000-4000-8000-000000000801','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000601')
$$,'23503',null,'payment request cannot link an invoice of another contract');
select throws_ok($$
  insert into public.material_payment_request_invoices(payment_request_id,invoice_id,tenant_id,company_id,project_id,contract_id)
  values('c1250000-0000-4000-8000-000000000701','c1250000-0000-4000-8000-000000000801','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000602')
$$,'23503',null,'payment request invoice link must carry the request contract');

select throws_ok($$
  select private.c1_material_notify_users(
    'c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000999',array['c1250000-0000-4000-8000-000000000903'::uuid],
    'material.order.created','material_order','c1250000-0000-4000-8000-000000000351','/materials/missing','{}'::jsonb,'missing-project'
  )
$$,'23503',null,'notification project must exist in the same company');

-- A second notification for another recipient proves recipient-only visibility.
select private.c1_material_notify_users(
  'c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',
  array['c1250000-0000-4000-8000-000000000901'::uuid],
  'material.contract.recorded','material_contract','c1250000-0000-4000-8000-000000000601',
  '/materials/c1250000-0000-4000-8000-000000000101/orders/c1250000-0000-4000-8000-000000000351',
  '{}'::jsonb,'contract:c1250000-0000-4000-8000-000000000601'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select is((
  select array_agg(distinct notification.recipient_id) from public.app_notifications as notification
),array['c1250000-0000-4000-8000-000000000903'::uuid],'accountant selects only their own notifications');
select is((
  select count(*) from public.material_contract_versions
  where contract_id='c1250000-0000-4000-8000-000000000601'
),1::bigint,'contract recorder reads contract versions');

select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is((
  select array_agg(distinct notification.recipient_id) from public.app_notifications as notification
),array['c1250000-0000-4000-8000-000000000901'::uuid],'engineer selects only their own notifications');
select is((
  select count(*) from public.material_contracts
  where id='c1250000-0000-4000-8000-000000000601'
),1::bigint,'proposal owner sees the contract status row');
select is((
  select count(*) from public.material_contract_versions
  where contract_id='c1250000-0000-4000-8000-000000000601'
),0::bigint,'proposal owner without finance permission cannot read contract versions');

select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select is((
  select count(*) from public.material_contracts
  where id='c1250000-0000-4000-8000-000000000601'
),1::bigint,'buyer sees the contract status row');
select is((
  select count(*) from public.material_contract_versions
  where contract_id='c1250000-0000-4000-8000-000000000601'
),0::bigint,'buyer with material.order.manage cannot read contract versions');

-- finance evidence: scopes for the finalized fixture files, then the role-based read gate.
set local role none;
insert into public.material_evidence_scopes(
  evidence_file_id,tenant_id,company_id,project_id,target_kind,proposal_id,revision_id,order_id,contract_id,evidence_role,created_by
) values
('c1250000-0000-4000-8000-000000000501','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','material_proposal','c1250000-0000-4000-8000-000000000301','c1250000-0000-4000-8000-000000000401',null,null,'unsigned_quotation','c1250000-0000-4000-8000-000000000903'),
('c1250000-0000-4000-8000-000000000502','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','material_order',null,null,'c1250000-0000-4000-8000-000000000351',null,'signed_contract','c1250000-0000-4000-8000-000000000903'),
('c1250000-0000-4000-8000-000000000503','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','material_order',null,null,'c1250000-0000-4000-8000-000000000351',null,'signed_quotation','c1250000-0000-4000-8000-000000000903'),
('c1250000-0000-4000-8000-000000000506','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','material_contract',null,null,null,'c1250000-0000-4000-8000-000000000601','contract_amendment','c1250000-0000-4000-8000-000000000903'),
('c1250000-0000-4000-8000-000000000510','c1250000-0000-4000-8000-000000000010','c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','material_contract',null,null,null,'c1250000-0000-4000-8000-000000000601','payment_proof','c1250000-0000-4000-8000-000000000903');
set local role authenticated;

-- finance evidence: upload intents follow the role permission and MIME table.
select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select lives_ok($$
  select public.c1_material_create_evidence_intent('c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',jsonb_build_object('originalFilename','hoa-don.xml','mimeType','application/xml','sizeBytes',8,'sha256',repeat('a',64),'evidenceRole','invoice','target',jsonb_build_object('kind','material_contract','contractId','c1250000-0000-4000-8000-000000000601')),'c1250000-0000-4000-8000-000000000951','c1250000-0000-4000-8000-000000000961')
$$,'finance evidence: accountant creates an XML invoice intent for a contract');
select throws_ok($$
  select public.c1_material_create_evidence_intent('c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',jsonb_build_object('originalFilename','unc.png','mimeType','image/png','sizeBytes',8,'sha256',repeat('a',64),'evidenceRole','payment_proof','target',jsonb_build_object('kind','material_contract','contractId','c1250000-0000-4000-8000-000000000601')),'c1250000-0000-4000-8000-000000000952','c1250000-0000-4000-8000-000000000962')
$$,'P0001','PERMISSION_DENIED','finance evidence: accountant without material.payment.execute cannot create a payment proof intent');
-- Invoices accept photos since 20261016100100 (C3).
select lives_ok($$
  select public.c1_material_create_evidence_intent('c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',jsonb_build_object('originalFilename','hoa-don.png','mimeType','image/png','sizeBytes',8,'sha256',repeat('a',64),'evidenceRole','invoice','target',jsonb_build_object('kind','material_contract','contractId','c1250000-0000-4000-8000-000000000601')),'c1250000-0000-4000-8000-000000000953','c1250000-0000-4000-8000-000000000963')
$$,'finance evidence: invoice accepts an image MIME type');
select throws_ok($$
  select public.c1_material_create_evidence_intent('c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',jsonb_build_object('originalFilename','phu-luc.xml','mimeType','application/xml','sizeBytes',8,'sha256',repeat('a',64),'evidenceRole','contract_amendment','target',jsonb_build_object('kind','material_contract','contractId','c1250000-0000-4000-8000-000000000601')),'c1250000-0000-4000-8000-000000000954','c1250000-0000-4000-8000-000000000964')
$$,'P0001','INPUT_INVALID','finance evidence: contract amendment accepts PDF only');
select throws_ok($$
  select public.c1_material_create_evidence_intent('c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',jsonb_build_object('originalFilename','hd.pdf','mimeType','application/pdf','sizeBytes',8,'sha256',repeat('a',64),'evidenceRole','signed_contract','target',jsonb_build_object('kind','material_contract','contractId','c1250000-0000-4000-8000-000000000601')),'c1250000-0000-4000-8000-000000000955','c1250000-0000-4000-8000-000000000965')
$$,'P0001','INPUT_INVALID','finance evidence: order-level signed_contract role cannot target a contract');
select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000904","role":"authenticated"}',true);
select lives_ok($$
  select public.c1_material_create_evidence_intent('c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',jsonb_build_object('originalFilename','unc.png','mimeType','image/png','sizeBytes',8,'sha256',repeat('a',64),'evidenceRole','payment_proof','target',jsonb_build_object('kind','material_contract','contractId','c1250000-0000-4000-8000-000000000601')),'c1250000-0000-4000-8000-000000000956','c1250000-0000-4000-8000-000000000966')
$$,'finance evidence: treasurer creates a PNG payment proof intent');
select throws_ok($$
  select public.c1_material_create_evidence_intent('c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',jsonb_build_object('originalFilename','hoa-don.pdf','mimeType','application/pdf','sizeBytes',8,'sha256',repeat('a',64),'evidenceRole','invoice','target',jsonb_build_object('kind','material_contract','contractId','c1250000-0000-4000-8000-000000000601')),'c1250000-0000-4000-8000-000000000957','c1250000-0000-4000-8000-000000000967')
$$,'P0001','PERMISSION_DENIED','finance evidence: treasurer without material.contract.record cannot create an invoice intent');
select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_create_evidence_intent('c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',jsonb_build_object('originalFilename','hoa-don.pdf','mimeType','application/pdf','sizeBytes',8,'sha256',repeat('a',64),'evidenceRole','invoice','target',jsonb_build_object('kind','material_contract','contractId','c1250000-0000-4000-8000-000000000601')),'c1250000-0000-4000-8000-000000000958','c1250000-0000-4000-8000-000000000968')
$$,'P0001','PERMISSION_DENIED','finance evidence: buyer cannot create an invoice intent');

-- finance evidence: read-target RPC.
select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select lives_ok(
  format($q$select public.c1_material_evidence_read_target(%L,%L,%L)$q$,'c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',file.id),
  'finance evidence: buyer reads the '||file.label||' through the read-target RPC'
) from (values
 ('c1250000-0000-4000-8000-000000000501'::uuid,'unsigned quotation')
) as file(id,label);
select throws_ok(
  format($q$select public.c1_material_evidence_read_target(%L,%L,%L)$q$,'c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',file.id),
  'P0001','PERMISSION_DENIED',
  'finance evidence: buyer is denied the '||file.label||' through the read-target RPC'
) from (values
 ('c1250000-0000-4000-8000-000000000502'::uuid,'signed contract'),
 ('c1250000-0000-4000-8000-000000000503'::uuid,'signed quotation'),
 ('c1250000-0000-4000-8000-000000000504'::uuid,'invoice'),
 ('c1250000-0000-4000-8000-000000000506'::uuid,'contract amendment'),
 ('c1250000-0000-4000-8000-000000000510'::uuid,'payment proof')
) as file(id,label);
select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select lives_ok(
  format($q$select public.c1_material_evidence_read_target(%L,%L,%L)$q$,'c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',file.id),
  'finance evidence: accountant reads the '||file.label||' through the read-target RPC'
) from (values
 ('c1250000-0000-4000-8000-000000000501'::uuid,'unsigned quotation'),
 ('c1250000-0000-4000-8000-000000000502'::uuid,'signed contract'),
 ('c1250000-0000-4000-8000-000000000503'::uuid,'signed quotation'),
 ('c1250000-0000-4000-8000-000000000504'::uuid,'invoice'),
 ('c1250000-0000-4000-8000-000000000506'::uuid,'contract amendment'),
 ('c1250000-0000-4000-8000-000000000510'::uuid,'payment proof')
) as file(id,label);
select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000904","role":"authenticated"}',true);
select lives_ok(
  format($q$select public.c1_material_evidence_read_target(%L,%L,%L)$q$,'c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',file.id),
  'finance evidence: treasurer reads the '||file.label||' through the read-target RPC'
) from (values
 ('c1250000-0000-4000-8000-000000000502'::uuid,'signed contract'),
 ('c1250000-0000-4000-8000-000000000503'::uuid,'signed quotation'),
 ('c1250000-0000-4000-8000-000000000504'::uuid,'invoice'),
 ('c1250000-0000-4000-8000-000000000506'::uuid,'contract amendment'),
 ('c1250000-0000-4000-8000-000000000510'::uuid,'payment proof')
) as file(id,label);
select throws_ok(
  format($q$select public.c1_material_evidence_read_target(%L,%L,%L)$q$,'c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101',file.id),
  'P0001','PERMISSION_DENIED',
  'finance evidence: treasurer is denied the '||file.label||' through the read-target RPC'
) from (values
 ('c1250000-0000-4000-8000-000000000501'::uuid,'unsigned quotation')
) as file(id,label);
select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_evidence_read_target('c1250000-0000-4000-8000-000000000020','c1250000-0000-4000-8000-000000000101','c1250000-0000-4000-8000-000000000502')
$$,'P0001','PERMISSION_DENIED','finance evidence: engineer without order or finance visibility is denied any material file');

-- finance evidence: Storage SELECT predicate.
select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select is(
  private.c1_can_select_evidence_object('c1-accounting-evidence','c1250000-0000-4000-8000-000000000010/c1250000-0000-4000-8000-000000000020/c1250000-0000-4000-8000-000000000101/'||file.id::text),
  file.id::text in ('c1250000-0000-4000-8000-000000000501'),
  'finance evidence: Storage SELECT predicate for the '||file.label||' matches the buyer rule'
) from (values
 ('c1250000-0000-4000-8000-000000000501'::uuid,'unsigned quotation'),
 ('c1250000-0000-4000-8000-000000000502'::uuid,'signed contract'),
 ('c1250000-0000-4000-8000-000000000503'::uuid,'signed quotation'),
 ('c1250000-0000-4000-8000-000000000504'::uuid,'invoice'),
 ('c1250000-0000-4000-8000-000000000506'::uuid,'contract amendment'),
 ('c1250000-0000-4000-8000-000000000510'::uuid,'payment proof')
) as file(id,label);
select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select is(
  private.c1_can_select_evidence_object('c1-accounting-evidence','c1250000-0000-4000-8000-000000000010/c1250000-0000-4000-8000-000000000020/c1250000-0000-4000-8000-000000000101/'||file.id::text),
  file.id::text in ('c1250000-0000-4000-8000-000000000501', 'c1250000-0000-4000-8000-000000000502', 'c1250000-0000-4000-8000-000000000503', 'c1250000-0000-4000-8000-000000000504', 'c1250000-0000-4000-8000-000000000506', 'c1250000-0000-4000-8000-000000000510'),
  'finance evidence: Storage SELECT predicate for the '||file.label||' matches the accountant rule'
) from (values
 ('c1250000-0000-4000-8000-000000000501'::uuid,'unsigned quotation'),
 ('c1250000-0000-4000-8000-000000000502'::uuid,'signed contract'),
 ('c1250000-0000-4000-8000-000000000503'::uuid,'signed quotation'),
 ('c1250000-0000-4000-8000-000000000504'::uuid,'invoice'),
 ('c1250000-0000-4000-8000-000000000506'::uuid,'contract amendment'),
 ('c1250000-0000-4000-8000-000000000510'::uuid,'payment proof')
) as file(id,label);
select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000904","role":"authenticated"}',true);
select is(
  private.c1_can_select_evidence_object('c1-accounting-evidence','c1250000-0000-4000-8000-000000000010/c1250000-0000-4000-8000-000000000020/c1250000-0000-4000-8000-000000000101/'||file.id::text),
  file.id::text in ('c1250000-0000-4000-8000-000000000502', 'c1250000-0000-4000-8000-000000000503', 'c1250000-0000-4000-8000-000000000504', 'c1250000-0000-4000-8000-000000000506', 'c1250000-0000-4000-8000-000000000510'),
  'finance evidence: Storage SELECT predicate for the '||file.label||' matches the treasurer rule'
) from (values
 ('c1250000-0000-4000-8000-000000000501'::uuid,'unsigned quotation'),
 ('c1250000-0000-4000-8000-000000000502'::uuid,'signed contract'),
 ('c1250000-0000-4000-8000-000000000503'::uuid,'signed quotation'),
 ('c1250000-0000-4000-8000-000000000504'::uuid,'invoice'),
 ('c1250000-0000-4000-8000-000000000506'::uuid,'contract amendment'),
 ('c1250000-0000-4000-8000-000000000510'::uuid,'payment proof')
) as file(id,label);

-- finance evidence: file metadata rows follow the same rule.
select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select is((select count(*) from public.cost_evidence_files where id in ('c1250000-0000-4000-8000-000000000501', 'c1250000-0000-4000-8000-000000000502', 'c1250000-0000-4000-8000-000000000503', 'c1250000-0000-4000-8000-000000000504', 'c1250000-0000-4000-8000-000000000506', 'c1250000-0000-4000-8000-000000000510')),1::bigint,'finance evidence: buyer sees metadata of the unsigned quotation only');
select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select is((select count(*) from public.cost_evidence_files where id in ('c1250000-0000-4000-8000-000000000501', 'c1250000-0000-4000-8000-000000000502', 'c1250000-0000-4000-8000-000000000503', 'c1250000-0000-4000-8000-000000000504', 'c1250000-0000-4000-8000-000000000506', 'c1250000-0000-4000-8000-000000000510')),6::bigint,'finance evidence: contract recorder sees metadata of every material file');
select set_config('request.jwt.claims','{"sub":"c1250000-0000-4000-8000-000000000904","role":"authenticated"}',true);
select is((select count(*) from public.cost_evidence_files where id in ('c1250000-0000-4000-8000-000000000501', 'c1250000-0000-4000-8000-000000000502', 'c1250000-0000-4000-8000-000000000503', 'c1250000-0000-4000-8000-000000000504', 'c1250000-0000-4000-8000-000000000506', 'c1250000-0000-4000-8000-000000000510')),5::bigint,'finance evidence: finance reader sees metadata of the finance files but not the unsigned quotation');

select * from finish(true);
rollback;
