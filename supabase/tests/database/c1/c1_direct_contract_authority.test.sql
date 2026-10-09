begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(40);

-- Rollback-only canonical fixture. The accountant has cash and contract rights,
-- but no request.submit or manager assignment when direct authority is recorded.
insert into auth.users(id,email) values
('c1260000-0000-4000-8000-000000000903','t6-accountant@test.invalid'),
('c1260000-0000-4000-8000-000000000904','t6-director@test.invalid');
insert into public.tenants(id,code,name)
values('c1260000-0000-4000-8000-000000000010','T6MAT','T6 material tenant');
insert into public.companies(id,tenant_id,code,name)
values('c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000010','T6MAT','T6 material company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select actor,'c1260000-0000-4000-8000-000000000010',array['member']
from (values('c1260000-0000-4000-8000-000000000903'::uuid),('c1260000-0000-4000-8000-000000000904'::uuid)) v(actor);
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select actor,'c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020',array['member'],true
from (values('c1260000-0000-4000-8000-000000000903'::uuid),('c1260000-0000-4000-8000-000000000904'::uuid)) v(actor);
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values
('c1260000-0000-4000-8000-000000000913','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','t6_accountant','T6 accountant','test',false),
('c1260000-0000-4000-8000-000000000914','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','t6_director','T6 director','test',false);
insert into public.role_permissions(role_id,permission_code) values
('c1260000-0000-4000-8000-000000000913','material.read'),
('c1260000-0000-4000-8000-000000000913','material.contract.record'),
('c1260000-0000-4000-8000-000000000913','cost.record_cash'),
('c1260000-0000-4000-8000-000000000914','cost.notification.read');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values
('c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000903','c1260000-0000-4000-8000-000000000913','c1260000-0000-4000-8000-000000000904','test'),
('c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000904','c1260000-0000-4000-8000-000000000914','c1260000-0000-4000-8000-000000000904','test');
insert into public.company_cost_settings(company_id,tenant_id,enabled,money_scale,created_by)
values('c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000010',true,4,'c1260000-0000-4000-8000-000000000904');
insert into public.cost_workflow_companies(company_id,tenant_id,mode,notification_recipient_id)
values('c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000010','document_backed_v1','c1260000-0000-4000-8000-000000000904');
insert into public.projects(id,tenant_id,company_id,code,name,location_text,operational_state,origin,created_by)
values('c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','T6-P','T6 project','Site A','active','manual','c1260000-0000-4000-8000-000000000904');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by)
values('c1260000-0000-4000-8000-000000000201','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','T6-S','T6 supplier','organization','c1260000-0000-4000-8000-000000000904');
insert into public.cost_categories(id,tenant_id,company_id,code,name,created_by,updated_by)
values('c1260000-0000-4000-8000-000000000301','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','materials','Materials','c1260000-0000-4000-8000-000000000904','c1260000-0000-4000-8000-000000000904');
insert into public.material_items(id,tenant_id,company_id,code,name,specification,unit,created_by)
values('c1260000-0000-4000-8000-000000000401','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','T6-STEEL','Steel','D10','bag','c1260000-0000-4000-8000-000000000903');
insert into public.material_proposals(id,tenant_id,company_id,project_id,review_state,needed_on,delivery_address,created_by)
values('c1260000-0000-4000-8000-000000000501','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','approved','2026-10-30','Site A','c1260000-0000-4000-8000-000000000903');
insert into public.material_proposal_lines(id,tenant_id,company_id,project_id,proposal_id,material_id,quantity,created_by)
values('c1260000-0000-4000-8000-000000000511','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000501','c1260000-0000-4000-8000-000000000401',20,'c1260000-0000-4000-8000-000000000903');
insert into public.material_proposal_revisions(id,tenant_id,company_id,project_id,proposal_id,revision_no,needed_on,delivery_address,submitted_by)
values('c1260000-0000-4000-8000-000000000521','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000501',1,'2026-10-30','Site A','c1260000-0000-4000-8000-000000000903');
insert into public.material_proposal_revision_lines(revision_id,proposal_line_id,proposal_id,tenant_id,company_id,project_id,material_id,material_name,specification,unit,quantity)
values('c1260000-0000-4000-8000-000000000521','c1260000-0000-4000-8000-000000000511','c1260000-0000-4000-8000-000000000501','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000401','Steel','D10','bag',20);
update public.material_proposals set current_revision_id='c1260000-0000-4000-8000-000000000521',approved_revision_id='c1260000-0000-4000-8000-000000000521'
where id='c1260000-0000-4000-8000-000000000501';

-- Finalized unsigned quotation, two signed order PDFs and a re-upload of
-- the same physical contract bytes for a second order.
insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,
 declared_mime_type,declared_size_bytes,declared_sha256,verified_mime_type,verified_size_bytes,
 verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version)
select evidence_id,'c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020',
 'c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000010/c1260000-0000-4000-8000-000000000020/c1260000-0000-4000-8000-000000000101/'||evidence_id::text,
 filename,'application/pdf',8,hash,'application/pdf',8,hash,'finalized',now()+interval '15 minutes',
 'c1260000-0000-4000-8000-000000000903','c1260000-0000-4000-8000-000000000903',now(),1
from (values
 ('c1260000-0000-4000-8000-000000000701'::uuid,'unsigned-1.pdf',repeat('1',64)),
 ('c1260000-0000-4000-8000-000000000702'::uuid,'unsigned-2.pdf',repeat('2',64)),
 ('c1260000-0000-4000-8000-000000000711'::uuid,'signed-contract-1.pdf',repeat('a',64)),
 ('c1260000-0000-4000-8000-000000000712'::uuid,'signed-contract-2.pdf',repeat('a',64)),
 ('c1260000-0000-4000-8000-000000000721'::uuid,'signed-quotation-1.pdf',repeat('b',64)),
 ('c1260000-0000-4000-8000-000000000722'::uuid,'signed-quotation-2.pdf',repeat('c',64))
) v(evidence_id,filename,hash);
insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,proposal_id,revision_id,evidence_role,created_by)
select evidence_id,'c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020',
 'c1260000-0000-4000-8000-000000000101','material_proposal','c1260000-0000-4000-8000-000000000501',
 'c1260000-0000-4000-8000-000000000521','unsigned_quotation','c1260000-0000-4000-8000-000000000903'
