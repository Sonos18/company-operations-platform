set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 21);

do $$
begin
  if to_regprocedure('private.c1_detail_receipt(uuid,uuid,uuid,text,uuid,text)') is null
    or to_regprocedure('private.c1_create_project_cost_detail_draft(uuid,jsonb,uuid,uuid)') is null
    or to_regprocedure('private.c1_publish_project_cost_detail(uuid,uuid,jsonb,uuid,uuid)') is null
    or to_regprocedure('private.c1_create_and_publish_project_cost_detail(uuid,jsonb,uuid,uuid)') is null
    or to_regprocedure('private.c1_correct_published_project_cost_detail(uuid,uuid,jsonb,uuid,uuid)') is null
    or to_regprocedure('private.c1_can_read_project_cost_detail_evidence_metadata(uuid,uuid,uuid)') is null then
    raise exception using errcode = 'P0001', message = 'C1_DETAIL_REVIEW_FIX_BASELINE_MISSING';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.project_cost_item_details', 'update') then
    raise exception using errcode = 'P0001', message = 'C1_DETAIL_REPLAY_PARENT_MUTABILITY_DRIFT';
  end if;

  if exists (
    select 1
    from public.cost_command_receipts receipt
    where receipt.command_name in (
      'project_cost_detail.create_draft',
      'project_cost_detail.publish',
      'project_cost_detail.create_and_publish',
      'project_cost_detail.correct'
    )
      and (receipt.result_resource_id is null or receipt.result_version is null)
  ) then
    raise exception using errcode = 'P0001', message = 'C1_DETAIL_REPLAY_RECEIPT_DRIFT';
  end if;
end;
$$;

create or replace function private.c1_detail_replay_ack(
  target_detail_id uuid,
  target_version bigint,
  target_publication_state text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', detail.id,
    'projectCostItemId', detail.project_cost_item_id,
    'publicationState', target_publication_state,
    'version', target_version,
    'replayed', true
  )
  from public.project_cost_item_details detail
  where detail.id = target_detail_id;
$$;

create or replace function private.c1_create_project_cost_detail_draft(target_company_id uuid, target_input jsonb, target_idempotency_key uuid, target_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_context jsonb; v_tenant_id uuid; v_actor_id uuid; v_hash text; v_receipt public.cost_command_receipts%rowtype; v_parent_id uuid; v_detail public.project_cost_item_details%rowtype; v_line_no integer;
begin
  v_context:=private.c1_detail_context(target_company_id,'cost.manage'); v_tenant_id:=(v_context->>'tenantId')::uuid; v_actor_id:=(v_context->>'actorId')::uuid;
  if target_idempotency_key is null or target_input->>'projectId' is null or target_input->>'categoryId' is null or coalesce(btrim(target_input->>'description'),'')='' then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  v_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('projectId',target_input->>'projectId','input',target_input)),'UTF8'),'sha256'),'hex');
  v_receipt:=private.c1_detail_receipt(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.create_draft',target_idempotency_key,v_hash);
  if v_receipt.id is not null then return private.c1_detail_replay_ack(v_receipt.result_resource_id,v_receipt.result_version,'draft'); end if;
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

create or replace function private.c1_publish_project_cost_detail(
  target_company_id uuid,
  target_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_actor_id uuid;
  v_detail public.project_cost_item_details%rowtype;
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_expected_version bigint;
begin
  v_context := private.c1_detail_context(target_company_id, 'cost.publish_import');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  v_actor_id := (v_context->>'actorId')::uuid;
  if target_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;

  v_expected_version := private.c1_detail_publish_expected_version(target_input);
  v_hash := encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(
    jsonb_build_object('id', target_id, 'expectedVersion', v_expected_version)
  ), 'UTF8'), 'sha256'), 'hex');
  v_receipt := private.c1_detail_receipt(
    v_tenant_id,
    target_company_id,
    v_actor_id,
    'project_cost_detail.publish',
    target_idempotency_key,
    v_hash
  );
  if v_receipt.id is not null then
    return private.c1_detail_replay_ack(v_receipt.result_resource_id,v_receipt.result_version,'published');
  end if;

  v_detail := private.c1_detail_require_scope(target_id, v_tenant_id, target_company_id);
  if v_detail.publication_state = 'published' then
    raise exception using errcode = 'P0001', message = 'COST_DETAIL_ALREADY_PUBLISHED';
  end if;
  if v_detail.version is distinct from v_expected_version then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;
  if v_detail.amount_text is null then
    raise exception using errcode = 'P0001', message = 'COST_DETAIL_PUBLISH_NOT_READY';
  end if;
  perform private.c1_detail_validate_linked_sources(v_detail.id, v_tenant_id, target_company_id);

  update public.project_cost_item_details detail
  set publication_state = 'published',
      publication_origin = 'command',
      published_by = v_actor_id,
      published_at = now(),
      publication_request_id = target_request_id,
      version = detail.version + 1,
      updated_at = now()
  where detail.id = v_detail.id
  returning * into v_detail;
  perform private.c1_sync_project_cost_item_amount(v_detail.project_cost_item_id);

  insert into public.audit_events(
    tenant_id, company_id, actor_id, action, resource_type, resource_id,
    request_id, before_summary, after_summary
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'c1.project_cost_detail.published',
    'project_cost_item_detail', v_detail.id::text, target_request_id, null, to_jsonb(v_detail)
  );
  insert into public.cost_command_receipts(
    tenant_id, company_id, actor_id, command_name, idempotency_key,
    request_hash, result_resource_id, result_version
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'project_cost_detail.publish',
    target_idempotency_key, v_hash, v_detail.id, v_detail.version
  );
  return private.c1_detail_ack(v_detail.id, false);
