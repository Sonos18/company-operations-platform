set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 3);

do $$
begin
  if to_regclass('public.project_cost_items') is null
    or to_regclass('public.project_cost_item_details') is null
    or to_regclass('public.project_cost_item_sources') is null
    or to_regclass('public.cost_categories') is null
    or to_regprocedure('private.c1_master_context(uuid,text)') is null
    or to_regprocedure('private.c1_jsonb_canonical_text(jsonb)') is null
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'project_cost_items'
        and column_name = 'publication_state'
    ) then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTING_WRITE_P2_BASELINE_MISSING';
  end if;
  if to_regprocedure('public.c1_create_project_cost_draft(uuid,jsonb,uuid,uuid)') is not null then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTING_WRITE_P2_ALREADY_APPLIED';
  end if;
end;
$$;

create function private.c1_assert_project_cost_operational_scope(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_id uuid,
  target_cost_category_id uuid,
  target_party_id uuid,
  target_engagement_id uuid,
  target_component_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_category_code text;
begin
  if not exists (
    select 1 from public.projects project
    where project.id = target_project_id
      and project.tenant_id = target_tenant_id
      and project.company_id = target_company_id
  ) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;

  select category.code into v_category_code
  from public.cost_categories category
  where category.id = target_cost_category_id
    and category.tenant_id = target_tenant_id
    and category.company_id = target_company_id
    and category.is_active;
  if v_category_code is null then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if v_category_code = 'subcontract_labor' then
    raise exception using errcode = 'P0001', message = 'SUBCONTRACT_COST_MODEL_UNSUPPORTED';
  end if;

  if target_party_id is not null and not exists (
    select 1 from public.business_parties party
    where party.id = target_party_id and party.tenant_id = target_tenant_id and party.company_id = target_company_id
  ) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if target_engagement_id is not null and not exists (
    select 1 from public.project_engagements engagement
    where engagement.id = target_engagement_id
      and engagement.tenant_id = target_tenant_id
      and engagement.company_id = target_company_id
      and engagement.project_id = target_project_id
      and (target_party_id is null or engagement.party_id = target_party_id)
  ) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if target_component_id is not null and (target_engagement_id is null or not exists (
    select 1 from public.engagement_components component
    where component.id = target_component_id
      and component.tenant_id = target_tenant_id
      and component.company_id = target_company_id
      and component.engagement_id = target_engagement_id
  )) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
end;
$$;

create function private.c1_project_cost_publish_readiness(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_cost_item_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item public.project_cost_items%rowtype;
  v_blocking_codes text[] := array[]::text[];
begin
  select item.* into v_item
  from public.project_cost_items item
  where item.id = target_project_cost_item_id
    and item.tenant_id = target_tenant_id
    and item.company_id = target_company_id;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;

  if v_item.publication_state <> 'draft' then
    raise exception using errcode = 'P0001', message = 'COST_NOT_DRAFT';
  end if;
  if v_item.amount is null or not exists (
    select 1 from public.project_cost_item_details detail
    where detail.project_cost_item_id = v_item.id
      and detail.tenant_id = target_tenant_id
      and detail.company_id = target_company_id
  ) then v_blocking_codes := array_append(v_blocking_codes, 'FINANCIAL_DETAILS_REQUIRED'); end if;
  if exists (
    select 1
    from public.project_cost_item_sources link
    join public.source_reported_figures figure
      on figure.id = link.source_reported_figure_id
     and figure.tenant_id = link.tenant_id
     and figure.company_id = link.company_id
    where link.project_cost_item_id = v_item.id
      and link.tenant_id = target_tenant_id
      and link.company_id = target_company_id
      and figure.status <> 'shared'
  ) then v_blocking_codes := array_append(v_blocking_codes, 'SOURCE_NOT_SHARED'); end if;
  if exists (
    select 1
    from public.project_cost_item_sources link
    join public.source_reported_figures figure on figure.id = link.source_reported_figure_id and figure.tenant_id = link.tenant_id and figure.company_id = link.company_id
    join public.source_review_issues issue on issue.source_selection_id = figure.source_selection_id and issue.tenant_id = figure.tenant_id and issue.company_id = figure.company_id
    where link.project_cost_item_id = v_item.id
      and link.tenant_id = target_tenant_id
      and link.company_id = target_company_id
      and issue.status = 'open'
      and issue.impact = 'blocks_normalization'
  ) then v_blocking_codes := array_append(v_blocking_codes, 'SOURCE_REVIEW_BLOCKING'); end if;
  if exists (
    select 1 from public.cost_categories category
    where category.id = v_item.cost_category_id
      and category.tenant_id = target_tenant_id
      and category.company_id = target_company_id
      and category.code = 'subcontract_labor'
  ) then v_blocking_codes := array_append(v_blocking_codes, 'SUBCONTRACT_COST_MODEL_UNSUPPORTED'); end if;

  return jsonb_build_object('ready', cardinality(v_blocking_codes) = 0, 'blockingCodes', to_jsonb(v_blocking_codes));
end;
$$;

create function private.c1_project_cost_draft_json(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_cost_item_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', item.id,
    'projectId', item.project_id,
    'description', item.description,
    'costCategoryId', item.cost_category_id,
    'businessReference', item.business_reference,
    'partyId', item.party_id,
    'engagementId', item.engagement_id,
    'componentId', item.component_id,
    'relevantDate', item.relevant_date,
    'workStatus', item.work_status,
    'amount', item.amount_text,
    'currencyCode', item.currency_code,
    'publicationState', item.publication_state,
    'version', item.version,
    'details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', detail.id, 'projectCostItemId', detail.project_cost_item_id,
        'lineNo', detail.line_no, 'detailKind', detail.detail_kind,
        'description', detail.description, 'quantity', detail.quantity_text,
        'unitCode', detail.unit_code, 'unitPrice', detail.unit_price_text,
        'amount', detail.amount_text, 'retentionKind', detail.retention_kind,
        'retentionRateBps', detail.retention_rate_bps, 'retentionAmount', detail.retention_amount_text,
        'relevantDate', detail.relevant_date, 'reference', detail.reference, 'note', detail.note,
        'version', detail.version, 'createdAt', detail.created_at, 'updatedAt', detail.updated_at
      ) order by detail.line_no, detail.id)
      from public.project_cost_item_details detail
      where detail.project_cost_item_id = item.id and detail.tenant_id = item.tenant_id and detail.company_id = item.company_id
    ), '[]'::jsonb),
    'sourceFigureIds', coalesce((
      select jsonb_agg(link.source_reported_figure_id order by link.source_reported_figure_id)
      from public.project_cost_item_sources link
      where link.project_cost_item_id = item.id and link.tenant_id = item.tenant_id and link.company_id = item.company_id
    ), '[]'::jsonb),
    'publishReadiness', private.c1_project_cost_publish_readiness(item.tenant_id, item.company_id, item.id),
    'createdAt', item.created_at,
    'updatedAt', item.updated_at
  )
  from public.project_cost_items item
  where item.id = target_project_cost_item_id
    and item.tenant_id = target_tenant_id
    and item.company_id = target_company_id
    and item.publication_state = 'draft';