from (values('c1260000-0000-4000-8000-000000000701'::uuid),('c1260000-0000-4000-8000-000000000702'::uuid)) v(evidence_id);
insert into public.material_orders(id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by) values
('c1260000-0000-4000-8000-000000000601','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000501','c1260000-0000-4000-8000-000000000521','c1260000-0000-4000-8000-000000000201','VND','c1260000-0000-4000-8000-000000000701','c1260000-0000-4000-8000-000000000903'),
('c1260000-0000-4000-8000-000000000602','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000501','c1260000-0000-4000-8000-000000000521','c1260000-0000-4000-8000-000000000201','VND','c1260000-0000-4000-8000-000000000702','c1260000-0000-4000-8000-000000000903');
insert into public.material_order_allocations(id,tenant_id,company_id,project_id,order_id,proposal_id,approved_revision_id,proposal_line_id,quantity,unit_price,quotation_material_name,mapping_confirmed) values
('c1260000-0000-4000-8000-000000000611','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000601','c1260000-0000-4000-8000-000000000501','c1260000-0000-4000-8000-000000000521','c1260000-0000-4000-8000-000000000511',10,10,'Supplier steel',true),
('c1260000-0000-4000-8000-000000000612','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000602','c1260000-0000-4000-8000-000000000501','c1260000-0000-4000-8000-000000000521','c1260000-0000-4000-8000-000000000511',10,10,'Supplier steel',true);
insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,order_id,evidence_role,created_by) values
('c1260000-0000-4000-8000-000000000711','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_order','c1260000-0000-4000-8000-000000000601','signed_contract','c1260000-0000-4000-8000-000000000903'),
('c1260000-0000-4000-8000-000000000712','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_order','c1260000-0000-4000-8000-000000000602','signed_contract','c1260000-0000-4000-8000-000000000903'),
('c1260000-0000-4000-8000-000000000721','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_order','c1260000-0000-4000-8000-000000000601','signed_quotation','c1260000-0000-4000-8000-000000000903'),
('c1260000-0000-4000-8000-000000000722','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_order','c1260000-0000-4000-8000-000000000602','signed_quotation','c1260000-0000-4000-8000-000000000903');

-- Canonical legacy contract cap100 / approved window30 / gross paid10.
insert into public.cost_workflow_contracts(id,tenant_id,company_id,project_id,party_id,reference,currency_code,created_by)
values('c1260000-0000-4000-8000-000000000801','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000201','T6-CONTRACT','VND','c1260000-0000-4000-8000-000000000903');
insert into public.cost_workflow_contract_versions(id,tenant_id,company_id,project_id,contract_id,version,cap,evidence_file_ids,basis_state,reviewed_by)
values('c1260000-0000-4000-8000-000000000811','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000801',1,100,array['c1260000-0000-4000-8000-000000000711'::uuid],'reviewed_reference','c1260000-0000-4000-8000-000000000903');
insert into public.cost_workflow_manager_assignments(id,tenant_id,company_id,project_id,manager_user_id,assignment_version,assigned_by,reason)
values('c1260000-0000-4000-8000-000000000821','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000904',1,'c1260000-0000-4000-8000-000000000904','legacy fixture');
insert into public.cost_workflow_requests(id,tenant_id,company_id,project_id,kind,state,party_id,category_id,contract_id,working_input,version,created_by)
values('c1260000-0000-4000-8000-000000000831','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','installment','approved','c1260000-0000-4000-8000-000000000201','c1260000-0000-4000-8000-000000000301','c1260000-0000-4000-8000-000000000801','{}',1,'c1260000-0000-4000-8000-000000000903');
insert into public.cost_workflow_request_versions(id,tenant_id,company_id,project_id,request_id,version,snapshot,amount,currency_code,evidence_file_ids,manager_assignment_id,submitted_by)
values('c1260000-0000-4000-8000-000000000841','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000831',1,'{"basis":{"kind":"materials"}}',30,'VND',array['c1260000-0000-4000-8000-000000000711'::uuid],'c1260000-0000-4000-8000-000000000821','c1260000-0000-4000-8000-000000000903');
update public.cost_workflow_requests set submitted_version_id='c1260000-0000-4000-8000-000000000841'
where id='c1260000-0000-4000-8000-000000000831';
insert into public.cost_workflow_decisions(id,tenant_id,company_id,project_id,submitted_version_id,decision,manager_assignment_id,decided_by)
values('c1260000-0000-4000-8000-000000000851','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000841','approve','c1260000-0000-4000-8000-000000000821','c1260000-0000-4000-8000-000000000904');
insert into public.cost_workflow_installments(id,tenant_id,company_id,project_id,request_id,decision_id,contract_id,contract_version_id,party_id,category_id,authorized_amount,currency_code,approved_at)
values('c1260000-0000-4000-8000-000000000861','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000831','c1260000-0000-4000-8000-000000000851','c1260000-0000-4000-8000-000000000801','c1260000-0000-4000-8000-000000000811','c1260000-0000-4000-8000-000000000201','c1260000-0000-4000-8000-000000000301',30,'VND',now());
insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,
 declared_mime_type,declared_size_bytes,declared_sha256,verified_mime_type,verified_size_bytes,
 verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version,
 workflow_origin,workflow_target_kind,workflow_target_id,workflow_evidence_kind)
