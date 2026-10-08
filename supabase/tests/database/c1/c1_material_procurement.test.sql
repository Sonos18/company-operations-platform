begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(60);

insert into auth.users(id,email) values
('c1200000-0000-4000-8000-000000000901','material-engineer@test.invalid'),
('c1200000-0000-4000-8000-000000000902','material-buyer@test.invalid'),
('c1200000-0000-4000-8000-000000000903','material-accountant@test.invalid'),
('c1200000-0000-4000-8000-000000000904','material-director@test.invalid');

insert into public.tenants(id,code,name)
values('c1200000-0000-4000-8000-000000000010','C1M','Material test tenant');
insert into public.companies(id,tenant_id,code,name)
values('c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000010','C1M','Material test company');

insert into public.tenant_memberships(user_id,tenant_id,roles)
select v.user_id,'c1200000-0000-4000-8000-000000000010',array['member']
from (values
 ('c1200000-0000-4000-8000-000000000901'::uuid),
 ('c1200000-0000-4000-8000-000000000902'::uuid),
 ('c1200000-0000-4000-8000-000000000903'::uuid),
 ('c1200000-0000-4000-8000-000000000904'::uuid)
) v(user_id);
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select v.user_id,'c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020',array['member'],true
from (values
 ('c1200000-0000-4000-8000-000000000901'::uuid),
 ('c1200000-0000-4000-8000-000000000902'::uuid),
 ('c1200000-0000-4000-8000-000000000903'::uuid),
 ('c1200000-0000-4000-8000-000000000904'::uuid)
) v(user_id);

insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values
('c1200000-0000-4000-8000-000000000911','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','material_engineer','Material engineer','test',false),
('c1200000-0000-4000-8000-000000000912','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','material_buyer','Material buyer','test',false),
('c1200000-0000-4000-8000-000000000913','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','material_accountant','Material accountant','test',false),
('c1200000-0000-4000-8000-000000000914','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','material_director','Material director','test',false);

insert into public.role_permissions(role_id,permission_code) values
('c1200000-0000-4000-8000-000000000911','material.read'),
('c1200000-0000-4000-8000-000000000911','material.proposal.submit'),
('c1200000-0000-4000-8000-000000000912','material.read'),
('c1200000-0000-4000-8000-000000000912','material.manage'),
('c1200000-0000-4000-8000-000000000912','material.proposal.decide'),
('c1200000-0000-4000-8000-000000000912','material.order.manage'),
('c1200000-0000-4000-8000-000000000912','material.supplier.record'),
('c1200000-0000-4000-8000-000000000913','material.read'),
('c1200000-0000-4000-8000-000000000913','material.contract.record'),
('c1200000-0000-4000-8000-000000000914','material.read'),
('c1200000-0000-4000-8000-000000000914','cost.notification.read');

insert into public.company_role_assignments(
  tenant_id,company_id,user_id,role_id,granted_by,grant_reason
) values
('c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000901','c1200000-0000-4000-8000-000000000911','c1200000-0000-4000-8000-000000000904','test'),
('c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000902','c1200000-0000-4000-8000-000000000912','c1200000-0000-4000-8000-000000000904','test'),
('c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000903','c1200000-0000-4000-8000-000000000913','c1200000-0000-4000-8000-000000000904','test'),
('c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000904','c1200000-0000-4000-8000-000000000914','c1200000-0000-4000-8000-000000000904','test');

insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000010',true,'c1200000-0000-4000-8000-000000000904');
insert into public.cost_workflow_companies(company_id,tenant_id,mode,notification_recipient_id)
values('c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000010','document_backed_v1','c1200000-0000-4000-8000-000000000904');
insert into public.projects(id,tenant_id,company_id,code,name,location_text,operational_state,origin,created_by)
values('c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','MAT-P','Material project','Site A','active','manual','c1200000-0000-4000-8000-000000000904');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c1200000-0000-4000-8000-000000000201','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','SUP-A','Supplier A','organization','c1200000-0000-4000-8000-000000000902');

create temporary table material_test_ids(name text primary key,value uuid,body jsonb);
grant select,insert,update on material_test_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into material_test_ids(name,value,body)
select 'material',(result->>'resourceId')::uuid,result
from (select public.c1_material_create_item(
  'c1200000-0000-4000-8000-000000000020',
  '{"code":"MAT-001","name":"Steel","specification":"D10","unit":"bag"}',
  'c1200000-0000-4000-8000-000000000601',
  'c1200000-0000-4000-8000-000000000701'
) result) q;
select ok((select value is not null from material_test_ids where name='material'),'material master command creates canonical item');

