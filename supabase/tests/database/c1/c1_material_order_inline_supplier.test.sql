begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(20);

insert into auth.users(id,email) values
('c1300000-0000-4000-8000-000000000901','inline-engineer@test.invalid'),
('c1300000-0000-4000-8000-000000000902','inline-buyer@test.invalid'),
('c1300000-0000-4000-8000-000000000905','inline-buyer-no-supplier@test.invalid');
insert into public.tenants(id,code,name) values('c1300000-0000-4000-8000-000000000010','C1S','Inline supplier tenant');
insert into public.companies(id,tenant_id,code,name) values('c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000010','C1S','Inline supplier company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select v.u,'c1300000-0000-4000-8000-000000000010',array['member'] from (values
 ('c1300000-0000-4000-8000-000000000901'::uuid),('c1300000-0000-4000-8000-000000000902'::uuid),('c1300000-0000-4000-8000-000000000905'::uuid)) v(u);
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select v.u,'c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020',array['member'],true from (values
 ('c1300000-0000-4000-8000-000000000901'::uuid),('c1300000-0000-4000-8000-000000000902'::uuid),('c1300000-0000-4000-8000-000000000905'::uuid)) v(u);
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values
('c1300000-0000-4000-8000-000000000912','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','inline_buyer','Inline buyer','test',false),
('c1300000-0000-4000-8000-000000000915','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','inline_buyer_ns','Inline buyer no supplier','test',false);
insert into public.role_permissions(role_id,permission_code) values
('c1300000-0000-4000-8000-000000000912','material.read'),
('c1300000-0000-4000-8000-000000000912','material.manage'),
('c1300000-0000-4000-8000-000000000912','material.order.manage'),
('c1300000-0000-4000-8000-000000000912','material.supplier.record'),
('c1300000-0000-4000-8000-000000000915','material.read'),
('c1300000-0000-4000-8000-000000000915','material.order.manage');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values
('c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000902','c1300000-0000-4000-8000-000000000912','c1300000-0000-4000-8000-000000000902','test'),
('c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000905','c1300000-0000-4000-8000-000000000915','c1300000-0000-4000-8000-000000000902','test');
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000010',true,'c1300000-0000-4000-8000-000000000902');
insert into public.cost_workflow_companies(company_id,tenant_id,mode,notification_recipient_id)
values('c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000010','document_backed_v1','c1300000-0000-4000-8000-000000000902');
insert into public.projects(id,tenant_id,company_id,code,name,location_text,operational_state,origin,created_by)
values('c1300000-0000-4000-8000-000000000101','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','INL-P','Inline project','Site A','active','manual','c1300000-0000-4000-8000-000000000902');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,is_active,created_by) values
('c1300000-0000-4000-8000-000000000201','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','SUP-A','Supplier A','organization',true,'c1300000-0000-4000-8000-000000000902'),
('c1300000-0000-4000-8000-000000000202','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','DUP-1','Duplicate Name','organization',true,'c1300000-0000-4000-8000-000000000902'),
('c1300000-0000-4000-8000-000000000203','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','DUP-2','duplicate  name','organization',true,'c1300000-0000-4000-8000-000000000902'),
('c1300000-0000-4000-8000-000000000204','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','INA-1','Inactive Co','organization',false,'c1300000-0000-4000-8000-000000000902'),
('c1300000-0000-4000-8000-000000000205','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','CREW-1','Crew One','crew',true,'c1300000-0000-4000-8000-000000000902');

create temporary table inline_ids(name text primary key,value uuid);
grant select,insert on inline_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1300000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into inline_ids(name,value)
select 'material',(public.c1_material_create_item(
  'c1300000-0000-4000-8000-000000000020',
  '{"code":"INL-MAT","name":"Steel","specification":"D10","unit":"bag"}',
  'c1300000-0000-4000-8000-000000000601','c1300000-0000-4000-8000-000000000701'
)->>'resourceId')::uuid;