values('c1260000-0000-4000-8000-000000000881','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000010/c1260000-0000-4000-8000-000000000020/c1260000-0000-4000-8000-000000000101/c1260000-0000-4000-8000-000000000881',
 'old-proof.pdf','application/pdf',8,repeat('e',64),'application/pdf',8,repeat('e',64),'finalized',now()+interval '15 minutes','c1260000-0000-4000-8000-000000000903','c1260000-0000-4000-8000-000000000903',now(),1,true,'payment','c1260000-0000-4000-8000-000000000861','payment_proof');
insert into public.cost_workflow_payments(id,tenant_id,company_id,project_id,installment_id,cash_kind,ordinary_amount,currency_code,payment_date,reference,evidence_file_ids,confirmed_by,cash_event_hash)
values('c1260000-0000-4000-8000-000000000871','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000861','ordinary',10,'VND','2026-10-08','old transfer',array['c1260000-0000-4000-8000-000000000881'::uuid],'c1260000-0000-4000-8000-000000000903',repeat('d',64));
insert into public.cost_workflow_consumptions(tenant_id,company_id,project_id,installment_id,payment_id,amount)
values('c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000861','c1260000-0000-4000-8000-000000000871',10);
insert into public.cost_workflow_cash_states(payment_id,tenant_id,company_id,project_id)
values('c1260000-0000-4000-8000-000000000871','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101');
insert into public.cost_workflow_cash_proof_claims(tenant_id,company_id,project_id,proof_sha256,payment_id)
values('c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',repeat('e',64),'c1260000-0000-4000-8000-000000000871');
create temporary table t6_results(name text primary key,body jsonb);
grant select,insert,update on t6_results to authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select is(jsonb_array_length(public.c1_material_list_eligible_contracts(
 'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000601')),1,'only the scoped matching canonical contract is eligible');
select throws_ok($$
 select public.c1_material_record_contract(
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  'c1260000-0000-4000-8000-000000000601',
  jsonb_build_object('expectedOrderVersion',1,'contractReference','T6-CONTRACT','signedValue','100.0000',
   'currencyCode','VND','signedContractEvidenceFileId','c1260000-0000-4000-8000-000000000711',
   'signedQuotationEvidenceFileId','c1260000-0000-4000-8000-000000000701','documentsReviewed',true,
   'existingContractId','c1260000-0000-4000-8000-000000000801'),
  'c1260000-0000-4000-8000-000000000911','c1260000-0000-4000-8000-000000000991')
$$,'P0001','EVIDENCE_UPLOAD_MISMATCH','unsigned quotation cannot fill signed quotation role');
insert into t6_results(name,body)
select 'record',public.c1_material_record_contract(
 'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000601',
 jsonb_build_object('expectedOrderVersion',1,'contractReference','T6-CONTRACT','signedValue','100.0000',
  'currencyCode','VND','signedContractEvidenceFileId','c1260000-0000-4000-8000-000000000711',
  'signedQuotationEvidenceFileId','c1260000-0000-4000-8000-000000000721','documentsReviewed',true,
  'existingContractId','c1260000-0000-4000-8000-000000000801'),
 'c1260000-0000-4000-8000-000000000912','c1260000-0000-4000-8000-000000000992');
select is((select body->>'contractId' from t6_results where name='record'),
 'c1260000-0000-4000-8000-000000000801','record binds exactly the selected canonical contract');
select is(public.c1_material_read_order(
 'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000601')#>>'{cash,availableToPay}',
 '90.0000','legacy cap100/approved30/paid10 opens direct available90');
select is((select opening_gross::text from public.material_contract_absorptions
 where old_installment_id='c1260000-0000-4000-8000-000000000861'),
 '10.0000','absorption records only gross paid10 and retires unused old20');
select ok((select authority_source='direct_authorization' and request_id is null and decision_id is null
 from public.cost_workflow_installments where id=(select (body->>'installmentId')::uuid from t6_results where name='record')),
 'direct window has no dummy request or manager decision');
select is(public.c1_material_record_contract(
 'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000601',
 jsonb_build_object('expectedOrderVersion',1,'contractReference','T6-CONTRACT','signedValue','100.0000',
  'currencyCode','VND','signedContractEvidenceFileId','c1260000-0000-4000-8000-000000000711',
  'signedQuotationEvidenceFileId','c1260000-0000-4000-8000-000000000721','documentsReviewed',true,
  'existingContractId','c1260000-0000-4000-8000-000000000801'),
 'c1260000-0000-4000-8000-000000000912','c1260000-0000-4000-8000-000000000992')->>'replayed',
 'true','same key and payload replay signed authority without another commitment');
