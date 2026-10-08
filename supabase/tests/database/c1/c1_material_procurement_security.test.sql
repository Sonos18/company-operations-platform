begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(104);

select ok(
  coalesce((select relation.relrowsecurity and relation.relforcerowsecurity from pg_class as relation where relation.oid=to_regclass(table_name)),false),
  table_name||' forces RLS'
)
from unnest(array[
  'public.material_items',
  'public.material_supplier_names',
  'public.material_proposals',
  'public.material_proposal_lines',
  'public.material_proposal_revisions',
  'public.material_proposal_revision_lines',
  'public.material_proposal_decisions',
  'public.material_orders',
  'public.material_order_allocations',
  'public.material_order_contracts',
  'public.material_evidence_scopes',
  'public.material_order_cancellations'
]) as listed(table_name);

select ok(
  not has_table_privilege('authenticated',table_name,'INSERT,UPDATE,DELETE,TRUNCATE'),
  'direct table DML denied: '||table_name
)
from unnest(array[
  'public.material_items',
  'public.material_supplier_names',
  'public.material_proposals',
  'public.material_proposal_lines',
  'public.material_proposal_revisions',
  'public.material_proposal_revision_lines',
  'public.material_proposal_decisions',
  'public.material_orders',
  'public.material_order_allocations',
  'public.material_order_contracts',
  'public.material_evidence_scopes',
  'public.material_order_cancellations'
]) as listed(table_name);

