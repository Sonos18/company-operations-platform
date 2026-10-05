set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,31);

-- Reviewed opening cash is distinct from a retrospective approval or a new grant.
create table public.cost_workflow_legacy_cash_reconciliation(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,company_id uuid not null,project_id uuid not null,
 unique(id,tenant_id,company_id,project_id),
 ordinary_detail_id uuid,subcontract_payment_id uuid,payment_id uuid,party_id uuid not null,category_id uuid not null,
 legacy_hash text not null check(legacy_hash ~ '^[a-f0-9]{64}$'),
 actual_outgoing numeric(20,4) not null check(actual_outgoing>=0),actual_payment_date date,
 evidence_file_ids uuid[] not null check(cardinality(evidence_file_ids)>0),reason text not null check(btrim(reason)<>''),
 reviewed_by uuid not null references auth.users(id),reviewed_at timestamptz not null default now(),
 check(num_nonnulls(ordinary_detail_id,subcontract_payment_id)=1),
 check((actual_outgoing=0 and payment_id is null and actual_payment_date is null) or(actual_outgoing>0 and payment_id is not null and actual_payment_date is not null)),
 unique(ordinary_detail_id),unique(subcontract_payment_id),unique(payment_id),
 foreign key(project_id,tenant_id,company_id) references public.projects(id,tenant_id,company_id) on delete restrict,
 foreign key(ordinary_detail_id,tenant_id,company_id) references public.project_cost_item_details(id,tenant_id,company_id) on delete restrict,
 foreign key(subcontract_payment_id,tenant_id,company_id,project_id) references public.project_subcontract_payments(id,tenant_id,company_id,project_id) on delete restrict,
 foreign key(party_id,tenant_id,company_id) references public.business_parties(id,tenant_id,company_id) on delete restrict,
 foreign key(category_id,tenant_id,company_id) references public.cost_categories(id,tenant_id,company_id) on delete restrict,
 foreign key(payment_id,tenant_id,company_id,project_id) references public.cost_workflow_payments(id,tenant_id,company_id,project_id) deferrable initially deferred
);
alter table public.cost_workflow_payments alter column installment_id drop not null;
alter table public.cost_workflow_payments add column legacy_reconciliation_id uuid,
 add constraint c1_workflow_payment_origin check((installment_id is not null and legacy_reconciliation_id is null) or(installment_id is null and legacy_reconciliation_id is not null)),
 add constraint c1_workflow_payment_reconciliation_fk foreign key(legacy_reconciliation_id,tenant_id,company_id,project_id)
 references public.cost_workflow_legacy_cash_reconciliation(id,tenant_id,company_id,project_id) deferrable initially deferred;