select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000901","role":"authenticated"}',true);
insert into material_test_ids(name,value,body)
select 'proposal1',(result->>'resourceId')::uuid,result
from (select public.c1_material_create_proposal(
  'c1200000-0000-4000-8000-000000000020',
  'c1200000-0000-4000-8000-000000000101',
  jsonb_build_object(
    'neededOn','2026-10-30','deliveryAddress','Site A','notes','morning',
    'lines',jsonb_build_array(jsonb_build_object(
      'lineId','c1200000-0000-4000-8000-000000000301',
      'materialId',(select value from material_test_ids where name='material'),
      'quantity','20.0000'
    ))
  ),
  'c1200000-0000-4000-8000-000000000602',
  'c1200000-0000-4000-8000-000000000702'
) result) q;
select ok((select body->>'reviewState'='draft' from material_test_ids where name='proposal1'),'engineer creates owned draft');
select is((
  public.c1_material_read_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='proposal1')
  )->>'returnReason'
),null::text,'draft proposal returnReason is null');

select throws_ok($$
  select public.c1_material_update_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='proposal1'),
    jsonb_build_object(
      'expectedVersion',99,'neededOn','2026-10-30','deliveryAddress','Site A',
      'lines',jsonb_build_array(jsonb_build_object(
        'lineId','c1200000-0000-4000-8000-000000000301',
        'materialId',(select value from material_test_ids where name='material'),
        'quantity','20.0000'
      ))
    ),
    'c1200000-0000-4000-8000-000000000603',
    'c1200000-0000-4000-8000-000000000703'
  )
$$,'P0001','VERSION_CONFLICT','stale revision -> VERSION_CONFLICT');

select lives_ok($$
  select public.c1_material_submit_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='proposal1'),
    '{"expectedVersion":0}',
    'c1200000-0000-4000-8000-000000000604',
    'c1200000-0000-4000-8000-000000000704'
  )
$$,'engineer submits immutable revision');
select is((
  public.c1_material_read_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='proposal1')
  )->>'returnReason'
),null::text,'submitted proposal returnReason is null');

select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select lives_ok($$
  select public.c1_material_decide_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='proposal1'),
    '{"expectedVersion":1,"decision":"approve"}',
    'c1200000-0000-4000-8000-000000000605',
    'c1200000-0000-4000-8000-000000000705'
  )
$$,'buyer approves without editing proposal');
select is((
  public.c1_material_read_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='proposal1')
  )->>'returnReason'
),null::text,'approved proposal returnReason is null');

select throws_ok($$
  select public.c1_material_create_evidence_intent(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    jsonb_build_object(
      'originalFilename','signed.pdf','mimeType','application/pdf','sizeBytes',8,'sha256',repeat('a',64),
      'evidenceRole','signed_contract',
      'target',jsonb_build_object(
        'kind','material_proposal','proposalId',(select value from material_test_ids where name='proposal1'),
        'revisionId',(select approved_revision_id from public.material_proposals where id=(select value from material_test_ids where name='proposal1'))
      )
    ),
    'c1200000-0000-4000-8000-000000000631',
    'c1200000-0000-4000-8000-000000000731'
  )
$$,'P0001','INPUT_INVALID','material evidence role must match proposal target');
select throws_ok($$
  select public.c1_material_create_evidence_intent(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    jsonb_build_object(
      'originalFilename','proof.png','mimeType','image/png','sizeBytes',8,'sha256',repeat('b',64),
      'evidenceRole','unsigned_quotation',
      'target',jsonb_build_object(
        'kind','material_proposal','proposalId',(select value from material_test_ids where name='proposal1'),
        'revisionId',(select approved_revision_id from public.material_proposals where id=(select value from material_test_ids where name='proposal1'))
      )
    ),
    'c1200000-0000-4000-8000-000000000632',
    'c1200000-0000-4000-8000-000000000732'
  )
$$,'P0001','FILE_TYPE_UNSUPPORTED','material evidence accepts PDF only');
insert into material_test_ids(name,value,body)
select 'pendingEvidence',(result->>'evidenceFileId')::uuid,result
from (select public.c1_material_create_evidence_intent(
  'c1200000-0000-4000-8000-000000000020',
  'c1200000-0000-4000-8000-000000000101',
  jsonb_build_object(
    'originalFilename','pending.pdf','mimeType','application/pdf','sizeBytes',8,'sha256',repeat('c',64),
    'evidenceRole','unsigned_quotation',
    'target',jsonb_build_object(
      'kind','material_proposal','proposalId',(select value from material_test_ids where name='proposal1'),
      'revisionId',(select approved_revision_id from public.material_proposals where id=(select value from material_test_ids where name='proposal1'))
    )
  ),
  'c1200000-0000-4000-8000-000000000633',
  'c1200000-0000-4000-8000-000000000733'
) result) q;
select ok((select value is not null from material_test_ids where name='pendingEvidence'),'buyer creates proposal-scoped unsigned PDF intent');
select throws_ok($$
  select public.c1_material_create_order(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='proposal1'),
    jsonb_build_object(
      'approvedRevisionId',(select approved_revision_id from public.material_proposals where id=(select value from material_test_ids where name='proposal1')),
      'supplierId','c1200000-0000-4000-8000-000000000201',
      'currencyCode','VND',
      'unsignedQuotationEvidenceFileId',(select value from material_test_ids where name='pendingEvidence'),
      'allocations',jsonb_build_array(jsonb_build_object(
        'proposalLineId','c1200000-0000-4000-8000-000000000301','quantity','1.0000',
        'unitPrice','1.0000','quotationMaterialName','Steel','mappingConfirmed',true
      ))
    ),
    'c1200000-0000-4000-8000-000000000634',
    'c1200000-0000-4000-8000-000000000734'
  )
