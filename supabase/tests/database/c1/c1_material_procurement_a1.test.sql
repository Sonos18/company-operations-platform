begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(33);

-- A1-only rollback fixture; c122 IDs do not overlap the broader material suites.
insert into auth.users(id,email) values
('c1220000-0000-4000-8000-000000000901','a1-engineer@test.invalid'),
('c1220000-0000-4000-8000-000000000902','a1-buyer@test.invalid'),
('c1220000-0000-4000-8000-000000000903','a1-peer-engineer@test.invalid');
insert into public.tenants(id,code,name)
values('c1220000-0000-4000-8000-000000000010','C1A1','A1 material test tenant');
insert into public.companies(id,tenant_id,code,name)
values('c1220000-0000-4000-8000-000000000020','c1220000-0000-4000-8000-000000000010','C1A1','A1 material test company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select id,'c1220000-0000-4000-8000-000000000010',array['member']
from auth.users where id in (
  'c1220000-0000-4000-8000-000000000901',
  'c1220000-0000-4000-8000-000000000902',
  'c1220000-0000-4000-8000-000000000903'
);
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select id,'c1220000-0000-4000-8000-000000000010','c1220000-0000-4000-8000-000000000020',array['member'],true
from auth.users where id in (
  'c1220000-0000-4000-8000-000000000901',
  'c1220000-0000-4000-8000-000000000902',
  'c1220000-0000-4000-8000-000000000903'
);
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values
('c1220000-0000-4000-8000-000000000911','c1220000-0000-4000-8000-000000000010','c1220000-0000-4000-8000-000000000020','a1_engineer','A1 engineer','rollback fixture',false),
('c1220000-0000-4000-8000-000000000912','c1220000-0000-4000-8000-000000000010','c1220000-0000-4000-8000-000000000020','a1_buyer','A1 buyer','rollback fixture',false);
insert into public.role_permissions(role_id,permission_code) values
('c1220000-0000-4000-8000-000000000911','material.read'),
('c1220000-0000-4000-8000-000000000911','material.proposal.submit'),
('c1220000-0000-4000-8000-000000000912','material.read'),
('c1220000-0000-4000-8000-000000000912','material.manage'),
('c1220000-0000-4000-8000-000000000912','material.proposal.decide'),
('c1220000-0000-4000-8000-000000000912','material.order.manage');
insert into public.company_role_assignments(
  tenant_id,company_id,user_id,role_id,granted_by,grant_reason
) values
('c1220000-0000-4000-8000-000000000010','c1220000-0000-4000-8000-000000000020','c1220000-0000-4000-8000-000000000901','c1220000-0000-4000-8000-000000000911','c1220000-0000-4000-8000-000000000902','rollback fixture'),
('c1220000-0000-4000-8000-000000000010','c1220000-0000-4000-8000-000000000020','c1220000-0000-4000-8000-000000000902','c1220000-0000-4000-8000-000000000912','c1220000-0000-4000-8000-000000000902','rollback fixture'),
('c1220000-0000-4000-8000-000000000010','c1220000-0000-4000-8000-000000000020','c1220000-0000-4000-8000-000000000903','c1220000-0000-4000-8000-000000000911','c1220000-0000-4000-8000-000000000902','rollback fixture');
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1220000-0000-4000-8000-000000000020','c1220000-0000-4000-8000-000000000010',true,'c1220000-0000-4000-8000-000000000902');
insert into public.cost_workflow_companies(company_id,tenant_id,mode)
values('c1220000-0000-4000-8000-000000000020','c1220000-0000-4000-8000-000000000010','document_backed_v1');
insert into public.projects(id,tenant_id,company_id,code,name,location_text,operational_state,origin,created_by)
values('c1220000-0000-4000-8000-000000000101','c1220000-0000-4000-8000-000000000010','c1220000-0000-4000-8000-000000000020','A1-P','A1 project','Depot A','active','manual','c1220000-0000-4000-8000-000000000902');

create temporary table a1_ids(name text primary key, id uuid not null);
create temporary table a1_inputs(name text primary key, body jsonb not null);
grant select,insert on a1_ids,a1_inputs to authenticated;
grant select on a1_ids to service_role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1220000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select is(
  public.c1_material_list_projects('c1220000-0000-4000-8000-000000000020')->0->>'locationText',
  'Depot A','project list supplies default delivery address'
);
insert into a1_inputs values
('material','{"code":"A1-STEEL","name":"Steel","specification":"D10","unit":"bag"}');
insert into a1_ids
select 'material',(public.c1_material_create_item(
  'c1220000-0000-4000-8000-000000000020',
  (select body from a1_inputs where name='material'),
  'c1220000-0000-4000-8000-000000000601',
  'c1220000-0000-4000-8000-000000000701'
)->>'resourceId')::uuid;
select is(
  public.c1_material_list_items('c1220000-0000-4000-8000-000000000020')->0->>'code',
  'A1-STEEL','buyer creates readable canonical material'
);

select set_config('request.jwt.claims','{"sub":"c1220000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_create_item(
    'c1220000-0000-4000-8000-000000000020',
    (select body from a1_inputs where name='material'),
    'c1220000-0000-4000-8000-000000000602',
    'c1220000-0000-4000-8000-000000000702'
  )
$$,'P0001','PERMISSION_DENIED','engineer cannot manage material catalog');
select is(
  public.c1_material_list_items('c1220000-0000-4000-8000-000000000020')->0->>'code',
  'A1-STEEL','engineer reads material catalog'
);
insert into a1_inputs
select 'proposal',jsonb_build_object(
  'neededOn','2026-10-30','deliveryAddress','Site override',
  'lines',jsonb_build_array(jsonb_build_object(
    'lineId','c1220000-0000-4000-8000-000000000301',
    'materialId',(select id from a1_ids where name='material'),
    'quantity','8.0000'
  ))
);
insert into a1_ids
select 'proposal',(public.c1_material_create_proposal(
  'c1220000-0000-4000-8000-000000000020',
  'c1220000-0000-4000-8000-000000000101',
  (select body from a1_inputs where name='proposal'),
  'c1220000-0000-4000-8000-000000000603',
  'c1220000-0000-4000-8000-000000000703'
)->>'resourceId')::uuid;
select is((
  public.c1_material_read_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal')
  )->>'reviewState'
),'draft','engineer creates owned draft');
select is((
  public.c1_material_read_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal')
  )->>'deliveryAddress'
),'Site override','draft read returns edited delivery address');
-- Verify the stored project value as fixture owner; engineer reads projects through the scoped RPC.
set local role none;
select is(
  (select location_text from public.projects where id='c1220000-0000-4000-8000-000000000101'),
  'Depot A','proposal address does not change project location'
);
set local role authenticated;
select is((
  public.c1_material_read_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal')
  )->'lines'->0->>'quantity'
),'8.0000','draft read includes material line quantity');
select is(
  (public.c1_material_create_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select body from a1_inputs where name='proposal'),
    'c1220000-0000-4000-8000-000000000603',
    'c1220000-0000-4000-8000-000000000703'
  )->>'resourceId')::uuid,
  (select id from a1_ids where name='proposal'),
  'exact create replay returns same proposal'
);
select is((public.c1_material_create_proposal(
  'c1220000-0000-4000-8000-000000000020',
  'c1220000-0000-4000-8000-000000000101',
  (select body from a1_inputs where name='proposal'),
  'c1220000-0000-4000-8000-000000000603',
  'c1220000-0000-4000-8000-000000000703'
)->>'replayed'),'true','exact create replay is marked replayed');
select throws_ok($$
  select public.c1_material_create_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select body from a1_inputs where name='proposal') || '{"deliveryAddress":"Changed"}'::jsonb,
    'c1220000-0000-4000-8000-000000000603',
    'c1220000-0000-4000-8000-000000000703'
  )