alter table public.cost_workflow_legacy_cash_reconciliation enable row level security;
alter table public.cost_workflow_legacy_cash_reconciliation force row level security;
revoke all on public.cost_workflow_legacy_cash_reconciliation from public,anon,authenticated,service_role;
grant select on public.cost_workflow_legacy_cash_reconciliation to authenticated;
create policy c1_workflow_reconciliation_read on public.cost_workflow_legacy_cash_reconciliation for select to authenticated using(private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger c1_workflow_reconciliation_retain before update or delete on public.cost_workflow_legacy_cash_reconciliation for each row execute function private.c1_workflow_retain_history();

create function private.c1_workflow_report_scope(c uuid,p uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare context jsonb;t uuid;
begin
 context:=private.c1_master_context(c,'cost.request.read');t:=(context->>'tenantId')::uuid;
 if not private.c1_workflow_can_read(t,c,p) then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 if not exists(select 1 from public.projects where id=p and tenant_id=t and company_id=c) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 return t;
end;$$;
create function private.c1_workflow_row_hash(value jsonb) returns text
language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(value),'UTF8'),'sha256'),'hex');
$$;
-- A deterministic identity hash binds every legacy row and its parent, not only its amount.
create function private.c1_workflow_legacy_records(t uuid,c uuid,p uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x.value order by x.kind,x.id),'[]'::jsonb) from(
 select 'ordinary_detail' kind,d.id,jsonb_build_object('legacyKind','ordinary_detail','legacyId',d.id,'categoryId',i.cost_category_id,'partyId',i.party_id,'currencyCode',i.currency_code,'recordedAmount',d.amount_text,'recordedDate',d.relevant_date,
 'legacyHash',private.c1_workflow_row_hash(jsonb_build_object('detail',to_jsonb(d),'parent',to_jsonb(i))),
 'status',case when cat.code='subcontract_labor' then 'excluded_legacy_subcontract' when i.publication_state<>'published' or d.publication_state<>'published' then 'unpublished' when m.id is null then 'unreconciled' when m.actual_outgoing=0 then 'verified_zero' else 'verified_cash' end,
 'paymentId',m.payment_id,'mappingId',m.id) value
 from public.project_cost_item_details d join public.project_cost_items i on i.id=d.project_cost_item_id and i.tenant_id=d.tenant_id and i.company_id=d.company_id
 left join public.cost_categories cat on cat.id=i.cost_category_id and cat.tenant_id=i.tenant_id and cat.company_id=i.company_id
 left join public.cost_workflow_legacy_cash_reconciliation m on m.ordinary_detail_id=d.id and m.tenant_id=d.tenant_id and m.company_id=d.company_id and m.project_id=i.project_id
 where i.tenant_id=t and i.company_id=c and i.project_id=p
 union all
 select 'subcontract_payment',a.id,jsonb_build_object('legacyKind','subcontract_payment','legacyId',a.id,'categoryId',(select id from public.cost_categories where tenant_id=t and company_id=c and code='subcontract_labor'),'partyId',s.subcontractor_party_id,'currencyCode',a.currency_code,'recordedAmount',a.paid_amount_text,'recordedDate',a.payment_date,
 'legacyHash',private.c1_workflow_row_hash(jsonb_build_object('payment',to_jsonb(a),'subcontract',to_jsonb(s))),
 'status',case when a.status<>'recorded' then 'voided' when w.installment_id is not null then 'workflow_cash' when m.id is null then 'unreconciled' when m.actual_outgoing=0 then 'verified_zero' else 'verified_cash' end,
 'paymentId',w.id,'mappingId',m.id)
 from public.project_subcontract_payments a join public.project_subcontracts s on s.id=a.project_subcontract_id and s.tenant_id=a.tenant_id and s.company_id=a.company_id and s.project_id=a.project_id
 left join public.cost_workflow_payments w on w.subcontract_payment_id=a.id and w.tenant_id=a.tenant_id and w.company_id=a.company_id and w.project_id=a.project_id
 left join public.cost_workflow_legacy_cash_reconciliation m on m.subcontract_payment_id=a.id and m.tenant_id=a.tenant_id and m.company_id=a.company_id and m.project_id=a.project_id
 where a.tenant_id=t and a.company_id=c and a.project_id=p) x;
$$;

