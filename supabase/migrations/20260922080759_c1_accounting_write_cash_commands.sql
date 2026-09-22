set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,7);

do $$ begin
  if to_regclass('public.project_subcontract_payments') is null or to_regclass('public.project_subcontracts') is null or to_regprocedure('private.c1_finance_guard_recorded_money()') is null then raise exception using errcode='P0001',message='C1_ACCOUNTING_CASH_BASELINE_MISSING'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='project_subcontract_payments' and column_name='replaces_payment_id') then raise exception using errcode='P0001',message='C1_ACCOUNTING_CASH_ALREADY_APPLIED'; end if;
end $$;

alter table public.project_subcontract_payments add column replaces_payment_id uuid;
alter table public.project_subcontract_payments add constraint c1_payment_replacement_self check(replaces_payment_id is null or replaces_payment_id<>id), add constraint c1_payment_replacement_scope foreign key(replaces_payment_id,tenant_id,company_id,project_id) references public.project_subcontract_payments(id,tenant_id,company_id,project_id) on delete restrict;
create unique index c1_payment_replacement_once on public.project_subcontract_payments(replaces_payment_id) where replaces_payment_id is not null;

create or replace function private.c1_finance_guard_recorded_money()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  if tg_op='INSERT' then if new.status<>'recorded' then raise exception 'C1_FINANCE_CREATE_RECORDED_ONLY'; end if; return new; end if;
  if tg_table_name='project_owner_advances' then
    if row(new.currency_code,new.description,new.amount_text,new.received_date,new.payer_name,new.receipt_no,new.reference,new.source_reference) is distinct from row(old.currency_code,old.description,old.amount_text,old.received_date,old.payer_name,old.receipt_no,old.reference,old.source_reference) then raise exception using errcode='P0001',message='HISTORY_IMMUTABLE'; end if;
  else
    if row(new.project_subcontract_id,new.currency_code,new.description,new.payment_date,new.paid_amount_text,new.warranty_retention_amount_text,new.retention_rate_bps,new.payment_reference,new.source_reference,new.replaces_payment_id) is distinct from row(old.project_subcontract_id,old.currency_code,old.description,old.payment_date,old.paid_amount_text,old.warranty_retention_amount_text,old.retention_rate_bps,old.payment_reference,old.source_reference,old.replaces_payment_id) then raise exception using errcode='P0001',message='HISTORY_IMMUTABLE'; end if;
  end if;
  if old.status='voided' and new.status<>'voided' then raise exception using errcode='P0001',message='HISTORY_IMMUTABLE'; end if;
  return new;
end;
$$;
revoke all on function private.c1_finance_guard_recorded_money() from public,anon,authenticated,service_role;

