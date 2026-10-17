begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(20);

-- C1 rollback fixture: proposals carry no engineer or buyer invoice name. The c123
-- prefix is reused from the retired engineer invoice name suite this file replaces.

select hasnt_column('public','material_proposal_lines','engineer_proposed_invoice_name',
  'proposal lines have no engineer invoice name column');
select hasnt_column('public','material_proposal_revision_lines','engineer_proposed_invoice_name',
  'proposal revision lines have no engineer invoice name column');
select hasnt_table('public','material_proposal_invoice_name_overrides',
  'buyer invoice name override table is gone');
select hasnt_function('public','c1_material_set_proposal_invoice_name',
  'public buyer invoice name command is gone');
select hasnt_function('private','c1_material_set_proposal_invoice_name',
  'private buyer invoice name command is gone');
select hasnt_function('private','c1_material_engineer_invoice_name',
  'engineer invoice name helper is gone');
select ok(
  not has_function_privilege('authenticated','private.c1_material_proposal_json(uuid,uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','private.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)','EXECUTE'),
  'patched proposal functions stay private behind their public wrappers'
);
-- Every proposal already in the database still reads, without any name key.
select is((
  select count(*)
  from public.material_proposals as proposal
  cross join lateral jsonb_array_elements(
    private.c1_material_proposal_json(proposal.tenant_id, proposal.company_id, proposal.project_id, proposal.id)->'lines'
  ) as line(value)
  where line.value ?| array[
    'engineerProposedInvoiceName','buyerProposedInvoiceName','effectiveInvoiceDisplayName',
    'invoiceDisplayNameSource','buyerOverrideVersion','buyerInvoiceNameEditable'
  ]
), 0::bigint, 'existing proposals read without invoice name keys');

