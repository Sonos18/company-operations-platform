set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 24);

do $$
begin
  if to_regprocedure('private.c1_prepare_project_cost_detail_financials(uuid,uuid,jsonb,uuid)') is null
    or to_regprocedure('private.c1_publish_project_cost_detail(uuid,uuid,jsonb,uuid,uuid)') is null
    or to_regprocedure('private.c1_detail_replace_sources(public.project_cost_item_details,uuid[])') is null then
    raise exception using errcode = 'P0001', message = 'C1_DETAIL_SOURCE_AUDIT_SNAPSHOTS_BASELINE_MISSING';
  end if;
end;
$$;

create or replace function private.c1_prepare_project_cost_detail_financials(target_company_id uuid,target_id uuid,target_input jsonb,target_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_context jsonb;
  v_detail public.project_cost_item_details%rowtype;
  v_before jsonb;
  v_before_source_figure_ids jsonb;
  v_after_source_figure_ids jsonb;
  v_amount numeric;
  v_expected_version bigint;
begin
  v_context:=private.c1_detail_context(target_company_id,'cost.prepare');
  v_expected_version:=private.c1_detail_validate_prepare_financial_input(target_input);
  v_detail:=private.c1_detail_require_scope(target_id,(v_context->>'tenantId')::uuid,target_company_id);
  if v_detail.publication_state<>'draft' then raise exception using errcode='P0001',message='COST_DETAIL_NOT_DRAFT'; end if;
  if v_detail.version is distinct from v_expected_version then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
  perform private.c1_detail_validate_financial_input(target_input);

  select coalesce(jsonb_agg(link.source_reported_figure_id order by link.source_reported_figure_id),'[]'::jsonb)
  into v_before_source_figure_ids
  from public.project_cost_item_detail_sources link
  where link.project_cost_item_detail_id=v_detail.id
    and link.tenant_id=(v_context->>'tenantId')::uuid
    and link.company_id=target_company_id;
  v_before:=to_jsonb(v_detail) || jsonb_build_object('sourceFigureIds',v_before_source_figure_ids);
  v_amount:=(target_input->>'amount')::numeric;
  update public.project_cost_item_details detail
  set quantity_text=nullif(target_input->>'quantity',''),
      unit_code=nullif(btrim(target_input->>'unitCode'),''),
      unit_price_text=nullif(target_input->>'unitPrice',''),
      amount_text=v_amount::text,
      retention_kind=nullif(target_input->>'retentionKind',''),
      retention_rate_bps=nullif(target_input->>'retentionRateBps','')::integer,
      retention_amount_text=nullif(target_input->>'retentionAmount',''),
      version=detail.version+1,
      updated_at=now()
  where detail.id=v_detail.id
  returning * into v_detail;
  perform private.c1_detail_replace_sources(v_detail,case when target_input?'sourceFigureIds' then array(select jsonb_array_elements_text(target_input->'sourceFigureIds')::uuid) else null end);
  select coalesce(jsonb_agg(link.source_reported_figure_id order by link.source_reported_figure_id),'[]'::jsonb)
  into v_after_source_figure_ids
  from public.project_cost_item_detail_sources link
  where link.project_cost_item_detail_id=v_detail.id
    and link.tenant_id=(v_context->>'tenantId')::uuid
    and link.company_id=target_company_id;
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,before_summary,after_summary)
  values((v_context->>'tenantId')::uuid,target_company_id,(v_context->>'actorId')::uuid,'c1.project_cost_detail.prepared','project_cost_item_detail',v_detail.id::text,target_request_id,v_before,to_jsonb(v_detail) || jsonb_build_object('sourceFigureIds',v_after_source_figure_ids));
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
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_actor_id uuid;
  v_detail public.project_cost_item_details%rowtype;
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_expected_version bigint;
  v_readiness jsonb;
  v_source_figure_ids jsonb;
begin
  v_context:=private.c1_detail_context(target_company_id,'cost.publish_import');
  v_tenant_id:=(v_context->>'tenantId')::uuid;
  v_actor_id:=(v_context->>'actorId')::uuid;
  if target_idempotency_key is null then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  v_expected_version:=private.c1_detail_publish_expected_version(target_input);
  v_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('id',target_id,'expectedVersion',v_expected_version)),'UTF8'),'sha256'),'hex');
  v_receipt:=private.c1_detail_receipt(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.publish',target_idempotency_key,v_hash);
  if v_receipt.id is not null then return private.c1_detail_replay_ack(v_receipt.result_resource_id,v_receipt.result_version,'published'); end if;
  v_detail:=private.c1_detail_load_readiness_scope(target_id,v_tenant_id,target_company_id);
  if v_detail.publication_state='published' then raise exception using errcode='P0001',message='COST_DETAIL_ALREADY_PUBLISHED'; end if;
  if v_detail.version is distinct from v_expected_version then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
  v_readiness:=private.c1_project_cost_detail_publish_readiness(v_tenant_id,target_company_id,v_detail.id);
  if not (v_readiness->>'ready')::boolean then raise exception using errcode='P0001',message='COST_DETAIL_PUBLISH_NOT_READY',detail=(v_readiness->'blockingCodes')::text; end if;
  update public.project_cost_item_details detail
  set publication_state='published',
      publication_origin='command',
      published_by=v_actor_id,
      published_at=now(),
      publication_request_id=target_request_id,
      version=detail.version+1,
      updated_at=now()
  where detail.id=v_detail.id
  returning * into v_detail;
  perform private.c1_sync_project_cost_item_amount(v_detail.project_cost_item_id);
  select coalesce(jsonb_agg(link.source_reported_figure_id order by link.source_reported_figure_id),'[]'::jsonb)
  into v_source_figure_ids
  from public.project_cost_item_detail_sources link
  where link.project_cost_item_detail_id=v_detail.id
    and link.tenant_id=v_tenant_id
    and link.company_id=target_company_id;
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,before_summary,after_summary)
  values(v_tenant_id,target_company_id,v_actor_id,'c1.project_cost_detail.published','project_cost_item_detail',v_detail.id::text,target_request_id,null,to_jsonb(v_detail) || jsonb_build_object('sourceFigureIds',v_source_figure_ids));
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version)
  values(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.publish',target_idempotency_key,v_hash,v_detail.id,v_detail.version);
  return private.c1_detail_ack(v_detail.id,false);
end;
$$;

notify pgrst,'reload schema';