create function private.c1_record_subcontract_payment(target_company_id uuid,target_project_id uuid,target_subcontract_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare
  v_context jsonb; v_actor_id uuid:=auth.uid(); v_tenant_id uuid; v_subcontract public.project_subcontracts%rowtype; v_payment public.project_subcontract_payments%rowtype;
  v_replaces uuid; v_evidence_ids uuid[]:=array[]::uuid[]; v_request_hash text; v_receipt public.cost_command_receipts%rowtype; v_payment_date date;
begin
  if v_actor_id is null then raise exception using errcode='P0001',message='PERMISSION_DENIED'; end if;
  v_context:=private.c1_master_context(target_company_id, 'cost.record_cash'); v_tenant_id:=(v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id or target_idempotency_key is null or target_request_id is null or jsonb_typeof(target_input) is distinct from 'object'
    or not(target_input ?& array['expectedSubcontractVersion','description','paidAmount','currencyCode'])
    or exists(select 1 from jsonb_object_keys(target_input) key where key not in('expectedSubcontractVersion','description','paidAmount','currencyCode','paymentDate','warrantyRetentionAmount','retentionRateBps','paymentReference','sourceReference','note','replacesPaymentId','evidenceFileIds'))
    or jsonb_typeof(target_input->'expectedSubcontractVersion') is distinct from 'number' or target_input->>'expectedSubcontractVersion' !~ '^\d+$'
    or jsonb_typeof(target_input->'description') is distinct from 'string' or btrim(target_input->>'description')=''
    or jsonb_typeof(target_input->'paidAmount') is distinct from 'string' or target_input->>'paidAmount' !~ '^\d{1,16}(\.\d{1,4})?$' or (target_input->>'paidAmount')::numeric<=0
    or jsonb_typeof(target_input->'currencyCode') is distinct from 'string' or target_input->>'currencyCode' !~ '^[A-Z]{3}$'
    or (target_input ? 'paymentDate' and (jsonb_typeof(target_input->'paymentDate') is distinct from 'string' or target_input->>'paymentDate' !~ '^\d{4}-\d{2}-\d{2}$'))
    or (target_input ? 'warrantyRetentionAmount' and (jsonb_typeof(target_input->'warrantyRetentionAmount') not in('string','null') or (jsonb_typeof(target_input->'warrantyRetentionAmount')='string' and target_input->>'warrantyRetentionAmount' !~ '^\d{1,16}(\.\d{1,4})?$')))
    or (target_input ? 'retentionRateBps' and jsonb_typeof(target_input->'retentionRateBps') not in('number','null'))
    or (target_input ? 'retentionRateBps' and jsonb_typeof(target_input->'retentionRateBps')='number' and ((target_input->>'retentionRateBps')::int<0 or (target_input->>'retentionRateBps')::int>10000))
    or (target_input ? 'retentionRateBps' and jsonb_typeof(target_input->'retentionRateBps')='number' and nullif(target_input->>'warrantyRetentionAmount','') is null)
    or (target_input ? 'replacesPaymentId' and jsonb_typeof(target_input->'replacesPaymentId') is distinct from 'string')
    or (target_input ? 'evidenceFileIds' and jsonb_typeof(target_input->'evidenceFileIds') is distinct from 'array')
  then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  begin
    v_replaces:=case when target_input ? 'replacesPaymentId' then (target_input->>'replacesPaymentId')::uuid end;
    select coalesce(array_agg(value::uuid order by value),array[]::uuid[]) into v_evidence_ids from jsonb_array_elements_text(coalesce(target_input->'evidenceFileIds','[]'::jsonb)) source(value);
  exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID'; end;
  if cardinality(v_evidence_ids)<>(select count(distinct value) from unnest(v_evidence_ids) source(value)) then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  v_payment_date:=case when target_input ? 'paymentDate' then private.c1_parse_project_cost_date(target_input->>'paymentDate') end;
  v_request_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('companyId',target_company_id,'projectId',target_project_id,'subcontractId',target_subcontract_id,'input',target_input)),'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('c1_payment:record:'||target_company_id::text||':'||v_actor_id::text||':'||target_idempotency_key::text,0));
  select receipt.* into v_receipt from public.cost_command_receipts receipt where receipt.company_id=target_company_id and receipt.actor_id=v_actor_id and receipt.command_name='subcontract_payment.record' and receipt.idempotency_key=target_idempotency_key for update;
  if found then if v_receipt.request_hash<>v_request_hash then raise exception using errcode='P0001',message='IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('paymentId',v_receipt.result_resource_id,'version',v_receipt.result_version,'status','recorded','replayed',true); end if;
  select subcontract.* into v_subcontract from public.project_subcontracts subcontract where subcontract.id=target_subcontract_id and subcontract.tenant_id=v_tenant_id and subcontract.company_id=target_company_id and subcontract.project_id=target_project_id for update;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  if not v_subcontract.is_active then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  if v_subcontract.version<>(target_input->>'expectedSubcontractVersion')::bigint then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
  if v_subcontract.currency_code<>target_input->>'currencyCode' then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  if v_replaces is not null and (not exists(select 1 from public.project_subcontract_payments payment where payment.id=v_replaces and payment.tenant_id=v_tenant_id and payment.company_id=target_company_id and payment.project_id=target_project_id and payment.project_subcontract_id=target_subcontract_id and payment.status='voided') or exists(select 1 from public.project_subcontract_payments payment where payment.replaces_payment_id=v_replaces)) then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  if cardinality(v_evidence_ids)>0 and (select count(*) from public.cost_evidence_files file where file.id=any(v_evidence_ids) and file.tenant_id=v_tenant_id and file.company_id=target_company_id and file.project_id=target_project_id and file.status='finalized')<>cardinality(v_evidence_ids) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  perform set_config('taskovia.c1_finance.request_id',target_request_id::text,true); perform set_config('taskovia.c1_finance.change_reason','record subcontract payment',true);
  insert into public.project_subcontract_payments(tenant_id,company_id,project_id,project_subcontract_id,currency_code,description,payment_date,paid_amount_text,warranty_retention_amount_text,retention_rate_bps,payment_reference,source_reference,note,status,replaces_payment_id)
  values(v_tenant_id,target_company_id,target_project_id,target_subcontract_id,target_input->>'currencyCode',btrim(target_input->>'description'),v_payment_date,target_input->>'paidAmount',nullif(target_input->>'warrantyRetentionAmount',''),nullif(target_input->>'retentionRateBps','')::int,nullif(btrim(target_input->>'paymentReference'),''),nullif(btrim(target_input->>'sourceReference'),''),target_input->>'note','recorded',v_replaces) returning * into v_payment;
  insert into public.cost_evidence_links(tenant_id,company_id,project_id,evidence_file_id,project_subcontract_payment_id,evidence_kind,request_id,created_by) select v_tenant_id,target_company_id,target_project_id,evidence_id,v_payment.id,'payment_proof',target_request_id,v_actor_id from unnest(v_evidence_ids) evidence(evidence_id);
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version) values(v_tenant_id,target_company_id,v_actor_id,'subcontract_payment.record',target_idempotency_key,v_request_hash,v_payment.id,v_payment.version);
  return jsonb_build_object('paymentId',v_payment.id,'version',v_payment.version,'status',v_payment.status,'replayed',false);