select throws_ok($$
 select public.c1_material_record_contract(
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  'c1260000-0000-4000-8000-000000000601',
  jsonb_build_object('expectedOrderVersion',1,'contractReference','CHANGED','signedValue','100.0000',
   'currencyCode','VND','signedContractEvidenceFileId','c1260000-0000-4000-8000-000000000711',
   'signedQuotationEvidenceFileId','c1260000-0000-4000-8000-000000000721','documentsReviewed',true,
   'existingContractId','c1260000-0000-4000-8000-000000000801'),
  'c1260000-0000-4000-8000-000000000912','c1260000-0000-4000-8000-000000000992')
$$,'P0001','IDEMPOTENCY_CONFLICT','changed payload with same key conflicts');
set local role none;
delete from public.role_permissions where role_id='c1260000-0000-4000-8000-000000000913' and permission_code='material.read';
set local role authenticated;
select throws_ok($$
 select public.c1_material_record_contract(
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  'c1260000-0000-4000-8000-000000000601',
  jsonb_build_object('expectedOrderVersion',1,'contractReference','T6-CONTRACT','signedValue','100.0000',
   'currencyCode','VND','signedContractEvidenceFileId','c1260000-0000-4000-8000-000000000711',
   'signedQuotationEvidenceFileId','c1260000-0000-4000-8000-000000000721','documentsReviewed',true,
   'existingContractId','c1260000-0000-4000-8000-000000000801'),
  'c1260000-0000-4000-8000-000000000912','c1260000-0000-4000-8000-000000000992')
$$,'P0001','PERMISSION_DENIED','raw RPC replay still requires material.read');
set local role none;
insert into public.role_permissions(role_id,permission_code)
values('c1260000-0000-4000-8000-000000000913','material.read');
select lives_ok($$
 select private.c1_workflow_cap_floor('c1260000-0000-4000-8000-000000000010',
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  'c1260000-0000-4000-8000-000000000801',110)
$$,'approved cap110 is allowed after old30 is retired; signed cash still caps at100');
select throws_ok($$
 select private.c1_workflow_cap_floor('c1260000-0000-4000-8000-000000000010',
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  'c1260000-0000-4000-8000-000000000801',90)
$$,'P0001','CONTRACT_CAP_EXCEEDED','cap90 cannot reduce below immutable direct100');
select throws_ok($$
 select private.c1_workflow_require_cap('c1260000-0000-4000-8000-000000000010',
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  'c1260000-0000-4000-8000-000000000801',1)
$$,'P0001','CONTRACT_CAP_EXCEEDED','generic manager window cannot reopen same direct material contract');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok($$
 select public.c1_material_record_contract(
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  'c1260000-0000-4000-8000-000000000602',
  jsonb_build_object('expectedOrderVersion',1,'contractReference','T6-SECOND','signedValue','100.0000',
   'currencyCode','VND','signedContractEvidenceFileId','c1260000-0000-4000-8000-000000000712',
   'signedQuotationEvidenceFileId','c1260000-0000-4000-8000-000000000722','documentsReviewed',true),
  'c1260000-0000-4000-8000-000000000913','c1260000-0000-4000-8000-000000000993')
$$,'P0001','MATERIAL_CONTRACT_SOURCE_CONFLICT','reuploaded signed-contract hash cannot fund another order');

-- A source with no contract/quotation classification in old canonical history
-- is unresolved. It cannot silently become another order's signed authority.
set local role none;
insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,
 declared_mime_type,declared_size_bytes,declared_sha256,verified_mime_type,verified_size_bytes,
 verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version)
select evidence_id,'c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020',
 'c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000010/c1260000-0000-4000-8000-000000000020/c1260000-0000-4000-8000-000000000101/'||evidence_id::text,
 filename,'application/pdf',8,repeat('d',64),'application/pdf',8,repeat('d',64),'finalized',now()+interval '15 minutes',
 'c1260000-0000-4000-8000-000000000903','c1260000-0000-4000-8000-000000000903',now(),1
from (values
 ('c1260000-0000-4000-8000-000000000790'::uuid,'untyped-old-reference.pdf'),
 ('c1260000-0000-4000-8000-000000000713'::uuid,'reuploaded-untyped-source.pdf')
) v(evidence_id,filename);
insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,order_id,evidence_role,created_by)
values('c1260000-0000-4000-8000-000000000713','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_order','c1260000-0000-4000-8000-000000000602','signed_contract','c1260000-0000-4000-8000-000000000903');
insert into public.cost_workflow_contracts(id,tenant_id,company_id,project_id,party_id,reference,currency_code,created_by)
values('c1260000-0000-4000-8000-000000000804','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000201','T6-UNTYPED','VND','c1260000-0000-4000-8000-000000000903');
insert into public.cost_workflow_contract_versions(id,tenant_id,company_id,project_id,contract_id,version,cap,evidence_file_ids,basis_state,reviewed_by)
values('c1260000-0000-4000-8000-000000000814','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000804',1,100,array['c1260000-0000-4000-8000-000000000790'::uuid],'reviewed_reference','c1260000-0000-4000-8000-000000000903');
select ok(private.c1_material_ambiguous_legacy_source('c1260000-0000-4000-8000-000000000790'),
 'unclassified old canonical reference is explicitly ambiguous');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok($$
 select public.c1_material_record_contract(
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  'c1260000-0000-4000-8000-000000000602',
  jsonb_build_object('expectedOrderVersion',1,'contractReference','T6-UNRESOLVED','signedValue','100.0000',
   'currencyCode','VND','signedContractEvidenceFileId','c1260000-0000-4000-8000-000000000713',
   'signedQuotationEvidenceFileId','c1260000-0000-4000-8000-000000000722','documentsReviewed',true),
  'c1260000-0000-4000-8000-000000000919','c1260000-0000-4000-8000-000000000999')
$$,'P0001','MATERIAL_CONTRACT_SOURCE_CONFLICT','unclassified exact source requires explicit legacy review');

-- The old workflow's generic contract kind is a canonical source fact, not an
-- attestation that the document is signed. The human selects its exact identity.
set local role none;
insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,
 declared_mime_type,declared_size_bytes,declared_sha256,verified_mime_type,verified_size_bytes,
 verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version,
 workflow_origin,workflow_target_kind,workflow_evidence_kind)
values('c1260000-0000-4000-8000-000000000791','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000010/c1260000-0000-4000-8000-000000000020/c1260000-0000-4000-8000-000000000101/c1260000-0000-4000-8000-000000000791',
 'legacy-contract-kind.pdf','application/pdf',8,repeat('8',64),'application/pdf',8,repeat('8',64),'finalized',now()+interval '15 minutes','c1260000-0000-4000-8000-000000000903','c1260000-0000-4000-8000-000000000903',now(),1,true,'request','contract');
insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,
 declared_mime_type,declared_size_bytes,declared_sha256,verified_mime_type,verified_size_bytes,
 verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version)
