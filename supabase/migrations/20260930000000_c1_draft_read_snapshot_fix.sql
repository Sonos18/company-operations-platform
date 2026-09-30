set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 23);

do $$
begin
  if to_regprocedure('private.c1_read_project_cost_detail_draft(uuid,uuid,boolean)') is null
    or to_regprocedure('private.c1_detail_context(uuid,text)') is null
    or to_regprocedure('private.c1_project_cost_detail_publish_readiness(uuid,uuid,uuid)') is null then
    raise exception using errcode = 'P0001', message = 'C1_DRAFT_READ_SNAPSHOT_BASELINE_MISSING';
  end if;
end;
$$;

create or replace function private.c1_read_project_cost_detail_draft(target_company_id uuid,target_id uuid,target_operational boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb; v_detail public.project_cost_item_details%rowtype; v_project_id uuid; v_category_id uuid; v_sources jsonb;
begin
  v_context:=private.c1_detail_context(target_company_id,case when target_operational then 'cost.manage' else 'cost.prepare' end);
  select detail.* into v_detail
  from public.project_cost_item_details detail
  join public.project_cost_items item on item.id=detail.project_cost_item_id and item.tenant_id=detail.tenant_id and item.company_id=detail.company_id
  join public.cost_categories category on category.id=item.cost_category_id and category.tenant_id=item.tenant_id and category.company_id=item.company_id
  where detail.id=target_id and detail.tenant_id=(v_context->>'tenantId')::uuid and detail.company_id=target_company_id and item.publication_state='published';
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  if v_detail.publication_state<>'draft' then raise exception using errcode='P0001',message='COST_DETAIL_NOT_DRAFT';end if;
  select item.project_id,item.cost_category_id into v_project_id,v_category_id from public.project_cost_items item where item.id=v_detail.project_cost_item_id;
  if target_operational then return jsonb_build_object('id',v_detail.id,'projectCostItemId',v_detail.project_cost_item_id,'projectId',v_project_id,'categoryId',v_category_id,'lineNo',v_detail.line_no,'description',v_detail.description,'relevantDate',v_detail.relevant_date,'reference',v_detail.reference,'note',v_detail.note,'publicationState','draft','version',v_detail.version,'createdAt',v_detail.created_at,'updatedAt',v_detail.updated_at);end if;
  select coalesce(jsonb_agg(link.source_reported_figure_id order by link.source_reported_figure_id),'[]'::jsonb) into v_sources from public.project_cost_item_detail_sources link where link.project_cost_item_detail_id=v_detail.id;
  return jsonb_build_object('id',v_detail.id,'projectCostItemId',v_detail.project_cost_item_id,'projectId',v_project_id,'categoryId',v_category_id,'lineNo',v_detail.line_no,'description',v_detail.description,'relevantDate',v_detail.relevant_date,'reference',v_detail.reference,'note',v_detail.note,'quantity',v_detail.quantity_text,'unitCode',v_detail.unit_code,'unitPrice',v_detail.unit_price_text,'amount',v_detail.amount_text,'retentionKind',v_detail.retention_kind,'retentionRateBps',v_detail.retention_rate_bps,'retentionAmount',v_detail.retention_amount_text,'sourceFigureIds',v_sources,'publicationState','draft','version',v_detail.version,'publishReadiness',private.c1_project_cost_detail_publish_readiness(v_detail.tenant_id,v_detail.company_id,v_detail.id),'createdAt',v_detail.created_at,'updatedAt',v_detail.updated_at);
end;
$$;
