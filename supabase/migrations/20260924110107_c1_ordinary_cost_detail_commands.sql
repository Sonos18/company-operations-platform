set local lock_timeout = '5s';
set local statement_timeout = '90s';

create table public.project_cost_item_detail_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_cost_item_detail_id uuid not null,
  source_reported_figure_id uuid not null,
  created_at timestamptz not null default now(),
  unique (project_cost_item_detail_id, source_reported_figure_id),
  foreign key (company_id, tenant_id) references public.companies(id, tenant_id),
  foreign key (project_cost_item_detail_id, tenant_id, company_id) references public.project_cost_item_details(id, tenant_id, company_id),
  foreign key (source_reported_figure_id, tenant_id, company_id) references public.source_reported_figures(id, tenant_id, company_id)
);
create index project_cost_item_detail_sources_scope_idx on public.project_cost_item_detail_sources(tenant_id, company_id, project_cost_item_detail_id);
alter table public.project_cost_item_detail_sources enable row level security;
alter table public.project_cost_item_detail_sources force row level security;
revoke all on table public.project_cost_item_detail_sources from public, anon, authenticated;

create function private.c1_detail_context(target_company_id uuid, target_permission text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb;
begin
  v_context := private.c1_master_context(target_company_id, target_permission);
  if auth.uid() is null or (v_context->>'actorId')::uuid is distinct from auth.uid() then raise exception using errcode='P0001', message='PERMISSION_DENIED'; end if;
  return v_context;
end;
$$;

create function private.c1_detail_receipt(
  target_tenant_id uuid, target_company_id uuid, target_actor_id uuid, target_command text,
  target_key uuid, target_hash text
) returns public.cost_command_receipts language plpgsql security definer set search_path = '' as $$
declare v_receipt public.cost_command_receipts%rowtype;
begin
  select receipt.* into v_receipt from public.cost_command_receipts receipt
  where receipt.company_id=target_company_id and receipt.actor_id=target_actor_id and receipt.command_name=target_command and receipt.idempotency_key=target_key;
  if found and v_receipt.request_hash <> target_hash then raise exception using errcode='P0001', message='IDEMPOTENCY_CONFLICT'; end if;
  return v_receipt;
end;
$$;

create function private.c1_detail_ack(target_detail_id uuid, target_replayed boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',detail.id,'projectCostItemId',detail.project_cost_item_id,'publicationState',detail.publication_state,'version',detail.version,'replayed',target_replayed)
  from public.project_cost_item_details detail where detail.id=target_detail_id;
$$;

create function private.c1_detail_require_scope(target_detail_id uuid, target_tenant_id uuid, target_company_id uuid)
returns public.project_cost_item_details language plpgsql security definer set search_path = '' as $$
declare v_detail public.project_cost_item_details%rowtype;
begin
  select detail.* into v_detail from public.project_cost_item_details detail
  where detail.id=target_detail_id and detail.tenant_id=target_tenant_id and detail.company_id=target_company_id for update;
  if not found then raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND'; end if;
  return v_detail;
end;
$$;

create function private.c1_detail_replace_sources(target_detail public.project_cost_item_details, target_source_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_project_id uuid; v_scope_count integer;
begin
  if target_source_ids is null then return; end if;
  select item.project_id into v_project_id from public.project_cost_items item where item.id=target_detail.project_cost_item_id and item.tenant_id=target_detail.tenant_id and item.company_id=target_detail.company_id;
  select count(*) into v_scope_count from public.source_reported_figures figure
  where figure.id = any(target_source_ids) and figure.tenant_id=target_detail.tenant_id and figure.company_id=target_detail.company_id and figure.project_id=v_project_id;
  if v_scope_count <> cardinality(target_source_ids) then raise exception using errcode='P0001', message='RESOURCE_NOT_FOUND'; end if;
  if exists (
    select 1 from public.source_reported_figures figure left join public.source_review_issues issue on issue.source_selection_id=figure.source_selection_id and issue.tenant_id=figure.tenant_id and issue.company_id=figure.company_id and issue.status='open' and issue.impact='blocks_normalization'
    where figure.id=any(target_source_ids) and (figure.status<>'shared' or issue.id is not null)
  ) then raise exception using errcode='P0001', message='COST_DETAIL_PUBLISH_NOT_READY'; end if;
  delete from public.project_cost_item_detail_sources link where link.project_cost_item_detail_id=target_detail.id and link.tenant_id=target_detail.tenant_id and link.company_id=target_detail.company_id;
  insert into public.project_cost_item_detail_sources(tenant_id,company_id,project_cost_item_detail_id,source_reported_figure_id)
  select target_detail.tenant_id,target_detail.company_id,target_detail.id,source_id from unnest(target_source_ids) source(source_id);
end;
$$;

create function private.c1_create_project_cost_detail_draft(target_company_id uuid, target_input jsonb, target_idempotency_key uuid, target_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_context jsonb; v_tenant_id uuid; v_actor_id uuid; v_hash text; v_receipt public.cost_command_receipts%rowtype; v_parent_id uuid; v_detail public.project_cost_item_details%rowtype; v_line_no integer;
begin
  v_context:=private.c1_detail_context(target_company_id,'cost.manage'); v_tenant_id:=(v_context->>'tenantId')::uuid; v_actor_id:=(v_context->>'actorId')::uuid;
  if target_idempotency_key is null or target_input->>'projectId' is null or target_input->>'categoryId' is null or coalesce(btrim(target_input->>'description'),'')='' then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  v_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('projectId',target_input->>'projectId','input',target_input)),'UTF8'),'sha256'),'hex');
  v_receipt:=private.c1_detail_receipt(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.create_draft',target_idempotency_key,v_hash);
  if v_receipt.id is not null then return private.c1_detail_ack(v_receipt.result_resource_id,true); end if;
  v_parent_id:=private.c1_resolve_or_create_ordinary_project_cost_item(v_tenant_id,target_company_id,(target_input->>'projectId')::uuid,(target_input->>'categoryId')::uuid,v_actor_id,target_request_id);
  perform 1 from public.project_cost_items item where item.id=v_parent_id for update;
  select coalesce(max(detail.line_no),0)+1 into v_line_no from public.project_cost_item_details detail where detail.project_cost_item_id=v_parent_id and detail.tenant_id=v_tenant_id and detail.company_id=target_company_id;
  insert into public.project_cost_item_details(tenant_id,company_id,project_cost_item_id,line_no,detail_kind,description,relevant_date,reference,note,publication_state,created_by)
  values(v_tenant_id,target_company_id,v_parent_id,v_line_no,'line_item',btrim(target_input->>'description'),nullif(target_input->>'relevantDate','')::date,nullif(btrim(target_input->>'reference'),''),nullif(btrim(target_input->>'note'),''),'draft',v_actor_id) returning * into v_detail;
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,after_summary) values(v_tenant_id,target_company_id,v_actor_id,'c1.project_cost_detail.draft_created','project_cost_item_detail',v_detail.id::text,target_request_id,to_jsonb(v_detail));
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version) values(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.create_draft',target_idempotency_key,v_hash,v_detail.id,v_detail.version);
  return private.c1_detail_ack(v_detail.id,false);
end;
$$;

create function private.c1_update_project_cost_detail_draft(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_context jsonb; v_detail public.project_cost_item_details%rowtype; v_before jsonb;
begin
  v_context:=private.c1_detail_context(target_company_id,'cost.manage'); v_detail:=private.c1_detail_require_scope(target_id,(v_context->>'tenantId')::uuid,target_company_id);
  if v_detail.publication_state<>'draft' then raise exception using errcode='P0001',message='COST_DETAIL_NOT_DRAFT'; end if;
  if v_detail.version<>(target_input->>'expectedVersion')::bigint then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
  if not (target_input ? 'description' or target_input ? 'relevantDate' or target_input ? 'reference' or target_input ? 'note') then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  v_before:=to_jsonb(v_detail);
  update public.project_cost_item_details detail set description=case when target_input?'description' then btrim(target_input->>'description') else detail.description end,relevant_date=case when target_input?'relevantDate' then nullif(target_input->>'relevantDate','')::date else detail.relevant_date end,reference=case when target_input?'reference' then nullif(btrim(target_input->>'reference'),'') else detail.reference end,note=case when target_input?'note' then nullif(btrim(target_input->>'note'),'') else detail.note end,version=detail.version+1,updated_at=now() where detail.id=v_detail.id returning * into v_detail;
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,before_summary,after_summary) values((v_context->>'tenantId')::uuid,target_company_id,(v_context->>'actorId')::uuid,'c1.project_cost_detail.draft_updated','project_cost_item_detail',v_detail.id::text,target_request_id,v_before,to_jsonb(v_detail));
  return private.c1_detail_ack(v_detail.id,false);
end;
$$;

create function private.c1_prepare_project_cost_detail_financials(target_company_id uuid,target_id uuid,target_input jsonb,target_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_context jsonb; v_detail public.project_cost_item_details%rowtype; v_before jsonb; v_amount numeric;
begin
  v_context:=private.c1_detail_context(target_company_id,'cost.prepare'); v_detail:=private.c1_detail_require_scope(target_id,(v_context->>'tenantId')::uuid,target_company_id);
  if v_detail.publication_state<>'draft' then raise exception using errcode='P0001',message='COST_DETAIL_NOT_DRAFT'; end if;
  if v_detail.version<>(target_input->>'expectedVersion')::bigint then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
  if coalesce(target_input->>'amount','') !~ '^\\d{1,16}(\\.\\d{1,4})?$' then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  v_before:=to_jsonb(v_detail); v_amount:=(target_input->>'amount')::numeric;
  update public.project_cost_item_details detail set quantity_text=nullif(target_input->>'quantity',''),unit_code=nullif(btrim(target_input->>'unitCode'),''),unit_price_text=nullif(target_input->>'unitPrice',''),amount_text=v_amount::text,retention_kind=nullif(target_input->>'retentionKind',''),retention_rate_bps=nullif(target_input->>'retentionRateBps','')::integer,retention_amount_text=nullif(target_input->>'retentionAmount',''),version=detail.version+1,updated_at=now() where detail.id=v_detail.id returning * into v_detail;
  perform private.c1_detail_replace_sources(v_detail,case when target_input?'sourceFigureIds' then array(select jsonb_array_elements_text(target_input->'sourceFigureIds')::uuid) else null end);
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,before_summary,after_summary) values((v_context->>'tenantId')::uuid,target_company_id,(v_context->>'actorId')::uuid,'c1.project_cost_detail.prepared','project_cost_item_detail',v_detail.id::text,target_request_id,v_before,to_jsonb(v_detail));
  return private.c1_detail_ack(v_detail.id,false);
end;
$$;

create function private.c1_publish_project_cost_detail(target_company_id uuid,target_id uuid,target_expected_version bigint,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_context jsonb; v_tenant_id uuid; v_actor_id uuid; v_detail public.project_cost_item_details%rowtype; v_hash text; v_receipt public.cost_command_receipts%rowtype;
begin
  v_context:=private.c1_detail_context(target_company_id,'cost.publish_import'); v_tenant_id:=(v_context->>'tenantId')::uuid;v_actor_id:=(v_context->>'actorId')::uuid; if target_idempotency_key is null then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('id',target_id,'expectedVersion',target_expected_version),'UTF8'),'sha256'),'hex');v_receipt:=private.c1_detail_receipt(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.publish',target_idempotency_key,v_hash);if v_receipt.id is not null then return private.c1_detail_ack(v_receipt.result_resource_id,true);end if;
  v_detail:=private.c1_detail_require_scope(target_id,v_tenant_id,target_company_id);if v_detail.publication_state='published' then raise exception using errcode='P0001',message='COST_DETAIL_ALREADY_PUBLISHED';end if;if v_detail.version<>target_expected_version then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;if v_detail.amount_text is null then raise exception using errcode='P0001',message='COST_DETAIL_PUBLISH_NOT_READY';end if;perform private.c1_detail_validate_linked_sources(v_detail.id,v_tenant_id,target_company_id);
  update public.project_cost_item_details detail set publication_state='published',publication_origin='command',published_by=v_actor_id,published_at=now(),publication_request_id=target_request_id,version=detail.version+1,updated_at=now() where detail.id=v_detail.id returning * into v_detail;perform private.c1_sync_project_cost_item_amount(v_detail.project_cost_item_id);
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,before_summary,after_summary) values(v_tenant_id,target_company_id,v_actor_id,'c1.project_cost_detail.published','project_cost_item_detail',v_detail.id::text,target_request_id,null,to_jsonb(v_detail));insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version) values(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.publish',target_idempotency_key,v_hash,v_detail.id,v_detail.version);return private.c1_detail_ack(v_detail.id,false);
end;
$$;

create function private.c1_create_and_publish_project_cost_detail(target_company_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_context jsonb; v_tenant_id uuid; v_actor_id uuid; v_hash text; v_receipt public.cost_command_receipts%rowtype; v_draft jsonb; v_prepared jsonb; v_detail_id uuid;
begin
  v_context:=private.c1_detail_context(target_company_id,'cost.manage');perform private.c1_detail_context(target_company_id,'cost.prepare');perform private.c1_detail_context(target_company_id,'cost.publish_import');v_tenant_id:=(v_context->>'tenantId')::uuid;v_actor_id:=(v_context->>'actorId')::uuid;
  if target_idempotency_key is null or coalesce(target_input->>'amount','') !~ '^\\d{1,16}(\\.\\d{1,4})?$' then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  v_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('projectId',target_input->>'projectId','input',target_input)),'UTF8'),'sha256'),'hex');v_receipt:=private.c1_detail_receipt(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.create_and_publish',target_idempotency_key,v_hash);if v_receipt.id is not null then return private.c1_detail_ack(v_receipt.result_resource_id,true);end if;
  v_draft:=private.c1_create_project_cost_detail_draft(target_company_id,target_input-'amount'-'quantity'-'unitCode'-'unitPrice'-'retentionKind'-'retentionRateBps'-'retentionAmount'-'sourceFigureIds',target_idempotency_key,target_request_id);v_detail_id:=(v_draft->>'id')::uuid;
  v_prepared:=private.c1_prepare_project_cost_detail_financials(target_company_id,v_detail_id,jsonb_build_object('expectedVersion',(v_draft->>'version')::bigint,'amount',target_input->>'amount','quantity',target_input->'quantity','unitCode',target_input->'unitCode','unitPrice',target_input->'unitPrice','retentionKind',target_input->'retentionKind','retentionRateBps',target_input->'retentionRateBps','retentionAmount',target_input->'retentionAmount','sourceFigureIds',target_input->'sourceFigureIds'),target_request_id);
  perform private.c1_publish_project_cost_detail(target_company_id,v_detail_id,(v_prepared->>'version')::bigint,target_idempotency_key,target_request_id);update public.project_cost_item_details detail set version=0 where detail.id=v_detail_id;
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version) select v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.create_and_publish',target_idempotency_key,v_hash,detail.id,detail.version from public.project_cost_item_details detail where detail.id=v_detail_id;
  return private.c1_detail_ack(v_detail_id,false);
