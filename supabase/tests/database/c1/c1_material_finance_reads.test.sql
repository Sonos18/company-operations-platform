begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(47);

-- Fixture prefix c128. Company A: buyer, accountants, treasurer, requester and two
-- notification-only members. Company B (separate tenant): one accountant with its own contract.
insert into auth.users(id,email) values
('c1280000-0000-4000-8000-000000000902','reads-buyer@test.invalid'),
('c1280000-0000-4000-8000-000000000903','reads-accountant@test.invalid'),
('c1280000-0000-4000-8000-000000000904','reads-treasurer@test.invalid'),
('c1280000-0000-4000-8000-000000000905','reads-requester@test.invalid'),
('c1280000-0000-4000-8000-000000000906','reads-accountant-b@test.invalid'),
('c1280000-0000-4000-8000-000000000907','reads-notified-one@test.invalid'),
('c1280000-0000-4000-8000-000000000908','reads-notified-two@test.invalid'),
('c1280000-0000-4000-8000-000000000909','reads-accountant-two@test.invalid');
insert into public.tenants(id,code,name) values
('c1280000-0000-4000-8000-000000000010','C1RA','Reads tenant A'),
('c1280000-0000-4000-8000-000000000011','C1RB','Reads tenant B');
insert into public.companies(id,tenant_id,code,name) values
('c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000010','C1RA','Reads company A'),
('c1280000-0000-4000-8000-000000000021','c1280000-0000-4000-8000-000000000011','C1RB','Reads company B');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select member.user_id,'c1280000-0000-4000-8000-000000000010',array['member']
from (values ('c1280000-0000-4000-8000-000000000902'::uuid),('c1280000-0000-4000-8000-000000000903'::uuid),('c1280000-0000-4000-8000-000000000904'::uuid),('c1280000-0000-4000-8000-000000000905'::uuid),('c1280000-0000-4000-8000-000000000907'::uuid),('c1280000-0000-4000-8000-000000000908'::uuid),('c1280000-0000-4000-8000-000000000909'::uuid)) as member(user_id);
insert into public.tenant_memberships(user_id,tenant_id,roles) values ('c1280000-0000-4000-8000-000000000906','c1280000-0000-4000-8000-000000000011',array['member']);
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select member.user_id,'c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020',array['member'],true
from (values ('c1280000-0000-4000-8000-000000000902'::uuid),('c1280000-0000-4000-8000-000000000903'::uuid),('c1280000-0000-4000-8000-000000000904'::uuid),('c1280000-0000-4000-8000-000000000905'::uuid),('c1280000-0000-4000-8000-000000000907'::uuid),('c1280000-0000-4000-8000-000000000908'::uuid),('c1280000-0000-4000-8000-000000000909'::uuid)) as member(user_id);
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
values ('c1280000-0000-4000-8000-000000000906','c1280000-0000-4000-8000-000000000011','c1280000-0000-4000-8000-000000000021',array['member'],true);
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values
('c1280000-0000-4000-8000-000000000912','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','reads_buyer','Reads buyer','test',false),
('c1280000-0000-4000-8000-000000000913','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','reads_accountant','Reads accountant','test',false),
('c1280000-0000-4000-8000-000000000914','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','reads_treasurer','Reads treasurer','test',false),
('c1280000-0000-4000-8000-000000000915','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','reads_requester','Reads requester','test',false),
('c1280000-0000-4000-8000-000000000916','c1280000-0000-4000-8000-000000000011','c1280000-0000-4000-8000-000000000021','reads_accountant_b','Reads accountant B','test',false);
insert into public.role_permissions(role_id,permission_code) values
('c1280000-0000-4000-8000-000000000912','material.read'),
('c1280000-0000-4000-8000-000000000912','material.order.manage'),
('c1280000-0000-4000-8000-000000000913','material.read'),
('c1280000-0000-4000-8000-000000000913','material.contract.record'),
('c1280000-0000-4000-8000-000000000913','material.finance.read'),
('c1280000-0000-4000-8000-000000000914','material.read'),
('c1280000-0000-4000-8000-000000000914','material.payment.approve'),
('c1280000-0000-4000-8000-000000000914','material.payment.execute'),
('c1280000-0000-4000-8000-000000000915','material.read'),
('c1280000-0000-4000-8000-000000000915','material.payment.request'),
('c1280000-0000-4000-8000-000000000916','material.read'),
('c1280000-0000-4000-8000-000000000916','material.contract.record'),
('c1280000-0000-4000-8000-000000000916','material.finance.read');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000902','c1280000-0000-4000-8000-000000000912','c1280000-0000-4000-8000-000000000903','test'),
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000903','c1280000-0000-4000-8000-000000000913','c1280000-0000-4000-8000-000000000903','test'),
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000909','c1280000-0000-4000-8000-000000000913','c1280000-0000-4000-8000-000000000903','test'),
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000904','c1280000-0000-4000-8000-000000000914','c1280000-0000-4000-8000-000000000903','test'),
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000905','c1280000-0000-4000-8000-000000000915','c1280000-0000-4000-8000-000000000903','test'),
('c1280000-0000-4000-8000-000000000011','c1280000-0000-4000-8000-000000000021','c1280000-0000-4000-8000-000000000906','c1280000-0000-4000-8000-000000000916','c1280000-0000-4000-8000-000000000906','test');
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by) values
('c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000010',true,'c1280000-0000-4000-8000-000000000903'),
('c1280000-0000-4000-8000-000000000021','c1280000-0000-4000-8000-000000000011',true,'c1280000-0000-4000-8000-000000000906');
insert into public.projects(id,tenant_id,company_id,code,name,origin,created_by) values
('c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','RD-P1','Reads project one','manual','c1280000-0000-4000-8000-000000000903'),
('c1280000-0000-4000-8000-000000000102','c1280000-0000-4000-8000-000000000011','c1280000-0000-4000-8000-000000000021','RD-PB','Reads project B','manual','c1280000-0000-4000-8000-000000000906');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by) values
('c1280000-0000-4000-8000-000000000201','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','RD-S1','Reads supplier one','organization','c1280000-0000-4000-8000-000000000902'),
('c1280000-0000-4000-8000-000000000202','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','RD-S2','Reads supplier two','organization','c1280000-0000-4000-8000-000000000902'),
('c1280000-0000-4000-8000-000000000203','c1280000-0000-4000-8000-000000000011','c1280000-0000-4000-8000-000000000021','RD-SB','Reads supplier B','organization','c1280000-0000-4000-8000-000000000906');
insert into public.material_proposals(id,tenant_id,company_id,project_id,needed_on,delivery_address,created_by) values
('c1280000-0000-4000-8000-000000000301','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','2026-10-30','Site A','c1280000-0000-4000-8000-000000000902'),
('c1280000-0000-4000-8000-000000000302','c1280000-0000-4000-8000-000000000011','c1280000-0000-4000-8000-000000000021','c1280000-0000-4000-8000-000000000102','2026-10-30','Site B','c1280000-0000-4000-8000-000000000906');
insert into public.material_proposal_revisions(id,tenant_id,company_id,project_id,proposal_id,revision_no,needed_on,delivery_address,submitted_by) values
('c1280000-0000-4000-8000-000000000401','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000301',1,'2026-10-30','Site A','c1280000-0000-4000-8000-000000000902'),
('c1280000-0000-4000-8000-000000000402','c1280000-0000-4000-8000-000000000011','c1280000-0000-4000-8000-000000000021','c1280000-0000-4000-8000-000000000102','c1280000-0000-4000-8000-000000000302',1,'2026-10-30','Site B','c1280000-0000-4000-8000-000000000906');
update public.material_proposals set review_state='approved',current_revision_id='c1280000-0000-4000-8000-000000000401',approved_revision_id='c1280000-0000-4000-8000-000000000401' where id='c1280000-0000-4000-8000-000000000301';
update public.material_proposals set review_state='approved',current_revision_id='c1280000-0000-4000-8000-000000000402',approved_revision_id='c1280000-0000-4000-8000-000000000402' where id='c1280000-0000-4000-8000-000000000302';
insert into public.cost_evidence_files(
 id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,
 verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,created_by,finalized_by,finalized_at,version
)
select
 file.id,file.tenant_id,file.company_id,file.project_id,
 file.tenant_id::text||'/'||file.company_id::text||'/'||file.project_id::text||'/'||file.id::text,
 'file-'||right(file.id::text,3)||'.pdf','application/pdf',8,md5(file.id::text)||md5(file.id::text),
 'application/pdf',8,md5(file.id::text)||md5(file.id::text),'finalized',
 now()+interval '15 minutes',file.actor,file.actor,now(),1