create function private.c1_workflow_inventory(t uuid,c uuid,p uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;records jsonb;counts jsonb;checksums jsonb;sums jsonb;result jsonb;missing jsonb;duplicates jsonb;category_data jsonb:='[]'::jsonb;cat record;cp jsonb;cd jsonb;cs jsonb;ca jsonb;
begin
 records:=private.c1_workflow_legacy_records(t,c,p);
 -- Scoped snapshots retain provenance, publication status, dates, identities and retention; no object bytes or URLs.
 rows:=jsonb_build_object(
 'parents',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.project_cost_items i where i.tenant_id=t and i.company_id=c and i.project_id=p),'[]'::jsonb),
 'details',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from public.project_cost_item_details d join public.project_cost_items i on i.id=d.project_cost_item_id and i.tenant_id=d.tenant_id and i.company_id=d.company_id where i.tenant_id=t and i.company_id=c and i.project_id=p),'[]'::jsonb),
 'sources',coalesce((select jsonb_agg(jsonb_build_object('link',to_jsonb(l),'figure',to_jsonb(f)) order by l.id) from public.project_cost_item_sources l join public.project_cost_items i on i.id=l.project_cost_item_id and i.tenant_id=l.tenant_id and i.company_id=l.company_id join public.source_reported_figures f on f.id=l.source_reported_figure_id and f.tenant_id=l.tenant_id and f.company_id=l.company_id where i.tenant_id=t and i.company_id=c and i.project_id=p),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.project_subcontract_payments a where a.tenant_id=t and a.company_id=c and a.project_id=p),'[]'::jsonb),
 'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'status',f.status,'hash',f.verified_sha256,'size',f.verified_size_bytes,'mime',f.verified_mime_type) order by f.id) from public.cost_evidence_files f where f.tenant_id=t and f.company_id=c and f.project_id=p),'[]'::jsonb),
 'mappings',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.cost_workflow_legacy_cash_reconciliation m where m.tenant_id=t and m.company_id=c and m.project_id=p),'[]'::jsonb));

 rows:=rows||jsonb_build_object(
 'workflowPayments',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.cost_workflow_payments x where x.tenant_id=t and x.company_id=c and x.project_id=p),'[]'::jsonb),
 'workflowInstallments',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.cost_workflow_installments x where x.tenant_id=t and x.company_id=c and x.project_id=p),'[]'::jsonb),
 'workflowRefunds',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.cost_workflow_refunds x where x.tenant_id=t and x.company_id=c and x.project_id=p),'[]'::jsonb),
 'workflowCorrections',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.cost_workflow_corrections x where x.tenant_id=t and x.company_id=c and x.project_id=p),'[]'::jsonb),
 'workflowContracts',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.cost_workflow_contracts x where x.tenant_id=t and x.company_id=c and x.project_id=p),'[]'::jsonb),
 'managerAssignments',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.cost_workflow_manager_assignments x where x.tenant_id=t and x.company_id=c and x.project_id=p),'[]'::jsonb));
 select jsonb_object_agg(key,jsonb_array_length(value)),jsonb_object_agg(key,private.c1_workflow_row_hash(value)) into counts,checksums from jsonb_each(rows);
 counts:=counts||jsonb_build_object(
 'publishedParents',(select count(*) from jsonb_array_elements(rows->'parents') x where x->>'publication_state'='published'),
 'draftParents',(select count(*) from jsonb_array_elements(rows->'parents') x where x->>'publication_state'<>'published'),
 'publishedDetails',(select count(*) from jsonb_array_elements(rows->'details') x where x->>'publication_state'='published'),
 'draftDetails',(select count(*) from jsonb_array_elements(rows->'details') x where x->>'publication_state'<>'published'),
 'unreconciled',(select count(*) from jsonb_array_elements(records) x where x->>'status'='unreconciled'),
 'publishedParentsWithoutDetails',(select count(*) from jsonb_array_elements(rows->'parents') x where x->>'publication_state'='published' and not exists(select 1 from jsonb_array_elements(rows->'details') d where d->>'project_cost_item_id'=x->>'id' and d->>'publication_state'='published')));
 sums:=jsonb_build_object('parentRecorded',coalesce((select sum((x->>'amount_text')::numeric) from jsonb_array_elements(rows->'parents') x),0)::numeric(34,4)::text,
 'detailRecorded',coalesce((select sum((x->>'amount_text')::numeric) from jsonb_array_elements(rows->'details') x),0)::numeric(34,4)::text,
 'canonicalRecordedCash',coalesce((select sum((x->>'paid_amount_text')::numeric) from jsonb_array_elements(rows->'payments') x where x->>'status'='recorded'),0)::numeric(34,4)::text);
 select coalesce(jsonb_agg(x.contract_id order by x.contract_id),'[]'::jsonb) into missing from(
 select distinct contract.id contract_id from public.cost_workflow_contracts contract where contract.tenant_id=t and contract.company_id=c and contract.project_id=p
 and (exists(select 1 from public.project_subcontract_payments a where a.project_subcontract_id=contract.source_subcontract_id and a.status='recorded' and not exists(select 1 from public.cost_workflow_payments w where w.subcontract_payment_id=a.id))
 or exists(select 1 from public.project_cost_items i where i.tenant_id=t and i.company_id=c and i.project_id=p and (i.party_id=contract.party_id or i.party_id is null) and i.publication_state='published' and not exists(select 1 from public.cost_categories excluded where excluded.id=i.category_id and excluded.tenant_id=t and excluded.company_id=c and excluded.code='subcontract_labor')))) x;
 select coalesce(jsonb_agg(jsonb_build_object('kind','same_verified_original','identities',x.ids)),'[]'::jsonb) into duplicates from(
 select jsonb_agg(f.id order by f.id) ids from public.cost_evidence_files f where f.tenant_id=t and f.company_id=c and f.project_id=p and f.verified_sha256 is not null group by f.verified_sha256 having count(*)>1) x;

 for cat in select id,code from public.cost_categories where tenant_id=t and company_id=c union all select null::uuid,'unclassified'
 loop
  select coalesce(jsonb_agg(x order by x->>'id'),'[]'::jsonb) into cp from jsonb_array_elements(rows->'parents') x where (x->>'cost_category_id')::uuid is not distinct from cat.id;
  select coalesce(jsonb_agg(x order by x->>'id'),'[]'::jsonb) into cd from jsonb_array_elements(rows->'details') x where exists(select 1 from jsonb_array_elements(cp) parent where parent->>'id'=x->>'project_cost_item_id');
  select coalesce(jsonb_agg(x order by x->'link'->>'id'),'[]'::jsonb) into cs from jsonb_array_elements(rows->'sources') x where exists(select 1 from jsonb_array_elements(cp) parent where parent->>'id'=x->'link'->>'project_cost_item_id');
  select case when cat.code='subcontract_labor' then rows->'payments' else '[]'::jsonb end into ca;
  category_data:=category_data||jsonb_build_array(jsonb_build_object('categoryId',cat.id,'code',cat.code,
   'counts',jsonb_build_object('parents',jsonb_array_length(cp),'details',jsonb_array_length(cd),'sources',jsonb_array_length(cs),'payments',jsonb_array_length(ca),
   'publishedParents',(select count(*) from jsonb_array_elements(cp) x where x->>'publication_state'='published'),
   'draftParents',(select count(*) from jsonb_array_elements(cp) x where x->>'publication_state'<>'published'),
   'publishedDetails',(select count(*) from jsonb_array_elements(cd) x where x->>'publication_state'='published'),
   'draftDetails',(select count(*) from jsonb_array_elements(cd) x where x->>'publication_state'<>'published'),
   'unreconciled',(select count(*) from jsonb_array_elements(records) x where (x->>'categoryId')::uuid is not distinct from cat.id and x->>'status'='unreconciled')),
   'checksums',jsonb_build_object('parents',private.c1_workflow_row_hash(cp),'details',private.c1_workflow_row_hash(cd),'sources',private.c1_workflow_row_hash(cs),'payments',private.c1_workflow_row_hash(ca)),
   'sums',jsonb_build_object(
   'publishedParents',coalesce((select sum((x->>'amount_text')::numeric) from jsonb_array_elements(cp) x where x->>'publication_state'='published'),0)::numeric(34,4)::text,
   'draftParents',coalesce((select sum((x->>'amount_text')::numeric) from jsonb_array_elements(cp) x where x->>'publication_state'<>'published'),0)::numeric(34,4)::text,
   'publishedDetails',coalesce((select sum((x->>'amount_text')::numeric) from jsonb_array_elements(cd) x where x->>'publication_state'='published'),0)::numeric(34,4)::text,
   'draftDetails',coalesce((select sum((x->>'amount_text')::numeric) from jsonb_array_elements(cd) x where x->>'publication_state'<>'published'),0)::numeric(34,4)::text,
   'canonicalRecordedCash',coalesce((select sum((x->>'paid_amount_text')::numeric) from jsonb_array_elements(ca) x where x->>'status'='recorded'),0)::numeric(34,4)::text)));
 end loop;
 result:=jsonb_build_object('schemaVersion',1,'companyId',c,'projectId',p,'records',records,'counts',counts,'checksums',checksums,'sums',sums,'duplicates',duplicates,'missingCapMapping',missing,'categories',category_data);
 return result||jsonb_build_object('scopeHash',private.c1_workflow_row_hash(result));
