set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 22);

create function private.c1_lock_project_cost_category(target_tenant_id uuid, target_company_id uuid, target_project_id uuid, target_category_id uuid)
returns void language sql volatile security definer set search_path='' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'c1_project_cost_category:' || target_tenant_id::text || ':' || target_company_id::text || ':' || target_project_id::text || ':' || target_category_id::text, 0
  ));
$$;

create function private.c1_project_cost_item_has_managed_detail_state(target_tenant_id uuid, target_company_id uuid, target_item_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.project_cost_item_details detail join public.cost_command_receipts receipt on receipt.result_resource_id=detail.id and receipt.command_name like 'project_cost_detail.%' where detail.project_cost_item_id=target_item_id and detail.tenant_id=target_tenant_id and detail.company_id=target_company_id)
    or exists (select 1 from public.audit_events audit join public.project_cost_item_details detail on audit.resource_id=detail.id::text where audit.resource_type='project_cost_item_detail' and audit.action like 'c1.project_cost_detail.%' and detail.project_cost_item_id=target_item_id and detail.tenant_id=target_tenant_id and detail.company_id=target_company_id)
    or exists (select 1 from public.project_cost_item_details detail join public.project_cost_item_detail_sources link on link.project_cost_item_detail_id=detail.id and link.tenant_id=detail.tenant_id and link.company_id=detail.company_id where detail.project_cost_item_id=target_item_id and detail.tenant_id=target_tenant_id and detail.company_id=target_company_id)
    or exists (select 1 from public.project_cost_item_details detail join public.cost_evidence_links link on link.project_cost_item_detail_id=detail.id and link.tenant_id=detail.tenant_id and link.company_id=detail.company_id where detail.project_cost_item_id=target_item_id and detail.tenant_id=target_tenant_id and detail.company_id=target_company_id);
$$;

create function private.c1_guard_project_cost_parent_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_existing uuid;
begin
  if tg_op='UPDATE' and (old.tenant_id,old.company_id,old.project_id,old.cost_category_id) is not distinct from (new.tenant_id,new.company_id,new.project_id,new.cost_category_id) then return new; end if;
  perform private.c1_lock_project_cost_category(new.tenant_id,new.company_id,new.project_id,new.cost_category_id);
  if tg_op='UPDATE' then
    if old.cost_category_id is distinct from new.cost_category_id and private.c1_project_cost_item_has_managed_detail_state(old.tenant_id,old.company_id,old.id) then raise exception using errcode='P0001',message='HISTORY_IMMUTABLE'; end if;
    select item.id into v_existing from public.project_cost_items item where item.tenant_id=new.tenant_id and item.company_id=new.company_id and item.project_id=new.project_id and item.cost_category_id=new.cost_category_id and item.id<>old.id limit 1;
    if found then raise exception using errcode='P0001',message='PROJECT_COST_CATEGORY_CONFLICT'; end if;
  elsif tg_op='INSERT' then
    select item.id into v_existing from public.project_cost_items item where item.tenant_id=new.tenant_id and item.company_id=new.company_id and item.project_id=new.project_id and item.cost_category_id=new.cost_category_id limit 1;
    if found then raise exception using errcode='P0001',message='PROJECT_COST_CATEGORY_CONFLICT'; end if;
  end if;
  return new;
end;
$$;

create function private.c1_guard_project_cost_detail_snapshot_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if private.c1_project_cost_item_has_managed_detail_state(old.tenant_id,old.company_id,old.project_cost_item_id) then raise exception using errcode='P0001',message='HISTORY_IMMUTABLE'; end if;
  return old;
end;
$$;

drop trigger if exists c1_project_cost_parent_identity_guard on public.project_cost_items;
create trigger c1_project_cost_parent_identity_guard before insert or update of tenant_id, company_id, project_id, cost_category_id on public.project_cost_items for each row execute function private.c1_guard_project_cost_parent_identity();
drop trigger if exists c1_project_cost_detail_snapshot_guard on public.project_cost_item_details;
create trigger c1_project_cost_detail_snapshot_guard before delete on public.project_cost_item_details for each row execute function private.c1_guard_project_cost_detail_snapshot_delete();