$$,'P0001','EVIDENCE_UPLOAD_MISMATCH','unfinished quotation evidence cannot create an order');

set local role none;
insert into public.cost_evidence_files(
  id,tenant_id,company_id,project_id,object_path,original_filename,
  declared_mime_type,declared_size_bytes,declared_sha256,
  verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,
  created_by,finalized_by,finalized_at,version
)
select
  evidence_id,
  'c1200000-0000-4000-8000-000000000010',
  'c1200000-0000-4000-8000-000000000020',
  'c1200000-0000-4000-8000-000000000101',
  'c1200000-0000-4000-8000-000000000010/c1200000-0000-4000-8000-000000000020/c1200000-0000-4000-8000-000000000101/'||evidence_id::text,
  filename,'application/pdf',8,hash,'application/pdf',8,hash,'finalized',
  now()+interval '15 minutes','c1200000-0000-4000-8000-000000000902',
  'c1200000-0000-4000-8000-000000000902',now(),1
from (values
 ('c1200000-0000-4000-8000-000000000501'::uuid,'quote-1.pdf',repeat('1',64)),
 ('c1200000-0000-4000-8000-000000000502'::uuid,'quote-2.pdf',repeat('2',64)),
 ('c1200000-0000-4000-8000-000000000503'::uuid,'quote-3.pdf',repeat('3',64)),
 ('c1200000-0000-4000-8000-000000000504'::uuid,'quote-4.pdf',repeat('4',64)),
 ('c1200000-0000-4000-8000-000000000505'::uuid,'quote-5.pdf',repeat('5',64)),
 ('c1200000-0000-4000-8000-000000000506'::uuid,'quote-6.pdf',repeat('6',64))
) v(evidence_id,filename,hash);

insert into public.material_evidence_scopes(
  evidence_file_id,tenant_id,company_id,project_id,target_kind,proposal_id,revision_id,evidence_role,created_by
)
select
  evidence.id,
  evidence.tenant_id,
  evidence.company_id,
  evidence.project_id,
  'material_proposal',
  proposal.id,
  proposal.current_revision_id,
  'unsigned_quotation',
  'c1200000-0000-4000-8000-000000000902'
from public.cost_evidence_files as evidence
cross join public.material_proposals as proposal
where evidence.id in (
  'c1200000-0000-4000-8000-000000000501',
  'c1200000-0000-4000-8000-000000000502'
)
and proposal.id=(select value from material_test_ids where name='proposal1');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into material_test_ids(name,value,body)
select 'order1',(result->>'resourceId')::uuid,result
from (select public.c1_material_create_order(
  'c1200000-0000-4000-8000-000000000020',
  'c1200000-0000-4000-8000-000000000101',
  (select value from material_test_ids where name='proposal1'),
  jsonb_build_object(
    'approvedRevisionId',(select current_revision_id from public.material_proposals where id=(select value from material_test_ids where name='proposal1')),
    'supplierId','c1200000-0000-4000-8000-000000000201',
    'currencyCode','VND',
    'unsignedQuotationEvidenceFileId','c1200000-0000-4000-8000-000000000501',
    'allocations',jsonb_build_array(jsonb_build_object(
      'proposalLineId','c1200000-0000-4000-8000-000000000301',
      'quantity','10.0000','unitPrice','12.5000',
      'quotationMaterialName','Steel Supplier A','mappingConfirmed',true
    ))
  ),
  'c1200000-0000-4000-8000-000000000606',
  'c1200000-0000-4000-8000-000000000706'
) result) q;
select ok((select value is not null from material_test_ids where name='order1'),'first 10 allocation succeeds');

select is((
  public.c1_material_create_order(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='proposal1'),
    jsonb_build_object(
      'approvedRevisionId',(select current_revision_id from public.material_proposals where id=(select value from material_test_ids where name='proposal1')),
      'supplierId','c1200000-0000-4000-8000-000000000201',
      'currencyCode','VND',
      'unsignedQuotationEvidenceFileId','c1200000-0000-4000-8000-000000000501',
      'allocations',jsonb_build_array(jsonb_build_object(
        'proposalLineId','c1200000-0000-4000-8000-000000000301',
        'quantity','10.0000','unitPrice','12.5000',
        'quotationMaterialName','Steel Supplier A','mappingConfirmed',true
      ))
    ),
    'c1200000-0000-4000-8000-000000000606',
    'c1200000-0000-4000-8000-000000000706'
  )->>'replayed'
),'true','same idempotency key and exact payload replays');

select throws_ok($$
  select public.c1_material_create_order(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='proposal1'),
    jsonb_build_object(
      'approvedRevisionId',(select current_revision_id from public.material_proposals where id=(select value from material_test_ids where name='proposal1')),
      'supplierId','c1200000-0000-4000-8000-000000000201',
      'currencyCode','VND',
      'unsignedQuotationEvidenceFileId','c1200000-0000-4000-8000-000000000501',
      'allocations',jsonb_build_array(jsonb_build_object(
        'proposalLineId','c1200000-0000-4000-8000-000000000301',
        'quantity','10.0000','unitPrice','99.0000',
        'quotationMaterialName','Steel Supplier A','mappingConfirmed',true
      ))
    ),
    'c1200000-0000-4000-8000-000000000606',
    'c1200000-0000-4000-8000-000000000707'
  )
