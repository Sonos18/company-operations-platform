set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,31);

create table public.cost_workflow_cash_states(
 payment_id uuid primary key,tenant_id uuid not null,company_id uuid not null,project_id uuid not null,
 version bigint not null default 0 check(version>=0),
 foreign key(payment_id,tenant_id,company_id,project_id) references public.cost_workflow_payments(id,tenant_id,company_id,project_id) on delete restrict);
alter table public.cost_workflow_cash_states enable row level security;
alter table public.cost_workflow_cash_states force row level security;
revoke all on public.cost_workflow_cash_states from public,anon,authenticated,service_role;
grant select on public.cost_workflow_cash_states to authenticated;
create policy c1_workflow_cash_states_read on public.cost_workflow_cash_states for select to authenticated using(private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger c1_workflow_cash_states_retain before delete on public.cost_workflow_cash_states for each row execute function private.c1_workflow_retain_history();
alter table public.cost_workflow_payments add column cash_event_hash text not null check(cash_event_hash ~ '^[a-f0-9]{64}$');
create unique index c1_workflow_payment_event on public.cost_workflow_payments(tenant_id,company_id,project_id,cash_event_hash);
alter table public.cost_workflow_refunds add column cash_event_hash text not null check(cash_event_hash ~ '^[a-f0-9]{64}$');
create unique index c1_workflow_refund_event on public.cost_workflow_refunds(tenant_id,company_id,project_id,cash_event_hash);
alter table public.cost_workflow_corrections add column event_sequence bigint not null check(event_sequence>0);
create unique index c1_workflow_correction_sequence on public.cost_workflow_corrections(source_payment_id,event_sequence);
-- Stage workflow identity/consumption before the single canonical cash row is inserted.
do $fk$
declare f record;
begin
 for f in select conname from pg_catalog.pg_constraint where conrelid='public.cost_workflow_payments'::regclass and confrelid='public.project_subcontract_payments'::regclass
 loop execute format('alter table public.cost_workflow_payments alter constraint %I deferrable initially deferred',f.conname);end loop;
end;$fk$;

-- A database uniqueness constraint closes proof races even at repeatable-read.
-- Ambiguous shared transfer proof is blocked pending an explicitly reviewed allocation path.
create table public.cost_workflow_cash_proof_claims(
 tenant_id uuid not null,company_id uuid not null,project_id uuid not null,
 proof_sha256 text not null check(proof_sha256 ~ '^[a-f0-9]{64}$'),
 payment_id uuid,refund_id uuid,claimed_at timestamptz not null default now(),
 primary key(tenant_id,company_id,proof_sha256),
 check((payment_id is not null)::integer+(refund_id is not null)::integer=1),
 foreign key(project_id,tenant_id,company_id) references public.projects(id,tenant_id,company_id) on delete restrict,
 foreign key(payment_id,tenant_id,company_id,project_id) references public.cost_workflow_payments(id,tenant_id,company_id,project_id) on delete restrict,
 foreign key(refund_id,tenant_id,company_id,project_id) references public.cost_workflow_refunds(id,tenant_id,company_id,project_id) on delete restrict
);
alter table public.cost_workflow_cash_proof_claims enable row level security;
alter table public.cost_workflow_cash_proof_claims force row level security;
revoke all on public.cost_workflow_cash_proof_claims from public,anon,authenticated,service_role;
grant select on public.cost_workflow_cash_proof_claims to authenticated;
create policy c1_workflow_cash_proof_claims_read on public.cost_workflow_cash_proof_claims for select to authenticated using(private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger c1_workflow_cash_proof_claims_retain before update or delete on public.cost_workflow_cash_proof_claims for each row execute function private.c1_workflow_retain_history();

create function private.c1_workflow_claim_cash_proof(t uuid,c uuid,p uuid,ids uuid[],outgoing_id uuid,incoming_id uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 insert into public.cost_workflow_cash_proof_claims(tenant_id,company_id,project_id,proof_sha256,payment_id,refund_id)
 select distinct t,c,p,f.verified_sha256,outgoing_id,incoming_id from public.cost_evidence_files f
 where f.id=any(ids) and f.tenant_id=t and f.company_id=c and f.project_id=p and f.status='finalized'
 and (f.workflow_evidence_kind='payment_proof' or exists(select 1 from public.cost_evidence_links l where l.evidence_file_id=f.id and l.tenant_id=t and l.company_id=c and l.project_id=p and l.evidence_kind='payment_proof'));
exception when unique_violation then raise exception using errcode='P0001',message='CASH_DUPLICATE_EVENT';
end;$$;
revoke all on function private.c1_workflow_claim_cash_proof(uuid,uuid,uuid,uuid[],uuid,uuid) from public,anon,authenticated,service_role;

create function private.c1_workflow_require_cash_proof(t uuid,c uuid,p uuid,ids uuid[]) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.c1_workflow_require_evidence(t,c,p,ids);
 if not exists(select 1 from public.cost_evidence_files f where f.id=any(ids) and f.tenant_id=t and f.company_id=c and f.project_id=p and
 (f.workflow_evidence_kind='payment_proof' or exists(select 1 from public.cost_evidence_links l where l.evidence_file_id=f.id and l.tenant_id=t and l.company_id=c and l.project_id=p and l.evidence_kind='payment_proof')))
 then raise exception using errcode='P0001',message='CASH_PROOF_REQUIRED';end if;
end;$$;
-- New cash needs an original filed for this exact payment/refund target.
-- The existing targetless helper remains only for explicitly reviewed legacy cash.
create function private.c1_workflow_require_cash_target_proof(t uuid,c uuid,p uuid,ids uuid[],expected_target_kind text,expected_target_id uuid,expected_source_payment_id uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.c1_workflow_require_cash_proof(t,c,p,ids);
 if expected_target_id is null or expected_target_kind not in('payment','adjustment') or not exists(
  select 1 from public.cost_evidence_files f where f.id=any(ids) and f.tenant_id=t and f.company_id=c and f.project_id=p and f.status='finalized'
  and f.workflow_origin and f.workflow_evidence_kind='payment_proof'
  and ((f.workflow_target_kind=expected_target_kind and f.workflow_target_id=expected_target_id)
   or (expected_target_kind='adjustment' and expected_source_payment_id is not null and f.workflow_target_kind='adjustment_source' and f.workflow_target_id=expected_source_payment_id))
 ) then raise exception using errcode='P0001',message='CASH_PROOF_REQUIRED';end if;
end;$$;
revoke all on function private.c1_workflow_require_cash_target_proof(uuid,uuid,uuid,uuid[],text,uuid,uuid) from public,anon,authenticated,service_role;
-- A used financial proof is an ambiguity/conflict, not an inferred new event.
-- Reference edits, amount/date edits and duplicate original uploads cannot bypass
-- this conservative guard. Shared-transfer allocation needs a separately reviewed path.
create function private.c1_workflow_require_unused_cash_proof(t uuid,c uuid,p uuid,ids uuid[]) returns void
language plpgsql volatile security definer set search_path='' as $$
declare proof_hash text;
begin
 for proof_hash in select distinct f.verified_sha256 from public.cost_evidence_files f
 where f.id=any(ids) and f.tenant_id=t and f.company_id=c and f.project_id=p and f.status='finalized'
 and (f.workflow_evidence_kind='payment_proof' or exists(select 1 from public.cost_evidence_links l where l.evidence_file_id=f.id and l.tenant_id=t and l.company_id=c and l.project_id=p and l.evidence_kind='payment_proof'))
 order by f.verified_sha256
 loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('c1-workflow-proof:'||t::text||':'||c::text||':'||proof_hash,0));
  if exists(select 1 from public.cost_workflow_payments previous join public.cost_evidence_files known on known.id=any(previous.evidence_file_ids)
    where previous.tenant_id=t and previous.company_id=c and known.tenant_id=t and known.company_id=c and known.verified_sha256=proof_hash)
   or exists(select 1 from public.cost_workflow_refunds previous join public.cost_evidence_files known on known.id=any(previous.evidence_file_ids)
    where previous.tenant_id=t and previous.company_id=c and known.tenant_id=t and known.company_id=c and known.verified_sha256=proof_hash)
  then raise exception using errcode='P0001',message='CASH_DUPLICATE_EVENT';end if;
 end loop;
end;$$;
revoke all on function private.c1_workflow_require_unused_cash_proof(uuid,uuid,uuid,uuid[]) from public,anon,authenticated,service_role;
create function private.c1_workflow_cash_event_hash(t uuid,c uuid,p uuid,kind text,input jsonb,ids uuid[]) returns text
language sql stable security definer set search_path='' as $$
 select encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('kind',kind,'input',input,'originalHashes',
 (select jsonb_agg(q.hash order by q.hash) from (select distinct f.verified_sha256 hash from public.cost_evidence_files f where f.id=any(ids) and f.tenant_id=t and f.company_id=c and f.project_id=p and
 (f.workflow_evidence_kind='payment_proof' or exists(select 1 from public.cost_evidence_links l where l.evidence_file_id=f.id and l.tenant_id=t and l.company_id=c and l.project_id=p and l.evidence_kind='payment_proof'))) q))),'UTF8'),'sha256'),'hex');