end;
$$;

create or replace function private.c1_create_and_publish_project_cost_detail(target_company_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_context jsonb; v_tenant_id uuid; v_actor_id uuid; v_hash text; v_receipt public.cost_command_receipts%rowtype; v_draft jsonb; v_prepared jsonb; v_detail_id uuid; v_prepare_input jsonb;
begin
  v_context:=private.c1_detail_context(target_company_id,'cost.manage');perform private.c1_detail_context(target_company_id,'cost.prepare');perform private.c1_detail_context(target_company_id,'cost.publish_import');v_tenant_id:=(v_context->>'tenantId')::uuid;v_actor_id:=(v_context->>'actorId')::uuid;
  if target_idempotency_key is null or coalesce(target_input->>'amount','') !~ '^\d{1,16}(\.\d{1,4})?$' or (target_input ? 'sourceFigureIds' and jsonb_typeof(target_input->'sourceFigureIds')<>'array') then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  v_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('projectId',target_input->>'projectId','input',target_input)),'UTF8'),'sha256'),'hex');v_receipt:=private.c1_detail_receipt(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.create_and_publish',target_idempotency_key,v_hash);if v_receipt.id is not null then return private.c1_detail_replay_ack(v_receipt.result_resource_id,v_receipt.result_version,'published');end if;
  v_draft:=private.c1_create_project_cost_detail_draft(target_company_id,target_input-'amount'-'quantity'-'unitCode'-'unitPrice'-'retentionKind'-'retentionRateBps'-'retentionAmount'-'sourceFigureIds',target_idempotency_key,target_request_id);v_detail_id:=(v_draft->>'id')::uuid;
  v_prepare_input:=jsonb_build_object('expectedVersion',(v_draft->>'version')::bigint,'amount',target_input->>'amount','quantity',target_input->'quantity','unitCode',target_input->'unitCode','unitPrice',target_input->'unitPrice','retentionKind',target_input->'retentionKind','retentionRateBps',target_input->'retentionRateBps','retentionAmount',target_input->'retentionAmount') || case when target_input ? 'sourceFigureIds' then jsonb_build_object('sourceFigureIds',target_input->'sourceFigureIds') else '{}'::jsonb end;
  v_prepared:=private.c1_prepare_project_cost_detail_financials(target_company_id,v_detail_id,v_prepare_input,target_request_id);
  perform private.c1_publish_project_cost_detail(target_company_id,v_detail_id,jsonb_build_object('expectedVersion',(v_prepared->>'version')::bigint),target_idempotency_key,target_request_id);update public.project_cost_item_details detail set version=0 where detail.id=v_detail_id;
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version) select v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.create_and_publish',target_idempotency_key,v_hash,detail.id,detail.version from public.project_cost_item_details detail where detail.id=v_detail_id;
  return private.c1_detail_ack(v_detail_id,false);
end;
$$;

