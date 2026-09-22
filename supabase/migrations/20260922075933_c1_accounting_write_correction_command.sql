set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,6);

do $$ begin
  if to_regprocedure('private.c1_assert_project_cost_operational_scope(uuid,uuid,uuid,uuid,uuid,uuid,uuid)') is null or to_regclass('public.project_cost_item_details') is null then raise exception using errcode='P0001',message='C1_ACCOUNTING_CORRECTION_BASELINE_MISSING'; end if;
  if to_regprocedure('public.c1_correct_published_project_cost(uuid,uuid,jsonb,uuid,uuid)') is not null then raise exception using errcode='P0001',message='C1_ACCOUNTING_CORRECTION_ALREADY_EXISTS'; end if;
end $$;

create function private.c1_correct_published_project_cost(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare
  v_context jsonb; v_actor_id uuid:=auth.uid(); v_tenant_id uuid; v_item public.project_cost_items%rowtype; v_corrected public.project_cost_items%rowtype;
  v_request_hash text; v_receipt public.cost_command_receipts%rowtype; v_operational jsonb; v_financial jsonb; v_detail jsonb;
  v_category_id uuid; v_party_id uuid; v_engagement_id uuid; v_component_id uuid; v_relevant_date date; v_source_ids uuid[]:=array[]::uuid[]; v_total numeric(20,4);
  v_before_details jsonb; v_before_sources jsonb; v_after_details jsonb; v_after_sources jsonb;
begin
  if v_actor_id is null then raise exception using errcode='P0001',message='PERMISSION_DENIED'; end if;
  v_context:=private.c1_master_context(target_company_id, 'cost.correct'); v_tenant_id:=(v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id or target_idempotency_key is null or target_request_id is null or jsonb_typeof(target_input) is distinct from 'object'
    or not(target_input ?& array['expectedVersion','reason']) or not(target_input ?| array['operationalChanges','financialChanges'])
    or exists(select 1 from jsonb_object_keys(target_input) key where key not in('expectedVersion','reason','operationalChanges','financialChanges'))
    or jsonb_typeof(target_input->'expectedVersion') is distinct from 'number' or target_input->>'expectedVersion' !~ '^\d+$'
    or jsonb_typeof(target_input->'reason') is distinct from 'string' or btrim(target_input->>'reason')=''
    or (target_input ? 'operationalChanges' and jsonb_typeof(target_input->'operationalChanges') is distinct from 'object')
    or (target_input ? 'financialChanges' and jsonb_typeof(target_input->'financialChanges') is distinct from 'object')
  then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  v_operational:=target_input->'operationalChanges'; v_financial:=target_input->'financialChanges';
  if v_operational is not null and (v_operational='{}'::jsonb or exists(select 1 from jsonb_object_keys(v_operational) key where key not in('description','costCategoryId','businessReference','partyId','engagementId','componentId','relevantDate','workStatus'))) then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  if v_financial is not null and (not(v_financial ?& array['currencyCode','details','sourceFigureIds']) or exists(select 1 from jsonb_object_keys(v_financial) key where key not in('currencyCode','details','sourceFigureIds')) or jsonb_typeof(v_financial->'details') is distinct from 'array' or jsonb_array_length(v_financial->'details')=0 or jsonb_typeof(v_financial->'sourceFigureIds') is distinct from 'array') then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  v_request_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('companyId',target_company_id,'id',target_id,'input',target_input)),'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('c1_project_cost:correct:'||target_company_id::text||':'||v_actor_id::text||':'||target_idempotency_key::text,0));
  select receipt.* into v_receipt from public.cost_command_receipts receipt where receipt.company_id=target_company_id and receipt.actor_id=v_actor_id and receipt.command_name='project_cost.correct' and receipt.idempotency_key=target_idempotency_key for update;
  if found then
    if v_receipt.request_hash<>v_request_hash then raise exception using errcode='P0001',message='IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('id',v_receipt.result_resource_id,'version',v_receipt.result_version,'publicationState','published','replayed',true);
  end if;
  select item.* into v_item from public.project_cost_items item where item.id=target_id and item.tenant_id=v_tenant_id and item.company_id=target_company_id for update;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  if v_item.publication_state<>'published' then raise exception using errcode='P0001',message='COST_NOT_DRAFT'; end if;
  if v_item.version<>(target_input->>'expectedVersion')::bigint then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
  if exists(select 1 from public.cost_categories category where category.id=v_item.cost_category_id and category.tenant_id=v_tenant_id and category.company_id=target_company_id and category.code='subcontract_labor') and (v_financial is not null or v_operational ?| array['costCategoryId','partyId','engagementId','componentId']) then raise exception using errcode='P0001',message='SUBCONTRACT_COST_MODEL_UNSUPPORTED'; end if;

  begin
    v_category_id:=case when v_operational ? 'costCategoryId' then (v_operational->>'costCategoryId')::uuid else v_item.cost_category_id end;
    v_party_id:=case when v_operational ? 'partyId' then case when jsonb_typeof(v_operational->'partyId')='null' then null else (v_operational->>'partyId')::uuid end else v_item.party_id end;
    v_engagement_id:=case when v_operational ? 'engagementId' then case when jsonb_typeof(v_operational->'engagementId')='null' then null else (v_operational->>'engagementId')::uuid end else v_item.engagement_id end;
    v_component_id:=case when v_operational ? 'componentId' then case when jsonb_typeof(v_operational->'componentId')='null' then null else (v_operational->>'componentId')::uuid end else v_item.component_id end;
  exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID'; end;
  v_relevant_date:=case when v_operational ? 'relevantDate' then case when jsonb_typeof(v_operational->'relevantDate')='null' then null else private.c1_parse_project_cost_date(v_operational->>'relevantDate') end else v_item.relevant_date end;
  perform private.c1_assert_project_cost_operational_scope(v_tenant_id,target_company_id,v_item.project_id,v_category_id,v_party_id,v_engagement_id,v_component_id);
  select coalesce(jsonb_agg(to_jsonb(detail) order by detail.line_no,detail.id),'[]'::jsonb) into v_before_details from public.project_cost_item_details detail where detail.project_cost_item_id=v_item.id and detail.tenant_id=v_tenant_id and detail.company_id=target_company_id;
  select coalesce(jsonb_agg(link.source_reported_figure_id order by link.source_reported_figure_id),'[]'::jsonb) into v_before_sources from public.project_cost_item_sources link where link.project_cost_item_id=v_item.id and link.tenant_id=v_tenant_id and link.company_id=target_company_id;

  v_total:=v_item.amount;
  if v_financial is not null then
    if jsonb_typeof(v_financial->'currencyCode') is distinct from 'string' or v_financial->>'currencyCode'<>v_item.currency_code then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
    v_total:=0;
    for v_detail in select value from jsonb_array_elements(v_financial->'details') loop
      if jsonb_typeof(v_detail) is distinct from 'object' or not(v_detail ?& array['lineNo','detailKind','description','amount']) or exists(select 1 from jsonb_object_keys(v_detail) key where key not in('lineNo','detailKind','description','quantity','unitCode','unitPrice','amount','retentionKind','retentionRateBps','retentionAmount','relevantDate','reference','note')) or v_detail->>'lineNo' !~ '^\d+$' or (v_detail->>'lineNo')::int<1 or v_detail->>'detailKind' not in('opening_balance','line_item') or btrim(v_detail->>'description')='' or v_detail->>'amount' !~ '^\d{1,16}(\.\d{1,4})?$' then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
      v_total:=v_total+(v_detail->>'amount')::numeric;
    end loop;
    if (select count(*) from jsonb_array_elements(v_financial->'details'))<>(select count(distinct value->>'lineNo') from jsonb_array_elements(v_financial->'details')) then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
    begin select coalesce(array_agg(value::uuid order by value),array[]::uuid[]) into v_source_ids from jsonb_array_elements_text(v_financial->'sourceFigureIds') source(value); exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID'; end;
    if cardinality(v_source_ids)<>(select count(distinct value) from unnest(v_source_ids) source(value)) then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
    if cardinality(v_source_ids)>0 and (select count(*) from public.source_reported_figures figure where figure.id=any(v_source_ids) and figure.tenant_id=v_tenant_id and figure.company_id=target_company_id and figure.project_id=v_item.project_id and figure.status='shared')<>cardinality(v_source_ids) then raise exception using errcode='P0001',message='SOURCE_VERSION_NOT_SHARED'; end if;
    if exists(select 1 from public.source_reported_figures figure join public.source_review_issues issue on issue.source_selection_id=figure.source_selection_id and issue.tenant_id=figure.tenant_id and issue.company_id=figure.company_id where figure.id=any(v_source_ids) and issue.status='open' and issue.impact='blocks_normalization') then raise exception using errcode='P0001',message='SOURCE_REVIEW_REQUIRED'; end if;
    perform set_config('taskovia.c1_cost_write.snapshot','1',true);
    delete from public.project_cost_item_details where project_cost_item_id=v_item.id and tenant_id=v_tenant_id and company_id=target_company_id;
    insert into public.project_cost_item_details(tenant_id,company_id,project_cost_item_id,line_no,detail_kind,description,quantity_text,unit_code,unit_price_text,amount_text,retention_kind,retention_rate_bps,retention_amount_text,relevant_date,reference,note,created_by)
    select v_tenant_id,target_company_id,v_item.id,(detail.value->>'lineNo')::int,detail.value->>'detailKind',btrim(detail.value->>'description'),nullif(detail.value->>'quantity',''),nullif(detail.value->>'unitCode',''),nullif(detail.value->>'unitPrice',''),detail.value->>'amount',nullif(detail.value->>'retentionKind',''),nullif(detail.value->>'retentionRateBps','')::int,nullif(detail.value->>'retentionAmount',''),case when nullif(detail.value->>'relevantDate','') is null then null else private.c1_parse_project_cost_date(detail.value->>'relevantDate') end,nullif(btrim(detail.value->>'reference'),''),detail.value->>'note',v_actor_id from jsonb_array_elements(v_financial->'details') detail(value);
    delete from public.project_cost_item_sources where project_cost_item_id=v_item.id and tenant_id=v_tenant_id and company_id=target_company_id;
    insert into public.project_cost_item_sources(tenant_id,company_id,project_cost_item_id,source_reported_figure_id) select v_tenant_id,target_company_id,v_item.id,source_id from unnest(v_source_ids) source(source_id);
  end if;
  update public.project_cost_items item set description=case when v_operational ? 'description' then btrim(v_operational->>'description') else item.description end,cost_category_id=v_category_id,business_reference=case when v_operational ? 'businessReference' then case when jsonb_typeof(v_operational->'businessReference')='null' then null else btrim(v_operational->>'businessReference') end else item.business_reference end,party_id=v_party_id,engagement_id=v_engagement_id,component_id=v_component_id,relevant_date=v_relevant_date,work_status=case when v_operational ? 'workStatus' then v_operational->>'workStatus' else item.work_status end,amount=v_total,amount_text=v_total::text,version=item.version+1,updated_at=now() where item.id=v_item.id returning * into v_corrected;
  if v_financial is not null then set constraints c1_project_cost_item_details_sync immediate; perform set_config('taskovia.c1_cost_write.snapshot','0',true); set constraints c1_project_cost_item_details_sync deferred; end if;
  select coalesce(jsonb_agg(to_jsonb(detail) order by detail.line_no,detail.id),'[]'::jsonb) into v_after_details from public.project_cost_item_details detail where detail.project_cost_item_id=v_item.id and detail.tenant_id=v_tenant_id and detail.company_id=target_company_id;
  select coalesce(jsonb_agg(link.source_reported_figure_id order by link.source_reported_figure_id),'[]'::jsonb) into v_after_sources from public.project_cost_item_sources link where link.project_cost_item_id=v_item.id and link.tenant_id=v_tenant_id and link.company_id=target_company_id;
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,before_summary,after_summary) values(v_tenant_id,target_company_id,v_actor_id,'c1.project_cost_item.corrected','project_cost_item',v_item.id::text,target_request_id,jsonb_build_object('parent',to_jsonb(v_item),'details',v_before_details,'sourceFigureIds',v_before_sources),jsonb_build_object('parent',to_jsonb(v_corrected),'details',v_after_details,'sourceFigureIds',v_after_sources,'reason',btrim(target_input->>'reason'),'idempotencyKey',target_idempotency_key));
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version) values(v_tenant_id,target_company_id,v_actor_id,'project_cost.correct',target_idempotency_key,v_request_hash,v_corrected.id,v_corrected.version);
  return jsonb_build_object('id',v_corrected.id,'version',v_corrected.version,'publicationState',v_corrected.publication_state,'replayed',false);
end;
$$;

create function public.c1_correct_published_project_cost(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language sql volatile security definer set search_path='' as $$select private.c1_correct_published_project_cost(target_company_id,target_id,target_input,target_idempotency_key,target_request_id);$$;
revoke all on function private.c1_correct_published_project_cost(uuid, uuid, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.c1_correct_published_project_cost(uuid, uuid, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.c1_correct_published_project_cost(uuid, uuid, jsonb, uuid, uuid) to authenticated;
revoke all on function public.c1_correct_project_cost_item(uuid, uuid, jsonb, uuid) from public, anon, authenticated;

notify pgrst,'reload schema';