end;$$;
create function public.c1_workflow_inventory(target_company_id uuid,target_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid;
begin t:=private.c1_workflow_report_scope(target_company_id,target_project_id);return private.c1_workflow_inventory(t,target_company_id,target_project_id);end;$$;

create function public.c1_workflow_reconcile_legacy_cash(target_company_id uuid,target_project_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;state text;kind text;legacy_id uuid;record jsonb;ids uuid[];amount numeric;scale integer;actual_date date;reason text;hash text;event_hash text;
 receipt public.cost_command_receipts%rowtype;mapping_id uuid:=gen_random_uuid();payment_id uuid;party_id uuid;category_id uuid;currency text;
begin
 context:=private.c1_master_context(target_company_id,'cost.record_cash');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.record_cash');perform private.c1_workflow_lock_actor(t,target_company_id,'cost.coverage.assert');
 state:=private.c1_workflow_project_state(t,target_company_id,target_project_id);
 perform private.c1_workflow_lock_assignment(t,target_company_id,target_project_id);
 perform private.c1_workflow_require_keys(target_input,array['legacyKind','legacyId','actualOutgoing','actualPaymentDate','evidenceFileIds','reason','expectedLegacyHash'],array['legacyKind','legacyId','actualOutgoing','actualPaymentDate','evidenceFileIds','reason','expectedLegacyHash']);
 kind:=private.c1_workflow_text(target_input->'legacyKind');
 begin legacy_id:=(target_input->>'legacyId')::uuid;exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID';end;
 select money_scale,default_currency_code into scale,currency from public.company_cost_settings where tenant_id=t and company_id=target_company_id and enabled;
 amount:=private.c1_workflow_money(target_input->'actualOutgoing',scale);reason:=private.c1_workflow_text(target_input->'reason');ids:=private.c1_workflow_evidence_ids(target_input->'evidenceFileIds');
 if amount>0 then actual_date:=private.c1_workflow_date(target_input->'actualPaymentDate');perform private.c1_workflow_require_cash_proof(t,target_company_id,target_project_id,ids);
 else
  if target_input->'actualPaymentDate'<>'null'::jsonb then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  perform private.c1_workflow_require_evidence(t,target_company_id,target_project_id,ids);
 end if;
 hash:=private.c1_workflow_hash(target_project_id,legacy_id,target_input);receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.reconcile_legacy_cash',target_idempotency_key,hash);
 if receipt.id is not null then return jsonb_build_object('reconciliationId',receipt.result_resource_id,'version',receipt.result_version,'replayed',true);end if;
 if amount>0 then perform private.c1_workflow_require_unused_cash_proof(t,target_company_id,target_project_id,ids);end if;
 -- Serialize against supported legacy commands before testing the exact reviewed snapshot.
 if kind='ordinary_detail' then
  perform 1 from public.project_cost_items i join public.project_cost_item_details d on d.project_cost_item_id=i.id and d.tenant_id=i.tenant_id and d.company_id=i.company_id
  where d.id=legacy_id and i.tenant_id=t and i.company_id=target_company_id and i.project_id=target_project_id for update of i,d;
 elsif kind='subcontract_payment' then
  perform 1 from public.project_subcontracts s join public.project_subcontract_payments a on a.project_subcontract_id=s.id and a.tenant_id=s.tenant_id and a.company_id=s.company_id and a.project_id=s.project_id
  where a.id=legacy_id and a.tenant_id=t and a.company_id=target_company_id and a.project_id=target_project_id for update of s,a;
 else raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 select x into record from jsonb_array_elements(private.c1_workflow_legacy_records(t,target_company_id,target_project_id)) x where x->>'legacyKind'=kind and (x->>'legacyId')::uuid=legacy_id;
 if record->>'status'<>'unreconciled' then raise exception using errcode='P0001',message='LEGACY_RECONCILIATION_REQUIRED';end if;
 if target_input->>'expectedLegacyHash' is distinct from record->>'legacyHash' then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 party_id:=(record->>'partyId')::uuid;category_id:=(record->>'categoryId')::uuid;
 if party_id is null or category_id is null or currency is distinct from record->>'currencyCode' then raise exception using errcode='P0001',message='LEGACY_RECONCILIATION_REQUIRED';end if;
 if kind='subcontract_payment' and (amount<>(record->>'recordedAmount')::numeric or(record->>'recordedDate' is not null and actual_date is distinct from (record->>'recordedDate')::date))
 then raise exception using errcode='P0001',message='CASH_CORRECTION_CONFLICT';end if;
 if amount>0 then
  payment_id:=gen_random_uuid();
  event_hash:=private.c1_workflow_cash_event_hash(t,target_company_id,target_project_id,'payment',jsonb_build_object('amount',amount::numeric(20,4)::text,'currency',currency,'date',actual_date,'reference','legacy:'||kind||':'||legacy_id::text),ids);
  if exists(select 1 from public.cost_workflow_payments a where a.tenant_id=t and a.company_id=target_company_id and a.project_id=target_project_id and a.cash_event_hash=event_hash) then raise exception using errcode='P0001',message='CASH_DUPLICATE_EVENT';end if;
 end if;
 insert into public.cost_workflow_legacy_cash_reconciliation(id,tenant_id,company_id,project_id,ordinary_detail_id,subcontract_payment_id,payment_id,party_id,category_id,legacy_hash,actual_outgoing,actual_payment_date,evidence_file_ids,reason,reviewed_by)
 values(mapping_id,t,target_company_id,target_project_id,case when kind='ordinary_detail' then legacy_id end,case when kind='subcontract_payment' then legacy_id end,payment_id,party_id,category_id,record->>'legacyHash',amount,actual_date,ids,reason,auth.uid());
 if payment_id is not null then
  insert into public.cost_workflow_payments(id,tenant_id,company_id,project_id,installment_id,legacy_reconciliation_id,cash_kind,ordinary_amount,subcontract_payment_id,currency_code,payment_date,reference,evidence_file_ids,confirmed_by,cash_event_hash)
  values(payment_id,t,target_company_id,target_project_id,null,mapping_id,case when kind='ordinary_detail' then 'ordinary' else 'subcontract' end,case when kind='ordinary_detail' then amount end,case when kind='subcontract_payment' then legacy_id end,currency,actual_date,'legacy:'||kind||':'||legacy_id::text,ids,auth.uid(),event_hash);
  perform private.c1_workflow_claim_cash_proof(t,target_company_id,target_project_id,ids,payment_id,null);
  insert into public.cost_workflow_cash_states(payment_id,tenant_id,company_id,project_id) values(payment_id,t,target_company_id,target_project_id);
 end if;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.reconcile_legacy_cash',target_idempotency_key,hash,mapping_id,1,target_request_id,jsonb_build_object('projectId',target_project_id,'legacyKind',kind,'legacyId',legacy_id,'legacyHash',record->>'legacyHash','actualOutgoing',amount::text,'paymentId',payment_id,'evidenceFileIds',ids,'reason',reason,'historicalApprovalCreated',false));
 return jsonb_strip_nulls(jsonb_build_object('reconciliationId',mapping_id,'paymentId',payment_id,'version',1,'replayed',false));
end;$$;
create or replace function private.c1_workflow_payment_party(payment_id uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select coalesce(i.party_id,m.party_id) from public.cost_workflow_payments p left join public.cost_workflow_installments i on i.id=p.installment_id left join public.cost_workflow_legacy_cash_reconciliation m on m.id=p.legacy_reconciliation_id where p.id=$1;
$$;
create or replace function private.c1_workflow_settlement_payment_allowed(t uuid,c uuid,p uuid,payment_id uuid,completed boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cost_workflow_payments a where a.id=payment_id and a.tenant_id=t and a.company_id=c and a.project_id=p and
 (not completed or exists(select 1 from public.cost_workflow_completion_installments h where h.installment_id=a.installment_id and h.tenant_id=t and h.company_id=c and h.project_id=p)
 or exists(select 1 from public.cost_workflow_legacy_cash_reconciliation m where m.id=a.legacy_reconciliation_id and m.payment_id=a.id and m.tenant_id=t and m.company_id=c and m.project_id=p and m.actual_outgoing>0)));
$$;

create function public.c1_workflow_cash_snapshot(target_company_id uuid,target_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid;project jsonb;categories jsonb;legacy jsonb;
begin
 t:=private.c1_workflow_report_scope(target_company_id,target_project_id);
 select jsonb_build_object('projectId',p.id,'projectCode',p.code,'projectName',p.name,'currencyCode',s.default_currency_code,'moneyScale',s.money_scale,'timeZone',s.time_zone,'operationalState',p.operational_state)
 into project from public.projects p join public.company_cost_settings s on s.tenant_id=p.tenant_id and s.company_id=p.company_id and s.enabled where p.id=target_project_id and p.tenant_id=t and p.company_id=target_company_id;
 if project is null then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 legacy:=private.c1_workflow_legacy_records(t,target_company_id,target_project_id);
 select coalesce(jsonb_agg(value order by display_order,code),'[]'::jsonb) into categories from(
 select category.display_order,category.code,jsonb_build_object('categoryId',category.id,'code',category.code,'name',category.name,'displayOrder',category.display_order,
 'outgoing',coalesce((select jsonb_agg(jsonb_build_object('id',payment.id,'validAmount',private.c1_workflow_valid_cash(payment.id)::text) order by payment.id) from public.cost_workflow_payments payment left join public.cost_workflow_installments i on i.id=payment.installment_id left join public.cost_workflow_legacy_cash_reconciliation m on m.id=payment.legacy_reconciliation_id
 where payment.tenant_id=t and payment.company_id=target_company_id and payment.project_id=target_project_id and coalesce(i.category_id,m.category_id) is not distinct from category.id),'[]'::jsonb),
 'refunds',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'paymentId',r.source_payment_id,'confirmedAmount',r.amount::text) order by r.id) from public.cost_workflow_refunds r join public.cost_workflow_payments payment on payment.id=r.source_payment_id left join public.cost_workflow_installments i on i.id=payment.installment_id left join public.cost_workflow_legacy_cash_reconciliation m on m.id=payment.legacy_reconciliation_id
 where r.tenant_id=t and r.company_id=target_company_id and r.project_id=target_project_id and coalesce(i.category_id,m.category_id) is not distinct from category.id),'[]'::jsonb),
 'installments',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'authorized',i.authorized_amount::text,'consumed',coalesce((select sum(x.amount) from public.cost_workflow_consumptions x where x.installment_id=i.id),0)::text) order by i.id) from public.cost_workflow_installments i where i.tenant_id=t and i.company_id=target_company_id and i.project_id=target_project_id and i.category_id=category.id),'[]'::jsonb),
 'unreconciledCount',(select count(*) from jsonb_array_elements(legacy) x where x->>'status'='unreconciled' and (x->>'categoryId')::uuid is not distinct from category.id)
 +(select count(*) from public.project_cost_items i where i.tenant_id=t and i.company_id=target_company_id and i.project_id=target_project_id and i.publication_state='published' and i.cost_category_id is not distinct from category.id and category.code<>'subcontract_labor' and not exists(select 1 from public.project_cost_item_details d where d.project_cost_item_id=i.id and d.publication_state='published')),
 'verifiedLegacyCount',(select count(*) from public.cost_workflow_legacy_cash_reconciliation m where m.tenant_id=t and m.company_id=target_company_id and m.project_id=target_project_id and m.category_id=category.id),
 -- Retention is a separate recorded observation, never added to cash or inferred from each transfer.
 'retention',jsonb_build_object('state',case when count(retained)>0 then 'recorded' else 'not_recorded' end,'amount',case when count(retained)>0 then sum(retained)::numeric(34,4)::text end,'recordedCount',count(retained))) value
 from(select id,code,name,display_order from public.cost_categories where tenant_id=t and company_id=target_company_id
 union all select null::uuid,'unclassified','Chưa phân loại',2147483647) category
 left join lateral (
 select a.warranty_retention_amount_text::numeric retained from public.project_subcontract_payments a where category.code='subcontract_labor' and a.tenant_id=t and a.company_id=target_company_id and a.project_id=target_project_id and a.status='recorded'
 union all
 select d.retention_amount_text::numeric from public.project_cost_item_details d join public.project_cost_items i on i.id=d.project_cost_item_id and i.tenant_id=d.tenant_id and i.company_id=d.company_id where category.code<>'subcontract_labor' and i.tenant_id=t and i.company_id=target_company_id and i.project_id=target_project_id and i.publication_state='published' and d.publication_state='published' and i.cost_category_id is not distinct from category.id
 ) retention on true
 group by category.id,category.code,category.name,category.display_order) q;
 return jsonb_build_object('project',project,'categories',categories);