$$,'P0001','IDEMPOTENCY_CONFLICT','changed create payload conflicts on reused key');

insert into a1_inputs
select 'update',jsonb_build_object(
  'expectedVersion',0,'neededOn','2026-10-31','deliveryAddress','Site revised',
  'lines',jsonb_build_array(jsonb_build_object(
    'lineId','c1220000-0000-4000-8000-000000000301',
    'materialId',(select id from a1_ids where name='material'),
    'quantity','9.0000'
  ))
);
select set_config('request.jwt.claims','{"sub":"c1220000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_update_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal'),
    (select body from a1_inputs where name='update'),
    'c1220000-0000-4000-8000-000000000604',
    'c1220000-0000-4000-8000-000000000704'
  )
$$,'P0001','PERMISSION_DENIED','buyer cannot edit engineer proposal');
select set_config('request.jwt.claims','{"sub":"c1220000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_update_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal'),
    (select body from a1_inputs where name='update'),
    'c1220000-0000-4000-8000-000000000605',
    'c1220000-0000-4000-8000-000000000705'
  )
$$,'P0001','PERMISSION_DENIED','peer engineer cannot edit another author proposal');
select is(public.c1_material_list_proposals(
  'c1220000-0000-4000-8000-000000000020',
  'c1220000-0000-4000-8000-000000000101'
),'[]'::jsonb,'peer engineer cannot list another author proposal');
select throws_ok($$
  select public.c1_material_read_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal')
  )
