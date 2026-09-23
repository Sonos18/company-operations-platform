begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(22);

select has_column('public','project_subcontract_payments','replaces_payment_id','canonical payment ledger has replacement relation');
select has_function('public','c1_record_subcontract_payment',array['uuid','uuid','uuid','jsonb','uuid','uuid'],'record payment RPC exists');
select has_function('public','c1_void_subcontract_payment',array['uuid','uuid','uuid','uuid','bigint','text','uuid','uuid'],'void payment RPC exists');
select ok(has_function_privilege('authenticated','public.c1_record_subcontract_payment(uuid,uuid,uuid,jsonb,uuid,uuid)','execute'),'authenticated can execute record RPC');
do $$begin if extensions.num_failed()>0 then raise exception 'C1 cash schema assertion failed';end if;end$$;

do $$
declare tenant_id constant uuid:='c1080000-0000-4000-8000-000000000010'; company_id constant uuid:='c1080000-0000-4000-8000-000000000020'; cashier constant uuid:='c1080000-0000-4000-8000-000000000901'; manager constant uuid:='c1080000-0000-4000-8000-000000000902';
begin
  insert into auth.users(id,email) values(cashier,'c108-cashier@taskovia.invalid'),(manager,'c108-manager@taskovia.invalid');
  insert into public.tenants(id,code,name) values(tenant_id,'c108','C108 synthetic tenant');
  insert into public.companies(id,tenant_id,code,name) values(company_id,tenant_id,'C108','C108 synthetic company');
  insert into public.tenant_memberships(user_id,tenant_id,roles) values(cashier,tenant_id,array['member']),(manager,tenant_id,array['member']);
  insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active) values(cashier,tenant_id,company_id,array['member'],true),(manager,tenant_id,company_id,array['member'],true);
  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values('c1080000-0000-4000-8000-000000000911',tenant_id,company_id,'c108_cashier','C108 cashier','Synthetic',false),('c1080000-0000-4000-8000-000000000912',tenant_id,company_id,'c108_manager','C108 manager','Synthetic',false);
  insert into public.role_permissions(role_id,permission_code) values('c1080000-0000-4000-8000-000000000911','cost.record_cash'),('c1080000-0000-4000-8000-000000000912','cost.manage');
  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values(tenant_id,company_id,cashier,'c1080000-0000-4000-8000-000000000911',cashier,'fixture'),(tenant_id,company_id,manager,'c1080000-0000-4000-8000-000000000912',cashier,'fixture');
  insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by) values(company_id,tenant_id,true,cashier);
  insert into public.projects(id,tenant_id,company_id,code,name,origin,created_by) values('c1080000-0000-4000-8000-000000000101',tenant_id,company_id,'C108-P','C108 project','manual',cashier);
  insert into public.business_parties(id,tenant_id,company_id,party_kind,code,display_name,is_active,created_by) values('c1080000-0000-4000-8000-000000000201',tenant_id,company_id,'organization','C108-S','C108 supplier',true,cashier);
  perform set_config('taskovia.c1_finance.actor_id',cashier::text,true); perform set_config('taskovia.c1_finance.request_id','c1080000-0000-4000-8000-000000000601',true); perform set_config('taskovia.c1_finance.change_reason','fixture',true);
  insert into public.project_subcontracts(id,tenant_id,company_id,project_id,subcontractor_party_id,code,contract_name,currency_code,is_active) values('c1080000-0000-4000-8000-000000000301',tenant_id,company_id,'c1080000-0000-4000-8000-000000000101','c1080000-0000-4000-8000-000000000201','C108-SC','C108 contract','VND',true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1080000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select throws_ok(
  $$select public.c1_record_subcontract_payment('c1080000-0000-4000-8000-000000000020','c1080000-0000-4000-8000-000000000101','c1080000-0000-4000-8000-000000000301','{"expectedSubcontractVersion":0,"description":"Denied","paidAmount":"10.0000","currencyCode":"VND"}','c1080000-0000-4000-8000-000000000701','c1080000-0000-4000-8000-000000000702')$$,
  'P0001','PERMISSION_DENIED','cost.manage cannot substitute for cost.record_cash');
select throws_ok(
  $$insert into public.project_subcontract_payments(tenant_id,company_id,project_id,project_subcontract_id,currency_code,description,paid_amount_text) values('c1080000-0000-4000-8000-000000000010','c1080000-0000-4000-8000-000000000020','c1080000-0000-4000-8000-000000000101','c1080000-0000-4000-8000-000000000301','VND','direct','1.0000')$$,
  '42501',null,'authenticated direct payment insert is denied');
do $$begin if extensions.num_failed()>0 then raise exception 'C1 cash permission assertion failed';end if;end$$;

select set_config('request.jwt.claims','{"sub":"c1080000-0000-4000-8000-000000000901","role":"authenticated"}',true);
create temp table c1_cash_result as select public.c1_record_subcontract_payment(
  'c1080000-0000-4000-8000-000000000020','c1080000-0000-4000-8000-000000000101','c1080000-0000-4000-8000-000000000301',
  '{"expectedSubcontractVersion":0,"description":"First voucher","paidAmount":"100.0000","currencyCode":"VND","warrantyRetentionAmount":"5.0000","retentionRateBps":500}',
  'c1080000-0000-4000-8000-000000000711','c1080000-0000-4000-8000-000000000712') result;
select is((select result->>'status' from c1_cash_result),'recorded','cash command records canonical payment');
reset role;
select is((select paid_amount_text from public.project_subcontract_payments where id=(select (result->>'paymentId')::uuid from c1_cash_result)),'100.0000','recorded amount is canonical decimal text');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1080000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is((public.c1_record_subcontract_payment('c1080000-0000-4000-8000-000000000020','c1080000-0000-4000-8000-000000000101','c1080000-0000-4000-8000-000000000301','{"expectedSubcontractVersion":0,"description":"First voucher","paidAmount":"100.0000","currencyCode":"VND","warrantyRetentionAmount":"5.0000","retentionRateBps":500}','c1080000-0000-4000-8000-000000000711','c1080000-0000-4000-8000-000000000713')->>'replayed')::boolean,true,'record replay is idempotent');
do $$declare v_status text;v_amount text;v_replay boolean;begin if extensions.num_failed()>0 then select result->>'status' into v_status from c1_cash_result;select paid_amount_text into v_amount from public.project_subcontract_payments where id=(select (result->>'paymentId')::uuid from c1_cash_result);select (public.c1_record_subcontract_payment('c1080000-0000-4000-8000-000000000020','c1080000-0000-4000-8000-000000000101','c1080000-0000-4000-8000-000000000301','{"expectedSubcontractVersion":0,"description":"First voucher","paidAmount":"100.0000","currencyCode":"VND","warrantyRetentionAmount":"5.0000","retentionRateBps":500}','c1080000-0000-4000-8000-000000000711','c1080000-0000-4000-8000-000000000713')->>'replayed')::boolean into v_replay;raise exception 'C1 cash record or replay assertion failed: status=%, amount=%, replay=%',v_status,v_amount,v_replay;end if;end$$;
select throws_ok($$select public.c1_record_subcontract_payment('c1080000-0000-4000-8000-000000000020','c1080000-0000-4000-8000-000000000101','c1080000-0000-4000-8000-000000000301','{"expectedSubcontractVersion":0,"description":"Changed","paidAmount":"100.0000","currencyCode":"VND"}','c1080000-0000-4000-8000-000000000711','c1080000-0000-4000-8000-000000000714')$$,'P0001','IDEMPOTENCY_CONFLICT','changed record replay conflicts');
do $$begin if extensions.num_failed()>0 then raise exception 'C1 cash idempotency conflict assertion failed';end if;end$$;
select throws_ok($$select public.c1_record_subcontract_payment('c1080000-0000-4000-8000-000000000020','c1080000-0000-4000-8000-000000000101','c1080000-0000-4000-8000-000000000301','{"expectedSubcontractVersion":0,"description":"Zero","paidAmount":"0","currencyCode":"VND"}','c1080000-0000-4000-8000-000000000715','c1080000-0000-4000-8000-000000000716')$$,'P0001','INPUT_INVALID','nonpositive cash is rejected');
select throws_ok($$select public.c1_record_subcontract_payment('c1080000-0000-4000-8000-000000000020','c1080000-0000-4000-8000-000000000101','c1080000-0000-4000-8000-000000000301','{"expectedSubcontractVersion":0,"description":"USD","paidAmount":"1","currencyCode":"USD"}','c1080000-0000-4000-8000-000000000717','c1080000-0000-4000-8000-000000000718')$$,'P0001','INPUT_INVALID','subcontract currency mismatch is rejected');
select throws_ok($$select public.c1_record_subcontract_payment('c1080000-0000-4000-8000-000000000020','c1080000-0000-4000-8000-000000000101','c1080000-0000-4000-8000-000000000301','{"expectedSubcontractVersion":9,"description":"Stale","paidAmount":"1","currencyCode":"VND"}','c1080000-0000-4000-8000-000000000719','c1080000-0000-4000-8000-000000000720')$$,'P0001','VERSION_CONFLICT','stale subcontract version is rejected');
do $$begin if extensions.num_failed()>0 then raise exception 'C1 cash input validation assertion failed';end if;end$$;

reset role;
select set_config('taskovia.c1_finance.actor_id','c1080000-0000-4000-8000-000000000901',true); select set_config('taskovia.c1_finance.request_id','c1080000-0000-4000-8000-000000000721',true); select set_config('taskovia.c1_finance.change_reason','forbidden rewrite',true);
select throws_ok($$update public.project_subcontract_payments set paid_amount_text='101.0000' where id=(select (result->>'paymentId')::uuid from c1_cash_result)$$,'P0001','HISTORY_IMMUTABLE','recorded money cannot be rewritten');
do $$begin if extensions.num_failed()>0 then raise exception 'C1 cash record assertion failed';end if;end$$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1080000-0000-4000-8000-000000000901","role":"authenticated"}',true);
create temp table c1_void_result as select public.c1_void_subcontract_payment('c1080000-0000-4000-8000-000000000020','c1080000-0000-4000-8000-000000000101','c1080000-0000-4000-8000-000000000301',(select (result->>'paymentId')::uuid from c1_cash_result),0,'Wrong voucher','c1080000-0000-4000-8000-000000000722','c1080000-0000-4000-8000-000000000723') result;
select is((select result->>'status' from c1_void_result),'voided','void command changes only payment lifecycle');
reset role;
select is((select paid_amount_text from public.project_subcontract_payments where id=(select (result->>'paymentId')::uuid from c1_cash_result)),'100.0000','void preserves recorded monetary value');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1080000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select is((public.c1_void_subcontract_payment('c1080000-0000-4000-8000-000000000020','c1080000-0000-4000-8000-000000000101','c1080000-0000-4000-8000-000000000301',(select (result->>'paymentId')::uuid from c1_cash_result),0,'Wrong voucher','c1080000-0000-4000-8000-000000000722','c1080000-0000-4000-8000-000000000724')->>'replayed')::boolean,true,'void replay is idempotent');
select throws_ok($$select public.c1_void_subcontract_payment('c1080000-0000-4000-8000-000000000020','c1080000-0000-4000-8000-000000000101','c1080000-0000-4000-8000-000000000301',(select (result->>'paymentId')::uuid from c1_cash_result),1,'Again','c1080000-0000-4000-8000-000000000725','c1080000-0000-4000-8000-000000000726')$$,'P0001','PAYMENT_ALREADY_VOIDED','double void is rejected');
create temp table c1_replacement_result as select public.c1_record_subcontract_payment('c1080000-0000-4000-8000-000000000020','c1080000-0000-4000-8000-000000000101','c1080000-0000-4000-8000-000000000301',jsonb_build_object('expectedSubcontractVersion',0,'description','Replacement','paidAmount','90.0000','currencyCode','VND','replacesPaymentId',(select result->>'paymentId' from c1_cash_result)),'c1080000-0000-4000-8000-000000000727','c1080000-0000-4000-8000-000000000728') result;
reset role;
select is((select replaces_payment_id from public.project_subcontract_payments where id=(select (result->>'paymentId')::uuid from c1_replacement_result)),(select (result->>'paymentId')::uuid from c1_cash_result),'replacement references the voided payment');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1080000-0000-4000-8000-000000000901","role":"authenticated"}',true);
select throws_ok($$select public.c1_record_subcontract_payment('c1080000-0000-4000-8000-000000000020','c1080000-0000-4000-8000-000000000101','c1080000-0000-4000-8000-000000000301',jsonb_build_object('expectedSubcontractVersion',0,'description','Duplicate replacement','paidAmount','80.0000','currencyCode','VND','replacesPaymentId',(select result->>'paymentId' from c1_cash_result)),'c1080000-0000-4000-8000-000000000729','c1080000-0000-4000-8000-000000000730')$$,'P0001','INPUT_INVALID','a voided payment can be replaced only once');
reset role;
select is((select sum(paid_amount_text::numeric)::text from public.project_subcontract_payments where project_subcontract_id='c1080000-0000-4000-8000-000000000301' and status='recorded'),'90.0000','canonical finance total counts only the replacement once');
select ok(not exists(select 1 from public.project_cost_items where tenant_id='c1080000-0000-4000-8000-000000000010'),'cash recording creates no project cost fact');

select * from extensions.finish(true);
rollback;