create or replace function private.c1_assert_project_cost_operational_scope(target_tenant_id uuid,target_company_id uuid,target_project_id uuid,target_cost_category_id uuid,target_party_id uuid,target_engagement_id uuid,target_component_id uuid)
returns void language plpgsql stable security definer set search_path='' as $$
declare v_strategy text;
begin
  if not exists(select 1 from public.projects project where project.id=target_project_id and project.tenant_id=target_tenant_id and project.company_id=target_company_id) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  select category.posting_strategy into v_strategy from public.cost_categories category where category.id=target_cost_category_id and category.tenant_id=target_tenant_id and category.company_id=target_company_id and category.is_active;
  if v_strategy is null then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  if v_strategy='subcontract_payment' then raise exception using errcode='P0001',message='SUBCONTRACT_COST_MODEL_UNSUPPORTED'; end if;
  if target_party_id is not null and not exists(select 1 from public.business_parties party where party.id=target_party_id and party.tenant_id=target_tenant_id and party.company_id=target_company_id) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  if target_engagement_id is not null and not exists(select 1 from public.project_engagements engagement where engagement.id=target_engagement_id and engagement.tenant_id=target_tenant_id and engagement.company_id=target_company_id and engagement.project_id=target_project_id and (target_party_id is null or engagement.party_id=target_party_id)) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  if target_component_id is not null and (target_engagement_id is null or not exists(select 1 from public.engagement_components component where component.id=target_component_id and component.tenant_id=target_tenant_id and component.company_id=target_company_id and component.engagement_id=target_engagement_id)) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
end;
$$;

create function private.c1_detail_load_readiness_scope(target_detail_id uuid,target_tenant_id uuid,target_company_id uuid)
returns public.project_cost_item_details language plpgsql security definer set search_path='' as $$
declare v_detail public.project_cost_item_details%rowtype;
begin
  select detail.* into v_detail from public.project_cost_item_details detail
  join public.project_cost_items item on item.id=detail.project_cost_item_id and item.tenant_id=detail.tenant_id and item.company_id=detail.company_id
  join public.cost_categories category on category.id=item.cost_category_id and category.tenant_id=item.tenant_id and category.company_id=item.company_id
  where detail.id=target_detail_id and detail.tenant_id=target_tenant_id and detail.company_id=target_company_id and item.publication_state='published'
  for update of detail;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  return v_detail;
end;
$$;