$$,'P0001','IDEMPOTENCY_CONFLICT','same key with different payload conflicts');

insert into material_test_ids(name,value,body)
select 'order2',(result->>'resourceId')::uuid,result
from (select public.c1_material_create_order(
  'c1200000-0000-4000-8000-000000000020',
  'c1200000-0000-4000-8000-000000000101',
  (select value from material_test_ids where name='proposal1'),
  jsonb_build_object(
    'approvedRevisionId',(select current_revision_id from public.material_proposals where id=(select value from material_test_ids where name='proposal1')),
    'supplierId','c1200000-0000-4000-8000-000000000201',
    'currencyCode','VND',
    'unsignedQuotationEvidenceFileId','c1200000-0000-4000-8000-000000000502',
    'allocations',jsonb_build_array(jsonb_build_object(
      'proposalLineId','c1200000-0000-4000-8000-000000000301',
      'quantity','10.0000','unitPrice','13.0000',
      'quotationMaterialName','Steel Supplier B','mappingConfirmed',true
    ))
  ),
  'c1200000-0000-4000-8000-000000000607',
  'c1200000-0000-4000-8000-000000000708'
) result) q;
select ok((select value is not null from material_test_ids where name='order2'),'second 10 allocation succeeds');
select is((
  select sum(quantity)::text from public.material_order_allocations
  where proposal_line_id='c1200000-0000-4000-8000-000000000301'
),'20.0000','20 -> 10 + 10');

-- Build two more approved revisions directly as rollback-only fixtures for allocation limits.
set local role none;
insert into public.material_proposals(
  id,tenant_id,company_id,project_id,review_state,needed_on,delivery_address,version,created_by
) values
('c1200000-0000-4000-8000-000000000402','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','draft','2026-10-30','Site A',0,'c1200000-0000-4000-8000-000000000901'),
('c1200000-0000-4000-8000-000000000403','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','draft','2026-10-30','Site A',0,'c1200000-0000-4000-8000-000000000901');
insert into public.material_proposal_lines(
  id,tenant_id,company_id,project_id,proposal_id,material_id,quantity,created_by
) values
('c1200000-0000-4000-8000-000000000302','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000402',(select value from material_test_ids where name='material'),20,'c1200000-0000-4000-8000-000000000901'),
('c1200000-0000-4000-8000-000000000304','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000402',(select value from material_test_ids where name='material'),5,'c1200000-0000-4000-8000-000000000901'),
('c1200000-0000-4000-8000-000000000303','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000403',(select value from material_test_ids where name='material'),20,'c1200000-0000-4000-8000-000000000901');
insert into public.material_proposal_revisions(
  id,tenant_id,company_id,project_id,proposal_id,revision_no,needed_on,delivery_address,submitted_by
) values
('c1200000-0000-4000-8000-000000000412','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000402',1,'2026-10-30','Site A','c1200000-0000-4000-8000-000000000901'),
('c1200000-0000-4000-8000-000000000413','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000403',1,'2026-10-30','Site A','c1200000-0000-4000-8000-000000000901');
insert into public.material_proposal_revision_lines(
  revision_id,proposal_line_id,proposal_id,tenant_id,company_id,project_id,material_id,material_name,specification,unit,quantity
) values
('c1200000-0000-4000-8000-000000000412','c1200000-0000-4000-8000-000000000302','c1200000-0000-4000-8000-000000000402','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101',(select value from material_test_ids where name='material'),'Steel','D10','bag',20),
('c1200000-0000-4000-8000-000000000412','c1200000-0000-4000-8000-000000000304','c1200000-0000-4000-8000-000000000402','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101',(select value from material_test_ids where name='material'),'Steel','D10','bag',5),
('c1200000-0000-4000-8000-000000000413','c1200000-0000-4000-8000-000000000303','c1200000-0000-4000-8000-000000000403','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101',(select value from material_test_ids where name='material'),'Steel','D10','bag',20);
update public.material_proposals set review_state='approved',current_revision_id='c1200000-0000-4000-8000-000000000412',approved_revision_id='c1200000-0000-4000-8000-000000000412',version=2 where id='c1200000-0000-4000-8000-000000000402';
update public.material_proposals set review_state='approved',current_revision_id='c1200000-0000-4000-8000-000000000413',approved_revision_id='c1200000-0000-4000-8000-000000000413',version=2 where id='c1200000-0000-4000-8000-000000000403';
insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,proposal_id,revision_id,evidence_role,created_by) values
('c1200000-0000-4000-8000-000000000503','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','material_proposal','c1200000-0000-4000-8000-000000000402','c1200000-0000-4000-8000-000000000412','unsigned_quotation','c1200000-0000-4000-8000-000000000902'),
('c1200000-0000-4000-8000-000000000504','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','material_proposal','c1200000-0000-4000-8000-000000000402','c1200000-0000-4000-8000-000000000412','unsigned_quotation','c1200000-0000-4000-8000-000000000902'),
('c1200000-0000-4000-8000-000000000505','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','material_proposal','c1200000-0000-4000-8000-000000000403','c1200000-0000-4000-8000-000000000413','unsigned_quotation','c1200000-0000-4000-8000-000000000902'),
('c1200000-0000-4000-8000-000000000506','c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','material_proposal','c1200000-0000-4000-8000-000000000403','c1200000-0000-4000-8000-000000000413','unsigned_quotation','c1200000-0000-4000-8000-000000000902');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select lives_ok($$
  select public.c1_material_create_order(
    'c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000402',
    '{"approvedRevisionId":"c1200000-0000-4000-8000-000000000412","supplierId":"c1200000-0000-4000-8000-000000000201","currencyCode":"VND","unsignedQuotationEvidenceFileId":"c1200000-0000-4000-8000-000000000503","allocations":[{"proposalLineId":"c1200000-0000-4000-8000-000000000302","quantity":"11.0000","unitPrice":"1.0000","quotationMaterialName":"Steel","mappingConfirmed":true}]}',
    'c1200000-0000-4000-8000-000000000608','c1200000-0000-4000-8000-000000000709'
  )
$$,'first 11 allocation succeeds');
select throws_ok($$
  select public.c1_material_create_order(
    'c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000402',
    '{"approvedRevisionId":"c1200000-0000-4000-8000-000000000412","supplierId":"c1200000-0000-4000-8000-000000000201","currencyCode":"VND","unsignedQuotationEvidenceFileId":"c1200000-0000-4000-8000-000000000504","allocations":[{"proposalLineId":"c1200000-0000-4000-8000-000000000302","quantity":"10.0000","unitPrice":"1.0000","quotationMaterialName":"Steel","mappingConfirmed":true}]}',
    'c1200000-0000-4000-8000-000000000609','c1200000-0000-4000-8000-000000000710'
  )
$$,'P0001','MATERIAL_ALLOCATION_EXCEEDED','20 -> 11 + 10');