$$;

create function private.c1_create_project_cost_draft(
  target_company_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_actor_id uuid := auth.uid();
  v_tenant_id uuid;
  v_project_id uuid;
  v_category_id uuid;
  v_party_id uuid;
  v_engagement_id uuid;
  v_component_id uuid;
  v_relevant_date date;
  v_currency_code text;
  v_request_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_item public.project_cost_items%rowtype;
begin
  if v_actor_id is null then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  v_context := private.c1_master_context(target_company_id, 'cost.manage');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id
    or target_idempotency_key is null or target_request_id is null
    or jsonb_typeof(target_input) is distinct from 'object'
    or not (target_input ?& array['projectId','description','costCategoryId'])
    or exists (select 1 from jsonb_object_keys(target_input) key where key not in ('projectId','description','costCategoryId','businessReference','partyId','engagementId','componentId','relevantDate','workStatus'))
    or jsonb_typeof(target_input->'projectId') is distinct from 'string'
    or jsonb_typeof(target_input->'costCategoryId') is distinct from 'string'
    or jsonb_typeof(target_input->'description') is distinct from 'string' or btrim(target_input->>'description') = ''
    or (target_input ? 'businessReference' and (jsonb_typeof(target_input->'businessReference') is distinct from 'string' or btrim(target_input->>'businessReference') = ''))
    or (target_input ? 'partyId' and jsonb_typeof(target_input->'partyId') is distinct from 'string')
    or (target_input ? 'engagementId' and jsonb_typeof(target_input->'engagementId') is distinct from 'string')
    or (target_input ? 'componentId' and jsonb_typeof(target_input->'componentId') is distinct from 'string')
    or (target_input ? 'relevantDate' and (jsonb_typeof(target_input->'relevantDate') is distinct from 'string' or target_input->>'relevantDate' !~ '^\d{4}-\d{2}-\d{2}$'))
    or (target_input ? 'workStatus' and (jsonb_typeof(target_input->'workStatus') is distinct from 'string' or target_input->>'workStatus' not in ('unknown','in_progress','accepted')))
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

  begin
    v_project_id := (target_input->>'projectId')::uuid;
    v_category_id := (target_input->>'costCategoryId')::uuid;
    v_party_id := case when target_input ? 'partyId' then (target_input->>'partyId')::uuid end;
    v_engagement_id := case when target_input ? 'engagementId' then (target_input->>'engagementId')::uuid end;
    v_component_id := case when target_input ? 'componentId' then (target_input->>'componentId')::uuid end;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end;
  v_relevant_date := case when target_input ? 'relevantDate' then private.c1_parse_project_cost_date(target_input->>'relevantDate') end;
  perform private.c1_assert_project_cost_operational_scope(v_tenant_id, target_company_id, v_project_id, v_category_id, v_party_id, v_engagement_id, v_component_id);
  select settings.default_currency_code into v_currency_code
  from public.company_cost_settings settings
  where settings.tenant_id = v_tenant_id and settings.company_id = target_company_id and settings.enabled;
  if v_currency_code is null then raise exception using errcode = 'P0001', message = 'MODULE_DISABLED'; end if;

  v_request_hash := encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('companyId', target_company_id, 'input', target_input)), 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('c1_project_cost_draft:create:' || target_company_id::text || ':' || v_actor_id::text || ':' || target_idempotency_key::text, 0));
  select receipt.* into v_receipt from public.cost_command_receipts receipt
  where receipt.company_id = target_company_id and receipt.actor_id = v_actor_id
    and receipt.command_name = 'project_cost_draft.create' and receipt.idempotency_key = target_idempotency_key
  for update;
  if found then
    if v_receipt.request_hash <> v_request_hash then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('id', v_receipt.result_resource_id, 'version', v_receipt.result_version, 'publicationState', 'draft', 'replayed', true);
  end if;

  insert into public.project_cost_items(
    tenant_id, company_id, project_id, cost_category_id, description, currency_code, work_status,
    business_reference, party_id, engagement_id, component_id, relevant_date, created_by
  ) values (
    v_tenant_id, target_company_id, v_project_id, v_category_id, btrim(target_input->>'description'), v_currency_code,
    coalesce(target_input->>'workStatus', 'unknown'), case when target_input ? 'businessReference' then btrim(target_input->>'businessReference') end,
    v_party_id, v_engagement_id, v_component_id, v_relevant_date, v_actor_id
  ) returning * into v_item;
  insert into public.cost_command_receipts(tenant_id, company_id, actor_id, command_name, idempotency_key, request_hash, result_resource_id, result_version)
  values (v_tenant_id, target_company_id, v_actor_id, 'project_cost_draft.create', target_idempotency_key, v_request_hash, v_item.id, v_item.version);
  insert into public.audit_events(tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, after_summary)
  values (v_tenant_id, target_company_id, v_actor_id, 'c1.project_cost_draft.created', 'project_cost_item', v_item.id::text, target_request_id,
    jsonb_build_object('projectId', v_item.project_id, 'costCategoryId', v_item.cost_category_id, 'publicationState', v_item.publication_state, 'version', v_item.version));
  return jsonb_build_object('id', v_item.id, 'version', v_item.version, 'publicationState', v_item.publication_state, 'replayed', false);
