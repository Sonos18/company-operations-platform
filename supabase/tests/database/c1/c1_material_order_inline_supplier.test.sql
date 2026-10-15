begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(22);

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
-- Existing parties keyed by the name-derived code.
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,tax_identifier,contact_display_name,contact_phone,is_active,created_by) values
('c1300000-0000-4000-8000-000000000201','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','suppliera','Supplier A','organization','111','Old Contact','0100',true,'c1300000-0000-4000-8000-000000000902'),
('c1300000-0000-4000-8000-000000000202','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','donga','Đông Á','organization',null,null,null,true,'c1300000-0000-4000-8000-000000000902'),
('c1300000-0000-4000-8000-000000000204','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','inactiveco','Inactive Co','organization',null,null,null,false,'c1300000-0000-4000-8000-000000000902'),
('c1300000-0000-4000-8000-000000000205','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','crewone','Crew One','crew',null,null,null,true,'c1300000-0000-4000-8000-000000000902');

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
  'c1300000-0000-4000-8000-000000000010/c1300000-0000-4000-8000-000000000020/c1300000-0000-4000-8000-000000000101/c1300000-0000-4000-8000-0000000005'||lpad(n::text,2,'0'),
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

-- Code derivation (as owner).
select is(private.c1_material_supplier_code('CÔNG TY TNHH SX-TM-XNK NGŨ KIM TRUNG NAM'),'congtytnhhsxtmxnkngukimtrungnam','code is the lower-case ASCII name without spaces or symbols');
select is(private.c1_material_supplier_code(normalize('Ngũ Kim Đông Á',NFD)),'ngukimdonga','decomposed (NFD) input yields the same code');

-- Buyer without material.supplier.record.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1300000-0000-4000-8000-000000000905","role":"authenticated"}',true);
insert into inline_ids(name,value) select 'unchanged',(pg_temp.inline_create(1,'{"displayName":"Supplier A","taxIdentifier":"111"}')->>'resourceId')::uuid;
select is((select supplier_id from public.material_orders where id=(select value from inline_ids where name='unchanged')),'c1300000-0000-4000-8000-000000000201'::uuid,'identical supplier is reused without supplier.record');
select throws_ok($$ select pg_temp.inline_create(2,'{"displayName":"Supplier A","contactPhone":"0999"}') $$,'P0001','PERMISSION_DENIED','overwriting a supplier requires supplier.record');
select throws_ok($$ select pg_temp.inline_create(10,'{"displayName":"Denied Co"}') $$,'P0001','PERMISSION_DENIED','creating a supplier requires supplier.record');
set local role none;
select is((select version from public.business_parties where id='c1300000-0000-4000-8000-000000000201'),0::bigint,'unchanged or denied reuse leaves the supplier version as is');
select is((select count(*)::int from public.business_parties where code='deniedco'),0,'denied supplier is not created');

-- Buyer with material.supplier.record.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1300000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into inline_ids(name,value) select 'overwrite',(pg_temp.inline_create(3,'{"displayName":"SUPPLIER A","contactPhone":"0909"}')->>'resourceId')::uuid;
select is((select supplier_id from public.material_orders where id=(select value from inline_ids where name='overwrite')),'c1300000-0000-4000-8000-000000000201'::uuid,'same name-derived code reuses the supplier');
set local role none;
select is((select display_name||'|'||tax_identifier||'|'||contact_display_name||'|'||contact_phone||'|'||version::text from public.business_parties where id='c1300000-0000-4000-8000-000000000201'),'SUPPLIER A|111|Old Contact|0909|1','differing fields are overwritten, omitted fields are kept, version bumps once');
set local role authenticated;

insert into inline_ids(name,value) select 'diacritics',(pg_temp.inline_create(4,'{"displayName":"Đông Á"}')->>'resourceId')::uuid;
select is((select supplier_id from public.material_orders where id=(select value from inline_ids where name='diacritics')),'c1300000-0000-4000-8000-000000000202'::uuid,'Vietnamese name maps to its accent-free code');

insert into inline_ids(name,value) select 'created',(pg_temp.inline_create(5,'{"displayName":"Brand New Co","taxIdentifier":"0101"}')->>'resourceId')::uuid;
set local role none;
select is((select party_kind||'|'||display_name||'|'||tax_identifier||'|'||is_active::text from public.business_parties where company_id='c1300000-0000-4000-8000-000000000020' and code='brandnewco'),'organization|Brand New Co|0101|true','unknown supplier is created with the derived code');
select is((select supplier_id from public.material_orders where id=(select value from inline_ids where name='created')),(select id from public.business_parties where company_id='c1300000-0000-4000-8000-000000000020' and code='brandnewco'),'order uses the new supplier id');
set local role authenticated;

select is((pg_temp.inline_create(5,'{"displayName":"Brand New Co","taxIdentifier":"0101"}')->>'resourceId')::uuid,(select value from inline_ids where name='created'),'replay returns the original order');
set local role none;
select is((select count(*)::int from public.business_parties where company_id='c1300000-0000-4000-8000-000000000020' and code='brandnewco'),1,'replay does not create another supplier');
set local role authenticated;

select throws_ok($$ select pg_temp.inline_create(6,'{"displayName":"Crew One"}') $$,'P0001','SUPPLIER_UNAVAILABLE','a crew owning the code is unavailable');
select throws_ok($$ select pg_temp.inline_create(7,'{"displayName":"inactive co"}') $$,'P0001','SUPPLIER_UNAVAILABLE','an inactive supplier is unavailable');

select throws_ok($$ select pg_temp.inline_create(8,'{"displayName":"Rollback Co"}','500.0000') $$,'P0001','MATERIAL_ALLOCATION_EXCEEDED','over-allocation still fails');
set local role none;
select is((select count(*)::int from public.business_parties where code='rollbackco'),0,'failed order rolls back the new supplier');
set local role authenticated;

select throws_ok($$ select pg_temp.inline_create(9,'{"taxIdentifier":"0101"}') $$,'P0001','INPUT_INVALID','supplier name is required');
select throws_ok($$ select pg_temp.inline_create(9,'{"code":"suppliera","displayName":"Supplier A"}') $$,'P0001','INPUT_INVALID','clients cannot send a supplier code');
select throws_ok($$ select pg_temp.inline_create(9,'{"displayName":"---"}') $$,'P0001','INPUT_INVALID','a name without letters or digits is rejected');
select throws_ok($$
  select public.c1_material_create_order(
    'c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101','c1300000-0000-4000-8000-000000000401',
    (pg_temp.inline_order(9,'{"displayName":"Supplier A"}') - 'supplier') || jsonb_build_object('supplierId','c1300000-0000-4000-8000-000000000201'),
    'c1300000-0000-4000-8000-000000000699','c1300000-0000-4000-8000-000000000799')
$$,'P0001','INPUT_INVALID','legacy supplierId input is rejected');

select * from finish();
rollback;
