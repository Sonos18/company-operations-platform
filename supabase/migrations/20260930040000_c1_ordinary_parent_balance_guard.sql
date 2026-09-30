set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 25);

do $$
begin
  if to_regprocedure('private.c1_resolve_or_create_ordinary_project_cost_item(uuid,uuid,uuid,uuid,uuid,uuid)') is null
    or to_regprocedure('private.c1_master_context(uuid,text)') is null then
    raise exception using errcode = 'P0001', message = 'C1_ORDINARY_PARENT_BALANCE_GUARD_BASELINE_MISSING';
  end if;
end;
$$;

create or replace function private.c1_resolve_or_create_ordinary_project_cost_item(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_id uuid,
  target_cost_category_id uuid,
  target_actor_id uuid,
  target_request_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_category public.cost_categories%rowtype;
  v_item public.project_cost_items%rowtype;
  v_published_detail_amount numeric;
  v_currency_code text;
begin
  if target_actor_id is null or target_request_id is null or auth.uid() is distinct from target_actor_id then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  v_context := private.c1_master_context(target_company_id, 'cost.manage');
  if (v_context->>'tenantId')::uuid is distinct from target_tenant_id
    or (v_context->>'actorId')::uuid is distinct from target_actor_id then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  if not exists (
    select 1 from public.projects project
    where project.id = target_project_id
      and project.tenant_id = target_tenant_id
      and project.company_id = target_company_id
  ) then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  select category.* into v_category
  from public.cost_categories category
  where category.id = target_cost_category_id
    and category.tenant_id = target_tenant_id
    and category.company_id = target_company_id
    and category.is_active;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if v_category.posting_strategy = 'subcontract_payment' then
    raise exception using errcode = 'P0001', message = 'SUBCONTRACT_COST_MODEL_UNSUPPORTED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'c1_ordinary_cost_parent:' || target_tenant_id::text || ':' || target_company_id::text || ':' || target_project_id::text || ':' || target_cost_category_id::text,
    0
  ));
  select item.* into v_item
  from public.project_cost_items item
  where item.tenant_id = target_tenant_id
    and item.company_id = target_company_id
    and item.project_id = target_project_id
    and item.cost_category_id = target_cost_category_id
  for update;
  if found then
    if v_item.publication_state <> 'published' then raise exception using errcode = 'P0001', message = 'COST_DETAIL_PUBLISH_NOT_READY'; end if;
    select coalesce(sum(detail.amount_text::numeric), 0) into v_published_detail_amount
    from public.project_cost_item_details detail
    where detail.tenant_id = target_tenant_id
      and detail.company_id = target_company_id
      and detail.project_cost_item_id = v_item.id
      and detail.publication_state = 'published';
    if v_item.amount is distinct from v_published_detail_amount then
      raise exception using errcode = 'P0001', message = 'COST_DETAIL_PUBLISH_NOT_READY', detail = jsonb_build_array('FINANCIAL_DETAILS_REQUIRED')::text;
    end if;
    return v_item.id;
  end if;

  select settings.default_currency_code into v_currency_code
  from public.company_cost_settings settings
  where settings.tenant_id = target_tenant_id
    and settings.company_id = target_company_id
    and settings.enabled;
  if v_currency_code is null then raise exception using errcode = 'P0001', message = 'MODULE_DISABLED'; end if;

  insert into public.project_cost_items(
    tenant_id, company_id, project_id, cost_category_id, description, amount, amount_text, currency_code,
    work_status, business_reference, party_id, engagement_id, component_id, relevant_date,
    publication_state, publication_origin, published_by, published_at, publication_request_id, created_by
  ) values (
    target_tenant_id, target_company_id, target_project_id, target_cost_category_id,
    'C1 ordinary cost aggregate — ' || v_category.code, 0, '0.0000', v_currency_code,
    'unknown', null, null, null, null, null,
    'published', 'command', target_actor_id, now(), target_request_id, target_actor_id
  ) returning id into v_item.id;
  return v_item.id;
end;
$$;