end;
$$;

create function private.c1_update_project_cost_draft(
  target_company_id uuid,
  target_id uuid,
  target_input jsonb,
  target_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_actor_id uuid := auth.uid();
  v_tenant_id uuid;
  v_item public.project_cost_items%rowtype;
  v_updated public.project_cost_items%rowtype;
  v_category_id uuid;
  v_party_id uuid;
  v_engagement_id uuid;
  v_component_id uuid;
  v_relevant_date date;
begin
  if v_actor_id is null then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  v_context := private.c1_master_context(target_company_id, 'cost.manage');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id or target_request_id is null
    or jsonb_typeof(target_input) is distinct from 'object' or not (target_input ? 'expectedVersion')
    or not (target_input ?| array['description','costCategoryId','businessReference','partyId','engagementId','componentId','relevantDate','workStatus'])
    or exists (select 1 from jsonb_object_keys(target_input) key where key not in ('expectedVersion','description','costCategoryId','businessReference','partyId','engagementId','componentId','relevantDate','workStatus'))
    or jsonb_typeof(target_input->'expectedVersion') is distinct from 'number' or target_input->>'expectedVersion' !~ '^\d+$'
    or (target_input ? 'description' and (jsonb_typeof(target_input->'description') is distinct from 'string' or btrim(target_input->>'description') = ''))
    or (target_input ? 'costCategoryId' and jsonb_typeof(target_input->'costCategoryId') is distinct from 'string')
    or (target_input ? 'businessReference' and (jsonb_typeof(target_input->'businessReference') not in ('string','null') or (jsonb_typeof(target_input->'businessReference') = 'string' and btrim(target_input->>'businessReference') = '')))
    or (target_input ? 'partyId' and jsonb_typeof(target_input->'partyId') not in ('string','null'))
    or (target_input ? 'engagementId' and jsonb_typeof(target_input->'engagementId') not in ('string','null'))
    or (target_input ? 'componentId' and jsonb_typeof(target_input->'componentId') not in ('string','null'))
    or (target_input ? 'relevantDate' and (jsonb_typeof(target_input->'relevantDate') not in ('string','null') or (jsonb_typeof(target_input->'relevantDate') = 'string' and target_input->>'relevantDate' !~ '^\d{4}-\d{2}-\d{2}$')))
    or (target_input ? 'workStatus' and (jsonb_typeof(target_input->'workStatus') is distinct from 'string' or target_input->>'workStatus' not in ('unknown','in_progress','accepted')))
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

  select item.* into v_item from public.project_cost_items item
  where item.id = target_id and item.tenant_id = v_tenant_id and item.company_id = target_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if v_item.publication_state <> 'draft' then raise exception using errcode = 'P0001', message = 'COST_NOT_DRAFT'; end if;
  if v_item.version <> (target_input->>'expectedVersion')::bigint then raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT'; end if;
  begin
    v_category_id := case when target_input ? 'costCategoryId' then (target_input->>'costCategoryId')::uuid else v_item.cost_category_id end;
    v_party_id := case when target_input ? 'partyId' then case when jsonb_typeof(target_input->'partyId') = 'null' then null else (target_input->>'partyId')::uuid end else v_item.party_id end;
    v_engagement_id := case when target_input ? 'engagementId' then case when jsonb_typeof(target_input->'engagementId') = 'null' then null else (target_input->>'engagementId')::uuid end else v_item.engagement_id end;
    v_component_id := case when target_input ? 'componentId' then case when jsonb_typeof(target_input->'componentId') = 'null' then null else (target_input->>'componentId')::uuid end else v_item.component_id end;
  exception when invalid_text_representation then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end;
  v_relevant_date := case when target_input ? 'relevantDate' then case when jsonb_typeof(target_input->'relevantDate') = 'null' then null else private.c1_parse_project_cost_date(target_input->>'relevantDate') end else v_item.relevant_date end;
  perform private.c1_assert_project_cost_operational_scope(v_tenant_id, target_company_id, v_item.project_id, v_category_id, v_party_id, v_engagement_id, v_component_id);

  update public.project_cost_items item set
    description = case when target_input ? 'description' then btrim(target_input->>'description') else item.description end,
    cost_category_id = v_category_id,
    business_reference = case when target_input ? 'businessReference' then case when jsonb_typeof(target_input->'businessReference') = 'null' then null else btrim(target_input->>'businessReference') end else item.business_reference end,
    party_id = v_party_id, engagement_id = v_engagement_id, component_id = v_component_id, relevant_date = v_relevant_date,
    work_status = case when target_input ? 'workStatus' then target_input->>'workStatus' else item.work_status end,
    version = item.version + 1, updated_at = now()
  where item.id = v_item.id returning * into v_updated;
  insert into public.audit_events(tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, before_summary, after_summary)
  values (v_tenant_id, target_company_id, v_actor_id, 'c1.project_cost_draft.updated', 'project_cost_item', v_item.id::text, target_request_id,
    jsonb_build_object('description', v_item.description, 'costCategoryId', v_item.cost_category_id, 'partyId', v_item.party_id, 'engagementId', v_item.engagement_id, 'componentId', v_item.component_id, 'relevantDate', v_item.relevant_date, 'workStatus', v_item.work_status, 'version', v_item.version),
    jsonb_build_object('description', v_updated.description, 'costCategoryId', v_updated.cost_category_id, 'partyId', v_updated.party_id, 'engagementId', v_updated.engagement_id, 'componentId', v_updated.component_id, 'relevantDate', v_updated.relevant_date, 'workStatus', v_updated.work_status, 'version', v_updated.version));
  return jsonb_build_object('id', v_updated.id, 'version', v_updated.version, 'publicationState', v_updated.publication_state, 'replayed', false);
end;
$$;

create or replace function private.c1_project_cost_detail_sync_trigger()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('taskovia.c1_cost_write.snapshot', true) = '1' then return null; end if;
  if tg_op = 'DELETE' then
    perform private.c1_sync_project_cost_item_amount(old.project_cost_item_id);
  elsif tg_op = 'UPDATE' and (old.project_cost_item_id, old.tenant_id, old.company_id) is distinct from (new.project_cost_item_id, new.tenant_id, new.company_id) then
    perform private.c1_sync_project_cost_item_amount(old.project_cost_item_id);
    perform private.c1_sync_project_cost_item_amount(new.project_cost_item_id);
  else
    perform private.c1_sync_project_cost_item_amount(new.project_cost_item_id);
  end if;
  return null;
end;
$$;

create or replace function private.c1_guard_derived_project_cost_amount()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (new.amount is distinct from old.amount or new.amount_text is distinct from old.amount_text)
    and exists (select 1 from public.project_cost_item_details detail where detail.project_cost_item_id = new.id and detail.tenant_id = new.tenant_id and detail.company_id = new.company_id)
    and current_setting('taskovia.project_cost_detail_sync', true) is distinct from '1'
    and current_setting('taskovia.c1_cost_write.snapshot', true) is distinct from '1' then
    raise exception using errcode = 'P0001', message = 'PROJECT_COST_AMOUNT_DERIVED';
  end if;
  return new;
end;
$$;

create function private.c1_prepare_project_cost_financials(
  target_company_id uuid,
  target_id uuid,
  target_input jsonb,
  target_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_actor_id uuid := auth.uid();
  v_tenant_id uuid;
  v_item public.project_cost_items%rowtype;
  v_updated public.project_cost_items%rowtype;
  v_detail jsonb;
  v_source_figure_ids uuid[] := array[]::uuid[];
  v_total numeric(20,4) := 0;
  v_detail_count integer;
  v_readiness jsonb;
  v_before_details jsonb;
  v_before_sources jsonb;
begin
  if v_actor_id is null then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  v_context := private.c1_master_context(target_company_id, 'cost.prepare');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id or target_request_id is null
    or jsonb_typeof(target_input) is distinct from 'object'
    or not (target_input ?& array['expectedVersion','currencyCode','details','sourceFigureIds'])
    or exists (select 1 from jsonb_object_keys(target_input) key where key not in ('expectedVersion','currencyCode','details','sourceFigureIds'))
    or jsonb_typeof(target_input->'expectedVersion') is distinct from 'number' or target_input->>'expectedVersion' !~ '^\d+$'
    or jsonb_typeof(target_input->'currencyCode') is distinct from 'string' or char_length(target_input->>'currencyCode') <> 3
    or jsonb_typeof(target_input->'details') is distinct from 'array' or jsonb_array_length(target_input->'details') = 0
    or jsonb_typeof(target_input->'sourceFigureIds') is distinct from 'array'
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

  select item.* into v_item from public.project_cost_items item
  where item.id = target_id and item.tenant_id = v_tenant_id and item.company_id = target_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if v_item.publication_state <> 'draft' then raise exception using errcode = 'P0001', message = 'COST_NOT_DRAFT'; end if;
  if v_item.version <> (target_input->>'expectedVersion')::bigint then raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT'; end if;
  if target_input->>'currencyCode' <> v_item.currency_code then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

  for v_detail in select value from jsonb_array_elements(target_input->'details') loop
    if jsonb_typeof(v_detail) is distinct from 'object'
      or not (v_detail ?& array['lineNo','detailKind','description','amount'])
      or exists (select 1 from jsonb_object_keys(v_detail) key where key not in ('lineNo','detailKind','description','quantity','unitCode','unitPrice','amount','retentionKind','retentionRateBps','retentionAmount','relevantDate','reference','note'))
      or jsonb_typeof(v_detail->'lineNo') is distinct from 'number' or v_detail->>'lineNo' !~ '^\d+$' or (v_detail->>'lineNo')::integer < 1
      or jsonb_typeof(v_detail->'detailKind') is distinct from 'string' or v_detail->>'detailKind' not in ('opening_balance','line_item')
      or jsonb_typeof(v_detail->'description') is distinct from 'string' or btrim(v_detail->>'description') = ''
      or jsonb_typeof(v_detail->'amount') is distinct from 'string' or v_detail->>'amount' !~ '^\d{1,16}(\.\d{1,4})?$'
      or (v_detail ? 'quantity' and (jsonb_typeof(v_detail->'quantity') not in ('string','null') or (jsonb_typeof(v_detail->'quantity') = 'string' and v_detail->>'quantity' !~ '^\d{1,16}(\.\d{1,4})?$')))
      or (v_detail ? 'unitCode' and jsonb_typeof(v_detail->'unitCode') not in ('string','null'))
      or (v_detail ? 'unitPrice' and (jsonb_typeof(v_detail->'unitPrice') not in ('string','null') or (jsonb_typeof(v_detail->'unitPrice') = 'string' and v_detail->>'unitPrice' !~ '^\d{1,16}(\.\d{1,4})?$')))
      or (v_detail ? 'retentionKind' and jsonb_typeof(v_detail->'retentionKind') not in ('string','null'))
      or (v_detail ? 'retentionKind' and jsonb_typeof(v_detail->'retentionKind') = 'string' and v_detail->>'retentionKind' not in ('warranty','other'))
      or (v_detail ? 'retentionRateBps' and jsonb_typeof(v_detail->'retentionRateBps') not in ('number','null'))
      or (v_detail ? 'retentionAmount' and (jsonb_typeof(v_detail->'retentionAmount') not in ('string','null') or (jsonb_typeof(v_detail->'retentionAmount') = 'string' and v_detail->>'retentionAmount' !~ '^\d{1,16}(\.\d{1,4})?$')))
      or (v_detail ? 'relevantDate' and (jsonb_typeof(v_detail->'relevantDate') not in ('string','null') or (jsonb_typeof(v_detail->'relevantDate') = 'string' and v_detail->>'relevantDate' !~ '^\d{4}-\d{2}-\d{2}$')))
      or (v_detail ? 'reference' and jsonb_typeof(v_detail->'reference') not in ('string','null'))
      or (v_detail ? 'note' and jsonb_typeof(v_detail->'note') not in ('string','null'))
      or ((nullif(v_detail->>'retentionKind','') is null) <> (nullif(v_detail->>'retentionAmount','') is null))
      or (nullif(v_detail->>'retentionAmount','') is not null and (v_detail->>'retentionAmount')::numeric > (v_detail->>'amount')::numeric)
      or (v_detail->>'retentionRateBps' is not null and ((v_detail->>'retentionRateBps')::integer < 0 or (v_detail->>'retentionRateBps')::integer > 10000))
    then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
    v_total := v_total + (v_detail->>'amount')::numeric;
  end loop;
  if (select count(*) from jsonb_array_elements(target_input->'details')) <> (select count(distinct value->>'lineNo') from jsonb_array_elements(target_input->'details')) then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;

  begin
    select coalesce(array_agg(value::text::uuid order by value::text), array[]::uuid[]) into v_source_figure_ids
    from jsonb_array_elements_text(target_input->'sourceFigureIds') source(value);
  exception when invalid_text_representation then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end;
  if cardinality(v_source_figure_ids) <> (select count(distinct value) from unnest(v_source_figure_ids) source(value)) then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  if cardinality(v_source_figure_ids) > 0 and (select count(*) from public.source_reported_figures figure
    where figure.id = any(v_source_figure_ids) and figure.tenant_id = v_tenant_id and figure.company_id = target_company_id
      and figure.project_id = v_item.project_id and figure.status = 'shared') <> cardinality(v_source_figure_ids) then
    raise exception using errcode = 'P0001', message = 'SOURCE_VERSION_NOT_SHARED';
  end if;
  if exists (
    select 1 from public.source_reported_figures figure
    join public.source_review_issues issue on issue.source_selection_id = figure.source_selection_id and issue.tenant_id = figure.tenant_id and issue.company_id = figure.company_id
    where figure.id = any(v_source_figure_ids) and issue.status = 'open' and issue.impact = 'blocks_normalization'
  ) then raise exception using errcode = 'P0001', message = 'SOURCE_REVIEW_REQUIRED'; end if;

  select coalesce(jsonb_agg(to_jsonb(detail) order by detail.line_no, detail.id), '[]'::jsonb) into v_before_details
  from public.project_cost_item_details detail where detail.project_cost_item_id = v_item.id and detail.tenant_id = v_tenant_id and detail.company_id = target_company_id;
  select coalesce(jsonb_agg(link.source_reported_figure_id order by link.source_reported_figure_id), '[]'::jsonb) into v_before_sources
  from public.project_cost_item_sources link where link.project_cost_item_id = v_item.id and link.tenant_id = v_tenant_id and link.company_id = target_company_id;

  perform set_config('taskovia.c1_cost_write.snapshot', '1', true);
  delete from public.project_cost_item_details where project_cost_item_id = v_item.id and tenant_id = v_tenant_id and company_id = target_company_id;
  insert into public.project_cost_item_details(
    tenant_id, company_id, project_cost_item_id, line_no, detail_kind, description, quantity_text, unit_code,
    unit_price_text, amount_text, retention_kind, retention_rate_bps, retention_amount_text, relevant_date, reference, note, created_by
  ) select
    v_tenant_id, target_company_id, v_item.id, (detail.value->>'lineNo')::integer, detail.value->>'detailKind', btrim(detail.value->>'description'),
    nullif(detail.value->>'quantity',''), nullif(detail.value->>'unitCode',''), nullif(detail.value->>'unitPrice',''), detail.value->>'amount',
    nullif(detail.value->>'retentionKind',''), nullif(detail.value->>'retentionRateBps','')::integer, nullif(detail.value->>'retentionAmount',''),
    case when nullif(detail.value->>'relevantDate','') is null then null else private.c1_parse_project_cost_date(detail.value->>'relevantDate') end,
    nullif(btrim(detail.value->>'reference'),''), detail.value->>'note', v_actor_id
  from jsonb_array_elements(target_input->'details') detail(value);
  delete from public.project_cost_item_sources where project_cost_item_id = v_item.id and tenant_id = v_tenant_id and company_id = target_company_id;
  insert into public.project_cost_item_sources(tenant_id, company_id, project_cost_item_id, source_reported_figure_id)
  select v_tenant_id, target_company_id, v_item.id, source_id from unnest(v_source_figure_ids) source(source_id);
  update public.project_cost_items item set amount = v_total, amount_text = v_total::text, version = item.version + 1, updated_at = now()
  where item.id = v_item.id returning * into v_updated;
  set constraints c1_project_cost_item_details_sync immediate;
  perform set_config('taskovia.c1_cost_write.snapshot', '0', true);
  set constraints c1_project_cost_item_details_sync deferred;

  v_detail_count := jsonb_array_length(target_input->'details');
  v_readiness := private.c1_project_cost_publish_readiness(v_tenant_id, target_company_id, v_item.id);
  insert into public.audit_events(tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, before_summary, after_summary)
  values (v_tenant_id, target_company_id, v_actor_id, 'c1.project_cost_draft.financials_prepared', 'project_cost_item', v_item.id::text, target_request_id,
    jsonb_build_object('amount', v_item.amount_text, 'details', v_before_details, 'sourceFigureIds', v_before_sources, 'version', v_item.version),
    jsonb_build_object('amount', v_updated.amount_text, 'detailCount', v_detail_count, 'sourceFigureIds', to_jsonb(v_source_figure_ids), 'version', v_updated.version));
  return jsonb_build_object('id', v_updated.id, 'version', v_updated.version, 'publicationState', v_updated.publication_state,
    'amount', v_updated.amount_text, 'detailCount', v_detail_count, 'publishReadiness', v_readiness, 'replayed', false);
end;
$$;

create function private.c1_read_project_cost_draft(target_company_id uuid, target_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_context jsonb; v_tenant_id uuid; v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  v_context := private.c1_master_context(target_company_id, 'cost.prepare');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  select private.c1_project_cost_draft_json(v_tenant_id, target_company_id, target_id) into v_result;
  if v_result is null then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  return v_result;
end;
$$;

create function private.c1_list_project_cost_drafts(target_company_id uuid, target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_context jsonb; v_tenant_id uuid; v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  v_context := private.c1_master_context(target_company_id, 'cost.prepare');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if not exists (select 1 from public.projects project where project.id = target_project_id and project.tenant_id = v_tenant_id and project.company_id = target_company_id) then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  select coalesce(jsonb_agg(private.c1_project_cost_draft_json(v_tenant_id, target_company_id, item.id) order by item.created_at, item.id), '[]'::jsonb)
  into v_result from public.project_cost_items item
  where item.tenant_id = v_tenant_id and item.company_id = target_company_id and item.project_id = target_project_id and item.publication_state = 'draft';
  return v_result;
end;
$$;

create function public.c1_create_project_cost_draft(target_company_id uuid, target_input jsonb, target_idempotency_key uuid, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$ select private.c1_create_project_cost_draft(target_company_id, target_input, target_idempotency_key, target_request_id); $$;
create function public.c1_update_project_cost_draft(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$ select private.c1_update_project_cost_draft(target_company_id, target_id, target_input, target_request_id); $$;
create function public.c1_prepare_project_cost_financials(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$ select private.c1_prepare_project_cost_financials(target_company_id, target_id, target_input, target_request_id); $$;
create function public.c1_read_project_cost_draft(target_company_id uuid, target_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.c1_read_project_cost_draft(target_company_id, target_id); $$;
create function public.c1_list_project_cost_drafts(target_company_id uuid, target_project_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$ select private.c1_list_project_cost_drafts(target_company_id, target_project_id); $$;

create or replace function public.c1_create_project_cost_item(target_company_id uuid, target_input jsonb, target_idempotency_key uuid, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$ select private.c1_create_project_cost_draft(target_company_id, target_input, target_idempotency_key, target_request_id); $$;
create or replace function public.c1_update_project_cost_item(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$ select private.c1_update_project_cost_draft(target_company_id, target_id, target_input, target_request_id); $$;

revoke all on function private.c1_assert_project_cost_operational_scope(uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.c1_project_cost_publish_readiness(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.c1_project_cost_draft_json(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.c1_create_project_cost_draft(uuid, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function private.c1_update_project_cost_draft(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function private.c1_prepare_project_cost_financials(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function private.c1_read_project_cost_draft(uuid, uuid) from public, anon, authenticated;
revoke all on function private.c1_list_project_cost_drafts(uuid, uuid) from public, anon, authenticated;

revoke all on function public.c1_create_project_cost_draft(uuid, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.c1_update_project_cost_draft(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.c1_prepare_project_cost_financials(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.c1_read_project_cost_draft(uuid, uuid) from public, anon, authenticated;
revoke all on function public.c1_list_project_cost_drafts(uuid, uuid) from public, anon, authenticated;
grant execute on function public.c1_create_project_cost_draft(uuid, jsonb, uuid, uuid) to authenticated;
grant execute on function public.c1_update_project_cost_draft(uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function public.c1_prepare_project_cost_financials(uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function public.c1_read_project_cost_draft(uuid, uuid) to authenticated;
grant execute on function public.c1_list_project_cost_drafts(uuid, uuid) to authenticated;

revoke all on function public.c1_create_project_cost_item(uuid, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.c1_update_project_cost_item(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.c1_create_project_cost_item(uuid, jsonb, uuid, uuid) to authenticated;
grant execute on function public.c1_update_project_cost_item(uuid, uuid, jsonb, uuid) to authenticated;
revoke all on function public.c1_correct_project_cost_item(uuid, uuid, jsonb, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