-- Approved proposal with one line of 100 and 12 finalized, scoped quotation PDFs (rollback-only fixtures).
set local role none;
insert into public.material_proposals(id,tenant_id,company_id,project_id,review_state,needed_on,delivery_address,version,created_by)
values('c1300000-0000-4000-8000-000000000401','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101','draft','2026-10-30','Site A',0,'c1300000-0000-4000-8000-000000000901');
insert into public.material_proposal_lines(id,tenant_id,company_id,project_id,proposal_id,material_id,quantity,created_by)
values('c1300000-0000-4000-8000-000000000301','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101','c1300000-0000-4000-8000-000000000401',(select value from inline_ids where name='material'),100,'c1300000-0000-4000-8000-000000000901');
insert into public.material_proposal_revisions(id,tenant_id,company_id,project_id,proposal_id,revision_no,needed_on,delivery_address,submitted_by)
values('c1300000-0000-4000-8000-000000000411','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101','c1300000-0000-4000-8000-000000000401',1,'2026-10-30','Site A','c1300000-0000-4000-8000-000000000901');
insert into public.material_proposal_revision_lines(revision_id,proposal_line_id,proposal_id,tenant_id,company_id,project_id,material_id,material_name,specification,unit,quantity)
values('c1300000-0000-4000-8000-000000000411','c1300000-0000-4000-8000-000000000301','c1300000-0000-4000-8000-000000000401','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101',(select value from inline_ids where name='material'),'Steel','D10','bag',100);
update public.material_proposals set review_state='approved',current_revision_id='c1300000-0000-4000-8000-000000000411',approved_revision_id='c1300000-0000-4000-8000-000000000411',version=2
where id='c1300000-0000-4000-8000-000000000401';
insert into public.cost_evidence_files(
  id,tenant_id,company_id,project_id,object_path,original_filename,
  declared_mime_type,declared_size_bytes,declared_sha256,
  verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,
  created_by,finalized_by,finalized_at,version
)
select ('c1300000-0000-4000-8000-0000000005'||lpad(n::text,2,'0'))::uuid,
  'c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101',
  'c1300000-0000-4000-8000-000000000010/c1300000-0000-4000-8000-000000000020/c1300000-0000-4000-8000-000000000101/inline-'||n,
  'inline-'||n||'.pdf','application/pdf',8,repeat(to_hex(n),64)::text,'application/pdf',8,repeat(to_hex(n),64)::text,'finalized',
  now()+interval '15 minutes','c1300000-0000-4000-8000-000000000902','c1300000-0000-4000-8000-000000000902',now(),1
from generate_series(1,12) n;
insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,proposal_id,revision_id,evidence_role,created_by)
select ('c1300000-0000-4000-8000-0000000005'||lpad(n::text,2,'0'))::uuid,
  'c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101',
  'material_proposal','c1300000-0000-4000-8000-000000000401','c1300000-0000-4000-8000-000000000411','unsigned_quotation','c1300000-0000-4000-8000-000000000902'
from generate_series(1,12) n;

-- Helper: build an order input for evidence n, supplier descriptor s, quantity q.
create function pg_temp.inline_order(n int, s jsonb, q text default '1.0000') returns jsonb language sql as $$
  select jsonb_build_object(
    'approvedRevisionId','c1300000-0000-4000-8000-000000000411',
    'supplier',s,
    'currencyCode','VND',
    'unsignedQuotationEvidenceFileId',('c1300000-0000-4000-8000-0000000005'||lpad(n::text,2,'0')),
    'allocations',jsonb_build_array(jsonb_build_object(
      'proposalLineId','c1300000-0000-4000-8000-000000000301','quantity',q,'unitPrice','1.0000',
      'quotationMaterialName','Steel','mappingConfirmed',true)))
$$;
create function pg_temp.inline_create(n int, s jsonb, q text default '1.0000') returns jsonb language sql as $$
  select public.c1_material_create_order(
    'c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101','c1300000-0000-4000-8000-000000000401',
    pg_temp.inline_order(n,s,q),
    ('c1300000-0000-4000-8000-0000000006'||lpad(n::text,2,'0'))::uuid,
    ('c1300000-0000-4000-8000-0000000007'||lpad(n::text,2,'0'))::uuid)
$$;
grant execute on function pg_temp.inline_order(int,jsonb,text), pg_temp.inline_create(int,jsonb,text) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1300000-0000-4000-8000-000000000902","role":"authenticated"}',true);

-- code match + no overwrite
insert into inline_ids(name,value) select 'byCode',(pg_temp.inline_create(1,'{"code":"SUP-A","displayName":"Other Name","taxIdentifier":"999"}')->>'resourceId')::uuid;
select is((select supplier_id from public.material_orders where id=(select value from inline_ids where name='byCode')),'c1300000-0000-4000-8000-000000000201'::uuid,'code match reuses the existing supplier');
set local role none;
select is((select display_name||'|'||coalesce(tax_identifier,'-') from public.business_parties where id='c1300000-0000-4000-8000-000000000201'),'Supplier A|-','reused supplier is not overwritten');
set local role authenticated;