$$,'P0001','PERMISSION_DENIED','peer engineer cannot read another author proposal');
select set_config('request.jwt.claims','{"sub":"c1220000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select lives_ok($$
  select public.c1_material_update_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal'),
    (select body from a1_inputs where name='update'),
    'c1220000-0000-4000-8000-000000000606',
    'c1220000-0000-4000-8000-000000000706'
  )
$$,'owner updates draft');
select is((
  public.c1_material_read_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal')
  )->>'deliveryAddress'
),'Site revised','owner update is readable');
select is((
  public.c1_material_read_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal')
  )->>'version'
),'1','owner update increments version once');
select is((
  public.c1_material_update_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal'),
    (select body from a1_inputs where name='update'),
    'c1220000-0000-4000-8000-000000000606',
    'c1220000-0000-4000-8000-000000000706'
  )->>'version'
),'1','exact update replay retains version');
select is((public.c1_material_update_proposal(
  'c1220000-0000-4000-8000-000000000020',
  'c1220000-0000-4000-8000-000000000101',
  (select id from a1_ids where name='proposal'),
  (select body from a1_inputs where name='update'),
  'c1220000-0000-4000-8000-000000000606',
  'c1220000-0000-4000-8000-000000000706'
)->>'replayed'),'true','exact update replay is marked replayed');
select throws_ok($$
  select public.c1_material_update_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal'),
    (select body from a1_inputs where name='update') || '{"deliveryAddress":"Changed again"}'::jsonb,
    'c1220000-0000-4000-8000-000000000606',
    'c1220000-0000-4000-8000-000000000706'
  )
$$,'P0001','IDEMPOTENCY_CONFLICT','changed update payload conflicts on reused key');

select lives_ok($$
  select public.c1_material_submit_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal'),
    '{"expectedVersion":1}',
    'c1220000-0000-4000-8000-000000000607',
    'c1220000-0000-4000-8000-000000000707'
  )
$$,'owner submits updated proposal');
select is((
  public.c1_material_read_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal')
  )->>'reviewState'
),'submitted','submitted state is readable');
select is((
  public.c1_material_read_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal')
  )->>'version'
),'2','submit increments version once');
select is((
  public.c1_material_read_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal')
  )->>'deliveryAddress'
),'Site revised','submitted read retains revised address');
select is((
  public.c1_material_read_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal')
  )->'lines'->0->>'quantity'
),'9.0000','submitted read uses revision quantity');
select is((
  public.c1_material_submit_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal'),
    '{"expectedVersion":1}',
    'c1220000-0000-4000-8000-000000000607',
    'c1220000-0000-4000-8000-000000000707'
  )->>'version'
),'2','exact submit replay retains version');
select is((public.c1_material_submit_proposal(
  'c1220000-0000-4000-8000-000000000020',
  'c1220000-0000-4000-8000-000000000101',
  (select id from a1_ids where name='proposal'),
  '{"expectedVersion":1}',
  'c1220000-0000-4000-8000-000000000607',
  'c1220000-0000-4000-8000-000000000707'
)->>'replayed'),'true','exact submit replay is marked replayed');
select throws_ok($$
  select public.c1_material_submit_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal'),
    '{"expectedVersion":2}',
    'c1220000-0000-4000-8000-000000000607',
    'c1220000-0000-4000-8000-000000000707'
  )