end;
$$;

create function private.c1_void_subcontract_payment(target_company_id uuid,target_project_id uuid,target_subcontract_id uuid,target_payment_id uuid,target_expected_version bigint,target_reason text,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_context jsonb; v_actor_id uuid:=auth.uid(); v_tenant_id uuid; v_request_hash text; v_receipt public.cost_command_receipts%rowtype; v_payment public.project_subcontract_payments%rowtype;
begin
  if v_actor_id is null then raise exception using errcode='P0001',message='PERMISSION_DENIED'; end if;
  v_context:=private.c1_master_context(target_company_id, 'cost.record_cash'); v_tenant_id:=(v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id or target_expected_version is null or target_expected_version<0 or target_reason is null or btrim(target_reason)='' or target_idempotency_key is null or target_request_id is null then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  v_request_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('companyId',target_company_id,'projectId',target_project_id,'subcontractId',target_subcontract_id,'paymentId',target_payment_id,'expectedVersion',target_expected_version,'reason',btrim(target_reason))),'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('c1_payment:void:'||target_company_id::text||':'||v_actor_id::text||':'||target_idempotency_key::text,0));
  select receipt.* into v_receipt from public.cost_command_receipts receipt where receipt.company_id=target_company_id and receipt.actor_id=v_actor_id and receipt.command_name='subcontract_payment.void' and receipt.idempotency_key=target_idempotency_key for update;
  if found then if v_receipt.request_hash<>v_request_hash then raise exception using errcode='P0001',message='IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('paymentId',v_receipt.result_resource_id,'version',v_receipt.result_version,'status','voided','replayed',true); end if;
  select payment.* into v_payment from public.project_subcontract_payments payment where payment.id=target_payment_id and payment.tenant_id=v_tenant_id and payment.company_id=target_company_id and payment.project_id=target_project_id and payment.project_subcontract_id=target_subcontract_id for update;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  if v_payment.status='voided' then raise exception using errcode='P0001',message='PAYMENT_ALREADY_VOIDED'; end if;
  if v_payment.version<>target_expected_version then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
  perform set_config('taskovia.c1_finance.request_id',target_request_id::text,true); perform set_config('taskovia.c1_finance.change_reason',btrim(target_reason),true);
  update public.project_subcontract_payments payment set status='voided',void_reason=btrim(target_reason) where payment.id=v_payment.id returning * into v_payment;
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version) values(v_tenant_id,target_company_id,v_actor_id,'subcontract_payment.void',target_idempotency_key,v_request_hash,v_payment.id,v_payment.version);
  return jsonb_build_object('paymentId',v_payment.id,'version',v_payment.version,'status',v_payment.status,'replayed',false);
end;
$$;

create function public.c1_record_subcontract_payment(target_company_id uuid,target_project_id uuid,target_subcontract_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb language sql volatile security definer set search_path='' as $$select private.c1_record_subcontract_payment(target_company_id,target_project_id,target_subcontract_id,target_input,target_idempotency_key,target_request_id);$$;
create function public.c1_void_subcontract_payment(target_company_id uuid,target_project_id uuid,target_subcontract_id uuid,target_payment_id uuid,target_expected_version bigint,target_reason text,target_idempotency_key uuid,target_request_id uuid) returns jsonb language sql volatile security definer set search_path='' as $$select private.c1_void_subcontract_payment(target_company_id,target_project_id,target_subcontract_id,target_payment_id,target_expected_version,target_reason,target_idempotency_key,target_request_id);$$;
revoke all on function private.c1_record_subcontract_payment(uuid,uuid,uuid,jsonb,uuid,uuid),private.c1_void_subcontract_payment(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.c1_record_subcontract_payment(uuid, uuid, uuid, jsonb, uuid, uuid),public.c1_void_subcontract_payment(uuid, uuid, uuid, uuid, bigint, text, uuid, uuid) from public,anon,authenticated;
grant execute on function public.c1_record_subcontract_payment(uuid, uuid, uuid, jsonb, uuid, uuid) to authenticated;
grant execute on function public.c1_void_subcontract_payment(uuid, uuid, uuid, uuid, bigint, text, uuid, uuid) to authenticated;

notify pgrst,'reload schema';