from (values
 ('c1280000-0000-4000-8000-000000000501'::uuid,'c1280000-0000-4000-8000-000000000010'::uuid,'c1280000-0000-4000-8000-000000000020'::uuid,'c1280000-0000-4000-8000-000000000101'::uuid,'c1280000-0000-4000-8000-000000000903'::uuid),
 ('c1280000-0000-4000-8000-000000000502'::uuid,'c1280000-0000-4000-8000-000000000010'::uuid,'c1280000-0000-4000-8000-000000000020'::uuid,'c1280000-0000-4000-8000-000000000101'::uuid,'c1280000-0000-4000-8000-000000000903'::uuid),
 ('c1280000-0000-4000-8000-000000000503'::uuid,'c1280000-0000-4000-8000-000000000010'::uuid,'c1280000-0000-4000-8000-000000000020'::uuid,'c1280000-0000-4000-8000-000000000101'::uuid,'c1280000-0000-4000-8000-000000000903'::uuid),
 ('c1280000-0000-4000-8000-000000000504'::uuid,'c1280000-0000-4000-8000-000000000010'::uuid,'c1280000-0000-4000-8000-000000000020'::uuid,'c1280000-0000-4000-8000-000000000101'::uuid,'c1280000-0000-4000-8000-000000000903'::uuid),
 ('c1280000-0000-4000-8000-000000000505'::uuid,'c1280000-0000-4000-8000-000000000010'::uuid,'c1280000-0000-4000-8000-000000000020'::uuid,'c1280000-0000-4000-8000-000000000101'::uuid,'c1280000-0000-4000-8000-000000000903'::uuid),
 ('c1280000-0000-4000-8000-000000000506'::uuid,'c1280000-0000-4000-8000-000000000010'::uuid,'c1280000-0000-4000-8000-000000000020'::uuid,'c1280000-0000-4000-8000-000000000101'::uuid,'c1280000-0000-4000-8000-000000000903'::uuid),
 ('c1280000-0000-4000-8000-000000000507'::uuid,'c1280000-0000-4000-8000-000000000010'::uuid,'c1280000-0000-4000-8000-000000000020'::uuid,'c1280000-0000-4000-8000-000000000101'::uuid,'c1280000-0000-4000-8000-000000000903'::uuid),
 ('c1280000-0000-4000-8000-000000000508'::uuid,'c1280000-0000-4000-8000-000000000010'::uuid,'c1280000-0000-4000-8000-000000000020'::uuid,'c1280000-0000-4000-8000-000000000101'::uuid,'c1280000-0000-4000-8000-000000000903'::uuid),
 ('c1280000-0000-4000-8000-000000000509'::uuid,'c1280000-0000-4000-8000-000000000010'::uuid,'c1280000-0000-4000-8000-000000000020'::uuid,'c1280000-0000-4000-8000-000000000101'::uuid,'c1280000-0000-4000-8000-000000000903'::uuid),
 ('c1280000-0000-4000-8000-000000000510'::uuid,'c1280000-0000-4000-8000-000000000010'::uuid,'c1280000-0000-4000-8000-000000000020'::uuid,'c1280000-0000-4000-8000-000000000101'::uuid,'c1280000-0000-4000-8000-000000000903'::uuid),
 ('c1280000-0000-4000-8000-000000000551'::uuid,'c1280000-0000-4000-8000-000000000011'::uuid,'c1280000-0000-4000-8000-000000000021'::uuid,'c1280000-0000-4000-8000-000000000102'::uuid,'c1280000-0000-4000-8000-000000000906'::uuid),
 ('c1280000-0000-4000-8000-000000000552'::uuid,'c1280000-0000-4000-8000-000000000011'::uuid,'c1280000-0000-4000-8000-000000000021'::uuid,'c1280000-0000-4000-8000-000000000102'::uuid,'c1280000-0000-4000-8000-000000000906'::uuid),
 ('c1280000-0000-4000-8000-000000000553'::uuid,'c1280000-0000-4000-8000-000000000011'::uuid,'c1280000-0000-4000-8000-000000000021'::uuid,'c1280000-0000-4000-8000-000000000102'::uuid,'c1280000-0000-4000-8000-000000000906'::uuid)
) as file(id,tenant_id,company_id,project_id,actor);

