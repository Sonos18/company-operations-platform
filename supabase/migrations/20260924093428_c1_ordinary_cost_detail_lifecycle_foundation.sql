set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 17);

do $$
begin
  if exists (
    select 1 from public.project_cost_items item
    where item.publication_state = 'draft'
  ) then
    raise exception using errcode = 'P0001', message = 'C1_ORDINARY_COST_DETAIL_PARENT_DRAFTS_UNSUPPORTED';
  end if;
  if exists (
    select 1 from public.cost_categories category
    where category.code not in ('materials', 'machinery', 'direct_labor', 'other', 'subcontract_labor')
  ) then
    raise exception using errcode = 'P0001', message = 'C1_ORDINARY_COST_DETAIL_CATEGORY_STRATEGY_MAPPING_REQUIRED';
  end if;
end;
$$;

alter table public.cost_categories add column posting_strategy text;

update public.cost_categories
set posting_strategy = case code
  when 'subcontract_labor' then 'subcontract_payment'
  when 'materials' then 'ordinary_detail'
  when 'machinery' then 'ordinary_detail'
  when 'direct_labor' then 'ordinary_detail'
  when 'other' then 'ordinary_detail'
end;

alter table public.cost_categories
  alter column posting_strategy set not null,
  add constraint cost_categories_posting_strategy_check
    check (posting_strategy in ('ordinary_detail', 'subcontract_payment'));

alter table public.project_cost_item_details
  add column publication_state text,
  add column publication_origin text,
  add column published_by uuid references auth.users(id) on delete restrict,
  add column published_at timestamptz,
  add column publication_request_id uuid;

alter table public.project_cost_item_details
  drop constraint project_cost_item_details_amount_text_check,
  alter column amount_text drop not null;

update public.project_cost_item_details
set publication_state = 'published',
    publication_origin = 'legacy_backfill',
    published_by = null,
    published_at = created_at,
    publication_request_id = null;

alter table public.project_cost_item_details
  alter column publication_state set not null,
  alter column publication_state set default 'draft',
  add constraint project_cost_item_details_amount_text_check
    check (amount_text is null or amount_text ~ '^\\d{1,16}(\\.\\d{1,4})?$'),
  add constraint project_cost_item_details_publication_state_check
    check (publication_state in ('draft', 'published')),
  add constraint project_cost_item_details_publication_origin_check
    check (publication_origin is null or publication_origin in ('command', 'legacy_backfill')),
  add constraint project_cost_item_details_publication_shape_check
    check (
      (publication_state = 'draft'
        and publication_origin is null
        and published_by is null
        and published_at is null
        and publication_request_id is null)
      or
      (publication_state = 'published' and (
        (publication_origin = 'legacy_backfill' and published_at is not null)
        or
        (publication_origin = 'command'
          and published_by is not null
          and published_at is not null
          and publication_request_id is not null)
      ))
    ),
  add constraint project_cost_item_details_published_amount_check
    check (publication_state <> 'published' or amount_text is not null),
  add constraint project_cost_item_details_draft_retention_shape_check
    check (amount_text is not null or (retention_kind is null and retention_rate_bps is null and retention_amount_text is null)),
  add constraint project_cost_item_details_opening_balance_legacy_check
    check (detail_kind <> 'opening_balance' or publication_origin = 'legacy_backfill');

create index project_cost_item_details_publication_scope_idx
  on public.project_cost_item_details(tenant_id, company_id, publication_state, project_cost_item_id, line_no, id);