$$,'P0001','IDEMPOTENCY_CONFLICT','changed submit payload conflicts on reused key');

select set_config('request.jwt.claims','{"sub":"c1220000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select lives_ok($$
  select public.c1_material_decide_proposal(
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='proposal'),
    '{"expectedVersion":2,"decision":"approve"}',
    'c1220000-0000-4000-8000-000000000608',
    'c1220000-0000-4000-8000-000000000708'
  )
$$,'buyer approves submitted proposal for material evidence');
insert into a1_ids
select 'evidence',(public.c1_material_create_evidence_intent(
  'c1220000-0000-4000-8000-000000000020',
  'c1220000-0000-4000-8000-000000000101',
  jsonb_build_object(
    'originalFilename','quotation.pdf','mimeType','application/pdf',
    'sizeBytes',8,'sha256',repeat('c',64),'evidenceRole','unsigned_quotation',
    'target',jsonb_build_object(
      'kind','material_proposal',
      'proposalId',(select id from a1_ids where name='proposal'),
      'revisionId',(public.c1_material_read_proposal(
        'c1220000-0000-4000-8000-000000000020',
        'c1220000-0000-4000-8000-000000000101',
        (select id from a1_ids where name='proposal')
      )->>'approvedRevisionId')::uuid
    )
  ),
  'c1220000-0000-4000-8000-000000000609',
  'c1220000-0000-4000-8000-000000000709'
)->>'evidenceFileId')::uuid;
set local role none;
select is(
  (select status::text from public.cost_evidence_files where id=(select id from a1_ids where name='evidence')),
  'pending_upload','document-backed material intent creates a pending evidence file'
);
set local role service_role;
select set_config('request.jwt.claims','{"sub":"c1220000-0000-4000-8000-000000000902","role":"service_role"}',true);
select is(
  (public.c1_finalize_material_evidence_server(
    'c1220000-0000-4000-8000-000000000902',
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    (select id from a1_ids where name='evidence'),
    jsonb_build_object('expectedVersion',0,'mimeType','application/pdf','sizeBytes',8,'sha256',repeat('c',64)),
    'c1220000-0000-4000-8000-000000000610',
    'c1220000-0000-4000-8000-000000000710'
  )->>'status'),
  'finalized','document-backed material evidence finalizes through guarded transition'
);
set local role none;
select throws_ok($$
  insert into public.cost_evidence_files(
    id,tenant_id,company_id,project_id,object_path,original_filename,
    declared_mime_type,declared_size_bytes,declared_sha256,intent_expires_at,
    created_by,workflow_origin
  ) values (
    'c1220000-0000-4000-8000-000000000599',
    'c1220000-0000-4000-8000-000000000010',
    'c1220000-0000-4000-8000-000000000020',
    'c1220000-0000-4000-8000-000000000101',
    'c1220000-0000-4000-8000-000000000010/c1220000-0000-4000-8000-000000000020/c1220000-0000-4000-8000-000000000101/c1220000-0000-4000-8000-000000000599',
    'legacy.pdf','application/pdf',8,repeat('9',64),now()+interval '15 minutes',
    'c1220000-0000-4000-8000-000000000902',false
  )
$$,'P0001','LEGACY_WORKFLOW_WRITE_DISABLED','generic legacy file insert remains denied in document-backed mode');

select 'A1_MATERIAL_PGTAP_COMPLETE' as result, (select count(*) from finish(true)) as finish_count;
rollback;
