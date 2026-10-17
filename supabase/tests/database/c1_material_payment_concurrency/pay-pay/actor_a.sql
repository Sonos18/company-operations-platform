-- C1 MATERIAL PAYMENT CONCURRENCY FIXTURE
begin;
select pg_catalog.set_config('taskovia.c140_fixture.request_y',(select request.id::text from public.material_payment_requests as request where request.tenant_id='c1400000-0000-4000-8000-000000000010' and request.company_id='c1400000-0000-4000-8000-000000000020' and request.project_id='c1400000-0000-4000-8000-000000000101' and request.installment_key='c1400000-0000-4000-8000-000000000a02'),true);
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims','{"sub":"c1400000-0000-4000-8000-000000000904","role":"authenticated"}',true);
select public.c1_material_record_payment('c1400000-0000-4000-8000-000000000020','c1400000-0000-4000-8000-000000000101',pg_catalog.current_setting('taskovia.c140_fixture.request_y')::uuid,'{"expectedVersion":2,"paidOn":"2026-10-02","bankReference":"C140-UNC-A","proofFileId":"c1400000-0000-4000-8000-000000000531"}','c1400000-0000-4000-8000-000000000641','c1400000-0000-4000-8000-000000000741');
set local role none;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('c1_material_payment_actor_a_ready:c1400000-0000-4000-8000-000000000010:c1400000-0000-4000-8000-000000000020',0));
select pg_catalog.pg_sleep(3);
commit;
select receipt.result_resource_id as resource_id from public.cost_command_receipts as receipt where receipt.tenant_id='c1400000-0000-4000-8000-000000000010' and receipt.company_id='c1400000-0000-4000-8000-000000000020' and receipt.actor_id='c1400000-0000-4000-8000-000000000904' and receipt.command_name='material.record_payment' and receipt.idempotency_key='c1400000-0000-4000-8000-000000000641';