-- Orders: O1 and O2 get contracts, O3 stays without a contract. The buyer is the acting user.
select set_config('request.jwt.claims','{"sub":"c1280000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,
  supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
) values
('c1280000-0000-4000-8000-000000000351','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000301','c1280000-0000-4000-8000-000000000401','c1280000-0000-4000-8000-000000000201','VND','c1280000-0000-4000-8000-000000000501','c1280000-0000-4000-8000-000000000902'),
('c1280000-0000-4000-8000-000000000352','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000301','c1280000-0000-4000-8000-000000000401','c1280000-0000-4000-8000-000000000202','VND','c1280000-0000-4000-8000-000000000501','c1280000-0000-4000-8000-000000000902'),
('c1280000-0000-4000-8000-000000000353','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000301','c1280000-0000-4000-8000-000000000401','c1280000-0000-4000-8000-000000000201','VND','c1280000-0000-4000-8000-000000000501','c1280000-0000-4000-8000-000000000902');
select set_config('request.jwt.claims','{"sub":"c1280000-0000-4000-8000-000000000906","role":"authenticated"}',true);
insert into public.material_orders(
  id,tenant_id,company_id,project_id,proposal_id,approved_revision_id,
  supplier_id,currency_code,unsigned_quotation_evidence_file_id,created_by
) values('c1280000-0000-4000-8000-000000000354','c1280000-0000-4000-8000-000000000011','c1280000-0000-4000-8000-000000000021','c1280000-0000-4000-8000-000000000102','c1280000-0000-4000-8000-000000000302','c1280000-0000-4000-8000-000000000402','c1280000-0000-4000-8000-000000000203','VND','c1280000-0000-4000-8000-000000000551','c1280000-0000-4000-8000-000000000906');