values('c1260000-0000-4000-8000-000000000714','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000010/c1260000-0000-4000-8000-000000000020/c1260000-0000-4000-8000-000000000101/c1260000-0000-4000-8000-000000000714',
 'reviewed-signed-contract.pdf','application/pdf',8,repeat('8',64),'application/pdf',8,repeat('8',64),'finalized',now()+interval '15 minutes','c1260000-0000-4000-8000-000000000903','c1260000-0000-4000-8000-000000000903',now(),1);
insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,order_id,evidence_role,created_by)
values('c1260000-0000-4000-8000-000000000714','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','material_order','c1260000-0000-4000-8000-000000000602','signed_contract','c1260000-0000-4000-8000-000000000903');
insert into public.cost_workflow_contracts(id,tenant_id,company_id,project_id,party_id,reference,currency_code,created_by)
values('c1260000-0000-4000-8000-000000000805','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000201','T6-GENERIC','VND','c1260000-0000-4000-8000-000000000903');
insert into public.cost_workflow_contract_versions(id,tenant_id,company_id,project_id,contract_id,version,cap,evidence_file_ids,basis_state,reviewed_by)
values('c1260000-0000-4000-8000-000000000815','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000805',1,100,array['c1260000-0000-4000-8000-000000000791'::uuid],'reviewed_reference','c1260000-0000-4000-8000-000000000903');
select ok(not private.c1_material_explicit_signed_source('c1260000-0000-4000-8000-000000000791')
 and private.c1_material_legacy_contract_source_fact('c1260000-0000-4000-8000-000000000791'),
 'legacy contract-kind association is not signed attestation');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok($$
 select public.c1_material_record_contract(
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  'c1260000-0000-4000-8000-000000000602',
  jsonb_build_object('expectedOrderVersion',1,'contractReference','T6-GENERIC','signedValue','100.0000',
   'currencyCode','VND','signedContractEvidenceFileId','c1260000-0000-4000-8000-000000000714',
   'signedQuotationEvidenceFileId','c1260000-0000-4000-8000-000000000722','documentsReviewed',true),
  'c1260000-0000-4000-8000-000000000920','c1260000-0000-4000-8000-0000000009a0')
$$,'P0001','MATERIAL_CONTRACT_SOURCE_CONFLICT','generic old contract source cannot auto-associate by hash');
insert into t6_results(name,body)
select 'generic-link',public.c1_material_record_contract(
 'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000602',
 jsonb_build_object('expectedOrderVersion',1,'contractReference','T6-GENERIC','signedValue','100.0000',
  'currencyCode','VND','signedContractEvidenceFileId','c1260000-0000-4000-8000-000000000714',
  'signedQuotationEvidenceFileId','c1260000-0000-4000-8000-000000000722','documentsReviewed',true,
  'existingContractId','c1260000-0000-4000-8000-000000000805'),
 'c1260000-0000-4000-8000-000000000921','c1260000-0000-4000-8000-0000000009a1');
select is((select body->>'contractId' from t6_results where name='generic-link'),
 'c1260000-0000-4000-8000-000000000805',
 'explicit exact canonical contract identity resolves generic source without guessing signature');

set local role none;
insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,
 declared_mime_type,declared_size_bytes,declared_sha256,verified_mime_type,verified_size_bytes,
 verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version,
 workflow_origin,workflow_target_kind,workflow_target_id,workflow_evidence_kind)
select evidence_id,'c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020',
 'c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000010/c1260000-0000-4000-8000-000000000020/c1260000-0000-4000-8000-000000000101/'||evidence_id::text,
 filename,'application/pdf',8,hash,'application/pdf',8,hash,'finalized',now()+interval '15 minutes',
 'c1260000-0000-4000-8000-000000000903','c1260000-0000-4000-8000-000000000903',now(),1,
 true,'payment',(select (body->>'installmentId')::uuid from t6_results where name='record'),kind
from (values
 ('c1260000-0000-4000-8000-000000000891'::uuid,'invoice.pdf',repeat('3',64),'invoice'),
 ('c1260000-0000-4000-8000-000000000892'::uuid,'proof-30.pdf',repeat('4',64),'payment_proof'),
 ('c1260000-0000-4000-8000-000000000893'::uuid,'proof-60.pdf',repeat('5',64),'payment_proof'),
 ('c1260000-0000-4000-8000-000000000894'::uuid,'proof-overcap.pdf',repeat('6',64),'payment_proof')
) v(evidence_id,filename,hash,kind);
insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,
 declared_mime_type,declared_size_bytes,declared_sha256,intent_expires_at,created_by,
 workflow_origin,workflow_target_kind,workflow_target_id,workflow_evidence_kind)
values('c1260000-0000-4000-8000-000000000896','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000010/c1260000-0000-4000-8000-000000000020/c1260000-0000-4000-8000-000000000101/c1260000-0000-4000-8000-000000000896',
 'pending-proof.pdf','application/pdf',8,repeat('7',64),now()+interval '15 minutes','c1260000-0000-4000-8000-000000000903',
 true,'payment',(select (body->>'installmentId')::uuid from t6_results where name='record'),'payment_proof');
insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,
 declared_mime_type,declared_size_bytes,declared_sha256,verified_mime_type,verified_size_bytes,
 verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version,
 workflow_origin,workflow_target_kind,workflow_target_id,workflow_evidence_kind)
values('c1260000-0000-4000-8000-000000000895','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000010/c1260000-0000-4000-8000-000000000020/c1260000-0000-4000-8000-000000000101/c1260000-0000-4000-8000-000000000895',
 'other-actor-proof.pdf','application/pdf',8,repeat('a',64),'application/pdf',8,repeat('a',64),'finalized',now()+interval '15 minutes','c1260000-0000-4000-8000-000000000904','c1260000-0000-4000-8000-000000000904',now(),1,
 true,'payment',(select (body->>'installmentId')::uuid from t6_results where name='record'),'payment_proof');