select lives_ok($$
  select public.c1_material_create_order(
    'c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000403',
    '{"approvedRevisionId":"c1200000-0000-4000-8000-000000000413","supplierId":"c1200000-0000-4000-8000-000000000201","currencyCode":"VND","unsignedQuotationEvidenceFileId":"c1200000-0000-4000-8000-000000000505","allocations":[{"proposalLineId":"c1200000-0000-4000-8000-000000000303","quantity":"11.0000","unitPrice":"1.0000","quotationMaterialName":"Steel","mappingConfirmed":true}]}',
    'c1200000-0000-4000-8000-000000000610','c1200000-0000-4000-8000-000000000711'
  )
$$,'first concurrent candidate 11 succeeds');
select throws_ok($$
  select public.c1_material_create_order(
    'c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000403',
    '{"approvedRevisionId":"c1200000-0000-4000-8000-000000000413","supplierId":"c1200000-0000-4000-8000-000000000201","currencyCode":"VND","unsignedQuotationEvidenceFileId":"c1200000-0000-4000-8000-000000000506","allocations":[{"proposalLineId":"c1200000-0000-4000-8000-000000000303","quantity":"11.0000","unitPrice":"1.0000","quotationMaterialName":"Steel","mappingConfirmed":true}]}',
    'c1200000-0000-4000-8000-000000000611','c1200000-0000-4000-8000-000000000712'
  )
$$,'P0001','MATERIAL_ALLOCATION_EXCEEDED','concurrent 11 + 11 second writer fails after stable lock');
select ok(
  position('order by line.id' in lower(pg_get_functiondef('private.c1_material_create_order(uuid,uuid,uuid,jsonb,uuid,uuid)'::regprocedure))) > 0
  and position('for update' in lower(pg_get_functiondef('private.c1_material_create_order(uuid,uuid,uuid,jsonb,uuid,uuid)'::regprocedure))) > 0,
  'concurrent 11 + 11 locks stable proposal line IDs before summing'
);

select lives_ok($$
  select public.c1_material_decide_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    'c1200000-0000-4000-8000-000000000402',
    '{"expectedVersion":2,"decision":"return","reason":"revise unsigned reservation"}',
    'c1200000-0000-4000-8000-000000000621',
    'c1200000-0000-4000-8000-000000000721'
  )
$$,'returned proposal keeps unsigned allocation reserved');

select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_update_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    'c1200000-0000-4000-8000-000000000402',
    jsonb_build_object(
      'expectedVersion',3,
      'neededOn','2026-10-30',
      'deliveryAddress','Site A',
      'lines',jsonb_build_array(
        jsonb_build_object(
          'lineId','c1200000-0000-4000-8000-000000000302',
          'materialId',(select value from material_test_ids where name='material'),
          'quantity','8.0000'
        ),
        jsonb_build_object(
          'lineId','c1200000-0000-4000-8000-000000000304',
          'materialId',(select value from material_test_ids where name='material'),
          'quantity','5.0000'
        )
      )
    ),
    'c1200000-0000-4000-8000-000000000622',
    'c1200000-0000-4000-8000-000000000722'
  )