-- Contract C1 (supplier one): three installments. Contract C2 (supplier two): one far-off installment.
insert into public.material_contracts(id,tenant_id,company_id,project_id,order_id,supplier_id,currency_code,contract_no,signed_on,created_by) values
('c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000351','c1280000-0000-4000-8000-000000000201','VND','HD-READS-1','2026-09-01','c1280000-0000-4000-8000-000000000903'),
('c1280000-0000-4000-8000-000000000602','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000352','c1280000-0000-4000-8000-000000000202','VND','HD-READS-2','2026-09-02','c1280000-0000-4000-8000-000000000903'),
('c1280000-0000-4000-8000-000000000603','c1280000-0000-4000-8000-000000000011','c1280000-0000-4000-8000-000000000021','c1280000-0000-4000-8000-000000000102','c1280000-0000-4000-8000-000000000354','c1280000-0000-4000-8000-000000000203','VND','HD-READS-B','2026-09-03','c1280000-0000-4000-8000-000000000906');
insert into public.material_contract_versions(
  id,tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
  order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
) values
('c1280000-0000-4000-8000-000000000611','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601',1,'original',100,10,110,100,null,'c1280000-0000-4000-8000-000000000502','c1280000-0000-4000-8000-000000000503',null,'c1280000-0000-4000-8000-000000000903'),
('c1280000-0000-4000-8000-000000000613','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000602',1,'original',50,5,55,50,null,'c1280000-0000-4000-8000-000000000504','c1280000-0000-4000-8000-000000000505',null,'c1280000-0000-4000-8000-000000000903'),
('c1280000-0000-4000-8000-000000000614','c1280000-0000-4000-8000-000000000011','c1280000-0000-4000-8000-000000000021','c1280000-0000-4000-8000-000000000102','c1280000-0000-4000-8000-000000000603',1,'original',70,7,77,70,null,'c1280000-0000-4000-8000-000000000552','c1280000-0000-4000-8000-000000000553',null,'c1280000-0000-4000-8000-000000000906');
insert into public.material_contract_installments(
  tenant_id,company_id,project_id,contract_id,contract_version_id,seq,installment_key,name,amount,due_on,is_advance
) values
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000611',1,'c1280000-0000-4000-8000-000000000a01','Dot 1',50,'2026-10-10',false),
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000611',2,'c1280000-0000-4000-8000-000000000a02','Dot 2',50,'2026-10-17',false),
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000611',3,'c1280000-0000-4000-8000-000000000a03','Dot 3',10,'2026-09-01',false),
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000602','c1280000-0000-4000-8000-000000000613',1,'c1280000-0000-4000-8000-000000000a04','Dot C2',55,'2026-12-01',false),
('c1280000-0000-4000-8000-000000000011','c1280000-0000-4000-8000-000000000021','c1280000-0000-4000-8000-000000000102','c1280000-0000-4000-8000-000000000603','c1280000-0000-4000-8000-000000000614',1,'c1280000-0000-4000-8000-000000000a05','Dot B',77,'2026-10-30',false);

-- Invoices: one recorded (counted), one voided (ignored).
insert into public.material_invoices(
  id,tenant_id,company_id,project_id,contract_id,supplier_id,invoice_symbol,invoice_no,issued_on,
  subtotal,vat_amount,total,file_id,recorded_by
) values('c1280000-0000-4000-8000-000000000801','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000201','1C26TAA','0000001','2026-10-01',10,1,11,'c1280000-0000-4000-8000-000000000506','c1280000-0000-4000-8000-000000000903');
insert into public.material_invoices(
  id,tenant_id,company_id,project_id,contract_id,supplier_id,invoice_symbol,invoice_no,issued_on,
  subtotal,vat_amount,total,file_id,state,void_reason,voided_by,voided_at,recorded_by
) values('c1280000-0000-4000-8000-000000000802','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000201','1C26TAA','0000002','2026-10-02',90,9,99,'c1280000-0000-4000-8000-000000000507','voided','Wrong invoice','c1280000-0000-4000-8000-000000000903',now(),'c1280000-0000-4000-8000-000000000903');

-- Payment requests: R1 submitted 10, R4 approved 5 (both pending on Dot 1); R2 paid 30 on Dot 1;
-- R3 returned and R5 cancelled on Dot 2 (neither pending); R6 paid 10 settles Dot 3.
insert into public.material_payment_requests(
  id,tenant_id,company_id,project_id,contract_id,installment_key,amount,state,cancel_reason,submitted_by,created_by
) values
('c1280000-0000-4000-8000-000000000701','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000a01',10,'submitted',null,'c1280000-0000-4000-8000-000000000905','c1280000-0000-4000-8000-000000000905'),
('c1280000-0000-4000-8000-000000000702','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000a01',30,'paid',null,'c1280000-0000-4000-8000-000000000905','c1280000-0000-4000-8000-000000000905'),
('c1280000-0000-4000-8000-000000000703','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000a02',10,'returned',null,'c1280000-0000-4000-8000-000000000905','c1280000-0000-4000-8000-000000000905'),
('c1280000-0000-4000-8000-000000000704','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000a01',5,'approved',null,'c1280000-0000-4000-8000-000000000905','c1280000-0000-4000-8000-000000000905'),
('c1280000-0000-4000-8000-000000000705','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000a02',5,'cancelled','Not needed','c1280000-0000-4000-8000-000000000905','c1280000-0000-4000-8000-000000000905'),
('c1280000-0000-4000-8000-000000000706','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000a03',10,'paid',null,'c1280000-0000-4000-8000-000000000905','c1280000-0000-4000-8000-000000000905');
insert into public.material_payment_decisions(
  tenant_id,company_id,project_id,payment_request_id,request_revision_no,decision,reason,decided_by
) values
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000703',1,'return','Thieu hoa don','c1280000-0000-4000-8000-000000000904'),
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000704',1,'approve',null,'c1280000-0000-4000-8000-000000000904');
insert into public.material_payments(
  tenant_id,company_id,project_id,payment_request_id,contract_id,installment_key,amount,
  paid_on,bank_reference,proof_file_id,proof_sha256,paid_by
) values
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000702','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000a01',30,'2026-10-05','UNC-READS-1','c1280000-0000-4000-8000-000000000508',repeat('a',64),'c1280000-0000-4000-8000-000000000904'),
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000706','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000a03',10,'2026-10-06','UNC-READS-2','c1280000-0000-4000-8000-000000000509',repeat('b',64),'c1280000-0000-4000-8000-000000000904');