select ok(private.c1_material_evidence_file('c1260000-0000-4000-8000-000000000892'),
 'direct payment proof is in closed material namespace');
select throws_ok($$
 select private.c1_workflow_require_evidence('c1260000-0000-4000-8000-000000000010',
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  array['c1260000-0000-4000-8000-000000000892'::uuid])
$$,'P0001','EVIDENCE_UPLOAD_MISMATCH','generic workflow validator cannot reuse direct material proof');
select throws_ok($$
 select private.c1_material_require_direct_payment_proofs('c1260000-0000-4000-8000-000000000010',
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  (select (body->>'installmentId')::uuid from t6_results where name='record'),
  array['c1260000-0000-4000-8000-000000000891'::uuid])
$$,'P0001','CASH_PROOF_REQUIRED','invoice purpose cannot satisfy bank-proof requirement');
select throws_ok($$
 select private.c1_material_require_direct_payment_proofs('c1260000-0000-4000-8000-000000000010',
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  (select (body->>'installmentId')::uuid from t6_results where name='record'),
  array['c1260000-0000-4000-8000-000000000895'::uuid])
$$,'P0001','CASH_PROOF_REQUIRED','another creator cannot supply direct payment proof');
select throws_ok($$
 select private.c1_material_require_direct_payment_proofs('c1260000-0000-4000-8000-000000000010',
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  (select (body->>'installmentId')::uuid from t6_results where name='record'),
  array['c1260000-0000-4000-8000-000000000896'::uuid])
$$,'P0001','CASH_PROOF_REQUIRED','pending proof cannot fund direct payment');
select throws_ok($$
 select private.c1_material_require_direct_payment_proofs('c1260000-0000-4000-8000-000000000010',
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  (select (body->>'installmentId')::uuid from t6_results where name='record'),
  array['c1260000-0000-4000-8000-000000000881'::uuid])
$$,'P0001','CASH_PROOF_REQUIRED','legacy proof for another window cannot fund direct payment');
select lives_ok($$
 select private.c1_material_require_direct_payment_proofs('c1260000-0000-4000-8000-000000000010',
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  (select (body->>'installmentId')::uuid from t6_results where name='record'),
  array['c1260000-0000-4000-8000-000000000892'::uuid])
$$,'finalized proof with exact actor/window is accepted');
select ok(private.c1_material_can_upload_direct_evidence('c1260000-0000-4000-8000-000000000896'),
 'pending direct proof uploader needs only cost.record_cash and exact creator');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok($$
 select public.c1_workflow_confirm_payment(
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  (select (body->>'installmentId')::uuid from t6_results where name='record'),
  jsonb_build_object('amount','30.0000','currencyCode','VND','paymentDate','2026-10-09',
   'reference','transfer 30','evidenceFileIds',jsonb_build_array('c1260000-0000-4000-8000-000000000892'),
   'expectedVersion',0,'invoiceNames',jsonb_build_array(jsonb_build_object(
    'orderLineId','c1260000-0000-4000-8000-000000000611','name','Supplier steel'))),
  'c1260000-0000-4000-8000-000000000914','c1260000-0000-4000-8000-000000000994')
$$,'P0001','INPUT_INVALID','direct payment requires a separate invoice file ID');
insert into t6_results(name,body)
select 'payment30',public.c1_workflow_confirm_payment(
 'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 (select (body->>'installmentId')::uuid from t6_results where name='record'),
 jsonb_build_object('amount','30.0000','currencyCode','VND','paymentDate','2026-10-09',
  'reference','transfer 30','evidenceFileIds',jsonb_build_array('c1260000-0000-4000-8000-000000000892'),
  'expectedVersion',0,'invoiceEvidenceFileId','c1260000-0000-4000-8000-000000000891',
  'invoiceNames',jsonb_build_array(jsonb_build_object('orderLineId','c1260000-0000-4000-8000-000000000611','name','Supplier steel'))),
 'c1260000-0000-4000-8000-000000000914','c1260000-0000-4000-8000-000000000994');
select ok((select body->>'paymentId' is not null from t6_results where name='payment30'),
 'direct canonical cash succeeds without cost.request.submit');
insert into t6_results(name,body)
select 'payment60',public.c1_workflow_confirm_payment(
 'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 (select (body->>'installmentId')::uuid from t6_results where name='record'),
 jsonb_build_object('amount','60.0000','currencyCode','VND','paymentDate','2026-10-09',
  'reference','transfer 60','evidenceFileIds',jsonb_build_array('c1260000-0000-4000-8000-000000000893'),
  'expectedVersion',1,'invoiceEvidenceFileId','c1260000-0000-4000-8000-000000000891',
  'invoiceNames',jsonb_build_array(jsonb_build_object('orderLineId','c1260000-0000-4000-8000-000000000611','name','Supplier steel'))),
 'c1260000-0000-4000-8000-000000000915','c1260000-0000-4000-8000-000000000995');
select is((select count(*)::integer from public.material_payment_invoices
 where invoice_evidence_file_id='c1260000-0000-4000-8000-000000000891'),2,
 'one invoice may support two partial payments; bank proofs remain per payment');
select is(public.c1_workflow_confirm_payment(
 'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 (select (body->>'installmentId')::uuid from t6_results where name='record'),
 jsonb_build_object('amount','30.0000','currencyCode','VND','paymentDate','2026-10-09',
  'reference','transfer 30','evidenceFileIds',jsonb_build_array('c1260000-0000-4000-8000-000000000892'),
  'expectedVersion',0,'invoiceEvidenceFileId','c1260000-0000-4000-8000-000000000891',
  'invoiceNames',jsonb_build_array(jsonb_build_object('orderLineId','c1260000-0000-4000-8000-000000000611','name','Supplier steel'))),
 'c1260000-0000-4000-8000-000000000914','c1260000-0000-4000-8000-000000000994')->>'replayed',
 'true','exact payment retry returns first receipt after later partial payment');