$$,'P0001','MATERIAL_ALLOCATION_EXCEEDED','unsigned reserved quantity cannot be reduced');

select throws_ok($$
  select public.c1_material_update_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    'c1200000-0000-4000-8000-000000000402',
    jsonb_build_object(
      'expectedVersion',3,
      'neededOn','2026-10-30',
      'deliveryAddress','Site A',
      'lines',jsonb_build_array(
        jsonb_build_object(
          'lineId','c1200000-0000-4000-8000-000000000304',
          'materialId',(select value from material_test_ids where name='material'),
          'quantity','5.0000'
        )
      )
    ),
    'c1200000-0000-4000-8000-000000000623',
    'c1200000-0000-4000-8000-000000000723'
  )
$$,'P0001','MATERIAL_ALLOCATION_EXCEEDED','reserved proposal line cannot be omitted');

set local role none;
update public.material_proposal_lines
set quantity=8
where id='c1200000-0000-4000-8000-000000000302';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_submit_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    'c1200000-0000-4000-8000-000000000402',
    '{"expectedVersion":3}',
    'c1200000-0000-4000-8000-000000000624',
    'c1200000-0000-4000-8000-000000000724'
  )
$$,'P0001','MATERIAL_ALLOCATION_EXCEEDED','submit rejects reduced reserved quantity');

set local role none;
update public.material_proposal_lines
set quantity=20,is_active=false
where id='c1200000-0000-4000-8000-000000000302';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_submit_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    'c1200000-0000-4000-8000-000000000402',
    '{"expectedVersion":3}',
    'c1200000-0000-4000-8000-000000000625',
    'c1200000-0000-4000-8000-000000000725'
  )
$$,'P0001','MATERIAL_ALLOCATION_EXCEEDED','submit rejects omitted reserved line');

set local role none;
update public.material_proposal_lines
set is_active=true
where id='c1200000-0000-4000-8000-000000000302';

insert into public.cost_workflow_contracts(
  id,tenant_id,company_id,project_id,party_id,reference,currency_code,created_by
) values (
  'c1200000-0000-4000-8000-000000000801',
  'c1200000-0000-4000-8000-000000000010',
  'c1200000-0000-4000-8000-000000000020',
  'c1200000-0000-4000-8000-000000000101',
  'c1200000-0000-4000-8000-000000000201',
  'SIGNED-1','VND','c1200000-0000-4000-8000-000000000903'
);
insert into public.material_order_contracts(order_id,tenant_id,company_id,project_id,contract_id,created_by)
values(
  (select value from material_test_ids where name='order1'),
  'c1200000-0000-4000-8000-000000000010',
  'c1200000-0000-4000-8000-000000000020',
  'c1200000-0000-4000-8000-000000000101',
  'c1200000-0000-4000-8000-000000000801',
  'c1200000-0000-4000-8000-000000000903'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_update_item(
    'c1200000-0000-4000-8000-000000000020',
    (select value from material_test_ids where name='material'),
    '{"expectedVersion":0,"unit":"piece"}',
    'c1200000-0000-4000-8000-000000000614',
    'c1200000-0000-4000-8000-000000000715'
  )
$$,'P0001','SIGNED_MATERIAL_UNIT_IMMUTABLE','signed material unit cannot change');
select lives_ok($$
  select public.c1_material_decide_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='proposal1'),
    '{"expectedVersion":2,"decision":"return","reason":"correct quantity"}',
    'c1200000-0000-4000-8000-000000000612',
    'c1200000-0000-4000-8000-000000000713'
  )
$$,'buyer returns an approved proposal without rewriting it');
select is((
  public.c1_material_read_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='proposal1')
  )->>'returnReason'
),'correct quantity','returned proposal exposes latest current-revision returnReason');
select is((select state from public.material_orders where id=(select value from material_test_ids where name='order1')),'active','signed order remains active after return');
select is((select state from public.material_orders where id=(select value from material_test_ids where name='order2')),'suspended','unsigned order is suspended after return');

select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_update_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='proposal1'),
    jsonb_build_object(
      'expectedVersion',3,'neededOn','2026-10-30','deliveryAddress','Site A',
      'lines',jsonb_build_array(jsonb_build_object(
        'lineId','c1200000-0000-4000-8000-000000000301',
        'materialId',(select value from material_test_ids where name='material'),
        'quantity','9.0000'
      ))
    ),
    'c1200000-0000-4000-8000-000000000613',
    'c1200000-0000-4000-8000-000000000714'
  )
$$,'P0001','SIGNED_QUANTITY_CONFLICT','signed quantity cannot be reduced');

set local role none;
select throws_ok($$
  update public.material_order_allocations
  set quantity=9
  where order_id=(select value from material_test_ids where name='order1')
$$,'P0001','SIGNED_ALLOCATION_IMMUTABLE','signed allocation cannot be changed');
select throws_ok($$
  update public.material_proposal_revisions
  set delivery_address='changed'
  where id=(select current_revision_id from public.material_proposals where id=(select value from material_test_ids where name='proposal1'))
$$,'P0001','MATERIAL_HISTORY_IMMUTABLE','submitted snapshot is immutable');