-- Notification fixtures with distinct and tied timestamps.
insert into public.app_notifications(
  id,tenant_id,company_id,project_id,recipient_id,event_kind,source_type,source_id,link_path,payload,dedupe_key,created_at
) values
('c1280000-0000-4000-8000-000000000b01','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020',null,'c1280000-0000-4000-8000-000000000907','material.order.created','material_order','c1280000-0000-4000-8000-000000000351','/x','{}','n1a','2026-10-01 10:00:00+00'),
('c1280000-0000-4000-8000-000000000b02','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020',null,'c1280000-0000-4000-8000-000000000907','material.order.created','material_order','c1280000-0000-4000-8000-000000000351','/x','{}','n1b','2026-10-02 10:00:00+00'),
('c1280000-0000-4000-8000-000000000b03','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020',null,'c1280000-0000-4000-8000-000000000907','material.order.created','material_order','c1280000-0000-4000-8000-000000000351','/x','{}','n1c','2026-10-03 10:00:00+00'),
('c1280000-0000-4000-8000-000000000b04','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020',null,'c1280000-0000-4000-8000-000000000907','material.order.created','material_order','c1280000-0000-4000-8000-000000000351','/x','{}','n1d','2026-10-04 10:00:00+00'),
('c1280000-0000-4000-8000-000000000b05','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020',null,'c1280000-0000-4000-8000-000000000907','material.order.created','material_order','c1280000-0000-4000-8000-000000000351','/x','{}','n1e','2026-10-05 10:00:00+00'),
('c1280000-0000-4000-8000-000000000b11','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020',null,'c1280000-0000-4000-8000-000000000908','material.order.created','material_order','c1280000-0000-4000-8000-000000000351','/x','{}','n2a','2026-10-10 10:00:00+00'),
('c1280000-0000-4000-8000-000000000b12','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020',null,'c1280000-0000-4000-8000-000000000908','material.order.created','material_order','c1280000-0000-4000-8000-000000000351','/x','{}','n2b','2026-10-10 10:00:00+00'),
('c1280000-0000-4000-8000-000000000b13','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020',null,'c1280000-0000-4000-8000-000000000908','material.order.created','material_order','c1280000-0000-4000-8000-000000000351','/x','{}','n2c','2026-10-10 10:00:00+00'),
('c1280000-0000-4000-8000-000000000b14','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020',null,'c1280000-0000-4000-8000-000000000908','material.order.created','material_order','c1280000-0000-4000-8000-000000000351','/x','{}','n2d','2026-10-10 10:00:00+00'),
('c1280000-0000-4000-8000-000000000b15','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020',null,'c1280000-0000-4000-8000-000000000908','material.order.created','material_order','c1280000-0000-4000-8000-000000000351','/x','{}','n2e','2026-10-10 10:00:00+00');

update public.app_notifications set read_at='2026-10-06 00:00:00+00' where id='c1280000-0000-4000-8000-000000000b03';

create temporary table read_results(name text primary key, body jsonb not null);
grant select,insert on read_results to authenticated;
grant select,insert on read_results to service_role;

-- Finance facts: accountant of company A.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1280000-0000-4000-8000-000000000903","role":"authenticated"}',true);
insert into read_results values('facts_all',public.c1_material_finance_facts('c1280000-0000-4000-8000-000000000020',null));
insert into read_results values('facts_project',public.c1_material_finance_facts('c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101'));
select is(
  (select jsonb_array_length(body->'contracts') from read_results where name='facts_all'),
  2,'finance facts only return contracts of the actor company'
);
select is(
  (select body->>'currencyCode' from read_results where name='facts_all'),
  'VND','finance facts report the company currency'
);
select is(
  (select jsonb_array_length(body->'contracts') from read_results where name='facts_project'),
  2,'finance facts accept a project filter'
);
select is(
  (select array[c->>'total',c->>'invoiced'] from read_results, jsonb_array_elements(body->'contracts') as c
   where name='facts_all' and c->>'contractId'='c1280000-0000-4000-8000-000000000601'),
  array['110.0000','11.0000'],'contract total and recorded invoices are summed (voided invoice ignored)'
);
select is(
  (select array[e->>'paid',e->>'pending'] from read_results, jsonb_array_elements(body->'contracts') as c,
     jsonb_array_elements(c->'installments') as e
   where name='facts_all' and e->>'installmentKey'='c1280000-0000-4000-8000-000000000a01'),
  array['30.0000','15.0000'],'paid counts payments and pending counts submitted plus approved requests'
);
select ok(
  (select (e->>'paid')::numeric=0 and (e->>'pending')::numeric=0 from read_results, jsonb_array_elements(body->'contracts') as c,
     jsonb_array_elements(c->'installments') as e
   where name='facts_all' and e->>'installmentKey'='c1280000-0000-4000-8000-000000000a02'),
  'returned and cancelled requests are neither paid nor pending'
);
select is(
  (select e->>'paid' from read_results, jsonb_array_elements(body->'contracts') as c,
     jsonb_array_elements(c->'installments') as e
   where name='facts_all' and e->>'installmentKey'='c1280000-0000-4000-8000-000000000a03'),
  '10.0000','a fully paid installment reports its payment'
);
select throws_ok(
  $$select public.c1_material_finance_facts('c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000fff')$$,
  'P0001','RESOURCE_NOT_FOUND','finance facts reject an unknown project'
);
select throws_ok(
  $$select public.c1_material_finance_facts('c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000102')$$,
  'P0001','RESOURCE_NOT_FOUND','finance facts reject a project of another company'
);