select throws_ok($$
 select public.c1_workflow_confirm_payment(
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  (select (body->>'installmentId')::uuid from t6_results where name='record'),
  jsonb_build_object('amount','1.0000','currencyCode','VND','paymentDate','2026-10-09',
   'reference','over cap','evidenceFileIds',jsonb_build_array('c1260000-0000-4000-8000-000000000894'),
   'expectedVersion',2,'invoiceEvidenceFileId','c1260000-0000-4000-8000-000000000891',
   'invoiceNames',jsonb_build_array(jsonb_build_object('orderLineId','c1260000-0000-4000-8000-000000000611','name','Supplier steel'))),
  'c1260000-0000-4000-8000-000000000916','c1260000-0000-4000-8000-000000000996')
$$,'P0001','CASH_AUTHORITY_EXCEEDED','gross legacy10+direct30+60 exhausts signed100');
select is(public.c1_material_read_order(
 'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000601')#>>'{cash,availableToPay}',
 '0.0000','direct order reports no remaining authority');

set local role none;
select ok(not private.c1_material_explicit_signed_source('c1260000-0000-4000-8000-000000000721')
 and private.c1_material_explicit_signed_source('c1260000-0000-4000-8000-000000000711'),
 'typed quotation remains reusable while signed-contract bytes are claimed');
insert into public.cost_workflow_contracts(id,tenant_id,company_id,project_id,party_id,reference,currency_code,created_by)
values('c1260000-0000-4000-8000-000000000802','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000201','T6-QUOTE-REUSE','VND','c1260000-0000-4000-8000-000000000903');
select lives_ok($$
 insert into public.cost_workflow_contract_versions(id,tenant_id,company_id,project_id,contract_id,version,cap,evidence_file_ids,basis_state,reviewed_by)
 values('c1260000-0000-4000-8000-000000000812','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000802',1,50,array['c1260000-0000-4000-8000-000000000721'::uuid],'reviewed_reference','c1260000-0000-4000-8000-000000000903')
$$,'another contract may cite the same quotation without taking signed source');
insert into public.cost_workflow_contracts(id,tenant_id,company_id,project_id,party_id,reference,currency_code,created_by)
values('c1260000-0000-4000-8000-000000000803','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000201','T6-SOURCE-REUSE','VND','c1260000-0000-4000-8000-000000000903');
select throws_ok($$
 insert into public.cost_workflow_contract_versions(id,tenant_id,company_id,project_id,contract_id,version,cap,evidence_file_ids,basis_state,reviewed_by)
 values('c1260000-0000-4000-8000-000000000813','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000803',1,50,array['c1260000-0000-4000-8000-000000000712'::uuid],'reviewed_reference','c1260000-0000-4000-8000-000000000903')
$$,'P0001','MATERIAL_CONTRACT_SOURCE_CONFLICT','typed signed source cannot enter a second legacy canonical contract');
insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,
 declared_mime_type,declared_size_bytes,declared_sha256,verified_mime_type,verified_size_bytes,
 verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version,
 workflow_origin,workflow_target_kind,workflow_target_id,workflow_evidence_kind)
values('c1260000-0000-4000-8000-000000000897','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000010/c1260000-0000-4000-8000-000000000020/c1260000-0000-4000-8000-000000000101/c1260000-0000-4000-8000-000000000897',
 'old-window-new-proof.pdf','application/pdf',8,repeat('9',64),'application/pdf',8,repeat('9',64),'finalized',now()+interval '15 minutes','c1260000-0000-4000-8000-000000000903','c1260000-0000-4000-8000-000000000903',now(),1,true,'payment','c1260000-0000-4000-8000-000000000861','payment_proof');
insert into public.role_permissions(role_id,permission_code)
values('c1260000-0000-4000-8000-000000000913','cost.request.submit');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok($$
 select public.c1_workflow_confirm_payment(
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  'c1260000-0000-4000-8000-000000000861',
  jsonb_build_object('amount','1.0000','currencyCode','VND','paymentDate','2026-10-09',
   'reference','retired window','evidenceFileIds',jsonb_build_array('c1260000-0000-4000-8000-000000000897'),
   'expectedVersion',1),
  'c1260000-0000-4000-8000-000000000917','c1260000-0000-4000-8000-000000000997')
$$,'P0001','CASH_AUTHORITY_EXCEEDED','retired legacy window rejects new cash even with submit permission');
select is((select count(*)::integer from public.cost_workflow_consumptions
 where installment_id='c1260000-0000-4000-8000-000000000861'),1,
 'retired-window rejection leaves legacy payment and consumption immutable');
set local role none;
update public.company_cost_settings set enabled=false
where company_id='c1260000-0000-4000-8000-000000000020';
set local role authenticated;
select throws_ok($$
 select public.c1_workflow_confirm_payment(
  'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
  (select (body->>'installmentId')::uuid from t6_results where name='record'),
  jsonb_build_object('amount','1.0000','currencyCode','VND','paymentDate','2026-10-09',
   'reference','no settings','evidenceFileIds',jsonb_build_array('c1260000-0000-4000-8000-000000000894'),
   'expectedVersion',2,'invoiceEvidenceFileId','c1260000-0000-4000-8000-000000000891',
   'invoiceNames',jsonb_build_array(jsonb_build_object('orderLineId','c1260000-0000-4000-8000-000000000611','name','Supplier steel'))),
  'c1260000-0000-4000-8000-000000000918','c1260000-0000-4000-8000-000000000998')
$$,'P0001','WORKFLOW_CONFIGURATION_REQUIRED','missing money scale is controlled before amount parsing');
set local role none;
update public.company_cost_settings set enabled=true
where company_id='c1260000-0000-4000-8000-000000000020';

