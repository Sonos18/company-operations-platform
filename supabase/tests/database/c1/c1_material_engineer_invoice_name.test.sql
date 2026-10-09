begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(10);

insert into auth.users(id,email) values
('c1230000-0000-4000-8000-000000000901','c123-engineer@test.invalid'),
('c1230000-0000-4000-8000-000000000902','c123-buyer@test.invalid'),
('c1230000-0000-4000-8000-000000000903','c123-peer@test.invalid');
insert into public.tenants(id,code,name)
values('c1230000-0000-4000-8000-000000000010','C123','C123 invoice-name tenant');
insert into public.companies(id,tenant_id,code,name)
values('c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000010','C123','C123 invoice-name company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select id,'c1230000-0000-4000-8000-000000000010',array['member']
from auth.users where id in (
  'c1230000-0000-4000-8000-000000000901',
  'c1230000-0000-4000-8000-000000000902',
  'c1230000-0000-4000-8000-000000000903'
);
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select id,'c1230000-0000-4000-8000-000000000010','c1230000-0000-4000-8000-000000000020',array['member'],true
from auth.users where id in (
  'c1230000-0000-4000-8000-000000000901',
  'c1230000-0000-4000-8000-000000000902',
  'c1230000-0000-4000-8000-000000000903'
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
('c1230000-0000-4000-8000-000000000010','c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000902','c1230000-0000-4000-8000-000000000912','c1230000-0000-4000-8000-000000000902','rollback fixture'),
('c1230000-0000-4000-8000-000000000010','c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000903','c1230000-0000-4000-8000-000000000911','c1230000-0000-4000-8000-000000000902','rollback fixture');
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
    jsonb_build_object('lineId','c1230000-0000-4000-8000-000000000301','materialId',(select id from c123_ids where name='material'),'quantity','8.0000','proposedInvoiceName','   '),
    jsonb_build_object('lineId','c1230000-0000-4000-8000-000000000302','materialId',(select id from c123_ids where name='material'),'quantity','2.0000','proposedInvoiceName','  Cut Steel  ')
  )
);
insert into c123_ids
select 'proposal',(public.c1_material_create_proposal(
  'c1230000-0000-4000-8000-000000000020',
  'c1230000-0000-4000-8000-000000000101',
  (select body from c123_inputs where name='create'),
  'c1230000-0000-4000-8000-000000000602',
  'c1230000-0000-4000-8000-000000000702'
)->>'resourceId')::uuid;
select is((
  public.c1_material_read_proposal('c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',(select id from c123_ids where name='proposal'))
  ->'lines'->0->>'effectiveInvoiceDisplayName'
),'Steel','blank engineer suggestion falls back to canonical name');
select is((
  public.c1_material_read_proposal('c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',(select id from c123_ids where name='proposal'))
  ->'lines'->1->>'engineerProposedInvoiceName'
),'Cut Steel','explicit engineer suggestion is trimmed and returned');
select is((
  public.c1_material_read_proposal('c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',(select id from c123_ids where name='proposal'))
  ->'lines'->1->>'buyerOverrideVersion'
),'0','buyer override stays absent before Task 3');

insert into c123_inputs
select 'update',jsonb_build_object(
  'expectedVersion',0,'neededOn','2026-10-30','deliveryAddress','C123 site',
  'lines',jsonb_build_array(
    jsonb_build_object('lineId','c1230000-0000-4000-8000-000000000301','materialId',(select id from c123_ids where name='material'),'quantity','8.0000','proposedInvoiceName',''),
    jsonb_build_object('lineId','c1230000-0000-4000-8000-000000000302','materialId',(select id from c123_ids where name='material'),'quantity','2.0000','proposedInvoiceName','Cut Steel')
  )
);
select throws_ok(
  format($format$
    select public.c1_material_update_proposal(
      'c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',
      '%s',
      '%s',
      'c1230000-0000-4000-8000-000000000603','c1230000-0000-4000-8000-000000000703'
    )
  $format$,(select id from c123_ids where name='proposal'),
  replace((select body from c123_inputs where name='update')::text,'Cut Steel',repeat('x',201))),
  'P0001','INPUT_INVALID','overlength engineer suggestion is rejected'
);
select set_config('request.jwt.claims','{"sub":"c1230000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok(
  format($format$
    select public.c1_material_update_proposal(
      'c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',
      '%s','%s','c1230000-0000-4000-8000-000000000604','c1230000-0000-4000-8000-000000000704'
    )
  $format$,(select id from c123_ids where name='proposal'),(select body from c123_inputs where name='update')),
  'P0001','PERMISSION_DENIED','peer engineer cannot change engineer invoice suggestion'
);
select set_config('request.jwt.claims','{"sub":"c1230000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select lives_ok(
  format($format$
    select public.c1_material_submit_proposal(
      'c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',
      '%s','{"expectedVersion":0}','c1230000-0000-4000-8000-000000000605','c1230000-0000-4000-8000-000000000705'
    )
  $format$,(select id from c123_ids where name='proposal')),
  'owner submits engineer suggestions'
);
set local role none;
update public.material_items set name='Renamed Steel' where id=(select id from c123_ids where name='material');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1230000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is((
  public.c1_material_read_proposal('c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',(select id from c123_ids where name='proposal'))
  ->'lines'->0->>'effectiveInvoiceDisplayName'
),'Steel','submitted fallback remains frozen after catalog rename');

select set_config('request.jwt.claims','{"sub":"c1230000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select lives_ok(
  format($format$
    select public.c1_material_decide_proposal(
      'c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',
      '%s','{"expectedVersion":1,"decision":"return","reason":"revise"}',
      'c1230000-0000-4000-8000-000000000606','c1230000-0000-4000-8000-000000000706'
    )
  $format$,(select id from c123_ids where name='proposal')),
  'buyer returns submitted proposal'
);
select set_config('request.jwt.claims','{"sub":"c1230000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is((
  public.c1_material_update_proposal(
    'c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',
    (select id from c123_ids where name='proposal'),
    jsonb_set(
      jsonb_set((select body from c123_inputs where name='update'),'{expectedVersion}','2'::jsonb),
      '{lines,0,proposedInvoiceName}','"Resubmitted Steel"'::jsonb
    ),
    'c1230000-0000-4000-8000-000000000607','c1230000-0000-4000-8000-000000000707'
  )->>'version'
),'3','returned resubmission accepts the engineer suggestion');
with submitted as (
  select public.c1_material_submit_proposal(
    'c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',
    (select id from c123_ids where name='proposal'),'{"expectedVersion":3}',
    'c1230000-0000-4000-8000-000000000608','c1230000-0000-4000-8000-000000000708'
  ) as result
)
select is((
  select public.c1_material_read_proposal(
    'c1230000-0000-4000-8000-000000000020','c1230000-0000-4000-8000-000000000101',
    (select id from c123_ids where name='proposal')
  )->'lines'->0->>'effectiveInvoiceDisplayName'
  from submitted
),'Resubmitted Steel','returned resubmission snapshots the new engineer suggestion');

select * from finish(true);
rollback;