create or replace function private.c1_correct_published_project_cost_detail(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_context jsonb; v_tenant_id uuid; v_actor_id uuid; v_detail public.project_cost_item_details%rowtype; v_before jsonb; v_before_sources jsonb; v_changes jsonb; v_hash text; v_receipt public.cost_command_receipts%rowtype; v_expected_version bigint;
begin
  v_context:=private.c1_detail_context(target_company_id,'cost.correct');v_tenant_id:=(v_context->>'tenantId')::uuid;v_actor_id:=(v_context->>'actorId')::uuid;if target_idempotency_key is null or coalesce(btrim(target_input->>'reason'),'')='' then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  v_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('detailId',target_id,'input',target_input)),'UTF8'),'sha256'),'hex');v_receipt:=private.c1_detail_receipt(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.correct',target_idempotency_key,v_hash);if v_receipt.id is not null then return private.c1_detail_replay_ack(v_receipt.result_resource_id,v_receipt.result_version,'published');end if;
  perform private.c1_detail_validate_correction_input(target_input);v_expected_version:=private.c1_detail_expected_version(target_input);v_detail:=private.c1_detail_require_scope(target_id,v_tenant_id,target_company_id);if v_detail.publication_state<>'published' then raise exception using errcode='P0001',message='COST_DETAIL_NOT_PUBLISHED';end if;if v_detail.version is distinct from v_expected_version then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;v_changes:=target_input->'changes';perform private.c1_detail_validate_correction_shape(v_detail,v_changes);
  v_before:=to_jsonb(v_detail);select coalesce(jsonb_agg(link.source_reported_figure_id order by link.source_reported_figure_id),'[]'::jsonb) into v_before_sources from public.project_cost_item_detail_sources link where link.project_cost_item_detail_id=v_detail.id and link.tenant_id=v_tenant_id and link.company_id=target_company_id;update public.project_cost_item_details detail set description=case when v_changes?'description' then btrim(v_changes->>'description') else detail.description end,relevant_date=case when v_changes?'relevantDate' then nullif(v_changes->>'relevantDate','')::date else detail.relevant_date end,reference=case when v_changes?'reference' then nullif(btrim(v_changes->>'reference'),'') else detail.reference end,note=case when v_changes?'note' then nullif(btrim(v_changes->>'note'),'') else detail.note end,quantity_text=case when v_changes?'quantity' then nullif(v_changes->>'quantity','') else detail.quantity_text end,unit_code=case when v_changes?'unitCode' then nullif(btrim(v_changes->>'unitCode'),'') else detail.unit_code end,unit_price_text=case when v_changes?'unitPrice' then nullif(v_changes->>'unitPrice','') else detail.unit_price_text end,amount_text=case when v_changes?'amount' then (v_changes->>'amount')::numeric::text else detail.amount_text end,retention_kind=case when v_changes?'retentionKind' then nullif(v_changes->>'retentionKind','') else detail.retention_kind end,retention_rate_bps=case when v_changes?'retentionRateBps' then nullif(v_changes->>'retentionRateBps','')::integer else detail.retention_rate_bps end,retention_amount_text=case when v_changes?'retentionAmount' then nullif(v_changes->>'retentionAmount','') else detail.retention_amount_text end,version=detail.version+1,updated_at=now() where detail.id=v_detail.id returning * into v_detail;
  perform private.c1_detail_replace_sources(v_detail,case when v_changes?'sourceFigureIds' then array(select jsonb_array_elements_text(v_changes->'sourceFigureIds')::uuid) else null end);perform private.c1_detail_validate_linked_sources(v_detail.id,v_tenant_id,target_company_id);perform private.c1_sync_project_cost_item_amount(v_detail.project_cost_item_id);insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,before_summary,after_summary) values(v_tenant_id,target_company_id,v_actor_id,'c1.project_cost_detail.corrected','project_cost_item_detail',v_detail.id::text,target_request_id,jsonb_build_object('detail',v_before,'sourceFigureIds',v_before_sources),jsonb_build_object('detail',to_jsonb(v_detail),'sourceFigureIds',(select coalesce(jsonb_agg(link.source_reported_figure_id order by link.source_reported_figure_id),'[]'::jsonb) from public.project_cost_item_detail_sources link where link.project_cost_item_detail_id=v_detail.id and link.tenant_id=v_tenant_id and link.company_id=target_company_id),'reason',btrim(target_input->>'reason'),'requestId',target_request_id,'idempotencyKey',target_idempotency_key));insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version) values(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.correct',target_idempotency_key,v_hash,v_detail.id,v_detail.version);return private.c1_detail_ack(v_detail.id,false);
end;
$$;

create or replace function private.c1_can_read_project_cost_detail_evidence_metadata(target_tenant_id uuid,target_company_id uuid,target_detail_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1
    from public.project_cost_item_details detail
    join public.company_cost_settings settings on settings.tenant_id=detail.tenant_id and settings.company_id=detail.company_id and settings.enabled
    where detail.id=target_detail_id and detail.tenant_id=target_tenant_id and detail.company_id=target_company_id
      and (
        (detail.publication_state = 'published' and private.has_company_permission(target_tenant_id,target_company_id,'cost.source.read'))
        or (
          detail.publication_state = 'draft'
          and private.has_company_permission(target_tenant_id,target_company_id,'cost.source.read')
          and private.has_company_permission(target_tenant_id,target_company_id,'cost.prepare')
        )
      )
  );
$$;

revoke all on function private.c1_detail_replay_ack(uuid,bigint,text),
  private.c1_create_project_cost_detail_draft(uuid,jsonb,uuid,uuid),
  private.c1_publish_project_cost_detail(uuid,uuid,jsonb,uuid,uuid),
  private.c1_create_and_publish_project_cost_detail(uuid,jsonb,uuid,uuid),
  private.c1_correct_published_project_cost_detail(uuid,uuid,jsonb,uuid,uuid),
  private.c1_can_read_project_cost_detail_evidence_metadata(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;

grant execute on function private.c1_can_read_project_cost_detail_evidence_metadata(uuid,uuid,uuid) to authenticated;