-- name match (case and whitespace insensitive)
insert into inline_ids(name,value) select 'byName',(pg_temp.inline_create(2,'{"code":"NEW-CODE-X","displayName":"  supplier   a "}')->>'resourceId')::uuid;
select is((select supplier_id from public.material_orders where id=(select value from inline_ids where name='byName')),'c1300000-0000-4000-8000-000000000201'::uuid,'name match reuses the existing supplier');
set local role none;
select is((select count(*)::int from public.business_parties where code='NEW-CODE-X'),0,'name match does not create a supplier');
set local role authenticated;

-- create new
insert into inline_ids(name,value) select 'created',(pg_temp.inline_create(3,'{"code":"NCC-NEW","displayName":"Brand New Co","taxIdentifier":"0101","contactPhone":"0909"}')->>'resourceId')::uuid;
set local role none;
select is((select party_kind||'|'||display_name||'|'||tax_identifier||'|'||contact_phone||'|'||is_active::text from public.business_parties where company_id='c1300000-0000-4000-8000-000000000020' and code='NCC-NEW'),'organization|Brand New Co|0101|0909|true','unknown supplier is created as an active organization');
select is((select supplier_id from public.material_orders where id=(select value from inline_ids where name='created')),(select id from public.business_parties where company_id='c1300000-0000-4000-8000-000000000020' and code='NCC-NEW'),'order uses the new supplier id');
set local role authenticated;

-- replay: same key + payload, no second supplier
select is((pg_temp.inline_create(3,'{"code":"NCC-NEW","displayName":"Brand New Co","taxIdentifier":"0101","contactPhone":"0909"}')->>'replayed'),'true','replay returns the original order');
set local role none;
select is((select count(*)::int from public.business_parties where company_id='c1300000-0000-4000-8000-000000000020' and code='NCC-NEW'),1,'replay does not create another supplier');
set local role authenticated;

-- conflicts
select throws_ok($$ select pg_temp.inline_create(4,'{"code":"NO-MATCH","displayName":"Duplicate Name"}') $$,'P0001','SUPPLIER_AMBIGUOUS','several suppliers with the same normalised name are ambiguous');
select throws_ok($$ select pg_temp.inline_create(5,'{"code":"INA-1","displayName":"Anything"}') $$,'P0001','SUPPLIER_UNAVAILABLE','inactive code match is unavailable');
select throws_ok($$ select pg_temp.inline_create(6,'{"code":"NO-MATCH-2","displayName":"inactive co"}') $$,'P0001','SUPPLIER_UNAVAILABLE','inactive name match is unavailable');
select throws_ok($$ select pg_temp.inline_create(7,'{"code":"CREW-1","displayName":"Crew One"}') $$,'P0001','SUPPLIER_UNAVAILABLE','crew code match is unavailable');

-- rollback: new supplier is not kept when the order fails
select throws_ok($$ select pg_temp.inline_create(8,'{"code":"NCC-ROLLBACK","displayName":"Rollback Co"}','500.0000') $$,'P0001','MATERIAL_ALLOCATION_EXCEEDED','over-allocation still fails');
set local role none;
select is((select count(*)::int from public.business_parties where code='NCC-ROLLBACK'),0,'failed order rolls back the new supplier');
set local role authenticated;

-- input validation
select throws_ok($$ select pg_temp.inline_create(9,'{"displayName":"No Code"}') $$,'P0001','INPUT_INVALID','supplier code is required');
select throws_ok($$ select pg_temp.inline_create(9,'{"code":"X","displayName":"Y","partyKind":"organization"}') $$,'P0001','INPUT_INVALID','unknown supplier keys are rejected');
select throws_ok($$
  select public.c1_material_create_order(
    'c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101','c1300000-0000-4000-8000-000000000401',
    (pg_temp.inline_order(9,'{"code":"SUP-A","displayName":"Supplier A"}') - 'supplier') || jsonb_build_object('supplierId','c1300000-0000-4000-8000-000000000201'),
    'c1300000-0000-4000-8000-000000000699','c1300000-0000-4000-8000-000000000799')
$$,'P0001','INPUT_INVALID','legacy supplierId input is rejected');

-- permission: buyer without material.supplier.record
select set_config('request.jwt.claims','{"sub":"c1300000-0000-4000-8000-000000000905","role":"authenticated"}',true);
select lives_ok($$ select pg_temp.inline_create(10,'{"code":"SUP-A","displayName":"Supplier A"}') $$,'existing supplier works without supplier.record');
select throws_ok($$ select pg_temp.inline_create(11,'{"code":"NCC-DENIED","displayName":"Denied Co"}') $$,'P0001','PERMISSION_DENIED','creating a supplier requires supplier.record');
set local role none;
select is((select count(*)::int from public.business_parties where code='NCC-DENIED'),0,'denied supplier is not created');

select * from finish();
rollback;