$$;
create function private.c1_workflow_settlement_payment_allowed(t uuid,c uuid,p uuid,payment_id uuid,completed boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cost_workflow_payments payment where payment.id=payment_id and payment.tenant_id=t and payment.company_id=c and payment.project_id=p
 and (not completed or exists(select 1 from public.cost_workflow_completion_installments h where h.installment_id=payment.installment_id)));
$$;
create function private.c1_workflow_valid_cash(payment_id uuid) returns numeric
language sql stable security definer set search_path='' as $$
 select coalesce((select x.corrected_outgoing from public.cost_workflow_corrections x where x.source_payment_id=$1 order by x.event_sequence desc limit 1),p.ordinary_amount,canonical.paid_amount)
 from public.cost_workflow_payments p left join public.project_subcontract_payments canonical on canonical.id=p.subcontract_payment_id and canonical.tenant_id=p.tenant_id and canonical.company_id=p.company_id and canonical.project_id=p.project_id where p.id=$1;
$$;
create function private.c1_workflow_payment_party(payment_id uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select i.party_id from public.cost_workflow_payments p join public.cost_workflow_installments i on i.id=p.installment_id where p.id=$1;
$$;

create function public.c1_workflow_confirm_payment(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;state text;assignment public.cost_workflow_manager_assignments%rowtype;installment public.cost_workflow_installments%rowtype;contract public.cost_workflow_contracts%rowtype;
 payment public.cost_workflow_payments%rowtype;receipt public.cost_command_receipts%rowtype;hash text;event_hash text;expected bigint;payment_version bigint;scale integer;amount numeric;consumed numeric;ids uuid[];payment_date date;reference text;canonical_id uuid;basis jsonb;
begin
 context:=private.c1_workflow_context(target_company_id,'cost.record_cash');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.record_cash');perform private.c1_workflow_lock_actor(t,target_company_id,'cost.request.submit');
 state:=private.c1_workflow_project_state(t,target_company_id,target_project_id);assignment:=private.c1_workflow_lock_assignment(t,target_company_id,target_project_id);
 select * into installment from public.cost_workflow_installments where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 if installment.contract_id is not null then select * into contract from public.cost_workflow_contracts where id=installment.contract_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id for update;end if;
 perform private.c1_workflow_require_keys(target_input,array['amount','currencyCode','paymentDate','reference','evidenceFileIds','expectedVersion'],array['amount','currencyCode','paymentDate','reference','evidenceFileIds','expectedVersion']);
 expected:=private.c1_detail_expected_version(target_input);select money_scale into scale from public.company_cost_settings where tenant_id=t and company_id=target_company_id and enabled;
 amount:=private.c1_workflow_money(target_input->'amount',scale);payment_date:=private.c1_workflow_date(target_input->'paymentDate');reference:=private.c1_workflow_text(target_input->'reference');
 if amount<=0 or private.c1_workflow_text(target_input->'currencyCode')<>installment.currency_code then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 ids:=private.c1_workflow_evidence_ids(target_input->'evidenceFileIds');perform private.c1_workflow_require_cash_target_proof(t,target_company_id,target_project_id,ids,'payment',installment.id,null);
 hash:=private.c1_workflow_hash(target_project_id,target_id,target_input);receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.confirm_payment',target_idempotency_key,hash);
 if receipt.id is not null then return jsonb_build_object('paymentId',receipt.result_resource_id,'version',receipt.result_version,'replayed',true);end if;
 if state='completed' and not exists(select 1 from public.cost_workflow_completion_installments h where h.installment_id=installment.id and h.tenant_id=t and h.company_id=target_company_id and h.project_id=target_project_id)
 then raise exception using errcode='P0001',message='PROJECT_COMPLETED';end if;
 perform 1 from public.cost_workflow_installments where id=installment.id for update;
 select count(*),coalesce(sum(x.amount),0) into payment_version,consumed from public.cost_workflow_consumptions x where x.installment_id=installment.id;
 if payment_version<>expected then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 if consumed+amount>installment.authorized_amount then raise exception using errcode='P0001',message='CASH_AUTHORITY_EXCEEDED';end if;
 event_hash:=private.c1_workflow_cash_event_hash(t,target_company_id,target_project_id,'payment',jsonb_build_object('amount',amount::numeric(20,4)::text,'currency',installment.currency_code,'date',payment_date),ids);
 if exists(select 1 from public.cost_workflow_payments p where p.tenant_id=t and p.company_id=target_company_id and p.project_id=target_project_id and p.cash_event_hash=event_hash) then raise exception using errcode='P0001',message='CASH_DUPLICATE_EVENT';end if;
 select v.snapshot->'basis' into basis from public.cost_workflow_request_versions v join public.cost_workflow_requests r on r.submitted_version_id=v.id where r.id=installment.request_id;
 if basis->>'kind'='subcontract' then
  if contract.source_subcontract_id is null or contract.source_subcontract_id is distinct from (basis->>'subcontractId')::uuid then raise exception using errcode='P0001',message='CONTRACT_BASIS_REQUIRED';end if;
  canonical_id:=gen_random_uuid();
 end if;
 perform private.c1_workflow_require_unused_cash_proof(t,target_company_id,target_project_id,ids);
 insert into public.cost_workflow_payments(tenant_id,company_id,project_id,installment_id,cash_kind,ordinary_amount,subcontract_payment_id,currency_code,payment_date,reference,evidence_file_ids,confirmed_by,cash_event_hash)
 values(t,target_company_id,target_project_id,installment.id,case when canonical_id is null then 'ordinary' else 'subcontract' end,case when canonical_id is null then amount end,canonical_id,installment.currency_code,payment_date,reference,ids,auth.uid(),event_hash) returning * into payment;
 perform private.c1_workflow_claim_cash_proof(t,target_company_id,target_project_id,ids,payment.id,null);
 insert into public.cost_workflow_consumptions(tenant_id,company_id,project_id,installment_id,payment_id,amount) values(t,target_company_id,target_project_id,installment.id,payment.id,amount);
 insert into public.cost_workflow_cash_states(payment_id,tenant_id,company_id,project_id) values(payment.id,t,target_company_id,target_project_id);
 if canonical_id is not null then
  perform set_config('taskovia.c1_finance.request_id',target_request_id::text,true);perform set_config('taskovia.c1_finance.change_reason','approved installment actual payment',true);
  insert into public.project_subcontract_payments(id,tenant_id,company_id,project_id,project_subcontract_id,currency_code,description,payment_date,paid_amount_text,payment_reference)
  values(canonical_id,t,target_company_id,target_project_id,contract.source_subcontract_id,installment.currency_code,reference,payment_date,amount::text,reference);
 end if;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.confirm_payment',target_idempotency_key,hash,payment.id,payment_version+1,target_request_id,jsonb_build_object('projectId',target_project_id,'installmentId',installment.id,'amount',amount::text,'cashKind',payment.cash_kind,'canonicalPaymentId',canonical_id,'evidenceFileIds',ids));
 return jsonb_build_object('paymentId',payment.id,'version',payment_version+1,'replayed',false);
end;$$;

create function public.c1_workflow_create_cash_adjustment(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;state text;assignment public.cost_workflow_manager_assignments%rowtype;payment public.cost_workflow_payments%rowtype;cash_state public.cost_workflow_cash_states%rowtype;
 request public.cost_workflow_requests%rowtype;snapshot public.cost_workflow_request_versions%rowtype;receipt public.cost_command_receipts%rowtype;hash text;expected bigint;scale integer;kind text;amount numeric;refunded numeric;valid_cash numeric;original numeric;ids uuid[];
begin
 context:=private.c1_workflow_context(target_company_id,'cost.correct');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.correct');perform private.c1_workflow_lock_actor(t,target_company_id,'cost.request.submit');
 state:=private.c1_workflow_project_state(t,target_company_id,target_project_id);assignment:=private.c1_workflow_lock_manager(t,target_company_id,target_project_id);
 select * into payment from public.cost_workflow_payments where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id for update;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 if not private.c1_workflow_settlement_payment_allowed(t,target_company_id,target_project_id,payment.id,state='completed') then raise exception using errcode='P0001',message='PROJECT_COMPLETED';end if;
 kind:=private.c1_workflow_text(target_input->'kind');
 if kind not in('refund','correction') then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 perform private.c1_workflow_require_keys(target_input,case when kind='refund' then array['kind','requestedAmount','reason','evidenceFileIds','expectedVersion'] else array['kind','correctedOutgoing','reason','evidenceFileIds','expectedVersion'] end,case when kind='refund' then array['kind','requestedAmount','reason','evidenceFileIds','expectedVersion'] else array['kind','correctedOutgoing','reason','evidenceFileIds','expectedVersion'] end);
 expected:=private.c1_detail_expected_version(target_input);perform private.c1_workflow_text(target_input->'reason');
 select money_scale into scale from public.company_cost_settings where tenant_id=t and company_id=target_company_id and enabled;
 amount:=private.c1_workflow_money(target_input->(case when kind='refund' then 'requestedAmount' else 'correctedOutgoing' end),scale);
 ids:=private.c1_workflow_evidence_ids(target_input->'evidenceFileIds');perform private.c1_workflow_require_evidence(t,target_company_id,target_project_id,ids);
 hash:=private.c1_workflow_hash(target_project_id,target_id,target_input);receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.create_cash_adjustment',target_idempotency_key,hash);
 if receipt.id is not null then return jsonb_build_object('adjustmentId',receipt.result_resource_id,'version',receipt.result_version,'replayed',true);end if;
 select * into cash_state from public.cost_workflow_cash_states where payment_id=payment.id for update;
 if not found or cash_state.version<>expected then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 valid_cash:=private.c1_workflow_valid_cash(payment.id);
 select coalesce(sum(r.amount),0) into refunded from public.cost_workflow_refunds r where r.source_payment_id=payment.id;
 select coalesce(payment.ordinary_amount,canonical.paid_amount) into original from public.project_subcontract_payments canonical where canonical.id=payment.subcontract_payment_id;
 original:=coalesce(payment.ordinary_amount,original);
 if kind='refund' and (amount<=0 or amount+refunded>valid_cash) then raise exception using errcode='P0001',message='CASH_REFUND_EXCEEDED';end if;
 if kind='correction' and (amount>original or amount<refunded) then raise exception using errcode='P0001',message='CASH_CORRECTION_CONFLICT';end if;
 insert into public.cost_workflow_requests(tenant_id,company_id,project_id,kind,party_id,source_payment_id,working_input,created_by)
 values(t,target_company_id,target_project_id,kind,private.c1_workflow_payment_party(payment.id),payment.id,target_input,auth.uid()) returning * into request;
 insert into public.cost_workflow_request_versions(tenant_id,company_id,project_id,request_id,version,snapshot,amount,currency_code,evidence_file_ids,manager_assignment_id,submitted_by)
 values(t,target_company_id,target_project_id,request.id,1,target_input,amount,payment.currency_code,ids,assignment.id,auth.uid()) returning * into snapshot;
 update public.cost_workflow_requests set state='submitted',submitted_version_id=snapshot.id,version=1,updated_at=now() where id=request.id returning * into request;
 insert into public.cost_workflow_request_evidence(tenant_id,company_id,project_id,request_id,request_version,evidence_file_id,evidence_kind,created_by)
 select t,target_company_id,target_project_id,request.id,1,f.id,coalesce(f.workflow_evidence_kind,'accounting_support'),auth.uid() from public.cost_evidence_files f where f.id=any(ids) and f.tenant_id=t and f.company_id=target_company_id and f.project_id=target_project_id;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.create_cash_adjustment',target_idempotency_key,hash,request.id,1,target_request_id,jsonb_build_object('projectId',target_project_id,'sourcePaymentId',payment.id,'kind',kind,'submittedVersionId',snapshot.id));
 return jsonb_build_object('adjustmentId',request.id,'version',1,'replayed',false);
end;$$;

create function public.c1_workflow_decide_cash_adjustment(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;state text;assignment public.cost_workflow_manager_assignments%rowtype;payment public.cost_workflow_payments%rowtype;cash_state public.cost_workflow_cash_states%rowtype;
 request public.cost_workflow_requests%rowtype;snapshot public.cost_workflow_request_versions%rowtype;decision public.cost_workflow_decisions%rowtype;receipt public.cost_command_receipts%rowtype;hash text;choice text;reason text;submitted uuid;refunded numeric;original numeric;
begin
 context:=private.c1_workflow_context(target_company_id,'cost.request.decide');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.request.decide');state:=private.c1_workflow_project_state(t,target_company_id,target_project_id);
 assignment:=private.c1_workflow_lock_manager(t,target_company_id,target_project_id);
 if assignment.manager_user_id is distinct from auth.uid() then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 perform private.c1_workflow_require_keys(target_input,array['submittedVersionId','decision'],array['submittedVersionId','decision','reason']);
 choice:=private.c1_workflow_text(target_input->'decision');if choice not in('approve','return') then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 if target_input ? 'reason' then reason:=private.c1_workflow_text(target_input->'reason');end if;
 if choice='return' and reason is null then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 begin submitted:=(target_input->>'submittedVersionId')::uuid;exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID';end;
 select * into request from public.cost_workflow_requests where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id and kind in('refund','correction');
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 select * into payment from public.cost_workflow_payments where id=request.source_payment_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id for update;
 if not private.c1_workflow_settlement_payment_allowed(t,target_company_id,target_project_id,payment.id,state='completed') then raise exception using errcode='P0001',message='PROJECT_COMPLETED';end if;
 select * into snapshot from public.cost_workflow_request_versions where id=submitted and request_id=request.id and tenant_id=t and company_id=target_company_id and project_id=target_project_id;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 hash:=private.c1_workflow_hash(target_project_id,target_id,target_input);receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.decide_cash_adjustment',target_idempotency_key,hash);
 if receipt.id is not null then return jsonb_build_object('adjustmentId',receipt.result_resource_id,'version',receipt.result_version,'replayed',true);end if;
 select * into cash_state from public.cost_workflow_cash_states where payment_id=payment.id for update;
 if not found then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 select * into request from public.cost_workflow_requests where id=request.id for update;
 if request.state<>'submitted' or request.submitted_version_id is distinct from submitted then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 if choice='approve' then
  if cash_state.payment_id is null or cash_state.version is distinct from private.c1_detail_expected_version(snapshot.snapshot) then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
  perform private.c1_workflow_require_evidence(t,target_company_id,target_project_id,snapshot.evidence_file_ids);
  select coalesce(sum(r.amount),0) into refunded from public.cost_workflow_refunds r where r.source_payment_id=payment.id;
  if request.kind='refund' and snapshot.amount+refunded>private.c1_workflow_valid_cash(payment.id) then raise exception using errcode='P0001',message='CASH_REFUND_EXCEEDED';end if;
  select coalesce(payment.ordinary_amount,c.paid_amount) into original from public.project_subcontract_payments c where c.id=payment.subcontract_payment_id;original:=coalesce(payment.ordinary_amount,original);
  if request.kind='correction' and (snapshot.amount>original or snapshot.amount<refunded) then raise exception using errcode='P0001',message='CASH_CORRECTION_CONFLICT';end if;
 end if;
 insert into public.cost_workflow_decisions(tenant_id,company_id,project_id,submitted_version_id,decision,manager_assignment_id,decided_by,reason)
 values(t,target_company_id,target_project_id,submitted,choice,assignment.id,auth.uid(),reason) returning * into decision;
 if choice='approve' then perform private.c1_workflow_notify_director(t,target_company_id,target_project_id,decision.id);end if;
 update public.cost_workflow_requests set state=case when choice='approve' then 'approved' else 'returned' end,version=version+1,updated_at=now() where id=request.id returning * into request;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.decide_cash_adjustment',target_idempotency_key,hash,request.id,request.version,target_request_id,jsonb_build_object('sourcePaymentId',payment.id,'submittedVersionId',submitted,'decision',choice,'reason',reason,'assignmentId',assignment.id));
 return jsonb_build_object('adjustmentId',request.id,'version',request.version,'replayed',false);
end;$$;

create function public.c1_workflow_confirm_refund(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;state text;assignment public.cost_workflow_manager_assignments%rowtype;payment public.cost_workflow_payments%rowtype;cash_state public.cost_workflow_cash_states%rowtype;
 request public.cost_workflow_requests%rowtype;snapshot public.cost_workflow_request_versions%rowtype;decision public.cost_workflow_decisions%rowtype;refund public.cost_workflow_refunds%rowtype;
 receipt public.cost_command_receipts%rowtype;hash text;event_hash text;expected bigint;scale integer;amount numeric;total_refunded numeric;request_refunded numeric;ids uuid[];received_date date;
begin
 context:=private.c1_workflow_context(target_company_id,'cost.record_cash');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.record_cash');perform private.c1_workflow_lock_actor(t,target_company_id,'cost.request.submit');
 state:=private.c1_workflow_project_state(t,target_company_id,target_project_id);assignment:=private.c1_workflow_lock_assignment(t,target_company_id,target_project_id);
 select * into request from public.cost_workflow_requests where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id and kind='refund';
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 select * into payment from public.cost_workflow_payments where id=request.source_payment_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id for update;
 if not private.c1_workflow_settlement_payment_allowed(t,target_company_id,target_project_id,payment.id,state='completed') then raise exception using errcode='P0001',message='PROJECT_COMPLETED';end if;
 perform private.c1_workflow_require_keys(target_input,array['amount','receivedDate','evidenceFileIds','expectedVersion'],array['amount','receivedDate','evidenceFileIds','expectedVersion']);
 expected:=private.c1_detail_expected_version(target_input);select money_scale into scale from public.company_cost_settings where tenant_id=t and company_id=target_company_id and enabled;
 amount:=private.c1_workflow_money(target_input->'amount',scale);received_date:=private.c1_workflow_date(target_input->'receivedDate');ids:=private.c1_workflow_evidence_ids(target_input->'evidenceFileIds');
 if amount<=0 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 perform private.c1_workflow_require_cash_target_proof(t,target_company_id,target_project_id,ids,'adjustment',request.id,payment.id);
 hash:=private.c1_workflow_hash(target_project_id,target_id,target_input);receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.confirm_refund',target_idempotency_key,hash);
 if receipt.id is not null then return jsonb_build_object('adjustmentId',target_id,'paymentId',receipt.result_resource_id,'version',receipt.result_version,'replayed',true);end if;
 perform private.c1_workflow_require_unused_cash_proof(t,target_company_id,target_project_id,ids);
 select * into cash_state from public.cost_workflow_cash_states where payment_id=payment.id for update;
 if not found then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 select * into request from public.cost_workflow_requests where id=request.id for update;
 if request.state<>'approved' or request.version<>expected then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 select * into snapshot from public.cost_workflow_request_versions where id=request.submitted_version_id;
 select d.* into decision from public.cost_workflow_decisions d where d.submitted_version_id=snapshot.id and d.decision='approve';
 if not found then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 select coalesce(sum(r.amount),0),coalesce(sum(r.amount) filter(where r.request_id=request.id),0) into total_refunded,request_refunded from public.cost_workflow_refunds r where r.source_payment_id=payment.id;
 if amount+total_refunded>private.c1_workflow_valid_cash(payment.id) or amount+request_refunded>snapshot.amount then raise exception using errcode='P0001',message='CASH_REFUND_EXCEEDED';end if;
 event_hash:=private.c1_workflow_cash_event_hash(t,target_company_id,target_project_id,'refund',jsonb_build_object('amount',amount::numeric(20,4)::text,'currency',payment.currency_code,'date',received_date),ids);
 if exists(select 1 from public.cost_workflow_refunds r where r.tenant_id=t and r.company_id=target_company_id and r.project_id=target_project_id and r.cash_event_hash=event_hash) then raise exception using errcode='P0001',message='CASH_DUPLICATE_EVENT';end if;
 insert into public.cost_workflow_refunds(tenant_id,company_id,project_id,source_payment_id,request_id,decision_id,amount,received_date,evidence_file_ids,confirmed_by,cash_event_hash)
 values(t,target_company_id,target_project_id,payment.id,request.id,decision.id,amount,received_date,ids,auth.uid(),event_hash) returning * into refund;
 perform private.c1_workflow_claim_cash_proof(t,target_company_id,target_project_id,ids,null,refund.id);
 update public.cost_workflow_cash_states set version=version+1 where payment_id=payment.id;
 update public.cost_workflow_requests set version=version+1,updated_at=now() where id=request.id returning * into request;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.confirm_refund',target_idempotency_key,hash,refund.id,request.version,target_request_id,jsonb_build_object('projectId',target_project_id,'adjustmentId',request.id,'sourcePaymentId',payment.id,'amount',amount::text,'receivedDate',received_date,'evidenceFileIds',ids));
 return jsonb_build_object('adjustmentId',request.id,'paymentId',refund.id,'version',request.version,'replayed',false);
end;$$;

create function public.c1_workflow_apply_cash_correction(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;state text;assignment public.cost_workflow_manager_assignments%rowtype;payment public.cost_workflow_payments%rowtype;cash_state public.cost_workflow_cash_states%rowtype;
 request public.cost_workflow_requests%rowtype;snapshot public.cost_workflow_request_versions%rowtype;decision public.cost_workflow_decisions%rowtype;correction public.cost_workflow_corrections%rowtype;
 receipt public.cost_command_receipts%rowtype;hash text;expected bigint;refunded numeric;original numeric;
begin
 context:=private.c1_workflow_context(target_company_id,'cost.correct');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.correct');perform private.c1_workflow_lock_actor(t,target_company_id,'cost.request.submit');
 state:=private.c1_workflow_project_state(t,target_company_id,target_project_id);assignment:=private.c1_workflow_lock_assignment(t,target_company_id,target_project_id);
 select * into request from public.cost_workflow_requests where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id and kind='correction';
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 select * into payment from public.cost_workflow_payments where id=request.source_payment_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id for update;
 if not private.c1_workflow_settlement_payment_allowed(t,target_company_id,target_project_id,payment.id,state='completed') then raise exception using errcode='P0001',message='PROJECT_COMPLETED';end if;
 perform private.c1_workflow_require_keys(target_input,array['expectedVersion'],array['expectedVersion']);expected:=private.c1_detail_expected_version(target_input);
 hash:=private.c1_workflow_hash(target_project_id,target_id,target_input);receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.apply_cash_correction',target_idempotency_key,hash);
 if receipt.id is not null then return jsonb_build_object('adjustmentId',receipt.result_resource_id,'version',receipt.result_version,'replayed',true);end if;
 select * into cash_state from public.cost_workflow_cash_states where payment_id=payment.id for update;
 if not found then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 select * into request from public.cost_workflow_requests where id=request.id for update;
 if request.state<>'approved' or request.version<>expected or exists(select 1 from public.cost_workflow_corrections x where x.request_id=request.id) then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 select * into snapshot from public.cost_workflow_request_versions where id=request.submitted_version_id;
 select d.* into decision from public.cost_workflow_decisions d where d.submitted_version_id=snapshot.id and d.decision='approve';
 if not found then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 if cash_state.payment_id is null or cash_state.version is distinct from private.c1_detail_expected_version(snapshot.snapshot) then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 perform private.c1_workflow_require_evidence(t,target_company_id,target_project_id,snapshot.evidence_file_ids);
 select coalesce(sum(r.amount),0) into refunded from public.cost_workflow_refunds r where r.source_payment_id=payment.id;
 select coalesce(payment.ordinary_amount,c.paid_amount) into original from public.project_subcontract_payments c where c.id=payment.subcontract_payment_id;original:=coalesce(payment.ordinary_amount,original);
 if snapshot.amount>original or snapshot.amount<refunded then raise exception using errcode='P0001',message='CASH_CORRECTION_CONFLICT';end if;
 insert into public.cost_workflow_corrections(tenant_id,company_id,project_id,source_payment_id,request_id,decision_id,corrected_outgoing,evidence_file_ids,applied_by,event_sequence)
 values(t,target_company_id,target_project_id,payment.id,request.id,decision.id,snapshot.amount,snapshot.evidence_file_ids,auth.uid(),cash_state.version+1) returning * into correction;
 update public.cost_workflow_cash_states set version=version+1 where payment_id=payment.id;
 update public.cost_workflow_requests set version=version+1,updated_at=now() where id=request.id returning * into request;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.apply_cash_correction',target_idempotency_key,hash,request.id,request.version,target_request_id,jsonb_build_object('sourcePaymentId',payment.id,'correctionId',correction.id,'correctedOutgoing',snapshot.amount::text,'authorizationRestored',false));
 return jsonb_build_object('adjustmentId',request.id,'version',request.version,'replayed',false);
end;$$;

create function private.c1_workflow_canonical_payment_staged(row_data jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cost_workflow_payments p join public.cost_workflow_consumptions consumption on consumption.payment_id=p.id and consumption.installment_id=p.installment_id
 join public.cost_workflow_installments i on i.id=p.installment_id and i.tenant_id=p.tenant_id and i.company_id=p.company_id and i.project_id=p.project_id
 join public.cost_workflow_contracts contract on contract.id=i.contract_id
 where p.subcontract_payment_id=(row_data->>'id')::uuid and p.tenant_id=(row_data->>'tenant_id')::uuid and p.company_id=(row_data->>'company_id')::uuid and p.project_id=(row_data->>'project_id')::uuid
 and p.cash_kind='subcontract' and p.confirmed_by=auth.uid() and p.currency_code=row_data->>'currency_code'
 and contract.source_subcontract_id=(row_data->>'project_subcontract_id')::uuid and i.party_id=contract.party_id
 and consumption.amount=(row_data->>'paid_amount_text')::numeric
 and i.authorized_amount>=(select sum(x.amount) from public.cost_workflow_consumptions x where x.installment_id=i.id)
 and private.c1_workflow_actor_has_permission(p.tenant_id,p.company_id,'cost.record_cash')
 and private.c1_workflow_actor_has_permission(p.tenant_id,p.company_id,'cost.request.submit'));
$$;
create function private.c1_workflow_guard_legacy_write() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare data jsonb;mode text;
begin
 data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 select w.mode into mode from public.cost_workflow_companies w where w.tenant_id=(data->>'tenant_id')::uuid and w.company_id=(data->>'company_id')::uuid;
 if mode='document_backed_v1' then
  if tg_table_name='project_subcontract_payments' and tg_op='INSERT' and private.c1_workflow_canonical_payment_staged(data) then return new;end if;
  raise exception using errcode='P0001',message='LEGACY_WORKFLOW_WRITE_DISABLED';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
create trigger aa_c1_workflow_legacy_item_gate before insert or update or delete on public.project_cost_items for each row execute function private.c1_workflow_guard_legacy_write();
create trigger aa_c1_workflow_legacy_detail_gate before insert or update or delete on public.project_cost_item_details for each row execute function private.c1_workflow_guard_legacy_write();
create trigger aa_c1_workflow_legacy_payment_gate before insert or update or delete on public.project_subcontract_payments for each row execute function private.c1_workflow_guard_legacy_write();

create function private.c1_workflow_guard_legacy_file() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 if exists(select 1 from public.cost_workflow_companies w where w.tenant_id=new.tenant_id and w.company_id=new.company_id and w.mode='document_backed_v1')
 and not new.workflow_origin and (tg_op='INSERT' or old.status='pending_upload') then raise exception using errcode='P0001',message='LEGACY_WORKFLOW_WRITE_DISABLED';end if;
 return new;
end;$$;
create trigger aa_c1_workflow_legacy_file_gate before insert or update on public.cost_evidence_files for each row execute function private.c1_workflow_guard_legacy_file();
create function private.c1_workflow_guard_legacy_link() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 if exists(select 1 from public.cost_evidence_files f where f.id=new.evidence_file_id and f.tenant_id=new.tenant_id and f.company_id=new.company_id and f.workflow_origin)
 then raise exception using errcode='P0001',message='LEGACY_WORKFLOW_WRITE_DISABLED';end if;return new;
end;$$;
create trigger aa_c1_workflow_legacy_link_gate before insert on public.cost_evidence_links for each row execute function private.c1_workflow_guard_legacy_link();

create or replace function private.c1_workflow_evidence_target_allowed(t uuid,c uuid,p uuid,k text,target uuid,completed boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select case
 when k='request' then not completed and (target is null or exists(
   select 1 from public.cost_workflow_requests r where r.id=target and r.tenant_id=t and r.company_id=c and r.project_id=p
   and r.kind in('installment','contract_adjustment') and r.state in('working','returned')))
 when k='payment' then exists(
   select 1 from public.cost_workflow_installments i where i.id=target and i.tenant_id=t and i.company_id=c and i.project_id=p
   and i.authorized_amount>coalesce((select sum(x.amount) from public.cost_workflow_consumptions x where x.installment_id=i.id),0)
   and (not completed or exists(select 1 from public.cost_workflow_completion_installments h where h.installment_id=i.id)))
 when k='adjustment' then exists(
   select 1 from public.cost_workflow_requests r join public.cost_workflow_payments payment
    on payment.id=r.source_payment_id and payment.tenant_id=r.tenant_id and payment.company_id=r.company_id and payment.project_id=r.project_id
   where r.id=target and r.tenant_id=t and r.company_id=c and r.project_id=p and r.kind in('refund','correction')
   and (not completed or exists(select 1 from public.cost_workflow_completion_installments h where h.installment_id=payment.installment_id)))
 when k='adjustment_source' then private.c1_workflow_settlement_payment_allowed(t,c,p,target,completed)
 else false end;
$$;

create or replace function private.c1_workflow_evidence_completed_exception(file_row jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare project_state text;t uuid:=(file_row->>'tenant_id')::uuid;c uuid:=(file_row->>'company_id')::uuid;p uuid:=(file_row->>'project_id')::uuid;
begin
 select operational_state into project_state from public.projects where id=p and tenant_id=t and company_id=c for share;
 return project_state='completed' and file_row->>'workflow_origin'='true'
 and private.c1_workflow_actor_has_permission(t,c,'cost.request.submit') and private.c1_workflow_actor_has_permission(t,c,'cost.prepare')
 and private.c1_workflow_evidence_target_allowed(t,c,p,file_row->>'workflow_target_kind',(file_row->>'workflow_target_id')::uuid,true);
end;$$;

create or replace function private.c1_workflow_can_read_file(t uuid,c uuid,p uuid,file_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.c1_workflow_actor_has_permission(t,c,'cost.request.file.read') and private.c1_workflow_can_read(t,c,p)
 and exists(select 1 from public.cost_evidence_files f where f.id=file_id and f.tenant_id=t and f.company_id=c and f.project_id=p and f.status='finalized'
 and ((f.workflow_origin and f.created_by=(select auth.uid()) and private.c1_workflow_actor_has_permission(t,c,'cost.request.submit'))
 or exists(select 1 from public.cost_workflow_request_evidence link where link.evidence_file_id=f.id and link.tenant_id=t and link.company_id=c and link.project_id=p)
 or exists(select 1 from public.cost_workflow_contract_versions basis where f.id=any(basis.evidence_file_ids) and basis.tenant_id=t and basis.company_id=c and basis.project_id=p)
 or (f.workflow_origin and f.workflow_target_id is not null and f.workflow_target_kind in('payment','adjustment','adjustment_source'))));
$$;

create or replace function private.c1_can_select_evidence_object(target_bucket_id text,target_object_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cost_evidence_files f where f.bucket_id=target_bucket_id and f.object_path=target_object_path
 and exists(select 1 from auth.users account where account.id=(select auth.uid()) and (account.banned_until is null or account.banned_until<=now()))
 and (
  (not f.workflow_origin and private.c1_can_select_evidence_object_legacy(target_bucket_id,target_object_path))
  or (f.workflow_origin and f.created_by=(select auth.uid()) and f.status='pending_upload' and f.intent_expires_at>now()
      and private.c1_workflow_actor_has_permission(f.tenant_id,f.company_id,'cost.prepare') and private.c1_workflow_actor_has_permission(f.tenant_id,f.company_id,'cost.request.submit'))
  or private.c1_workflow_can_read_file(f.tenant_id,f.company_id,f.project_id,f.id)));
$$;

create or replace function private.c1_can_insert_evidence_object(target_bucket_id text,target_object_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cost_evidence_files f join public.projects p on p.id=f.project_id and p.tenant_id=f.tenant_id and p.company_id=f.company_id
 where f.bucket_id=target_bucket_id and f.object_path=target_object_path and(
  (not f.workflow_origin and not exists(select 1 from public.cost_workflow_companies w where w.tenant_id=f.tenant_id and w.company_id=f.company_id and w.mode='document_backed_v1') and private.c1_can_insert_evidence_object_legacy(target_bucket_id,target_object_path))
  or (f.workflow_origin and f.created_by=(select auth.uid()) and f.status='pending_upload' and f.intent_expires_at>now()
    and private.c1_workflow_actor_has_permission(f.tenant_id,f.company_id,'cost.prepare') and private.c1_workflow_actor_has_permission(f.tenant_id,f.company_id,'cost.request.submit')
    and private.c1_workflow_evidence_target_allowed(f.tenant_id,f.company_id,f.project_id,f.workflow_target_kind,f.workflow_target_id,p.operational_state='completed'))));
$$;

create or replace function private.c1_guard_completed_project_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_rows jsonb[]; v_row jsonb; v_project uuid; v_tenant uuid; v_company uuid;
BEGIN
  IF TG_TABLE_NAME='project_subcontract_payments' AND TG_OP='INSERT' THEN IF private.c1_workflow_canonical_payment_staged(to_jsonb(NEW)) AND EXISTS(select 1 from public.cost_workflow_completion_installments h join public.cost_workflow_payments p on p.installment_id=h.installment_id where p.subcontract_payment_id=NEW.id) THEN RETURN NEW; END IF; END IF;
  IF TG_OP <> 'DELETE' AND TG_TABLE_NAME = 'cost_evidence_files' THEN IF private.c1_workflow_evidence_completed_exception(to_jsonb(NEW)) THEN RETURN NEW; END IF; END IF;
  IF TG_OP <> 'DELETE' AND TG_TABLE_NAME = 'objects' THEN IF EXISTS (SELECT 1 FROM public.cost_evidence_files f WHERE f.bucket_id=NEW.bucket_id AND f.object_path=NEW.name AND private.c1_workflow_evidence_completed_exception(to_jsonb(f))) THEN RETURN NEW; END IF; END IF;
  IF TG_TABLE_NAME = 'projects' THEN
    IF OLD.operational_state = 'completed' THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'PROJECT_COMPLETED';
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN v_rows := ARRAY[to_jsonb(NEW)];
    ELSIF TG_OP = 'DELETE' THEN v_rows := ARRAY[to_jsonb(OLD)];
    ELSE v_rows := ARRAY[to_jsonb(OLD), to_jsonb(NEW)]; END IF;
    FOREACH v_row IN ARRAY v_rows LOOP
      v_tenant := (v_row->>'tenant_id')::uuid;
      v_company := (v_row->>'company_id')::uuid;
      v_project := NULL;
      IF TG_ARGV[0] = 'project' THEN v_project := (v_row->>'project_id')::uuid;
      ELSIF TG_ARGV[0] = 'item' THEN
        SELECT project_id INTO v_project FROM public.project_cost_items
        WHERE id=(v_row->>'project_cost_item_id')::uuid AND tenant_id=v_tenant AND company_id=v_company;
      ELSIF TG_ARGV[0] = 'detail' THEN
        SELECT item.project_id INTO v_project
        FROM public.project_cost_item_details detail
        JOIN public.project_cost_items item ON item.id=detail.project_cost_item_id AND item.tenant_id=detail.tenant_id AND item.company_id=detail.company_id
        WHERE detail.id=(v_row->>'project_cost_item_detail_id')::uuid AND detail.tenant_id=v_tenant AND detail.company_id=v_company;
      ELSIF TG_ARGV[0] = 'engagement' THEN
        SELECT project_id INTO v_project FROM public.project_engagements
        WHERE id=(v_row->>'engagement_id')::uuid AND tenant_id=v_tenant AND company_id=v_company;
      ELSIF TG_ARGV[0] = 'storage' THEN
        IF v_row->>'bucket_id' <> 'c1-accounting-evidence' THEN CONTINUE; END IF;
        SELECT project_id,tenant_id,company_id INTO v_project,v_tenant,v_company
        FROM public.cost_evidence_files
        WHERE bucket_id=v_row->>'bucket_id' AND object_path=v_row->>'name';
      END IF;
      PERFORM private.c1_lock_writable_project(v_tenant,v_company,v_project);
    END LOOP;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

create or replace function public.c1_workflow_create_evidence_intent(target_company_id uuid, target_project_id uuid, target_input jsonb, target_idempotency_key uuid, target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_context jsonb; v_actor_id uuid := auth.uid(); v_tenant_id uuid; v_id uuid := gen_random_uuid();
  v_path text; v_request_hash text; v_receipt public.cost_command_receipts%rowtype; v_file public.cost_evidence_files%rowtype; v_kind text; v_target uuid; v_project_state text;
begin
  if v_actor_id is null then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  v_context := private.c1_master_context(target_company_id, 'cost.prepare'); v_tenant_id := (v_context->>'tenantId')::uuid;
  v_context:=private.c1_workflow_context(target_company_id,'cost.request.submit');
  if (v_context->>'actorId')::uuid is distinct from v_actor_id or target_idempotency_key is null or target_request_id is null
    or jsonb_typeof(target_input) is distinct from 'object'
    or not (target_input ?& array['originalFilename','mimeType','sizeBytes','sha256'])
    or exists (select 1 from jsonb_object_keys(target_input) key where key not in ('evidenceKind','target','originalFilename','mimeType','sizeBytes','sha256'))
    or jsonb_typeof(target_input->'originalFilename') is distinct from 'string' or btrim(target_input->>'originalFilename') = ''
    or jsonb_typeof(target_input->'mimeType') is distinct from 'string' or target_input->>'mimeType' not in ('application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg')
    or jsonb_typeof(target_input->'sizeBytes') is distinct from 'number' or target_input->>'sizeBytes' !~ '^\d+$' or (target_input->>'sizeBytes')::bigint < 1 or (target_input->>'sizeBytes')::bigint > 26214400
    or jsonb_typeof(target_input->'sha256') is distinct from 'string' or target_input->>'sha256' !~ '^[a-f0-9]{64}$'
  then
    if jsonb_typeof(target_input) = 'object' and target_input ? 'sizeBytes' and target_input->>'sizeBytes' ~ '^\d+$' and (target_input->>'sizeBytes')::bigint > 26214400 then raise exception using errcode = 'P0001', message = 'FILE_TOO_LARGE'; end if;
    if jsonb_typeof(target_input) = 'object' and target_input ? 'mimeType' and target_input->>'mimeType' not in ('application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg') then raise exception using errcode = 'P0001', message = 'FILE_TYPE_UNSUPPORTED'; end if;
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  if not exists (select 1 from public.projects project where project.id = target_project_id and project.tenant_id = v_tenant_id and project.company_id = target_company_id) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if jsonb_typeof(target_input->'target') is distinct from 'object' or jsonb_typeof(target_input->'target'->'kind') is distinct from 'string' or exists(select 1 from jsonb_object_keys(target_input->'target') key where key not in('kind','id','sourcePaymentId')) then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  v_kind:=target_input->'target'->>'kind';
  if v_kind not in('request','payment','adjustment') then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  if v_kind='adjustment' then
   if (target_input->'target' ? 'id')=(target_input->'target' ? 'sourcePaymentId') then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  elsif target_input->'target' ? 'sourcePaymentId' then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  begin
   if target_input->'target' ? 'sourcePaymentId' then v_target:=(target_input->'target'->>'sourcePaymentId')::uuid;v_kind:='adjustment_source';
   else v_target:=(target_input->'target'->>'id')::uuid;end if;
  exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID';end;
  select operational_state into v_project_state from public.projects where id=target_project_id and tenant_id=v_tenant_id and company_id=target_company_id for share;
  if not private.c1_workflow_evidence_target_allowed(v_tenant_id,target_company_id,target_project_id,v_kind,v_target,v_project_state='completed') then raise exception using errcode='P0001',message='PROJECT_COMPLETED';end if;
  v_request_hash := encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('companyId',target_company_id,'projectId',target_project_id,'input',target_input)),'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('c1_evidence:intent:'||target_company_id::text||':'||v_actor_id::text||':'||target_idempotency_key::text,0));
  select receipt.* into v_receipt from public.cost_command_receipts receipt where receipt.company_id=target_company_id and receipt.actor_id=v_actor_id and receipt.command_name='cost_workflow.evidence_intent' and receipt.idempotency_key=target_idempotency_key for update;
  if found then
    if v_receipt.request_hash <> v_request_hash then raise exception using errcode='P0001', message='IDEMPOTENCY_CONFLICT'; end if;
    select file.* into v_file from public.cost_evidence_files file where file.id=v_receipt.result_resource_id and file.tenant_id=v_tenant_id and file.company_id=target_company_id;
    return jsonb_build_object('evidenceFileId',v_file.id,'version',v_file.version,'bucketId',v_file.bucket_id,'objectPath',v_file.object_path,'expiresAt',v_file.intent_expires_at,'replayed',true);
  end if;
  v_path := v_tenant_id::text||'/'||target_company_id::text||'/'||target_project_id::text||'/'||v_id::text;
  insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,intent_expires_at,created_by,workflow_origin,workflow_target_kind,workflow_target_id,workflow_evidence_kind)
  values(v_id,v_tenant_id,target_company_id,target_project_id,v_path,btrim(target_input->>'originalFilename'),target_input->>'mimeType',(target_input->>'sizeBytes')::bigint,target_input->>'sha256',now()+interval '15 minutes',v_actor_id,true,v_kind,v_target,coalesce(target_input->>'evidenceKind','accounting_support')) returning * into v_file;
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version)
  values(v_tenant_id,target_company_id,v_actor_id,'cost_workflow.evidence_intent',target_idempotency_key,v_request_hash,v_file.id,v_file.version);
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,after_summary)
  values(v_tenant_id,target_company_id,v_actor_id,'c1.cost_workflow.evidence_intent_created','cost_evidence_file',v_file.id::text,target_request_id,jsonb_build_object('projectId',v_file.project_id,'mimeType',v_file.declared_mime_type,'sizeBytes',v_file.declared_size_bytes,'sha256',v_file.declared_sha256,'version',v_file.version));
  return jsonb_build_object('evidenceFileId',v_file.id,'version',v_file.version,'bucketId',v_file.bucket_id,'objectPath',v_file.object_path,'expiresAt',v_file.intent_expires_at,'replayed',false);
end;
$$;

alter policy c1_cost_evidence_files_select on public.cost_evidence_files using(
 private.c1_workflow_can_read_file(tenant_id,company_id,project_id,id) or
 (workflow_origin and ((created_by=(select auth.uid()) and private.c1_workflow_actor_has_permission(tenant_id,company_id,'cost.request.submit') and private.c1_workflow_actor_has_permission(tenant_id,company_id,'cost.prepare'))
   or private.c1_workflow_can_read_file(tenant_id,company_id,project_id,id)))
 or (not workflow_origin and ((status='pending_upload' and created_by=(select auth.uid()) and private.c1_workflow_actor_has_permission(tenant_id,company_id,'cost.prepare'))
   or (status='finalized' and private.c1_workflow_actor_has_permission(tenant_id,company_id,'cost.source.read')))));

create or replace function private.c1_workflow_payment_view(payment_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'amount',coalesce(p.ordinary_amount,canonical.paid_amount)::text,
 'refunded',coalesce((select sum(r.amount) from public.cost_workflow_refunds r where r.source_payment_id=p.id),0)::text,
 'correctedCash',coalesce((select x.corrected_outgoing from public.cost_workflow_corrections x where x.source_payment_id=p.id order by x.event_sequence desc limit 1),coalesce(p.ordinary_amount,canonical.paid_amount))::text,
 'currencyCode',p.currency_code,'paymentDate',p.payment_date,'version',coalesce((select s.version from public.cost_workflow_cash_states s where s.payment_id=p.id),0),'evidenceFileIds',p.evidence_file_ids)
 from public.cost_workflow_payments p left join public.project_subcontract_payments canonical
 on canonical.id=p.subcontract_payment_id and canonical.tenant_id=p.tenant_id and canonical.company_id=p.company_id and canonical.project_id=p.project_id where p.id=$1;
$$;

create or replace function private.c1_workflow_request_view(request_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'version',r.version,'submittedVersionId',r.submitted_version_id,'status',r.state,
 'partyId',r.party_id,'partyKind',r.working_input->>'partyKind','crewOwnership',r.working_input->>'crewOwnership',
 'categoryId',r.category_id,'contractVersionId',r.working_input->>'contractVersionId','latestDecision',private.c1_workflow_decision_view(r.submitted_version_id),
 'amount',r.working_input->>'amount','currencyCode',r.working_input->>'currencyCode','evidenceFileIds',r.working_input->'evidenceFileIds','basis',r.working_input->'basis',
 'assignmentVersion',(select a.assignment_version from public.cost_workflow_manager_assignments a where a.tenant_id=r.tenant_id and a.company_id=r.company_id and a.project_id=r.project_id order by a.assignment_version desc limit 1),
 'installment',(select jsonb_build_object('id',i.id,'version',(select count(*) from public.cost_workflow_consumptions x where x.installment_id=i.id),'authorized',i.authorized_amount::text,'consumed',coalesce((select sum(c.amount) from public.cost_workflow_consumptions c where c.installment_id=i.id),0)::text,'remaining',(i.authorized_amount-coalesce((select sum(c.amount) from public.cost_workflow_consumptions c where c.installment_id=i.id),0))::text) from public.cost_workflow_installments i where i.request_id=r.id),
 'payments',coalesce((select jsonb_agg(private.c1_workflow_payment_view(p.id) order by p.confirmed_at,p.id) from public.cost_workflow_payments p join public.cost_workflow_installments i on i.id=p.installment_id where i.request_id=r.id),'[]'::jsonb))
 from public.cost_workflow_requests r where r.id=$1 and r.kind='installment';
$$;

create or replace function private.c1_workflow_adjustment_view(request_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'kind',r.kind,'version',r.version,'submittedVersionId',r.submitted_version_id,'status',r.state,'partyId',r.party_id,'contractId',r.contract_id,'sourcePaymentId',r.source_payment_id,'input',r.working_input,'confirmedRefund',coalesce((select sum(f.amount) from public.cost_workflow_refunds f where f.request_id=r.id),0)::text,'correctionApplied',exists(select 1 from public.cost_workflow_corrections x where x.request_id=r.id),'latestDecision',private.c1_workflow_decision_view(r.submitted_version_id))
 from public.cost_workflow_requests r where r.id=$1 and r.kind in('contract_adjustment','refund','correction');
$$;

do $acl$
declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname in('private','public') and p.proname like 'c1_workflow_%'
 loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'c1_workflow_%'
 loop execute format('grant execute on function %s to authenticated',f.signature);end loop;
end;$acl$;
grant execute on function private.c1_workflow_actor_has_permission(uuid,uuid,text),private.c1_workflow_is_current_manager(uuid,uuid,uuid),private.c1_workflow_is_director(uuid,uuid),private.c1_workflow_can_read(uuid,uuid,uuid),private.c1_workflow_can_read_file(uuid,uuid,uuid,uuid) to authenticated;
revoke all on function private.c1_workflow_guard_legacy_write(),private.c1_workflow_guard_legacy_file(),private.c1_workflow_guard_legacy_link() from public,anon,authenticated,service_role;

create function private.c1_workflow_require_legacy(target_company_id uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from public.cost_workflow_companies w where w.company_id=target_company_id and w.mode='document_backed_v1')
 then raise exception using errcode='P0001',message='LEGACY_WORKFLOW_WRITE_DISABLED';end if;
end;$$;
revoke all on function private.c1_workflow_require_legacy(uuid) from public,anon,authenticated,service_role;

create or replace function public.c1_create_project_cost_draft(target_company_id uuid, target_input jsonb, target_idempotency_key uuid, target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_create_project_cost_draft(target_company_id, target_input, target_idempotency_key, target_request_id); end; $$;

create or replace function public.c1_update_project_cost_draft(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_update_project_cost_draft(target_company_id, target_id, target_input, target_request_id); end; $$;

create or replace function public.c1_prepare_project_cost_financials(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_prepare_project_cost_financials(target_company_id, target_id, target_input, target_request_id); end; $$;

create or replace function public.c1_create_project_cost_item(target_company_id uuid, target_input jsonb, target_idempotency_key uuid, target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_create_project_cost_draft(target_company_id, target_input, target_idempotency_key, target_request_id); end; $$;

create or replace function public.c1_update_project_cost_item(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_update_project_cost_draft(target_company_id, target_id, target_input, target_request_id); end; $$;

create or replace function public.c1_correct_project_cost_item(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_correct_project_cost_item(target_company_id, target_id, target_input, target_request_id); end; $$;

create or replace function public.c1_publish_project_cost(target_company_id uuid,target_id uuid,target_expected_version bigint,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_publish_project_cost(target_company_id,target_id,target_expected_version,target_idempotency_key,target_request_id); end; $$;

create or replace function public.c1_correct_published_project_cost(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_correct_published_project_cost(target_company_id,target_id,target_input,target_idempotency_key,target_request_id); end; $$;

create or replace function public.c1_record_subcontract_payment(target_company_id uuid,target_project_id uuid,target_subcontract_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_record_subcontract_payment(target_company_id,target_project_id,target_subcontract_id,target_input,target_idempotency_key,target_request_id); end; $$;

create or replace function public.c1_void_subcontract_payment(target_company_id uuid,target_project_id uuid,target_subcontract_id uuid,target_payment_id uuid,target_expected_version bigint,target_reason text,target_idempotency_key uuid,target_request_id uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_void_subcontract_payment(target_company_id,target_project_id,target_subcontract_id,target_payment_id,target_expected_version,target_reason,target_idempotency_key,target_request_id); end; $$;

create or replace function public.c1_create_cost_evidence_intent(target_company_id uuid,target_project_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_create_cost_evidence_intent(target_company_id,target_project_id,target_input,target_idempotency_key,target_request_id); end; $$;

create or replace function public.c1_link_cost_evidence(target_company_id uuid,target_project_cost_item_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_link_cost_evidence(target_company_id,target_project_cost_item_id,target_input,target_idempotency_key,target_request_id); end; $$;

create or replace function public.c1_create_project_cost_detail_draft(target_company_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_create_project_cost_detail_draft(target_company_id,target_input,target_idempotency_key,target_request_id); end; $$;

create or replace function public.c1_update_project_cost_detail_draft(target_company_id uuid,target_id uuid,target_input jsonb,target_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_update_project_cost_detail_draft(target_company_id,target_id,target_input,target_request_id); end; $$;

create or replace function public.c1_prepare_project_cost_detail_financials(target_company_id uuid,target_id uuid,target_input jsonb,target_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_prepare_project_cost_detail_financials(target_company_id,target_id,target_input,target_request_id); end; $$;

create or replace function public.c1_publish_project_cost_detail(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); perform private.c1_detail_publish_expected_version(target_input); return private.c1_publish_project_cost_detail(target_company_id,target_id,target_input,target_idempotency_key,target_request_id); end; $$;

create or replace function public.c1_create_and_publish_project_cost_detail(target_company_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_create_and_publish_project_cost_detail(target_company_id,target_input,target_idempotency_key,target_request_id); end; $$;

create or replace function public.c1_correct_published_project_cost_detail(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_correct_published_project_cost_detail(target_company_id,target_id,target_input,target_idempotency_key,target_request_id); end; $$;

create or replace function public.c1_link_project_cost_detail_evidence(target_company_id uuid,target_detail_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ begin perform private.c1_workflow_require_legacy(target_company_id); return private.c1_link_project_cost_detail_evidence(target_company_id,target_detail_id,target_input,target_idempotency_key,target_request_id); end; $$;