create or replace function private.c1_project_cost_publish_readiness(target_tenant_id uuid,target_company_id uuid,target_project_cost_item_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_item public.project_cost_items%rowtype; v_codes text[]:=array[]::text[];
begin
  select item.* into v_item from public.project_cost_items item where item.id=target_project_cost_item_id and item.tenant_id=target_tenant_id and item.company_id=target_company_id;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  if v_item.publication_state<>'draft' then raise exception using errcode='P0001',message='COST_NOT_DRAFT'; end if;
  if v_item.amount is null or not exists(select 1 from public.project_cost_item_details detail where detail.project_cost_item_id=v_item.id and detail.tenant_id=target_tenant_id and detail.company_id=target_company_id) then v_codes:=array_append(v_codes,'FINANCIAL_DETAILS_REQUIRED'); end if;
  if exists(select 1 from public.project_cost_item_sources link left join public.source_reported_figures figure on figure.id=link.source_reported_figure_id and figure.tenant_id=link.tenant_id and figure.company_id=link.company_id where link.project_cost_item_id=v_item.id and link.tenant_id=target_tenant_id and link.company_id=target_company_id and (figure.id is null or figure.project_id is distinct from v_item.project_id or figure.status<>'shared')) then v_codes:=array_append(v_codes,'SOURCE_NOT_SHARED'); end if;
  if exists(select 1 from public.project_cost_item_sources link join public.source_reported_figures figure on figure.id=link.source_reported_figure_id and figure.tenant_id=link.tenant_id and figure.company_id=link.company_id join public.source_review_issues issue on issue.source_selection_id=figure.source_selection_id and issue.tenant_id=figure.tenant_id and issue.company_id=figure.company_id where link.project_cost_item_id=v_item.id and link.tenant_id=target_tenant_id and link.company_id=target_company_id and issue.status='open' and issue.impact='blocks_normalization') then v_codes:=array_append(v_codes,'SOURCE_REVIEW_BLOCKING'); end if;
  if exists(select 1 from public.cost_evidence_links link left join public.cost_evidence_files file on file.id=link.evidence_file_id and file.tenant_id=link.tenant_id and file.company_id=link.company_id where link.project_cost_item_id=v_item.id and link.tenant_id=target_tenant_id and link.company_id=target_company_id and (file.id is null or file.project_id is distinct from v_item.project_id or file.status<>'finalized')) then v_codes:=array_append(v_codes,'EVIDENCE_NOT_FINALIZED'); end if;
  if exists(select 1 from public.cost_categories category where category.id=v_item.cost_category_id and category.tenant_id=target_tenant_id and category.company_id=target_company_id and category.posting_strategy='subcontract_payment') then v_codes:=array_append(v_codes,'SUBCONTRACT_COST_MODEL_UNSUPPORTED'); end if;
  return jsonb_build_object('ready',cardinality(v_codes)=0,'blockingCodes',to_jsonb(v_codes));
end;
$$;

create function private.c1_project_cost_detail_publish_readiness(target_tenant_id uuid,target_company_id uuid,target_detail_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_detail public.project_cost_item_details%rowtype; v_codes text[]:=array[]::text[];
begin
  select detail.* into v_detail from public.project_cost_item_details detail where detail.id=target_detail_id and detail.tenant_id=target_tenant_id and detail.company_id=target_company_id;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  if v_detail.amount_text is null then v_codes:=array_append(v_codes,'FINANCIAL_DETAILS_REQUIRED'); end if;
  if exists(select 1 from public.project_cost_item_detail_sources link join public.project_cost_items item on item.id=v_detail.project_cost_item_id and item.tenant_id=v_detail.tenant_id and item.company_id=v_detail.company_id left join public.source_reported_figures figure on figure.id=link.source_reported_figure_id and figure.tenant_id=link.tenant_id and figure.company_id=link.company_id where link.project_cost_item_detail_id=v_detail.id and link.tenant_id=target_tenant_id and link.company_id=target_company_id and (figure.id is null or figure.project_id is distinct from item.project_id or figure.status<>'shared')) then v_codes:=array_append(v_codes,'SOURCE_NOT_SHARED'); end if;
  if exists(select 1 from public.project_cost_item_detail_sources link join public.source_reported_figures figure on figure.id=link.source_reported_figure_id and figure.tenant_id=link.tenant_id and figure.company_id=link.company_id join public.source_review_issues issue on issue.source_selection_id=figure.source_selection_id and issue.tenant_id=figure.tenant_id and issue.company_id=figure.company_id where link.project_cost_item_detail_id=v_detail.id and link.tenant_id=target_tenant_id and link.company_id=target_company_id and issue.status='open' and issue.impact='blocks_normalization') then v_codes:=array_append(v_codes,'SOURCE_REVIEW_BLOCKING'); end if;
  if exists(select 1 from public.cost_evidence_links link left join public.cost_evidence_files file on file.id=link.evidence_file_id and file.tenant_id=link.tenant_id and file.company_id=link.company_id join public.project_cost_items item on item.id=v_detail.project_cost_item_id and item.tenant_id=v_detail.tenant_id and item.company_id=v_detail.company_id where link.project_cost_item_detail_id=v_detail.id and link.tenant_id=target_tenant_id and link.company_id=target_company_id and (file.id is null or file.project_id is distinct from item.project_id or file.status<>'finalized')) then v_codes:=array_append(v_codes,'EVIDENCE_NOT_FINALIZED'); end if;
  if exists(select 1 from public.project_cost_items item join public.cost_categories category on category.id=item.cost_category_id and category.tenant_id=item.tenant_id and category.company_id=item.company_id where item.id=v_detail.project_cost_item_id and item.tenant_id=target_tenant_id and item.company_id=target_company_id and category.posting_strategy<>'ordinary_detail') then v_codes:=array_append(v_codes,'SUBCONTRACT_COST_MODEL_UNSUPPORTED'); end if;
  return jsonb_build_object('ready',cardinality(v_codes)=0,'blockingCodes',to_jsonb(v_codes));
end;
$$;

create or replace function private.c1_detail_validate_linked_sources(target_detail_id uuid,target_tenant_id uuid,target_company_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_readiness jsonb;
begin
  v_readiness:=private.c1_project_cost_detail_publish_readiness(target_tenant_id,target_company_id,target_detail_id);
  if not (v_readiness->>'ready')::boolean then raise exception using errcode='P0001',message='COST_DETAIL_PUBLISH_NOT_READY',detail=(v_readiness->'blockingCodes')::text; end if;
end;
$$;

create or replace function private.c1_read_project_cost_detail_draft(target_company_id uuid,target_id uuid,target_operational boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_context jsonb; v_detail public.project_cost_item_details%rowtype; v_project_id uuid; v_category_id uuid; v_sources jsonb;
begin
  v_context:=private.c1_detail_context(target_company_id,case when target_operational then 'cost.manage' else 'cost.prepare' end);v_detail:=private.c1_detail_load_readiness_scope(target_id,(v_context->>'tenantId')::uuid,target_company_id);
  if v_detail.publication_state<>'draft' then raise exception using errcode='P0001',message='COST_DETAIL_NOT_DRAFT';end if;
  select item.project_id,item.cost_category_id into v_project_id,v_category_id from public.project_cost_items item where item.id=v_detail.project_cost_item_id;
  if target_operational then return jsonb_build_object('id',v_detail.id,'projectCostItemId',v_detail.project_cost_item_id,'projectId',v_project_id,'categoryId',v_category_id,'lineNo',v_detail.line_no,'description',v_detail.description,'relevantDate',v_detail.relevant_date,'reference',v_detail.reference,'note',v_detail.note,'publicationState','draft','version',v_detail.version,'createdAt',v_detail.created_at,'updatedAt',v_detail.updated_at);end if;
  select coalesce(jsonb_agg(link.source_reported_figure_id order by link.source_reported_figure_id),'[]'::jsonb) into v_sources from public.project_cost_item_detail_sources link where link.project_cost_item_detail_id=v_detail.id;
  return jsonb_build_object('id',v_detail.id,'projectCostItemId',v_detail.project_cost_item_id,'projectId',v_project_id,'categoryId',v_category_id,'lineNo',v_detail.line_no,'description',v_detail.description,'relevantDate',v_detail.relevant_date,'reference',v_detail.reference,'note',v_detail.note,'quantity',v_detail.quantity_text,'unitCode',v_detail.unit_code,'unitPrice',v_detail.unit_price_text,'amount',v_detail.amount_text,'retentionKind',v_detail.retention_kind,'retentionRateBps',v_detail.retention_rate_bps,'retentionAmount',v_detail.retention_amount_text,'sourceFigureIds',v_sources,'publicationState','draft','version',v_detail.version,'publishReadiness',private.c1_project_cost_detail_publish_readiness(v_detail.tenant_id,v_detail.company_id,v_detail.id),'createdAt',v_detail.created_at,'updatedAt',v_detail.updated_at);
end;
$$;

create or replace function private.c1_resolve_or_create_ordinary_project_cost_item(target_tenant_id uuid,target_company_id uuid,target_project_id uuid,target_cost_category_id uuid,target_actor_id uuid,target_request_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare v_context jsonb; v_category public.cost_categories%rowtype; v_item public.project_cost_items%rowtype; v_currency text;
begin
  if target_actor_id is null or target_request_id is null or auth.uid() is distinct from target_actor_id then raise exception using errcode='P0001',message='PERMISSION_DENIED'; end if;
  v_context:=private.c1_master_context(target_company_id,'cost.manage');
  if (v_context->>'tenantId')::uuid is distinct from target_tenant_id or (v_context->>'actorId')::uuid is distinct from target_actor_id then raise exception using errcode='P0001',message='PERMISSION_DENIED'; end if;
  perform private.c1_assert_project_cost_operational_scope(target_tenant_id,target_company_id,target_project_id,target_cost_category_id,null,null,null);
  select category.* into v_category from public.cost_categories category where category.id=target_cost_category_id and category.tenant_id=target_tenant_id and category.company_id=target_company_id and category.is_active;
  perform private.c1_lock_project_cost_category(target_tenant_id,target_company_id,target_project_id,target_cost_category_id);
  select item.* into v_item from public.project_cost_items item where item.tenant_id=target_tenant_id and item.company_id=target_company_id and item.project_id=target_project_id and item.cost_category_id=target_cost_category_id for update;
  if found then
    if v_item.publication_state<>'published' then raise exception using errcode='P0001',message='PROJECT_COST_CATEGORY_CONFLICT'; end if;
    return v_item.id;
  end if;
  select settings.default_currency_code into v_currency from public.company_cost_settings settings where settings.tenant_id=target_tenant_id and settings.company_id=target_company_id and settings.enabled;
  if v_currency is null then raise exception using errcode='P0001',message='MODULE_DISABLED'; end if;
  insert into public.project_cost_items(tenant_id,company_id,project_id,cost_category_id,description,amount,amount_text,currency_code,work_status,publication_state,publication_origin,published_by,published_at,publication_request_id,created_by)
  values(target_tenant_id,target_company_id,target_project_id,target_cost_category_id,'C1 ordinary cost aggregate — '||v_category.code,0,'0.0000',v_currency,'unknown','published','command',target_actor_id,now(),target_request_id,target_actor_id) returning * into v_item;
  return v_item.id;
end;
$$;

create function private.c1_detail_validate_financial_input(target_input jsonb)
returns void language plpgsql immutable security definer set search_path='' as $$
declare v_amount numeric; v_retention_kind text; v_retention_rate_bps integer; v_retention_amount numeric;
begin
  if jsonb_typeof(target_input) is distinct from 'object'
    or jsonb_typeof(target_input->'amount')<>'string'
    or (target_input ? 'quantity' and jsonb_typeof(target_input->'quantity')<>'null' and (jsonb_typeof(target_input->'quantity')<>'string' or target_input->>'quantity' !~ '^\d{1,16}(\.\d{1,4})?$'))
    or (target_input ? 'unitCode' and jsonb_typeof(target_input->'unitCode')<>'null' and (jsonb_typeof(target_input->'unitCode')<>'string' or coalesce(btrim(target_input->>'unitCode'),'')=''))
    or (target_input ? 'unitPrice' and jsonb_typeof(target_input->'unitPrice')<>'null' and (jsonb_typeof(target_input->'unitPrice')<>'string' or target_input->>'unitPrice' !~ '^\d{1,16}(\.\d{1,4})?$'))
    or (target_input ? 'retentionKind' and jsonb_typeof(target_input->'retentionKind')<>'null' and (jsonb_typeof(target_input->'retentionKind')<>'string' or target_input->>'retentionKind' not in ('warranty','other')))
    or (target_input ? 'retentionRateBps' and jsonb_typeof(target_input->'retentionRateBps')<>'null' and (jsonb_typeof(target_input->'retentionRateBps')<>'number' or target_input->>'retentionRateBps' !~ '^\d{1,5}$' or lpad(target_input->>'retentionRateBps',5,'0')>'10000'))
    or (target_input ? 'retentionAmount' and jsonb_typeof(target_input->'retentionAmount')<>'null' and (jsonb_typeof(target_input->'retentionAmount')<>'string' or target_input->>'retentionAmount' !~ '^\d{1,16}(\.\d{1,4})?$'))
  then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  if target_input->>'amount' !~ '^\d{1,16}(\.\d{1,4})?$' then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  if target_input ? 'sourceFigureIds' then
    if jsonb_typeof(target_input->'sourceFigureIds')<>'array' then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
    if exists(select 1 from jsonb_array_elements(target_input->'sourceFigureIds') source_id where jsonb_typeof(source_id)<>'string' or source_id#>>'{}' !~* '^(00000000-0000-0000-0000-000000000000|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$')
      or (select count(*) from jsonb_array_elements_text(target_input->'sourceFigureIds'))<>(select count(distinct source_id) from jsonb_array_elements_text(target_input->'sourceFigureIds') source_id)
    then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  end if;
  v_amount:=(target_input->>'amount')::numeric;
  v_retention_kind:=nullif(target_input->>'retentionKind','');
  v_retention_rate_bps:=nullif(target_input->>'retentionRateBps','')::integer;
  v_retention_amount:=nullif(target_input->>'retentionAmount','')::numeric;
  if (v_retention_kind is null and (v_retention_rate_bps is not null or v_retention_amount is not null)) or (v_retention_kind is not null and v_retention_amount is null) or v_retention_amount>v_amount then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
end;
$$;

create function private.c1_detail_validate_prepare_financial_input(target_input jsonb)
returns bigint language plpgsql immutable security definer set search_path='' as $$
begin
  if jsonb_typeof(target_input) is distinct from 'object' then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  if not (target_input ? 'expectedVersion')
    or not (target_input ? 'amount')
    or exists(select 1 from jsonb_object_keys(target_input) key where key not in ('expectedVersion','amount','quantity','unitCode','unitPrice','retentionKind','retentionRateBps','retentionAmount','sourceFigureIds'))
  then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  return private.c1_detail_expected_version(target_input);
end;
$$;

create function private.c1_detail_validate_direct_create_input(target_input jsonb)
returns void language plpgsql immutable security definer set search_path='' as $$
begin
  if jsonb_typeof(target_input) is distinct from 'object' then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  if not (target_input ? 'projectId')
    or not (target_input ? 'categoryId')
    or not (target_input ? 'description')
    or not (target_input ? 'amount')
    or exists(select 1 from jsonb_object_keys(target_input) key where key not in ('projectId','categoryId','description','amount','quantity','unitCode','unitPrice','retentionKind','retentionRateBps','retentionAmount','relevantDate','reference','note','sourceFigureIds'))
    or jsonb_typeof(target_input->'projectId')<>'string'
    or jsonb_typeof(target_input->'categoryId')<>'string'
    or jsonb_typeof(target_input->'description')<>'string'
    or target_input->>'projectId' !~* '^(00000000-0000-0000-0000-000000000000|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$'
    or target_input->>'categoryId' !~* '^(00000000-0000-0000-0000-000000000000|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$'
    or coalesce(btrim(target_input->>'description'),'')=''
    or (target_input ? 'reference' and (jsonb_typeof(target_input->'reference')<>'string' or coalesce(btrim(target_input->>'reference'),'')=''))
    or (target_input ? 'note' and (jsonb_typeof(target_input->'note')<>'string' or coalesce(btrim(target_input->>'note'),'')=''))
    or (target_input ? 'relevantDate' and (jsonb_typeof(target_input->'relevantDate')<>'string' or coalesce(btrim(target_input->>'relevantDate'),'')=''))
  then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  if target_input ? 'relevantDate' then perform private.c1_parse_project_cost_date(target_input->>'relevantDate'); end if;
end;
$$;

create or replace function private.c1_prepare_project_cost_detail_financials(target_company_id uuid,target_id uuid,target_input jsonb,target_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_context jsonb; v_detail public.project_cost_item_details%rowtype; v_before jsonb; v_amount numeric; v_expected_version bigint;
begin
  v_context:=private.c1_detail_context(target_company_id,'cost.prepare');v_expected_version:=private.c1_detail_validate_prepare_financial_input(target_input);v_detail:=private.c1_detail_require_scope(target_id,(v_context->>'tenantId')::uuid,target_company_id);
  if v_detail.publication_state<>'draft' then raise exception using errcode='P0001',message='COST_DETAIL_NOT_DRAFT'; end if;
  if v_detail.version is distinct from v_expected_version then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
  perform private.c1_detail_validate_financial_input(target_input);
  v_before:=to_jsonb(v_detail);v_amount:=(target_input->>'amount')::numeric;
  update public.project_cost_item_details detail set quantity_text=nullif(target_input->>'quantity',''),unit_code=nullif(btrim(target_input->>'unitCode'),''),unit_price_text=nullif(target_input->>'unitPrice',''),amount_text=v_amount::text,retention_kind=nullif(target_input->>'retentionKind',''),retention_rate_bps=nullif(target_input->>'retentionRateBps','')::integer,retention_amount_text=nullif(target_input->>'retentionAmount',''),version=detail.version+1,updated_at=now() where detail.id=v_detail.id returning * into v_detail;
  perform private.c1_detail_replace_sources(v_detail,case when target_input?'sourceFigureIds' then array(select jsonb_array_elements_text(target_input->'sourceFigureIds')::uuid) else null end);
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,before_summary,after_summary) values((v_context->>'tenantId')::uuid,target_company_id,(v_context->>'actorId')::uuid,'c1.project_cost_detail.prepared','project_cost_item_detail',v_detail.id::text,target_request_id,v_before,to_jsonb(v_detail));
  return private.c1_detail_ack(v_detail.id,false);
end;
$$;

create or replace function private.c1_create_and_publish_project_cost_detail(
  target_company_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_actor_id uuid;
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_parent_id uuid;
  v_detail public.project_cost_item_details%rowtype;
  v_line_no integer;
  v_amount numeric;
  v_retention_kind text;
  v_retention_rate_bps integer;
  v_readiness jsonb;
begin
  v_context:=private.c1_detail_context(target_company_id,'cost.manage');
  perform private.c1_detail_context(target_company_id,'cost.prepare');
  perform private.c1_detail_context(target_company_id,'cost.publish_import');
  v_tenant_id:=(v_context->>'tenantId')::uuid;
  v_actor_id:=(v_context->>'actorId')::uuid;

  if target_idempotency_key is null or coalesce(target_input->>'amount','') !~ '^\d{1,16}(\.\d{1,4})?$' or (target_input ? 'sourceFigureIds' and jsonb_typeof(target_input->'sourceFigureIds')<>'array') then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  v_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('projectId',target_input->>'projectId','input',target_input)),'UTF8'),'sha256'),'hex');
  v_receipt:=private.c1_detail_receipt(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.create_and_publish',target_idempotency_key,v_hash);
  if v_receipt.id is not null then return private.c1_detail_replay_ack(v_receipt.result_resource_id,v_receipt.result_version,'published'); end if;
  perform private.c1_detail_validate_direct_create_input(target_input);
  perform private.c1_detail_validate_financial_input(target_input);
  v_amount:=(target_input->>'amount')::numeric;
  v_retention_kind:=nullif(target_input->>'retentionKind','');
  v_retention_rate_bps:=nullif(target_input->>'retentionRateBps','')::integer;

  v_parent_id:=private.c1_resolve_or_create_ordinary_project_cost_item(v_tenant_id,target_company_id,(target_input->>'projectId')::uuid,(target_input->>'categoryId')::uuid,v_actor_id,target_request_id);
  perform 1 from public.project_cost_items item where item.id=v_parent_id for update;
  select coalesce(max(detail.line_no),0)+1 into v_line_no from public.project_cost_item_details detail where detail.project_cost_item_id=v_parent_id and detail.tenant_id=v_tenant_id and detail.company_id=target_company_id;
  insert into public.project_cost_item_details(tenant_id,company_id,project_cost_item_id,line_no,detail_kind,description,quantity_text,unit_code,unit_price_text,amount_text,retention_kind,retention_rate_bps,retention_amount_text,relevant_date,reference,note,publication_state,publication_origin,published_by,published_at,publication_request_id,created_by)
  values(v_tenant_id,target_company_id,v_parent_id,v_line_no,'line_item',btrim(target_input->>'description'),nullif(target_input->>'quantity',''),nullif(btrim(target_input->>'unitCode'),''),nullif(target_input->>'unitPrice',''),v_amount::text,v_retention_kind,v_retention_rate_bps,nullif(target_input->>'retentionAmount',''),nullif(target_input->>'relevantDate','')::date,nullif(btrim(target_input->>'reference'),''),nullif(btrim(target_input->>'note'),''),'published','command',v_actor_id,now(),target_request_id,v_actor_id)
  returning * into v_detail;
  perform private.c1_detail_replace_sources(v_detail,case when target_input ? 'sourceFigureIds' then array(select jsonb_array_elements_text(target_input->'sourceFigureIds')::uuid) else null end);
  v_readiness:=private.c1_project_cost_detail_publish_readiness(v_tenant_id,target_company_id,v_detail.id);
  if not (v_readiness->>'ready')::boolean then raise exception using errcode='P0001',message='COST_DETAIL_PUBLISH_NOT_READY',detail=(v_readiness->'blockingCodes')::text; end if;
  perform private.c1_sync_project_cost_item_amount(v_detail.project_cost_item_id);
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,after_summary)
  values(v_tenant_id,target_company_id,v_actor_id,'c1.project_cost_detail.created_and_published','project_cost_item_detail',v_detail.id::text,target_request_id,jsonb_build_object('detail',to_jsonb(v_detail),'sourceFigureIds',(select coalesce(jsonb_agg(link.source_reported_figure_id order by link.source_reported_figure_id),'[]'::jsonb) from public.project_cost_item_detail_sources link where link.project_cost_item_detail_id=v_detail.id and link.tenant_id=v_tenant_id and link.company_id=target_company_id),'requestId',target_request_id,'idempotencyKey',target_idempotency_key));
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version)
  values(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.create_and_publish',target_idempotency_key,v_hash,v_detail.id,v_detail.version);
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
  update public.project_cost_item_details detail set publication_state='published',publication_origin='command',published_by=v_actor_id,published_at=now(),publication_request_id=target_request_id,version=detail.version+1,updated_at=now() where detail.id=v_detail.id returning * into v_detail;
  perform private.c1_sync_project_cost_item_amount(v_detail.project_cost_item_id);
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,before_summary,after_summary) values(v_tenant_id,target_company_id,v_actor_id,'c1.project_cost_detail.published','project_cost_item_detail',v_detail.id::text,target_request_id,null,to_jsonb(v_detail));
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version) values(v_tenant_id,target_company_id,v_actor_id,'project_cost_detail.publish',target_idempotency_key,v_hash,v_detail.id,v_detail.version);
  return private.c1_detail_ack(v_detail.id,false);
end;
$$;

revoke all on function private.c1_lock_project_cost_category(uuid,uuid,uuid,uuid), private.c1_project_cost_item_has_managed_detail_state(uuid,uuid,uuid), private.c1_project_cost_detail_publish_readiness(uuid,uuid,uuid), private.c1_detail_load_readiness_scope(uuid,uuid,uuid), private.c1_detail_validate_financial_input(jsonb), private.c1_detail_validate_prepare_financial_input(jsonb), private.c1_detail_validate_direct_create_input(jsonb) from public, anon, authenticated;
notify pgrst,'reload schema';