-- Inbox by permission: accountant.
insert into read_results values('inbox_acct',public.c1_material_finance_inbox_facts('c1280000-0000-4000-8000-000000000020',null));
select is(
  (select array[(body->'awaitingContract'->0->>'orderId'),jsonb_array_length(body->'awaitingContract')::text,
    body->'awaitingContract'->0->>'orderSubtotal']
   from read_results where name='inbox_acct'),
  array['c1280000-0000-4000-8000-000000000353','1','0.0000'],'accountant inbox lists active orders without a contract'
);
select ok(
  (select body->'returnedRequests'='[]'::jsonb and body->'pendingApproval'='[]'::jsonb and body->'approvedAwaitingPayment'='[]'::jsonb
   from read_results where name='inbox_acct'),
  'accountant inbox leaves payment lists empty'
);

-- Treasurer.
select set_config('request.jwt.claims','{"sub":"c1280000-0000-4000-8000-000000000904","role":"authenticated"}',true);
insert into read_results values('inbox_treas',public.c1_material_finance_inbox_facts('c1280000-0000-4000-8000-000000000020',null));
select is(
  (select body->'awaitingContract' from read_results where name='inbox_treas'),
  '[]'::jsonb,'treasurer inbox has no awaiting contracts'
);
select is(
  (select array[body->'pendingApproval'->0->>'requestId',jsonb_array_length(body->'pendingApproval')::text,
    body->'approvedAwaitingPayment'->0->>'requestId',jsonb_array_length(body->'approvedAwaitingPayment')::text,
    (body->'returnedRequests')::text]
   from read_results where name='inbox_treas'),
  array['c1280000-0000-4000-8000-000000000701','1','c1280000-0000-4000-8000-000000000704','1','[]'],'treasurer inbox lists submitted and approved requests only'
);
select ok(
  (select (body->'approvedAwaitingPayment'->0->>'approvedAt') is not null from read_results where name='inbox_treas'),
  'approved requests carry the approval time'
);

-- Requester.
select set_config('request.jwt.claims','{"sub":"c1280000-0000-4000-8000-000000000905","role":"authenticated"}',true);
insert into read_results values('inbox_reqr',public.c1_material_finance_inbox_facts('c1280000-0000-4000-8000-000000000020',null));
select is(
  (select array[body->'returnedRequests'->0->>'requestId',body->'returnedRequests'->0->>'reason',
    (body->'pendingApproval')::text,(body->'awaitingContract')::text]
   from read_results where name='inbox_reqr'),
  array['c1280000-0000-4000-8000-000000000703','Thieu hoa don','[]','[]'],'requester inbox lists returned requests with the return reason'
);

-- Buyer without any finance permission.
select set_config('request.jwt.claims','{"sub":"c1280000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select throws_ok(
  $$select public.c1_material_finance_inbox_facts('c1280000-0000-4000-8000-000000000020',null)$$,
  'P0001','PERMISSION_DENIED','procurement inbox is denied without finance permissions'
);
select throws_ok(
  $$select public.c1_material_finance_facts('c1280000-0000-4000-8000-000000000020',null)$$,
  'P0001','PERMISSION_DENIED','finance facts are denied without finance permissions'
);

-- Company B accountant never sees company A data.
select set_config('request.jwt.claims','{"sub":"c1280000-0000-4000-8000-000000000906","role":"authenticated"}',true);
insert into read_results values('facts_b',public.c1_material_finance_facts('c1280000-0000-4000-8000-000000000021',null));
select is(
  (select array[jsonb_array_length(body->'contracts')::text,body->'contracts'->0->>'contractId'] from read_results where name='facts_b'),
  array['1','c1280000-0000-4000-8000-000000000603'],'company B facts contain only company B contracts'
);
select throws_ok(
  $$select public.c1_material_finance_facts('c1280000-0000-4000-8000-000000000020',null)$$,
  'P0001',null,'company B accountant cannot read company A facts'
);

-- Notifications: pagination, isolation and read.
select set_config('request.jwt.claims','{"sub":"c1280000-0000-4000-8000-000000000907","role":"authenticated"}',true);
insert into read_results values('n1_page1',public.c1_list_app_notifications('c1280000-0000-4000-8000-000000000020',null,2));
insert into read_results values('n1_page2',public.c1_list_app_notifications('c1280000-0000-4000-8000-000000000020',
  (select body->>'nextCursor' from read_results where name='n1_page1'),2));
insert into read_results values('n1_page3',public.c1_list_app_notifications('c1280000-0000-4000-8000-000000000020',
  (select body->>'nextCursor' from read_results where name='n1_page2'),2));