create or replace function private.c1_sync_project_cost_item_amount(target_project_cost_item_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_company_id uuid;
  v_publication_state text;
  v_amount numeric;
begin
  select item.tenant_id, item.company_id, item.publication_state
  into v_tenant_id, v_company_id, v_publication_state
  from public.project_cost_items item
  where item.id = target_project_cost_item_id
  for update;
  if not found then return; end if;

  select coalesce(sum(detail.amount_text::numeric), 0) into v_amount
  from public.project_cost_item_details detail
  where detail.project_cost_item_id = target_project_cost_item_id
    and detail.tenant_id = v_tenant_id
    and detail.company_id = v_company_id
    and (v_publication_state = 'draft' or detail.publication_state = 'published');

  if exists (
    select 1 from public.project_cost_items item
    where item.id = target_project_cost_item_id and item.amount is distinct from v_amount
  ) then
    perform set_config('taskovia.project_cost_detail_sync', '1', true);
    update public.project_cost_items item
    set amount = v_amount, amount_text = v_amount::text, version = item.version + 1, updated_at = now()
    where item.id = target_project_cost_item_id;
    perform set_config('taskovia.project_cost_detail_sync', '0', true);
  end if;
end;
$$;

create function private.c1_can_read_project_cost_detail(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_cost_item_id uuid,
  target_publication_state text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_cost_settings settings
    join public.project_cost_items item
      on item.id = target_project_cost_item_id
     and item.tenant_id = target_tenant_id
     and item.company_id = target_company_id
    where settings.tenant_id = target_tenant_id
      and settings.company_id = target_company_id
      and settings.enabled
      and (
        (target_publication_state = 'published'
          and private.has_company_permission(target_tenant_id, target_company_id, 'cost.read'))
        or
        (target_publication_state = 'draft'
          and private.has_company_permission(target_tenant_id, target_company_id, 'cost.prepare'))
      )
  );
$$;

revoke all on function private.c1_can_read_project_cost_detail(uuid, uuid, uuid, text) from public, anon, authenticated;

drop policy c1_project_cost_item_details_select on public.project_cost_item_details;
create policy c1_project_cost_item_details_select
  on public.project_cost_item_details for select to authenticated
  using (private.c1_can_read_project_cost_detail(tenant_id, company_id, project_cost_item_id, publication_state));

create function private.c1_resolve_or_create_ordinary_project_cost_item(
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
  v_item_id uuid;
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
  select item.id into v_item_id
  from public.project_cost_items item
  where item.tenant_id = target_tenant_id
    and item.company_id = target_company_id
    and item.project_id = target_project_id
    and item.cost_category_id = target_cost_category_id
  for update;
  if found then return v_item_id; end if;

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
  ) returning id into v_item_id;
  return v_item_id;
end;
$$;

revoke all on function private.c1_resolve_or_create_ordinary_project_cost_item(uuid, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.c1_read_project_cost_draft_management_metadata(target_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_tenant_id uuid;
begin
  if v_actor_id is null then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  select membership.tenant_id into v_tenant_id
  from public.company_memberships membership
  where membership.company_id = target_company_id and membership.user_id = v_actor_id and membership.is_active;
  if v_tenant_id is null or not exists (
    select 1 from public.company_cost_settings settings
    where settings.tenant_id = v_tenant_id and settings.company_id = target_company_id and settings.enabled
  ) or not (
    private.has_company_permission(v_tenant_id, target_company_id, 'cost.manage')
    or private.has_company_permission(v_tenant_id, target_company_id, 'cost.prepare')
  ) then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;

  return pg_catalog.jsonb_build_object(
    'projects', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', project.id, 'code', project.code, 'name', project.name) order by project.code, project.id)
      from public.projects project
      where project.tenant_id = v_tenant_id and project.company_id = target_company_id
    ), '[]'::jsonb),
    'categories', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'categoryId', category.id, 'code', category.code, 'name', category.name,
        'isActive', category.is_active, 'draftEligible', category.is_active and category.posting_strategy = 'ordinary_detail',
        'postingStrategy', category.posting_strategy
      ) order by category.display_order, category.id)
      from public.cost_categories category
      where category.tenant_id = v_tenant_id and category.company_id = target_company_id
    ), '[]'::jsonb)
  );
end;
$$;

notify pgrst, 'reload schema';
