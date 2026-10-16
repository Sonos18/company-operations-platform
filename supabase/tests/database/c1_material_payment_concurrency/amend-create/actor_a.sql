-- C1 MATERIAL PAYMENT CONCURRENCY FIXTURE
begin;
select pg_catalog.set_config('taskovia.c140_fixture.contract_x',(select contract.id::text from public.material_contracts as contract where contract.tenant_id='c1400000-0000-4000-8000-000000000010' and contract.company_id='c1400000-0000-4000-8000-000000000020' and contract.project_id='c1400000-0000-4000-8000-000000000101' and contract.order_id='c1400000-0000-4000-8000-000000000351'),true);
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims','{"sub":"c1400000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select public.c1_material_amend_contract('c1400000-0000-4000-8000-000000000020','c1400000-0000-4000-8000-000000000101',pg_catalog.current_setting('taskovia.c140_fixture.contract_x')::uuid,'{"expectedVersion":1,"subtotal":"50.0000","vatAmount":"0.0000","total":"50.0000","varianceReason":"C140 race amendment below the order subtotal","amendmentFileId":"c1400000-0000-4000-8000-000000000521","reason":"C140 race lowers installment X to 50","installments":[{"installmentKey":"c1400000-0000-4000-8000-000000000a01","name":"C140 Dot X","amount":"50.0000","dueOn":"2026-12-01","isAdvance":true}]}','c1400000-0000-4000-8000-000000000631','c1400000-0000-4000-8000-000000000731');
set local role none;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('c1_material_payment_actor_a_ready:c1400000-0000-4000-8000-000000000010:c1400000-0000-4000-8000-000000000020',0));
select pg_catalog.pg_sleep(3);
commit;
select receipt.result_resource_id as resource_id from public.cost_command_receipts as receipt where receipt.tenant_id='c1400000-0000-4000-8000-000000000010' and receipt.company_id='c1400000-0000-4000-8000-000000000020' and receipt.actor_id='c1400000-0000-4000-8000-000000000903' and receipt.command_name='material.amend_contract' and receipt.idempotency_key='c1400000-0000-4000-8000-000000000631';
