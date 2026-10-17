-- C1 MATERIAL PAYMENT CONCURRENCY FIXTURE
select
  (select count(*)::integer from public.material_payment_requests as request
    where request.tenant_id='c1400000-0000-4000-8000-000000000010' and request.company_id='c1400000-0000-4000-8000-000000000020' and request.project_id='c1400000-0000-4000-8000-000000000101'
      and request.installment_key='c1400000-0000-4000-8000-000000000a01') as x_request_count,
  (select coalesce(sum(request.amount),0)::numeric(20,4)::text from public.material_payment_requests as request
    where request.tenant_id='c1400000-0000-4000-8000-000000000010' and request.company_id='c1400000-0000-4000-8000-000000000020' and request.project_id='c1400000-0000-4000-8000-000000000101'
      and request.installment_key='c1400000-0000-4000-8000-000000000a01' and request.state in ('submitted','approved')) as x_pending_amount_text,
  (select count(*)::integer from public.material_payment_requests as request
    where request.tenant_id='c1400000-0000-4000-8000-000000000010' and request.company_id='c1400000-0000-4000-8000-000000000020' and request.project_id='c1400000-0000-4000-8000-000000000101'
      and request.installment_key='c1400000-0000-4000-8000-000000000a01' and request.created_by='c1400000-0000-4000-8000-000000000901') as x_accountant_a_request_count,
  (select contract.current_version_no::integer from public.material_contracts as contract
    where contract.tenant_id='c1400000-0000-4000-8000-000000000010' and contract.company_id='c1400000-0000-4000-8000-000000000020' and contract.project_id='c1400000-0000-4000-8000-000000000101'
      and contract.order_id='c1400000-0000-4000-8000-000000000351') as x_contract_version_no,
  (select count(*)::integer from public.material_contract_versions as version_row
    join public.material_contracts as contract on contract.id=version_row.contract_id
    where contract.tenant_id='c1400000-0000-4000-8000-000000000010' and contract.company_id='c1400000-0000-4000-8000-000000000020' and contract.project_id='c1400000-0000-4000-8000-000000000101'
      and contract.order_id='c1400000-0000-4000-8000-000000000351') as x_version_count,
  (select item.amount::numeric(20,4)::text from public.material_contract_installments as item
    join public.material_contracts as contract on contract.id=item.contract_id
    join public.material_contract_versions as version_row on version_row.id=item.contract_version_id and version_row.version_no=contract.current_version_no
    where contract.tenant_id='c1400000-0000-4000-8000-000000000010' and contract.company_id='c1400000-0000-4000-8000-000000000020' and contract.project_id='c1400000-0000-4000-8000-000000000101'
      and contract.order_id='c1400000-0000-4000-8000-000000000351' and item.installment_key='c1400000-0000-4000-8000-000000000a01') as x_installment_amount_text,
  (select count(*)::integer from public.material_payments as payment
    where payment.tenant_id='c1400000-0000-4000-8000-000000000010' and payment.company_id='c1400000-0000-4000-8000-000000000020' and payment.project_id='c1400000-0000-4000-8000-000000000101'
      and payment.installment_key='c1400000-0000-4000-8000-000000000a02') as y_payment_count,
  (select count(*)::integer from public.material_payments as payment
    where payment.tenant_id='c1400000-0000-4000-8000-000000000010' and payment.company_id='c1400000-0000-4000-8000-000000000020' and payment.project_id='c1400000-0000-4000-8000-000000000101'
      and payment.installment_key='c1400000-0000-4000-8000-000000000a02' and payment.paid_by='c1400000-0000-4000-8000-000000000904'
      and payment.proof_file_id='c1400000-0000-4000-8000-000000000531') as y_treasurer_a_payment_count,
  (select request.state from public.material_payment_requests as request
    where request.tenant_id='c1400000-0000-4000-8000-000000000010' and request.company_id='c1400000-0000-4000-8000-000000000020' and request.project_id='c1400000-0000-4000-8000-000000000101'
      and request.installment_key='c1400000-0000-4000-8000-000000000a02') as y_request_state,
  (select request.version::integer from public.material_payment_requests as request
    where request.tenant_id='c1400000-0000-4000-8000-000000000010' and request.company_id='c1400000-0000-4000-8000-000000000020' and request.project_id='c1400000-0000-4000-8000-000000000101'
      and request.installment_key='c1400000-0000-4000-8000-000000000a02') as y_request_version,
  (select count(*)::integer from public.cost_command_receipts as receipt
    where receipt.tenant_id='c1400000-0000-4000-8000-000000000010' and receipt.company_id='c1400000-0000-4000-8000-000000000020'
      and receipt.idempotency_key in ('c1400000-0000-4000-8000-000000000612','c1400000-0000-4000-8000-000000000622','c1400000-0000-4000-8000-000000000632','c1400000-0000-4000-8000-000000000642')) as actor_b_receipt_count,
  (select coalesce(bool_and(usage.paid + usage.pending <= item.amount), false)
    from public.material_contracts as contract
    join public.material_contract_versions as version_row on version_row.contract_id=contract.id and version_row.version_no=contract.current_version_no
    join public.material_contract_installments as item on item.contract_version_id=version_row.id
    cross join lateral (
      select
        (select coalesce(sum(payment.amount),0) from public.material_payments as payment
          where payment.contract_id=contract.id and payment.installment_key=item.installment_key) as paid,
        (select coalesce(sum(request.amount),0) from public.material_payment_requests as request
          where request.contract_id=contract.id and request.installment_key=item.installment_key and request.state in ('submitted','approved')) as pending
    ) as usage
    where contract.tenant_id='c1400000-0000-4000-8000-000000000010' and contract.company_id='c1400000-0000-4000-8000-000000000020' and contract.project_id='c1400000-0000-4000-8000-000000000101') as installment_invariant_holds;