select is(
  (select array[body->'items'->0->>'id',body->'items'->1->>'id'] from read_results where name='n1_page1'),
  array['c1280000-0000-4000-8000-000000000b05','c1280000-0000-4000-8000-000000000b04'],'first notification page returns the newest rows'
);
select ok(
  (select body->>'nextCursor' is not null from read_results where name='n1_page1'),
  'first notification page carries a next cursor'
);
select is(
  (select array[body->'items'->0->>'id',body->'items'->1->>'id'] from read_results where name='n1_page2'),
  array['c1280000-0000-4000-8000-000000000b03','c1280000-0000-4000-8000-000000000b02'],'the cursor continues with older notifications'
);
select is(
  (select array[jsonb_array_length(body->'items')::text,body->'items'->0->>'id'] from read_results where name='n1_page3'),
  array['1','c1280000-0000-4000-8000-000000000b01'],'last notification page holds the remainder'
);
select ok(
  (select body->'nextCursor'='null'::jsonb from read_results where name='n1_page3'),
  'last notification page has no next cursor'
);
select is(
  (select count(*) from public.app_notifications where recipient_id<>'c1280000-0000-4000-8000-000000000907'),
  0::bigint,'notification table rows are limited to the recipient'
);
select throws_ok(
  $$select public.c1_list_app_notifications('c1280000-0000-4000-8000-000000000020',null,0)$$,
  'P0001','INPUT_INVALID','notification limit below 1 is rejected'
);
select throws_ok(
  $$select public.c1_list_app_notifications('c1280000-0000-4000-8000-000000000020',null,51)$$,
  'P0001','INPUT_INVALID','notification limit above 50 is rejected'
);

select set_config('request.jwt.claims','{"sub":"c1280000-0000-4000-8000-000000000908","role":"authenticated"}',true);
insert into read_results values('n2_all',public.c1_list_app_notifications('c1280000-0000-4000-8000-000000000020',null,50));
insert into read_results values('n2_page1',public.c1_list_app_notifications('c1280000-0000-4000-8000-000000000020',null,2));
insert into read_results values('n2_page2',public.c1_list_app_notifications('c1280000-0000-4000-8000-000000000020',
  (select body->>'nextCursor' from read_results where name='n2_page1'),2));
insert into read_results values('n2_page3',public.c1_list_app_notifications('c1280000-0000-4000-8000-000000000020',
  (select body->>'nextCursor' from read_results where name='n2_page2'),2));
select is(
  (select jsonb_array_length(body->'items') from read_results where name='n2_all'),
  5,'user B does not see notifications of user A'
);
select is(
  (select array[body->'items'->0->>'id',body->'items'->1->>'id',jsonb_array_length(body->'items')::text,(body->>'nextCursor' is not null)::text]
   from read_results where name='n2_page1'),
  array['c1280000-0000-4000-8000-000000000b15','c1280000-0000-4000-8000-000000000b14','2','true'],'rows sharing one created_at are paged by id: first page of two'
);
select is(
  (select array[body->'items'->0->>'id',body->'items'->1->>'id',jsonb_array_length(body->'items')::text,(body->>'nextCursor' is not null)::text]
   from read_results where name='n2_page2'),
  array['c1280000-0000-4000-8000-000000000b13','c1280000-0000-4000-8000-000000000b12','2','true'],'rows sharing one created_at are paged by id: second page of two without gaps or duplicates'
);
select is(
  (select array[body->'items'->0->>'id',jsonb_array_length(body->'items')::text,(body->'nextCursor'='null'::jsonb)::text]
   from read_results where name='n2_page3'),
  array['c1280000-0000-4000-8000-000000000b11','1','true'],'rows sharing one created_at are paged by id: last page of one and no next cursor'
);
select throws_ok(
  $$select public.c1_list_app_notifications('c1280000-0000-4000-8000-000000000020','not-a-cursor',10)$$,
  'P0001','INPUT_INVALID','a malformed notification cursor is rejected'
);
select throws_ok(
  $$select public.c1_list_app_notifications('c1280000-0000-4000-8000-000000000020',encode(convert_to('2026-13-45T99:00:00.000000Z|c1280000-0000-4000-8000-000000000fff','UTF8'),'hex'),10)$$,
  'P0001','INPUT_INVALID','a well-shaped cursor with an impossible timestamp is rejected'
);

select set_config('request.jwt.claims','{"sub":"c1280000-0000-4000-8000-000000000906","role":"authenticated"}',true);
select throws_ok(
  $$select public.c1_list_app_notifications('c1280000-0000-4000-8000-000000000020',null,10)$$,
  'P0001','PERMISSION_DENIED','non-members cannot list notifications of the company'
);

select set_config('request.jwt.claims','{"sub":"c1280000-0000-4000-8000-000000000907","role":"authenticated"}',true);
insert into read_results values('read_first',public.c1_read_app_notification('c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000b05'));
insert into read_results values('read_second',public.c1_read_app_notification('c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000b05'));
select is(
  (select array[(body->>'replayed'),(body->>'resourceId')] from read_results where name='read_first'),
  array['false','c1280000-0000-4000-8000-000000000b05'],'first read marks the notification read'
);
select is(
  (select body->>'replayed' from read_results where name='read_second'),
  'true','reading twice is idempotent'
);
insert into read_results values('read_preread',public.c1_read_app_notification('c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000b03'));
select is(
  (select array[(body->>'replayed'),(select read_at::text from public.app_notifications where id='c1280000-0000-4000-8000-000000000b03')]
   from read_results where name='read_preread'),
  array['true','2026-10-06 00:00:00+00'],'an already read notification keeps its first read_at'
);
select set_config('request.jwt.claims','{"sub":"c1280000-0000-4000-8000-000000000908","role":"authenticated"}',true);
select throws_ok(
  $$select public.c1_read_app_notification('c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000b04')$$,
  'P0001','RESOURCE_NOT_FOUND','user B cannot read user A notification'
);

