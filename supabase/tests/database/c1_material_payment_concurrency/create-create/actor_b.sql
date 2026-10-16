-- C1 MATERIAL PAYMENT CONCURRENCY FIXTURE
begin;
do $$
declare actor_a_holds_lock boolean := false;
begin
  for attempt in 1..100 loop
    actor_a_holds_lock := not pg_catalog.pg_try_advisory_lock(pg_catalog.hashtextextended('c1_material_payment_actor_a_ready:c1400000-0000-4000-8000-000000000010:c1400000-0000-4000-8000-000000000020',0));
    exit when actor_a_holds_lock;
    perform pg_catalog.pg_advisory_unlock(pg_catalog.hashtextextended('c1_material_payment_actor_a_ready:c1400000-0000-4000-8000-000000000010:c1400000-0000-4000-8000-000000000020',0));
    perform pg_catalog.pg_sleep(0.1);
  end loop;
  if not actor_a_holds_lock then raise exception 'C1 material payment actor A readiness barrier timed out'; end if;
end;
$$;
select pg_catalog.set_config('taskovia.c140_fixture.contract_x',(select contract.id::text from public.material_contracts as contract where contract.tenant_id='c1400000-0000-4000-8000-000000000010' and contract.company_id='c1400000-0000-4000-8000-000000000020' and contract.project_id='c1400000-0000-4000-8000-000000000101' and contract.order_id='c1400000-0000-4000-8000-000000000351'),true);
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims','{"sub":"c1400000-0000-4000-8000-000000000902","role":"authenticated"}',true);
select public.c1_material_create_payment_request('c1400000-0000-4000-8000-000000000020','c1400000-0000-4000-8000-000000000101',pg_catalog.current_setting('taskovia.c140_fixture.contract_x')::uuid,'{"installmentKey":"c1400000-0000-4000-8000-000000000a01","amount":"60.0000","invoiceIds":[],"note":"C140 race request B"}','c1400000-0000-4000-8000-000000000612','c1400000-0000-4000-8000-000000000712');
commit;
select receipt.result_resource_id as resource_id from public.cost_command_receipts as receipt where receipt.tenant_id='c1400000-0000-4000-8000-000000000010' and receipt.company_id='c1400000-0000-4000-8000-000000000020' and receipt.actor_id='c1400000-0000-4000-8000-000000000902' and receipt.command_name='material.create_payment_request' and receipt.idempotency_key='c1400000-0000-4000-8000-000000000612';