select throws_ok($$
  insert into public.material_orders(
    id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,
    supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
  )
  select
    'c1200000-0000-4000-8000-000000000899',tenant_id,company_id,project_id,
    proposal_id,approved_revision_id,supplier_id,'USD',unsigned_quotation_evidence_file_id,created_by
  from public.material_orders where id=(select value from material_test_ids where name='order2')
$$,'P0001','INPUT_INVALID','order currency must equal enabled company default currency');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select lives_ok($$
  select public.c1_material_cancel_order(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='order2'),
    '{"expectedOrderVersion":2,"reason":"supplier unavailable"}',
    'c1200000-0000-4000-8000-000000000626',
    'c1200000-0000-4000-8000-000000000726'
  )
$$,'buyer cancels an unsigned suspended order');
select is((
  public.c1_material_cancel_order(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='order2'),
    '{"expectedOrderVersion":2,"reason":"supplier unavailable"}',
    'c1200000-0000-4000-8000-000000000626',
    'c1200000-0000-4000-8000-000000000726'
  )->>'replayed'
),'true','unsigned cancellation retry replays without releasing twice');
select throws_ok($$
  select public.c1_material_cancel_order(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='order2'),
    '{"expectedOrderVersion":2,"reason":"different reason"}',
    'c1200000-0000-4000-8000-000000000626',
    'c1200000-0000-4000-8000-000000000726'
  )
$$,'P0001','IDEMPOTENCY_CONFLICT','cancellation key rejects another payload');
select throws_ok($$
  select public.c1_material_cancel_order(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='order2'),
    '{"expectedOrderVersion":2,"reason":"stale retry"}',
    'c1200000-0000-4000-8000-000000000627',
    'c1200000-0000-4000-8000-000000000727'
  )
$$,'P0001','VERSION_CONFLICT','stale cancellation version is denied');
select throws_ok($$
  select public.c1_material_cancel_order(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='order1'),
    '{"expectedOrderVersion":1,"reason":"cannot cancel signed"}',
    'c1200000-0000-4000-8000-000000000628',
    'c1200000-0000-4000-8000-000000000728'
  )
$$,'P0001','VERSION_CONFLICT','signed order cancellation is denied');

set local role none;
select is((select state from public.material_orders where id=(select value from material_test_ids where name='order2')),'cancelled','unsigned order records cancelled state');
select is((
  public.c1_material_read_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='proposal1')
  )->'lines'->0->>'allocatedQuantity'
),'10.0000','cancellation releases only the unsigned reservation');
select is((
  select reason from public.material_order_cancellations
  where order_id=(select value from material_test_ids where name='order2')
),'supplier unavailable','cancellation audit preserves mandatory reason');
select is((
  select cancelled_by::text from public.material_order_cancellations
  where order_id=(select value from material_test_ids where name='order2')
),'c1200000-0000-4000-8000-000000000902','cancellation audit preserves actor identity');

select lives_ok($$
  update public.material_items
  set name='Steel renamed',specification='D12'
  where id=(select value from material_test_ids where name='material')
$$,'canonical material display may evolve without rewriting approved snapshots');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select lives_ok($$
  select public.c1_material_update_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='proposal1'),
    jsonb_build_object(
      'expectedVersion',3,'neededOn','2026-11-01','deliveryAddress','Site A',
      'lines',jsonb_build_array(jsonb_build_object(
        'lineId','c1200000-0000-4000-8000-000000000301',
        'materialId',(select value from material_test_ids where name='material'),
        'quantity','20.0000'
      ))
    ),
    'c1200000-0000-4000-8000-000000000629',
    'c1200000-0000-4000-8000-000000000729'
  )
$$,'engineer edits returned proposal after unsigned cancellation');
select lives_ok($$
  select public.c1_material_submit_proposal(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='proposal1'),
    '{"expectedVersion":4}',
    'c1200000-0000-4000-8000-000000000630',
    'c1200000-0000-4000-8000-000000000730'
  )
$$,'engineer resubmits a new revision without rewriting the old order');