insert into auth.users(id,email) values
('c1230000-0000-4000-8000-000000000901','c123-engineer@test.invalid'),
('c1230000-0000-4000-8000-000000000902','c123-buyer@test.invalid');
insert into public.tenants(id,code,name)
values('c1230000-0000-4000-8000-000000000010','C123','C123 invoice-name removal tenant');
insert into public.companies(id,tenant_id,code,name)
values('c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000010','C123','C123 invoice-name removal company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select id,'c1230000-0000-4000-8000-000000000010',array['member']
from auth.users where id in (
  'c1230000-0000-4000-8000-000000000901',
  'c1230000-0000-4000-8000-000000000902'
);
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select id,'c1230000-0000-4000-8000-000000000010','c1230000-0000-4000-8000-000000000020',array['member'],true
from auth.users where id in (
  'c1230000-0000-4000-8000-000000000901',
  'c1230000-0000-4000-8000-000000000902'
);
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values
('c1230000-0000-4000-8000-000000000911','c1230000-0000-4000-8000-000000000010','c1230000-0000-4000-8000-000000000020','c123_engineer','C123 engineer','rollback fixture',false),
('c1230000-0000-4000-8000-000000000912','c1230000-0000-4000-8000-000000000010','c1230000-0000-4000-8000-000000000020','c123_buyer','C123 buyer','rollback fixture',false);
insert into public.role_permissions(role_id,permission_code) values
('c1230000-0000-4000-8000-000000000911','material.read'),
('c1230000-0000-4000-8000-000000000911','material.proposal.submit'),
('c1230000-0000-4000-8000-000000000912','material.read'),
('c1230000-0000-4000-8000-000000000912','material.manage'),
('c1230000-0000-4000-8000-000000000912','material.proposal.decide'),
('c1230000-0000-4000-8000-000000000912','material.order.manage');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values
('c1230000-0000-4000-8000-000000000010','c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000901','c1230000-0000-4000-8000-000000000911','c1230000-0000-4000-8000-000000000902','rollback fixture'),
('c1230000-0000-4000-8000-000000000010','c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000902','c1230000-0000-4000-8000-000000000912','c1230000-0000-4000-8000-000000000902','rollback fixture');
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000010',true,'c1230000-0000-4000-8000-000000000902');
insert into public.cost_workflow_companies(company_id,tenant_id,mode)
values('c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000010','document_backed_v1');
insert into public.projects(id,tenant_id,company_id,code,name,location_text,operational_state,origin,created_by)
values('c1230000-0000-4000-8000-000000000101','c1230000-0000-4000-8000-000000000010','c1230000-0000-4000-8000-000000000020','C123-P','C123 project','Depot','active','manual','c1230000-0000-4000-8000-000000000902');

create temporary table c123_ids(name text primary key,id uuid not null);
create temporary table c123_inputs(name text primary key,body jsonb not null);
grant select,insert on c123_ids,c123_inputs to authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1230000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into c123_ids
select 'material',(public.c1_material_create_item(
  'c1230000-0000-4000-8000-000000000020',
  '{"code":"C123-STEEL","name":"Steel","specification":"D10","unit":"bag"}',
  'c1230000-0000-4000-8000-000000000601',
  'c1230000-0000-4000-8000-000000000701'
)->>'resourceId')::uuid;

select set_config('request.jwt.claims','{"sub":"c1230000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into c123_inputs
select 'create',jsonb_build_object(
  'neededOn','2026-10-30','deliveryAddress','C123 site',
  'lines',jsonb_build_array(
    jsonb_build_object('lineId','c1230000-0000-4000-8000-000000000301','materialId',(select id from c123_ids where name='material'),'quantity','8.0000','notes','C123 note'),
    jsonb_build_object('lineId','c1230000-0000-4000-8000-000000000302','materialId',(select id from c123_ids where name='material'),'quantity','2.0000')
  )
);
insert into c123_inputs
select 'update',jsonb_build_object(
  'expectedVersion',0,'neededOn','2026-10-30','deliveryAddress','C123 site',
  'lines',jsonb_build_array(
    jsonb_build_object('lineId','c1230000-0000-4000-8000-000000000301','materialId',(select id from c123_ids where name='material'),'quantity','8.0000'),
    jsonb_build_object('lineId','c1230000-0000-4000-8000-000000000302','materialId',(select id from c123_ids where name='material'),'quantity','3.0000')
  )
);

select throws_ok(
  format($format$
    select public.c1_material_create_proposal(
      'c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',
      %L::jsonb,
      'c1230000-0000-4000-8000-000000000602','c1230000-0000-4000-8000-000000000702'
    )
  $format$,jsonb_set((select body from c123_inputs where name='create'),'{lines,1,proposedInvoiceName}','"Cut Steel"'::jsonb)),
  'P0001','INPUT_INVALID','create rejects a line with proposedInvoiceName'
);
insert into c123_ids
select 'proposal',(public.c1_material_create_proposal(
  'c1230000-0000-4000-8000-000000000020',
  'c1230000-0000-4000-8000-000000000101',
  (select body from c123_inputs where name='create'),
  'c1230000-0000-4000-8000-000000000603',
  'c1230000-0000-4000-8000-000000000703'
)->>'resourceId')::uuid;
select is((
  public.c1_material_read_proposal('c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',(select id from c123_ids where name='proposal'))
  ->>'reviewState'
),'draft','create without invoice name succeeds');
select ok((
  with proposal as (
    select public.c1_material_read_proposal('c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',(select id from c123_ids where name='proposal')) as body
  )
  select jsonb_array_length(proposal.body->'lines') = 2
    and not exists (
      select 1 from jsonb_array_elements(proposal.body->'lines') as line(value)
      where line.value ?| array[
        'engineerProposedInvoiceName','buyerProposedInvoiceName','effectiveInvoiceDisplayName',
        'invoiceDisplayNameSource','buyerOverrideVersion','buyerInvoiceNameEditable'
      ]
    )
  from proposal
),'draft proposal JSON has no invoice name keys');
select ok((
  with proposal as (
    select public.c1_material_read_proposal('c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',(select id from c123_ids where name='proposal')) as body
  )
  select proposal.body ? 'currentRevisionId'
    and proposal.body ? 'contractStatus'
    and proposal.body->'contractStatus' = '[]'::jsonb
    and proposal.body ? 'orderProgress'
  from proposal
),'draft proposal JSON keeps currentRevisionId, contractStatus and orderProgress');
select is((
  public.c1_material_read_proposal('c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',(select id from c123_ids where name='proposal'))
  ->'lines'->0->>'notes'
),'C123 note','create still stores line notes');

select throws_ok(
  format($format$
    select public.c1_material_update_proposal(
      'c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',
      %L,%L::jsonb,
      'c1230000-0000-4000-8000-000000000604','c1230000-0000-4000-8000-000000000704'
    )
  $format$,(select id from c123_ids where name='proposal'),
  jsonb_set((select body from c123_inputs where name='update'),'{lines,0,proposedInvoiceName}','null'::jsonb)),
  'P0001','INPUT_INVALID','update rejects a line with proposedInvoiceName'
);
select is((
  public.c1_material_update_proposal(
    'c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',
    (select id from c123_ids where name='proposal'),
    (select body from c123_inputs where name='update'),
    'c1230000-0000-4000-8000-000000000605','c1230000-0000-4000-8000-000000000705'
  )->>'version'
),'1','update without invoice name succeeds');
select ok((
  with proposal as (
    select public.c1_material_read_proposal('c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',(select id from c123_ids where name='proposal')) as body
  )
  select proposal.body->'lines'->0->>'notes' = 'C123 note'
    and proposal.body->'lines'->1->>'quantity' = '3.0000'
  from proposal
),'update keeps omitted line notes and applies the new quantity');

select lives_ok(
  format($format$
    select public.c1_material_submit_proposal(
      'c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',
      %L,'{"expectedVersion":1}','c1230000-0000-4000-8000-000000000606','c1230000-0000-4000-8000-000000000706'
    )
  $format$,(select id from c123_ids where name='proposal')),
  'submit without invoice name succeeds'
);
select ok((
  with proposal as (
    select public.c1_material_read_proposal('c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',(select id from c123_ids where name='proposal')) as body
  )
  select proposal.body->>'reviewState' = 'submitted'
    and proposal.body->>'currentRevisionId' is not null
    and proposal.body->'contractStatus' = '[]'::jsonb
    and jsonb_array_length(proposal.body->'lines') = 2
    and not exists (
      select 1 from jsonb_array_elements(proposal.body->'lines') as line(value)
      where line.value ?| array[
        'engineerProposedInvoiceName','buyerProposedInvoiceName','effectiveInvoiceDisplayName',
        'invoiceDisplayNameSource','buyerOverrideVersion','buyerInvoiceNameEditable'
      ]
    )
  from proposal
),'submitted proposal JSON has no invoice name keys but keeps currentRevisionId and contractStatus');
select ok((
  with proposal as (
    select public.c1_material_read_proposal('c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',(select id from c123_ids where name='proposal')) as body
  )
  select proposal.body->'lines'->0->>'notes' = 'C123 note'
    and proposal.body->'lines'->0->>'materialName' = 'Steel'
    and proposal.body->'lines'->1->>'quantity' = '3.0000'
  from proposal
),'submitted snapshot keeps notes, material name and quantity');

set local role none;
select is((
  select count(*)
  from public.material_proposal_revision_lines as snapshot
  join public.material_proposals as proposal
    on proposal.id = snapshot.proposal_id
   and proposal.current_revision_id = snapshot.revision_id
  where snapshot.proposal_id = (select id from c123_ids where name='proposal')
    and snapshot.notes is not distinct from case
      when snapshot.proposal_line_id = 'c1230000-0000-4000-8000-000000000301' then 'C123 note'
    end
), 2::bigint, 'submit snapshots both lines with their notes');

select * from finish(true);
rollback;