end;
$$;

create function private.c1_correct_published_project_cost_detail(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_context jsonb; v_tenant_id uuid; v_actor_id uuid; v_detail public.project_cost_item_details%rowtype; v_before jsonb; v_before_sources jsonb; v_changes jsonb; v_hash text; v_receipt public.cost_command_receipts%rowtype;
begin
  v_context:=private.c1_detail_context(target_company_id,'cost.correct');v_tenant_id:=(v_context->>'tenantId')::uuid;v_actor_id:=(v_context->>'actorId')::uuid;if target_idempotency_key is null or coalesce(btrim(target_input->>'reason'),'')='' then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  v_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('detailId',target_id,'input',target_input)),'UTF8'),'sha256'),'hex');v_receipt:=private.c1_detail_receipt(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.correct',target_idempotency_key,v_hash);if v_receipt.id is not null then return private.c1_detail_ack(v_receipt.result_resource_id,true);end if;
  perform private.c1_detail_validate_correction_input(target_input);v_detail:=private.c1_detail_require_scope(target_id,v_tenant_id,target_company_id);if v_detail.publication_state<>'published' then raise exception using errcode='P0001',message='COST_DETAIL_NOT_PUBLISHED';end if;if v_detail.version<>(target_input->>'expectedVersion')::bigint then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;v_changes:=target_input->'changes';perform private.c1_detail_validate_correction_shape(v_detail,v_changes);
  v_before:=to_jsonb(v_detail);select coalesce(jsonb_agg(link.source_reported_figure_id order by link.source_reported_figure_id),'[]'::jsonb) into v_before_sources from public.project_cost_item_detail_sources link where link.project_cost_item_detail_id=v_detail.id and link.tenant_id=v_tenant_id and link.company_id=target_company_id;update public.project_cost_item_details detail set description=case when v_changes?'description' then btrim(v_changes->>'description') else detail.description end,relevant_date=case when v_changes?'relevantDate' then nullif(v_changes->>'relevantDate','')::date else detail.relevant_date end,reference=case when v_changes?'reference' then nullif(btrim(v_changes->>'reference'),'') else detail.reference end,note=case when v_changes?'note' then nullif(btrim(v_changes->>'note'),'') else detail.note end,quantity_text=case when v_changes?'quantity' then nullif(v_changes->>'quantity','') else detail.quantity_text end,unit_code=case when v_changes?'unitCode' then nullif(btrim(v_changes->>'unitCode'),'') else detail.unit_code end,unit_price_text=case when v_changes?'unitPrice' then nullif(v_changes->>'unitPrice','') else detail.unit_price_text end,amount_text=case when v_changes?'amount' then (v_changes->>'amount')::numeric::text else detail.amount_text end,retention_kind=case when v_changes?'retentionKind' then nullif(v_changes->>'retentionKind','') else detail.retention_kind end,retention_rate_bps=case when v_changes?'retentionRateBps' then nullif(v_changes->>'retentionRateBps','')::integer else detail.retention_rate_bps end,retention_amount_text=case when v_changes?'retentionAmount' then nullif(v_changes->>'retentionAmount','') else detail.retention_amount_text end,version=detail.version+1,updated_at=now() where detail.id=v_detail.id returning * into v_detail;
  perform private.c1_detail_replace_sources(v_detail,case when v_changes?'sourceFigureIds' then array(select jsonb_array_elements_text(v_changes->'sourceFigureIds')::uuid) else null end);perform private.c1_detail_validate_linked_sources(v_detail.id,v_tenant_id,target_company_id);perform private.c1_sync_project_cost_item_amount(v_detail.project_cost_item_id);insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,before_summary,after_summary) values(v_tenant_id,target_company_id,v_actor_id,'c1.project_cost_detail.corrected','project_cost_item_detail',v_detail.id::text,target_request_id,jsonb_build_object('detail',v_before,'sourceFigureIds',v_before_sources),jsonb_build_object('detail',to_jsonb(v_detail),'sourceFigureIds',(select coalesce(jsonb_agg(link.source_reported_figure_id order by link.source_reported_figure_id),'[]'::jsonb) from public.project_cost_item_detail_sources link where link.project_cost_item_detail_id=v_detail.id and link.tenant_id=v_tenant_id and link.company_id=target_company_id),'reason',btrim(target_input->>'reason'),'requestId',target_request_id,'idempotencyKey',target_idempotency_key));insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version) values(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.correct',target_idempotency_key,v_hash,v_detail.id,v_detail.version);return private.c1_detail_ack(v_detail.id,false);
end;
$$;

create function private.c1_read_project_cost_detail_draft(target_company_id uuid,target_id uuid,target_operational boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb; v_permission text:=case when target_operational then 'cost.manage' else 'cost.prepare' end; v_detail public.project_cost_item_details%rowtype; v_project_id uuid; v_category_id uuid; v_sources jsonb;
begin
  v_context:=private.c1_detail_context(target_company_id,v_permission);select detail.* into v_detail from public.project_cost_item_details detail where detail.id=target_id and detail.tenant_id=(v_context->>'tenantId')::uuid and detail.company_id=target_company_id and detail.publication_state='draft';if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;select item.project_id,item.cost_category_id into v_project_id,v_category_id from public.project_cost_items item where item.id=v_detail.project_cost_item_id;
  if target_operational then return jsonb_build_object('id',v_detail.id,'projectCostItemId',v_detail.project_cost_item_id,'projectId',v_project_id,'categoryId',v_category_id,'lineNo',v_detail.line_no,'description',v_detail.description,'relevantDate',v_detail.relevant_date,'reference',v_detail.reference,'note',v_detail.note,'publicationState','draft','version',v_detail.version,'createdAt',v_detail.created_at,'updatedAt',v_detail.updated_at);end if;
  select coalesce(jsonb_agg(link.source_reported_figure_id order by link.source_reported_figure_id),'[]'::jsonb) into v_sources from public.project_cost_item_detail_sources link where link.project_cost_item_detail_id=v_detail.id;return jsonb_build_object('id',v_detail.id,'projectCostItemId',v_detail.project_cost_item_id,'projectId',v_project_id,'categoryId',v_category_id,'lineNo',v_detail.line_no,'description',v_detail.description,'relevantDate',v_detail.relevant_date,'reference',v_detail.reference,'note',v_detail.note,'quantity',v_detail.quantity_text,'unitCode',v_detail.unit_code,'unitPrice',v_detail.unit_price_text,'amount',v_detail.amount_text,'retentionKind',v_detail.retention_kind,'retentionRateBps',v_detail.retention_rate_bps,'retentionAmount',v_detail.retention_amount_text,'sourceFigureIds',v_sources,'publicationState','draft','version',v_detail.version,'publishReadiness',jsonb_build_object('ready',v_detail.amount_text is not null,'blockingCodes',case when v_detail.amount_text is null then jsonb_build_array('FINANCIAL_DETAILS_REQUIRED') else '[]'::jsonb end),'createdAt',v_detail.created_at,'updatedAt',v_detail.updated_at);
end;
$$;

create function private.c1_list_project_cost_detail_drafts(target_company_id uuid,target_project_id uuid,target_operational boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb; v_permission text:=case when target_operational then 'cost.manage' else 'cost.prepare' end;
begin
  v_context:=private.c1_detail_context(target_company_id,v_permission);return coalesce((select jsonb_agg(private.c1_read_project_cost_detail_draft(target_company_id,detail.id,target_operational) order by detail.created_at,detail.id) from public.project_cost_item_details detail join public.project_cost_items item on item.id=detail.project_cost_item_id where detail.tenant_id=(v_context->>'tenantId')::uuid and detail.company_id=target_company_id and item.project_id=target_project_id and detail.publication_state='draft'),'[]'::jsonb);
end;
$$;

create function public.c1_create_project_cost_detail_draft(target_company_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.c1_create_project_cost_detail_draft(target_company_id,target_input,target_idempotency_key,target_request_id); $$;
create function public.c1_update_project_cost_detail_draft(target_company_id uuid,target_id uuid,target_input jsonb,target_request_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.c1_update_project_cost_detail_draft(target_company_id,target_id,target_input,target_request_id); $$;
create function public.c1_prepare_project_cost_detail_financials(target_company_id uuid,target_id uuid,target_input jsonb,target_request_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.c1_prepare_project_cost_detail_financials(target_company_id,target_id,target_input,target_request_id); $$;
create function public.c1_publish_project_cost_detail(target_company_id uuid,target_id uuid,target_expected_version bigint,target_idempotency_key uuid,target_request_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.c1_publish_project_cost_detail(target_company_id,target_id,target_expected_version,target_idempotency_key,target_request_id); $$;
create function public.c1_create_and_publish_project_cost_detail(target_company_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.c1_create_and_publish_project_cost_detail(target_company_id,target_input,target_idempotency_key,target_request_id); $$;
create function public.c1_correct_published_project_cost_detail(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.c1_correct_published_project_cost_detail(target_company_id,target_id,target_input,target_idempotency_key,target_request_id); $$;
create function public.c1_read_project_cost_detail_draft(target_company_id uuid,target_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.c1_read_project_cost_detail_draft(target_company_id,target_id,false); $$;
create function public.c1_read_project_cost_detail_draft_operational(target_company_id uuid,target_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.c1_read_project_cost_detail_draft(target_company_id,target_id,true); $$;
create function public.c1_list_project_cost_detail_drafts(target_company_id uuid,target_project_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.c1_list_project_cost_detail_drafts(target_company_id,target_project_id,false); $$;
create function public.c1_list_project_cost_detail_drafts_operational(target_company_id uuid,target_project_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.c1_list_project_cost_detail_drafts(target_company_id,target_project_id,true); $$;

create or replace function private.c1_detail_receipt(
  target_tenant_id uuid, target_company_id uuid, target_actor_id uuid, target_command text,
  target_key uuid, target_hash text
) returns public.cost_command_receipts language plpgsql security definer set search_path='' as $$
declare v_receipt public.cost_command_receipts%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('c1_detail_receipt:' || target_tenant_id::text || ':' || target_company_id::text || ':' || target_actor_id::text || ':' || target_command || ':' || target_key::text, 0));
  select receipt.* into v_receipt from public.cost_command_receipts receipt
  where receipt.company_id=target_company_id and receipt.actor_id=target_actor_id and receipt.command_name=target_command and receipt.idempotency_key=target_key for update;
  if found and v_receipt.request_hash <> target_hash then raise exception using errcode='P0001', message='IDEMPOTENCY_CONFLICT'; end if;
  return v_receipt;
end;
$$;

create function private.c1_detail_validate_linked_sources(target_detail_id uuid, target_tenant_id uuid, target_company_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if exists (
    select 1
    from public.project_cost_item_detail_sources link
    join public.project_cost_item_details detail on detail.id=link.project_cost_item_detail_id and detail.tenant_id=link.tenant_id and detail.company_id=link.company_id
    join public.project_cost_items item on item.id=detail.project_cost_item_id and item.tenant_id=detail.tenant_id and item.company_id=detail.company_id
    left join public.source_reported_figures figure on figure.id=link.source_reported_figure_id and figure.tenant_id=link.tenant_id and figure.company_id=link.company_id
    where link.project_cost_item_detail_id=target_detail_id and link.tenant_id=target_tenant_id and link.company_id=target_company_id
      and (figure.id is null or figure.project_id is distinct from item.project_id or figure.status<>'shared' or exists (
        select 1 from public.source_review_issues issue where issue.source_selection_id=figure.source_selection_id and issue.tenant_id=figure.tenant_id and issue.company_id=figure.company_id and issue.status='open' and issue.impact='blocks_normalization'
      ))
  ) then raise exception using errcode='P0001', message='COST_DETAIL_PUBLISH_NOT_READY'; end if;
end;
$$;

create function private.c1_detail_validate_correction_input(target_input jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_changes jsonb; v_key text;
begin
  if jsonb_typeof(target_input)<>'object' or not (target_input ?& array['expectedVersion','reason','changes']) or exists (select 1 from jsonb_object_keys(target_input) key where key not in ('expectedVersion','reason','changes'))
    or jsonb_typeof(target_input->'expectedVersion')<>'number' or (target_input->>'expectedVersion') !~ '^\\d{1,19}$' or (length(target_input->>'expectedVersion')=19 and target_input->>'expectedVersion' > '9223372036854775807')
    or jsonb_typeof(target_input->'reason')<>'string' or btrim(target_input->>'reason')='' or jsonb_typeof(target_input->'changes')<>'object' or target_input->'changes'='{}'::jsonb
  then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  v_changes:=target_input->'changes';
  if exists (select 1 from jsonb_object_keys(v_changes) key where key not in ('description','relevantDate','reference','note','quantity','unitCode','unitPrice','amount','retentionKind','retentionRateBps','retentionAmount','sourceFigureIds')) then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  if (v_changes ? 'description' and (jsonb_typeof(v_changes->'description')<>'string' or btrim(v_changes->>'description')=''))
    or (v_changes ? 'relevantDate' and (jsonb_typeof(v_changes->'relevantDate') not in ('string','null') or (jsonb_typeof(v_changes->'relevantDate')='string' and (v_changes->>'relevantDate') !~ '^\\d{4}-\\d{2}-\\d{2}$')))
    or (v_changes ? 'reference' and (jsonb_typeof(v_changes->'reference') not in ('string','null') or (jsonb_typeof(v_changes->'reference')='string' and btrim(v_changes->>'reference')='')))
    or (v_changes ? 'note' and (jsonb_typeof(v_changes->'note') not in ('string','null') or (jsonb_typeof(v_changes->'note')='string' and btrim(v_changes->>'note')='')))
    or (v_changes ? 'quantity' and (jsonb_typeof(v_changes->'quantity') not in ('string','null') or (jsonb_typeof(v_changes->'quantity')='string' and (v_changes->>'quantity') !~ '^\\d{1,16}(\\.\\d{1,4})?$')))
    or (v_changes ? 'unitCode' and (jsonb_typeof(v_changes->'unitCode') not in ('string','null') or (jsonb_typeof(v_changes->'unitCode')='string' and btrim(v_changes->>'unitCode')='')))
    or (v_changes ? 'unitPrice' and (jsonb_typeof(v_changes->'unitPrice') not in ('string','null') or (jsonb_typeof(v_changes->'unitPrice')='string' and (v_changes->>'unitPrice') !~ '^\\d{1,16}(\\.\\d{1,4})?$')))
    or (v_changes ? 'amount' and (jsonb_typeof(v_changes->'amount')<>'string' or v_changes->>'amount' !~ '^\\d{1,16}(\\.\\d{1,4})?$'))
    or (v_changes ? 'retentionKind' and (jsonb_typeof(v_changes->'retentionKind') not in ('string','null') or (v_changes->>'retentionKind') not in ('warranty','other')))
    or (v_changes ? 'retentionRateBps' and (jsonb_typeof(v_changes->'retentionRateBps') not in ('number','null') or (jsonb_typeof(v_changes->'retentionRateBps')='number' and ((v_changes->>'retentionRateBps') !~ '^\\d{1,5}$' or lpad(v_changes->>'retentionRateBps',5,'0') > '10000'))))
    or (v_changes ? 'retentionAmount' and (jsonb_typeof(v_changes->'retentionAmount') not in ('string','null') or (jsonb_typeof(v_changes->'retentionAmount')='string' and (v_changes->>'retentionAmount') !~ '^\\d{1,16}(\\.\\d{1,4})?$')))
    or (v_changes ? 'sourceFigureIds' and jsonb_typeof(v_changes->'sourceFigureIds')<>'array')
  then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  if v_changes ? 'sourceFigureIds' and (exists (select 1 from jsonb_array_elements(v_changes->'sourceFigureIds') value where jsonb_typeof(value)<>'string' or value#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') or (select count(*) from jsonb_array_elements_text(v_changes->'sourceFigureIds'))<>(select count(distinct value) from jsonb_array_elements_text(v_changes->'sourceFigureIds') value)) then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  if v_changes ? 'relevantDate' and jsonb_typeof(v_changes->'relevantDate')='string' then perform private.c1_parse_project_cost_date(v_changes->>'relevantDate'); end if;
end;
$$;

create function private.c1_detail_validate_correction_shape(target_detail public.project_cost_item_details, target_changes jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_amount numeric; v_kind text; v_rate integer; v_retention_amount numeric;
begin
  v_amount:=case when target_changes?'amount' then (target_changes->>'amount')::numeric else target_detail.amount_text::numeric end;
  v_kind:=case when target_changes?'retentionKind' then nullif(target_changes->>'retentionKind','') else target_detail.retention_kind end;
  v_rate:=case when target_changes?'retentionRateBps' then nullif(target_changes->>'retentionRateBps','')::integer else target_detail.retention_rate_bps end;
  v_retention_amount:=case when target_changes?'retentionAmount' then nullif(target_changes->>'retentionAmount','')::numeric else nullif(target_detail.retention_amount_text,'')::numeric end;
  if (v_kind is null and (v_rate is not null or v_retention_amount is not null)) or (v_kind is not null and v_retention_amount is null) or v_retention_amount > v_amount then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
end;
$$;

create or replace function private.c1_can_read_project_cost_detail(target_tenant_id uuid,target_company_id uuid,target_project_cost_item_id uuid,target_publication_state text)
returns boolean language sql stable security definer set search_path='' as $$
  select target_publication_state='published' and exists (
    select 1 from public.company_cost_settings settings join public.project_cost_items item on item.id=target_project_cost_item_id and item.tenant_id=target_tenant_id and item.company_id=target_company_id
    where settings.tenant_id=target_tenant_id and settings.company_id=target_company_id and settings.enabled and private.has_company_permission(target_tenant_id,target_company_id,'cost.read')
  );
$$;

revoke all on function private.c1_detail_context(uuid,text), private.c1_detail_receipt(uuid,uuid,uuid,text,uuid,text), private.c1_detail_ack(uuid,boolean), private.c1_detail_require_scope(uuid,uuid,uuid), private.c1_detail_replace_sources(public.project_cost_item_details,uuid[]), private.c1_detail_validate_linked_sources(uuid,uuid,uuid), private.c1_detail_validate_correction_input(jsonb), private.c1_detail_validate_correction_shape(public.project_cost_item_details,jsonb), private.c1_create_project_cost_detail_draft(uuid,jsonb,uuid,uuid), private.c1_update_project_cost_detail_draft(uuid,uuid,jsonb,uuid), private.c1_prepare_project_cost_detail_financials(uuid,uuid,jsonb,uuid), private.c1_publish_project_cost_detail(uuid,uuid,bigint,uuid,uuid), private.c1_create_and_publish_project_cost_detail(uuid,jsonb,uuid,uuid), private.c1_correct_published_project_cost_detail(uuid,uuid,jsonb,uuid,uuid), private.c1_read_project_cost_detail_draft(uuid,uuid,boolean), private.c1_list_project_cost_detail_drafts(uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.c1_create_project_cost_detail_draft(uuid,jsonb,uuid,uuid), public.c1_update_project_cost_detail_draft(uuid,uuid,jsonb,uuid), public.c1_prepare_project_cost_detail_financials(uuid,uuid,jsonb,uuid), public.c1_publish_project_cost_detail(uuid,uuid,bigint,uuid,uuid), public.c1_create_and_publish_project_cost_detail(uuid,jsonb,uuid,uuid), public.c1_correct_published_project_cost_detail(uuid,uuid,jsonb,uuid,uuid), public.c1_read_project_cost_detail_draft(uuid,uuid), public.c1_read_project_cost_detail_draft_operational(uuid,uuid), public.c1_list_project_cost_detail_drafts(uuid,uuid), public.c1_list_project_cost_detail_drafts_operational(uuid,uuid) from public, anon, authenticated;
grant execute on function public.c1_create_project_cost_detail_draft(uuid,jsonb,uuid,uuid), public.c1_update_project_cost_detail_draft(uuid,uuid,jsonb,uuid), public.c1_prepare_project_cost_detail_financials(uuid,uuid,jsonb,uuid), public.c1_publish_project_cost_detail(uuid,uuid,bigint,uuid,uuid), public.c1_create_and_publish_project_cost_detail(uuid,jsonb,uuid,uuid), public.c1_correct_published_project_cost_detail(uuid,uuid,jsonb,uuid,uuid), public.c1_read_project_cost_detail_draft(uuid,uuid), public.c1_read_project_cost_detail_draft_operational(uuid,uuid), public.c1_list_project_cost_detail_drafts(uuid,uuid), public.c1_list_project_cost_detail_drafts_operational(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