select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select is((
  public.c1_material_read_order(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='order1')
  )->'allocations'->0->>'materialName'
),'Steel','old order keeps approved material name after resubmission and master rename');
select is((
  public.c1_material_read_order(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='order1')
  )->'allocations'->0->>'specification'
),'D10','old order keeps approved specification after resubmission and master rename');
select is((
  public.c1_material_read_order(
    'c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='order1')
  )->'allocations'->0->>'unit'
),'bag','old order keeps approved unit after resubmission and master rename');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select throws_ok($$
  select public.c1_material_create_evidence_intent(
    'c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101',
    jsonb_build_object('originalFilename','bad.pdf','mimeType','application/pdf','sizeBytes',8,'sha256',repeat('d',64),
      'evidenceRole',null,'target',jsonb_build_object('kind','material_proposal','proposalId',(select value from material_test_ids where name='proposal1'),'revisionId','c1200000-0000-4000-8000-000000000412')),
    'c1200000-0000-4000-8000-000000000641','c1200000-0000-4000-8000-000000000741'
  )
$$,'P0001','INPUT_INVALID','null evidence role is controlled input invalid');
select throws_ok($$
  select public.c1_material_create_evidence_intent(
    'c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101',
    jsonb_build_object('originalFilename','bad.pdf','mimeType','application/pdf','sizeBytes',8,'sha256',repeat('d',64),
      'evidenceRole','unsigned_quotation','target',jsonb_build_object('kind',null,'proposalId',(select value from material_test_ids where name='proposal1'),'revisionId','c1200000-0000-4000-8000-000000000412')),
    'c1200000-0000-4000-8000-000000000642','c1200000-0000-4000-8000-000000000742'
  )
$$,'P0001','INPUT_INVALID','null target kind is controlled input invalid');
select throws_ok($$
  select public.c1_material_create_evidence_intent(
    'c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101',
    jsonb_build_object('originalFilename','bad.pdf','mimeType','application/pdf','sizeBytes',9999999999999999999999999999999999999999,'sha256',repeat('d',64),
      'evidenceRole','unsigned_quotation','target',jsonb_build_object('kind','material_proposal','proposalId',(select value from material_test_ids where name='proposal1'),'revisionId','c1200000-0000-4000-8000-000000000412')),
    'c1200000-0000-4000-8000-000000000643','c1200000-0000-4000-8000-000000000743'
  )
$$,'P0001','INPUT_INVALID','out of range evidence size is controlled input invalid');
select throws_ok($$
  select public.c1_material_cancel_order(
    'c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101',
    (select value from material_test_ids where name='order2'),
    '{"expectedOrderVersion":9999999999999999999999999999999999999999,"reason":"invalid"}',
    'c1200000-0000-4000-8000-000000000644','c1200000-0000-4000-8000-000000000744'
  )
$$,'P0001','INPUT_INVALID','out of range version is controlled input invalid');

set local role none;
insert into public.cost_command_receipts(
  tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version
) values (
  'c1200000-0000-4000-8000-000000000010','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000902',
  'material.evidence_finalize','c1200000-0000-4000-8000-000000000645',
  private.c1_workflow_hash(
    'c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000501',
    '{"expectedVersion":0,"mimeType":"application/pdf","sizeBytes":8,"sha256":"1111111111111111111111111111111111111111111111111111111111111111"}'::jsonb
  ),
  'c1200000-0000-4000-8000-000000000501',1
);

set local role service_role;
select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000902","role":"service_role"}',true);
select is((public.c1_finalize_material_evidence_server(
  'c1200000-0000-4000-8000-000000000902','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000501',
  '{"expectedVersion":0}'::jsonb,'c1200000-0000-4000-8000-000000000645','c1200000-0000-4000-8000-000000000745'
)->>'replayed'),'true','expected-version-only finalizer replay succeeds');
select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000902","role":"service_role"}',true);
select is((public.c1_finalize_material_evidence_server(
  'c1200000-0000-4000-8000-000000000902','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000501',
  '{"expectedVersion":0,"mimeType":"application/pdf","sizeBytes":8,"sha256":"1111111111111111111111111111111111111111111111111111111111111111"}'::jsonb,
  'c1200000-0000-4000-8000-000000000645','c1200000-0000-4000-8000-000000000745'
)->>'replayed'),'true','exact full verified finalizer replay succeeds');
select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000902","role":"service_role"}',true);
select throws_ok($$
  select public.c1_finalize_material_evidence_server(
    'c1200000-0000-4000-8000-000000000902','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000501',
    '{"expectedVersion":0,"mimeType":"application/pdf","sizeBytes":8,"sha256":"2222222222222222222222222222222222222222222222222222222222222222"}',
    'c1200000-0000-4000-8000-000000000645','c1200000-0000-4000-8000-000000000745'
  )
$$,'P0001','IDEMPOTENCY_CONFLICT','changed full verified finalizer replay conflicts');
select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000902","role":"service_role"}',true);
select throws_ok($$
  select public.c1_finalize_material_evidence_server(
    'c1200000-0000-4000-8000-000000000902','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000501',
    '{"expectedVersion":0,"mimeType":"application/pdf"}',
    'c1200000-0000-4000-8000-000000000645','c1200000-0000-4000-8000-000000000745'
  )
$$,'P0001','INPUT_INVALID','partial verified finalizer replay is input invalid');

select set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000902","role":"service_role"}',true);
select throws_ok($$
  select public.c1_finalize_material_evidence_server(
    'c1200000-0000-4000-8000-000000000902','c1200000-0000-4000-8000-000000000020',
    'c1200000-0000-4000-8000-000000000101','c1200000-0000-4000-8000-000000000501',
    '{"expectedVersion":9223372036854775807}',
    'c1200000-0000-4000-8000-000000000645','c1200000-0000-4000-8000-000000000745'
  )
$$,'P0001','INPUT_INVALID','max bigint finalizer replay is controlled input invalid');

select * from finish();
rollback;