-- Approved refund and downward correction keep their existing request/decision
-- history. They change net cash but never delete gross consumption.
insert into public.cost_workflow_requests(id,tenant_id,company_id,project_id,kind,state,party_id,source_payment_id,working_input,version,created_by) values
('c1260000-0000-4000-8000-000000000832','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','refund','approved','c1260000-0000-4000-8000-000000000201',(select (body->>'paymentId')::uuid from t6_results where name='payment30'),'{}',1,'c1260000-0000-4000-8000-000000000903'),
('c1260000-0000-4000-8000-000000000833','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','correction','approved','c1260000-0000-4000-8000-000000000201',(select (body->>'paymentId')::uuid from t6_results where name='payment60'),'{}',1,'c1260000-0000-4000-8000-000000000903');
insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,
 declared_mime_type,declared_size_bytes,declared_sha256,verified_mime_type,verified_size_bytes,
 verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version,
 workflow_origin,workflow_target_kind,workflow_target_id,workflow_evidence_kind)
select evidence_id,'c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020',
 'c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000010/c1260000-0000-4000-8000-000000000020/c1260000-0000-4000-8000-000000000101/'||evidence_id::text,
 filename,'application/pdf',8,hash,'application/pdf',8,hash,'finalized',now()+interval '15 minutes',
 'c1260000-0000-4000-8000-000000000903','c1260000-0000-4000-8000-000000000903',now(),1,
 true,'adjustment',request_id,kind
from (values
 ('c1260000-0000-4000-8000-000000000898'::uuid,'refund-proof.pdf',repeat('f',64),'c1260000-0000-4000-8000-000000000832'::uuid,'payment_proof'),
 ('c1260000-0000-4000-8000-000000000899'::uuid,'correction-support.pdf',repeat('0',64),'c1260000-0000-4000-8000-000000000833'::uuid,'accounting_support')
) v(evidence_id,filename,hash,request_id,kind);
insert into public.cost_workflow_request_versions(id,tenant_id,company_id,project_id,request_id,version,snapshot,amount,currency_code,evidence_file_ids,manager_assignment_id,submitted_by) values
('c1260000-0000-4000-8000-000000000842','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000832',1,'{"kind":"refund","requestedAmount":"20.0000","expectedVersion":0}',20,'VND',array['c1260000-0000-4000-8000-000000000898'::uuid],'c1260000-0000-4000-8000-000000000821','c1260000-0000-4000-8000-000000000903'),
('c1260000-0000-4000-8000-000000000843','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000833',1,'{"kind":"correction","correctedOutgoing":"50.0000","expectedVersion":0}',50,'VND',array['c1260000-0000-4000-8000-000000000899'::uuid],'c1260000-0000-4000-8000-000000000821','c1260000-0000-4000-8000-000000000903');
update public.cost_workflow_requests set submitted_version_id=case id
 when 'c1260000-0000-4000-8000-000000000832' then 'c1260000-0000-4000-8000-000000000842'::uuid
 else 'c1260000-0000-4000-8000-000000000843'::uuid end
where id in('c1260000-0000-4000-8000-000000000832','c1260000-0000-4000-8000-000000000833');
insert into public.cost_workflow_decisions(id,tenant_id,company_id,project_id,submitted_version_id,decision,manager_assignment_id,decided_by) values
('c1260000-0000-4000-8000-000000000852','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000842','approve','c1260000-0000-4000-8000-000000000821','c1260000-0000-4000-8000-000000000904'),
('c1260000-0000-4000-8000-000000000853','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101','c1260000-0000-4000-8000-000000000843','approve','c1260000-0000-4000-8000-000000000821','c1260000-0000-4000-8000-000000000904');
insert into public.cost_workflow_refunds(id,tenant_id,company_id,project_id,source_payment_id,request_id,decision_id,amount,received_date,evidence_file_ids,confirmed_by,cash_event_hash)
values('c1260000-0000-4000-8000-000000000872','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',(select (body->>'paymentId')::uuid from t6_results where name='payment30'),'c1260000-0000-4000-8000-000000000832','c1260000-0000-4000-8000-000000000852',20,'2026-10-09',array['c1260000-0000-4000-8000-000000000898'::uuid],'c1260000-0000-4000-8000-000000000903',repeat('8',64));
insert into public.cost_workflow_cash_proof_claims(tenant_id,company_id,project_id,proof_sha256,refund_id)
values('c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',repeat('f',64),'c1260000-0000-4000-8000-000000000872');
insert into public.cost_workflow_corrections(id,tenant_id,company_id,project_id,source_payment_id,request_id,decision_id,corrected_outgoing,evidence_file_ids,applied_by,event_sequence)
values('c1260000-0000-4000-8000-000000000874','c1260000-0000-4000-8000-000000000010','c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',(select (body->>'paymentId')::uuid from t6_results where name='payment60'),'c1260000-0000-4000-8000-000000000833','c1260000-0000-4000-8000-000000000853',50,array['c1260000-0000-4000-8000-000000000899'::uuid],'c1260000-0000-4000-8000-000000000903',1);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1260000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select is(public.c1_material_read_order(
 'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000601')#>>'{cash,availableToPay}',
 '0.0000','refund and correction do not reopen signed gross capacity');
select is(public.c1_material_read_order(
 'c1260000-0000-4000-8000-000000000020','c1260000-0000-4000-8000-000000000101',
 'c1260000-0000-4000-8000-000000000601')#>>'{cash,grossPaid}',
 '100.0000','gross consumed remains100 despite corrected net cash');
select * from finish();
rollback;