end;$$;
revoke all on function private.c1_workflow_report_scope(uuid,uuid),private.c1_workflow_row_hash(jsonb),private.c1_workflow_legacy_records(uuid,uuid,uuid),private.c1_workflow_inventory(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.c1_workflow_inventory(uuid,uuid),public.c1_workflow_cash_snapshot(uuid,uuid),public.c1_workflow_reconcile_legacy_cash(uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.c1_workflow_inventory(uuid,uuid),public.c1_workflow_cash_snapshot(uuid,uuid),public.c1_workflow_reconcile_legacy_cash(uuid,uuid,jsonb,uuid,uuid) to authenticated;

-- A cash-only review cannot establish the whole historical authorized/unpaid cap.
-- Keep affected existing contracts blocked until a separately approved cap-opening design/review exists.
create or replace function private.c1_workflow_require_cap(t uuid,c uuid,p uuid,contract_id uuid,proposed numeric) returns void
language plpgsql volatile security definer set search_path='' as $$
declare contract public.cost_workflow_contracts%rowtype;cap numeric;authorized numeric;
begin
 if contract_id is null then return;end if;
 select * into contract from public.cost_workflow_contracts where id=contract_id and tenant_id=t and company_id=c and project_id=p for update;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 if contract.source_subcontract_id is not null and exists(select 1 from public.project_subcontract_payments old
 where old.project_subcontract_id=contract.source_subcontract_id and old.status='recorded'
 and not exists(select 1 from public.cost_workflow_payments mapped where mapped.subcontract_payment_id=old.id and mapped.installment_id is not null))
 then raise exception using errcode='P0001',message='LEGACY_RECONCILIATION_REQUIRED';end if;
 -- Published ordinary history cannot establish the full approved/unpaid cap.
 -- No opening mapping exists yet; cash-only reconciliation never unlocks it.
 if exists(select 1 from public.project_cost_items legacy left join public.cost_categories legacy_category on legacy_category.id=legacy.category_id and legacy_category.tenant_id=t and legacy_category.company_id=c
 where legacy.tenant_id=t and legacy.company_id=c and legacy.project_id=p
 and (legacy.party_id=contract.party_id or legacy.party_id is null) and legacy.publication_state='published'
 and (legacy_category.code is null or legacy_category.code<>'subcontract_labor'))
 then raise exception using errcode='P0001',message='LEGACY_RECONCILIATION_REQUIRED';end if;
 select v.cap into cap from public.cost_workflow_contract_versions v where v.contract_id=contract.id and v.version=contract.current_version;
 select coalesce(sum(i.authorized_amount),0) into authorized from public.cost_workflow_installments i where i.contract_id=contract.id and i.tenant_id=t and i.company_id=c and i.project_id=p;
 if cap is null or authorized+proposed>cap then raise exception using errcode='P0001',message='CONTRACT_CAP_EXCEEDED';end if;
end;$$;
create or replace function private.c1_workflow_cap_floor(t uuid,c uuid,p uuid,target_contract_id uuid,cap numeric) returns void
language plpgsql volatile security definer set search_path='' as $$
declare authorized numeric;historic_cash numeric;
begin
 select coalesce(sum(i.authorized_amount),0) into authorized from public.cost_workflow_installments i where i.tenant_id=t and i.company_id=c and i.project_id=p and i.contract_id=target_contract_id;
 -- Gross original legacy cash is a minimum floor; refund/correction never releases it.
 select coalesce(sum(a.paid_amount),0) into historic_cash from public.project_subcontract_payments a join public.cost_workflow_contracts contract on contract.source_subcontract_id=a.project_subcontract_id
 where contract.id=target_contract_id and contract.tenant_id=t and contract.company_id=c and contract.project_id=p and a.status='recorded'
 and not exists(select 1 from public.cost_workflow_payments w where w.subcontract_payment_id=a.id and w.installment_id is not null);
 if cap<authorized+historic_cash then raise exception using errcode='P0001',message='CONTRACT_CAP_EXCEEDED';end if;
end;$$;
create or replace function private.c1_workflow_can_read_file(t uuid,c uuid,p uuid,file_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.c1_workflow_actor_has_permission(t,c,'cost.request.file.read') and private.c1_workflow_can_read(t,c,p)
 and exists(select 1 from public.cost_evidence_files f where f.id=file_id and f.tenant_id=t and f.company_id=c and f.project_id=p and f.status='finalized'
 and ((f.workflow_origin and f.created_by=(select auth.uid()) and private.c1_workflow_actor_has_permission(t,c,'cost.request.submit'))
 or exists(select 1 from public.cost_workflow_request_evidence link where link.evidence_file_id=f.id and link.tenant_id=t and link.company_id=c and link.project_id=p)
 or exists(select 1 from public.cost_workflow_contract_versions basis where f.id=any(basis.evidence_file_ids) and basis.tenant_id=t and basis.company_id=c and basis.project_id=p)
 or exists(select 1 from public.cost_workflow_legacy_cash_reconciliation m where f.id=any(m.evidence_file_ids) and m.tenant_id=t and m.company_id=c and m.project_id=p)
 or exists(select 1 from public.cost_workflow_payments payment where f.id=any(payment.evidence_file_ids) and payment.tenant_id=t and payment.company_id=c and payment.project_id=p)
 or (f.workflow_origin and f.workflow_target_id is not null and f.workflow_target_kind in('payment','adjustment','adjustment_source'))));
$$;

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
   and private.c1_workflow_settlement_payment_allowed(t,c,p,payment.id,completed))
 when k='adjustment_source' then private.c1_workflow_settlement_payment_allowed(t,c,p,target,completed)
 else false end;
$$;


create function private.c1_workflow_preserve_mapped_canonical_cash() returns trigger
language plpgsql volatile security definer set search_path='' as $guard$
begin
 if exists(select 1 from public.cost_workflow_payments w where w.subcontract_payment_id=old.id and w.tenant_id=old.tenant_id and w.company_id=old.company_id and w.project_id=old.project_id)
 or exists(select 1 from public.cost_workflow_legacy_cash_reconciliation m where m.subcontract_payment_id=old.id and m.tenant_id=old.tenant_id and m.company_id=old.company_id and m.project_id=old.project_id)
 then raise exception using errcode='P0001',message='LEGACY_WORKFLOW_WRITE_DISABLED';end if;
 if tg_op='UPDATE' then return new;end if;return old;
end;$guard$;
create trigger c1_workflow_preserve_mapped_canonical_cash before update or delete on public.project_subcontract_payments
 for each row execute function private.c1_workflow_preserve_mapped_canonical_cash();
revoke all on function private.c1_workflow_preserve_mapped_canonical_cash() from public,anon,authenticated,service_role;