select ok(
  not has_table_privilege('anon',table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
  'anonymous access denied: '||table_name
)
from unnest(array[
  'public.material_items',
  'public.material_supplier_names',
  'public.material_proposals',
  'public.material_proposal_lines',
  'public.material_proposal_revisions',
  'public.material_proposal_revision_lines',
  'public.material_proposal_decisions',
  'public.material_orders',
  'public.material_order_allocations',
  'public.material_order_contracts',
  'public.material_evidence_scopes',
  'public.material_order_cancellations'
]) as listed(table_name);

select ok(
  coalesce((
    select procedure.prosecdef and procedure.proconfig @> array['search_path=']
    from pg_proc as procedure
    where procedure.oid=to_regprocedure(signature)
  ),false),
  signature||' is SECURITY DEFINER with empty search_path'
)
from unnest(array[
  'public.c1_material_list_projects(uuid)',
  'public.c1_material_list_items(uuid)',
  'public.c1_material_create_item(uuid,jsonb,uuid,uuid)',
  'public.c1_material_update_item(uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_list_supplier_names(uuid,uuid)',
  'public.c1_material_record_supplier_name(uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_resolve_supplier(uuid,jsonb,uuid,uuid)',
  'public.c1_material_list_proposals(uuid,uuid)',
  'public.c1_material_read_proposal(uuid,uuid,uuid)',
  'public.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_decide_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_create_order(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_list_orders(uuid,uuid)',
  'public.c1_material_read_order(uuid,uuid,uuid)',
  'public.c1_material_cancel_order(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_create_evidence_intent(uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_evidence_finalization_target(uuid,uuid,uuid)',
  'public.c1_material_evidence_read_target(uuid,uuid,uuid)',
  'public.c1_finalize_material_evidence_server(uuid,uuid,uuid,uuid,jsonb,uuid,uuid)'
]) as listed(signature);

select ok(
  has_function_privilege('authenticated',signature,'EXECUTE'),
  signature||' is executable by authenticated'
)
from unnest(array[
  'public.c1_material_list_projects(uuid)',
  'public.c1_material_list_items(uuid)',
  'public.c1_material_create_item(uuid,jsonb,uuid,uuid)',
  'public.c1_material_update_item(uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_list_supplier_names(uuid,uuid)',
  'public.c1_material_record_supplier_name(uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_resolve_supplier(uuid,jsonb,uuid,uuid)',
  'public.c1_material_list_proposals(uuid,uuid)',
  'public.c1_material_read_proposal(uuid,uuid,uuid)',
  'public.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_decide_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_create_order(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_list_orders(uuid,uuid)',
  'public.c1_material_read_order(uuid,uuid,uuid)',
  'public.c1_material_cancel_order(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_create_evidence_intent(uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_evidence_finalization_target(uuid,uuid,uuid)',
  'public.c1_material_evidence_read_target(uuid,uuid,uuid)'
]) as listed(signature);

select ok(
  not has_function_privilege('anon',signature,'EXECUTE'),
  signature||' denies anonymous execution'
)
from unnest(array[
  'public.c1_material_list_projects(uuid)',
  'public.c1_material_list_items(uuid)',
  'public.c1_material_create_item(uuid,jsonb,uuid,uuid)',
  'public.c1_material_update_item(uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_list_supplier_names(uuid,uuid)',
  'public.c1_material_record_supplier_name(uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_resolve_supplier(uuid,jsonb,uuid,uuid)',
  'public.c1_material_list_proposals(uuid,uuid)',
  'public.c1_material_read_proposal(uuid,uuid,uuid)',
  'public.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_decide_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_create_order(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_list_orders(uuid,uuid)',
  'public.c1_material_read_order(uuid,uuid,uuid)',
  'public.c1_material_cancel_order(uuid,uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_create_evidence_intent(uuid,uuid,jsonb,uuid,uuid)',
  'public.c1_material_evidence_finalization_target(uuid,uuid,uuid)',
  'public.c1_material_evidence_read_target(uuid,uuid,uuid)'
]) as listed(signature);

select ok(
  has_function_privilege('service_role','public.c1_finalize_material_evidence_server(uuid,uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE'),
  'service role executes material evidence finalizer'
);
select ok(
  not has_function_privilege('authenticated','public.c1_finalize_material_evidence_server(uuid,uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
    and not has_function_privilege('anon','public.c1_finalize_material_evidence_server(uuid,uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE'),
  'API roles cannot execute material evidence finalizer'
);

insert into auth.users(id,email) values
('c1210000-0000-4000-8000-000000000901','security-engineer@test.invalid'),
('c1210000-0000-4000-8000-000000000902','security-buyer@test.invalid');
insert into public.tenants(id,code,name)
values('c1210000-0000-4000-8000-000000000010','C1MS','Material security tenant');
insert into public.companies(id,tenant_id,code,name)
values('c1210000-0000-4000-8000-000000000020','c1210000-0000-4000-8000-000000000010','C1MS','Material security company');
insert into public.tenant_memberships(user_id,tenant_id,roles) values
('c1210000-0000-4000-8000-000000000901','c1210000-0000-4000-8000-000000000010',array['member']),
('c1210000-0000-4000-8000-000000000902','c1210000-0000-4000-8000-000000000010',array['member']);
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active) values
('c1210000-0000-4000-8000-000000000901','c1210000-0000-4000-8000-000000000010','c1210000-0000-4000-8000-000000000020',array['member'],true),
('c1210000-0000-4000-8000-000000000902','c1210000-0000-4000-8000-000000000010','c1210000-0000-4000-8000-000000000020',array['member'],true);
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values
('c1210000-0000-4000-8000-000000000911','c1210000-0000-4000-8000-000000000010','c1210000-0000-4000-8000-000000000020','security_engineer','Security engineer','test',false),
('c1210000-0000-4000-8000-000000000912','c1210000-0000-4000-8000-000000000010','c1210000-0000-4000-8000-000000000020','security_buyer','Security buyer','test',false);
insert into public.role_permissions(role_id,permission_code) values
('c1210000-0000-4000-8000-000000000911','material.read'),
('c1210000-0000-4000-8000-000000000911','material.proposal.submit'),
('c1210000-0000-4000-8000-000000000912','material.read'),
('c1210000-0000-4000-8000-000000000912','material.manage'),
('c1210000-0000-4000-8000-000000000912','material.proposal.decide'),
('c1210000-0000-4000-8000-000000000912','material.order.manage'),
('c1210000-0000-4000-8000-000000000912','material.supplier.record');
insert into public.company_role_assignments(
  tenant_id,company_id,user_id,role_id,granted_by,grant_reason
) values
('c1210000-0000-4000-8000-000000000010','c1210000-0000-4000-8000-000000000020','c1210000-0000-4000-8000-000000000901','c1210000-0000-4000-8000-000000000911','c1210000-0000-4000-8000-000000000902','test'),
('c1210000-0000-4000-8000-000000000010','c1210000-0000-4000-8000-000000000020','c1210000-0000-4000-8000-000000000902','c1210000-0000-4000-8000-000000000912','c1210000-0000-4000-8000-000000000902','test');
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1210000-0000-4000-8000-000000000020','c1210000-0000-4000-8000-000000000010',true,'c1210000-0000-4000-8000-000000000902');
insert into public.projects(id,tenant_id,company_id,code,name,origin,created_by)
values('c1210000-0000-4000-8000-000000000101','c1210000-0000-4000-8000-000000000010','c1210000-0000-4000-8000-000000000020','SEC-P','Security project','manual','c1210000-0000-4000-8000-000000000902');
insert into public.material_items(id,tenant_id,company_id,code,name,specification,unit,created_by)
values('c1210000-0000-4000-8000-000000000201','c1210000-0000-4000-8000-000000000010','c1210000-0000-4000-8000-000000000020','SEC-M','Steel','D10','bag','c1210000-0000-4000-8000-000000000902');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c1210000-0000-4000-8000-000000000202','c1210000-0000-4000-8000-000000000010','c1210000-0000-4000-8000-000000000020','SEC-S','Hidden supplier','organization','c1210000-0000-4000-8000-000000000902');
insert into public.material_supplier_names(
  id,tenant_id,company_id,material_id,supplier_id,document_kind,name,created_by
) values (
  'c1210000-0000-4000-8000-000000000203',
  'c1210000-0000-4000-8000-000000000010',
  'c1210000-0000-4000-8000-000000000020',
  'c1210000-0000-4000-8000-000000000201',
  'c1210000-0000-4000-8000-000000000202',
  'quotation','Supplier steel alias','c1210000-0000-4000-8000-000000000902'
);
insert into public.material_proposals(
  id,tenant_id,company_id,project_id,needed_on,delivery_address,created_by
) values (
  'c1210000-0000-4000-8000-000000000301',
  'c1210000-0000-4000-8000-000000000010',
  'c1210000-0000-4000-8000-000000000020',
  'c1210000-0000-4000-8000-000000000101',
  '2026-10-30','Site A','c1210000-0000-4000-8000-000000000901'
);
insert into public.material_proposal_lines(
  id,tenant_id,company_id,project_id,proposal_id,material_id,quantity,created_by
) values (
  'c1210000-0000-4000-8000-000000000302',
  'c1210000-0000-4000-8000-000000000010',
  'c1210000-0000-4000-8000-000000000020',
  'c1210000-0000-4000-8000-000000000101',
  'c1210000-0000-4000-8000-000000000301',
  'c1210000-0000-4000-8000-000000000201',
  20,'c1210000-0000-4000-8000-000000000901'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1210000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_update_proposal(
    'c1210000-0000-4000-8000-000000000020',
    'c1210000-0000-4000-8000-000000000101',
    'c1210000-0000-4000-8000-000000000301',
    '{"expectedVersion":0,"neededOn":"2026-10-30","deliveryAddress":"buyer edit","lines":[{"lineId":"c1210000-0000-4000-8000-000000000302","materialId":"c1210000-0000-4000-8000-000000000201","quantity":"20.0000"}]}',
    'c1210000-0000-4000-8000-000000000601',
    'c1210000-0000-4000-8000-000000000701'
  )
$$,'P0001','PERMISSION_DENIED','buyer cannot update proposal');

select set_config('request.jwt.claims','{"sub":"c1210000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select lives_ok($$
  select public.c1_material_update_proposal(
    'c1210000-0000-4000-8000-000000000020',
    'c1210000-0000-4000-8000-000000000101',
    'c1210000-0000-4000-8000-000000000301',
    '{"expectedVersion":0,"neededOn":"2026-10-31","deliveryAddress":"owner edit","lines":[{"lineId":"c1210000-0000-4000-8000-000000000302","materialId":"c1210000-0000-4000-8000-000000000201","quantity":"20.0000"}]}',
    'c1210000-0000-4000-8000-000000000602',
    'c1210000-0000-4000-8000-000000000702'
  )
$$,'own engineer can update draft');

select is((
  select count(*) from public.material_supplier_names
  where material_id='c1210000-0000-4000-8000-000000000201'
),0::bigint,'engineer supplier alias RLS returns no rows');
select throws_ok($$
  select public.c1_material_list_supplier_names(
    'c1210000-0000-4000-8000-000000000020',
    'c1210000-0000-4000-8000-000000000201'
  )
$$,'P0001','PERMISSION_DENIED','engineer supplier alias RPC is denied');

select throws_ok($$
  select public.c1_material_read_order(
    'c1210000-0000-4000-8000-000000000020',
    'c1210000-0000-4000-8000-000000000101',
    'c1210000-0000-4000-8000-000000000999'
  )
$$,'P0001','PERMISSION_DENIED','engineer cannot read order financials');

select * from finish();
rollback;