-- Reminder emitter: service role only.
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1280000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select throws_ok(
  $$select public.c1_material_emit_installment_reminders('2026-10-15')$$,
  '42501',null,'authenticated cannot call the reminder emitter'
);
select ok(
  not has_function_privilege('anon','public.c1_material_emit_installment_reminders(date)','EXECUTE')
    and not has_function_privilege('authenticated','public.c1_material_emit_installment_reminders(date)','EXECUTE')
    and has_function_privilege('service_role','public.c1_material_emit_installment_reminders(date)','EXECUTE'),
  'only service_role may execute the reminder emitter'
);
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
-- The emitter scans every company on a shared database, so assert on the fixture company's own rows,
-- never on the global counts it returns.
insert into read_results values('emit_first',public.c1_material_emit_installment_reminders('2026-10-15'));
reset role;
insert into read_results
select 'emit_first_rows',jsonb_build_object(
  'dueSoon',count(*) filter (where event_kind='material.installment.due_soon'),
  'overdue',count(*) filter (where event_kind='material.installment.overdue'))
from public.app_notifications
where company_id='c1280000-0000-4000-8000-000000000020'
  and event_kind in ('material.installment.due_soon','material.installment.overdue');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into read_results values('emit_again',public.c1_material_emit_installment_reminders('2026-10-15'));
reset role;
insert into read_results
select 'emit_again_rows',jsonb_build_object(
  'dueSoon',count(*) filter (where event_kind='material.installment.due_soon'),
  'overdue',count(*) filter (where event_kind='material.installment.overdue'))
from public.app_notifications
where company_id='c1280000-0000-4000-8000-000000000020'
  and event_kind in ('material.installment.due_soon','material.installment.overdue');
select is(
  (select body from read_results where name='emit_first_rows'),
  '{"dueSoon":2,"overdue":2}'::jsonb,'one due-soon and one overdue reminder per accountant in the fixture company'
);
select is(
  (select body from read_results where name='emit_again_rows'),
  (select body from read_results where name='emit_first_rows'),'a second run on the same day creates no new reminders for the fixture company'
);
reset role;
select is(
  (select array_agg(recipient_id::text order by recipient_id) from public.app_notifications
   where event_kind='material.installment.due_soon' and source_id='c1280000-0000-4000-8000-000000000a02'),
  array['c1280000-0000-4000-8000-000000000903','c1280000-0000-4000-8000-000000000909'],'due-soon reminders go to every contract recorder of the company'
);
select is(
  (select array_agg(distinct dedupe_key) from public.app_notifications
   where event_kind='material.installment.due_soon' and source_id='c1280000-0000-4000-8000-000000000a02'),
  array['inst:c1280000-0000-4000-8000-000000000601:c1280000-0000-4000-8000-000000000a02:due_soon:'
    ||(select due_on::text from public.material_contract_installments
       where contract_version_id='c1280000-0000-4000-8000-000000000611' and installment_key='c1280000-0000-4000-8000-000000000a02')],
  'reminder dedupe keys carry the contract id, the installment, the kind and the due date (20261015090600)'
);
select is(
  (select payload->>'remaining' from public.app_notifications
   where event_kind='material.installment.overdue' and source_id='c1280000-0000-4000-8000-000000000a01' and recipient_id='c1280000-0000-4000-8000-000000000903'),
  '20.0000','overdue reminder reports the unpaid remainder'
);
select is(
  (select count(*) from public.app_notifications
   where event_kind in ('material.installment.due_soon','material.installment.overdue')
     and source_id in ('c1280000-0000-4000-8000-000000000a03','c1280000-0000-4000-8000-000000000a04','c1280000-0000-4000-8000-000000000a05')),
  0::bigint,'settled and not-yet-due installments are not reminded'
);

-- An amendment that moves a due date produces a fresh reminder.
insert into public.material_contract_versions(
  id,tenant_id,company_id,project_id,contract_id,version_no,kind,subtotal,vat_amount,total,
  order_subtotal_snapshot,variance_reason,contract_file_id,signed_quotation_file_id,reason,recorded_by
) values('c1280000-0000-4000-8000-000000000612','c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601',2,'amendment',100,10,110,100,null,'c1280000-0000-4000-8000-000000000510',null,'Doi han dot 2','c1280000-0000-4000-8000-000000000903');
insert into public.material_contract_installments(
  tenant_id,company_id,project_id,contract_id,contract_version_id,seq,installment_key,name,amount,due_on,is_advance
) values
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000612',1,'c1280000-0000-4000-8000-000000000a01','Dot 1',50,'2026-10-10',false),
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000612',2,'c1280000-0000-4000-8000-000000000a02','Dot 2',50,'2026-10-16',false),
('c1280000-0000-4000-8000-000000000010','c1280000-0000-4000-8000-000000000020','c1280000-0000-4000-8000-000000000101','c1280000-0000-4000-8000-000000000601','c1280000-0000-4000-8000-000000000612',3,'c1280000-0000-4000-8000-000000000a03','Dot 3',10,'2026-09-01',false);
update public.material_contracts set current_version_no=2 where id='c1280000-0000-4000-8000-000000000601';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into read_results values('emit_amended',public.c1_material_emit_installment_reminders('2026-10-15'));
select is(
  (select body from read_results where name='emit_amended'),
  '{"dueSoon":2,"overdue":0}'::jsonb,'a moved due date creates new reminders while unchanged ones stay deduplicated'
);

reset role;
select * from finish(true);
rollback;
