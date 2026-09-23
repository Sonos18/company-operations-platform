set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 2);

do $$
begin
  if to_regclass('public.project_cost_items') is null
    or to_regclass('public.project_cost_item_details') is null
    or to_regclass('public.project_cost_item_sources') is null
    or to_regprocedure('private.c1_can_read_project_cost(uuid,uuid)') is null then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTING_WRITE_BASELINE_MISSING';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_cost_items' and column_name = 'publication_state'
  ) then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTING_WRITE_PUBLICATION_ALREADY_EXISTS';
  end if;
end;
$$;

alter table public.project_cost_items
  add column publication_state text,
  add column publication_origin text,
  add column published_by uuid references auth.users(id) on delete restrict,
  add column published_at timestamptz,
  add column publication_request_id uuid;

update public.project_cost_items
set publication_state = 'published',
    publication_origin = 'legacy_backfill',
    published_at = updated_at;

alter table public.project_cost_items
  alter column publication_state set not null,
  alter column publication_state set default 'draft',
  alter column amount drop not null,
  alter column amount_text drop not null,
  add constraint project_cost_items_publication_state_check
    check (publication_state in ('draft', 'published')),
  add constraint project_cost_items_publication_origin_check
    check (publication_origin is null or publication_origin in ('legacy_backfill', 'command')),
  add constraint project_cost_items_amount_pair_check
    check ((amount is null) = (amount_text is null)),
  add constraint project_cost_items_published_amount_check
    check (publication_state <> 'published' or (amount is not null and amount_text is not null)),
  add constraint project_cost_items_publication_shape_check
    check (
      (publication_state = 'draft'
        and publication_origin is null
        and published_by is null
        and published_at is null
        and publication_request_id is null)
      or
      (publication_state = 'published' and (
        (publication_origin = 'legacy_backfill'
          and published_by is null
          and published_at is not null
          and publication_request_id is null)
        or
        (publication_origin = 'command'
          and published_by is not null
          and published_at is not null
          and publication_request_id is not null)
      ))
    );

create index project_cost_items_publication_scope_idx
  on public.project_cost_items(tenant_id, company_id, publication_state, project_id, created_at, id);

create function private.c1_can_read_project_cost_item(
  target_tenant_id uuid,
  target_company_id uuid,
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
    where settings.tenant_id = target_tenant_id
      and settings.company_id = target_company_id
      and settings.enabled
  ) and (
    (target_publication_state = 'published'
      and private.has_company_permission(target_tenant_id, target_company_id, 'cost.read'))
    or
    (target_publication_state = 'draft' and (
      private.has_company_permission(target_tenant_id, target_company_id, 'cost.manage')
      or private.has_company_permission(target_tenant_id, target_company_id, 'cost.prepare')
    ))
  );
$$;

create function private.c1_can_read_project_cost_child(
  target_tenant_id uuid,
  target_company_id uuid,
  target_project_cost_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_cost_items item
    where item.id = target_project_cost_item_id
      and item.tenant_id = target_tenant_id
      and item.company_id = target_company_id
      and private.c1_can_read_project_cost_item(item.tenant_id, item.company_id, item.publication_state)
  );
$$;

revoke all on function private.c1_can_read_project_cost_item(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.c1_can_read_project_cost_child(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.c1_can_read_project_cost_item(uuid, uuid, text) to authenticated;
grant execute on function private.c1_can_read_project_cost_child(uuid, uuid, uuid) to authenticated;

drop policy c1_project_cost_items_select on public.project_cost_items;
create policy c1_project_cost_items_select
  on public.project_cost_items for select to authenticated
  using (private.c1_can_read_project_cost_item(tenant_id, company_id, publication_state));

drop policy c1_project_cost_item_details_select on public.project_cost_item_details;
create policy c1_project_cost_item_details_select
  on public.project_cost_item_details for select to authenticated
  using (private.c1_can_read_project_cost_child(tenant_id, company_id, project_cost_item_id));

drop policy c1_project_cost_item_sources_select on public.project_cost_item_sources;
create policy c1_project_cost_item_sources_select
  on public.project_cost_item_sources for select to authenticated
  using (private.c1_can_read_project_cost_child(tenant_id, company_id, project_cost_item_id));

revoke all on function public.c1_create_project_cost_item(uuid, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.c1_update_project_cost_item(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.c1_correct_project_cost_item(uuid, uuid, jsonb, uuid) from public, anon, authenticated;

do $$
declare
  v_tenant_id constant uuid := '10000000-0000-4000-8000-000000000010'::uuid;
  v_company_id constant uuid := '10000000-0000-4000-8000-000000000020'::uuid;
  v_accountant_role_id uuid;
  v_operator_role_id uuid;
  v_accountant_before text[];
  v_accountant_after text[];
  v_operator_before text[];
  v_operator_after text[];
  v_other_permissions_before jsonb;
  v_other_permissions_after jsonb;
  v_required_catalog constant text[] := array[
    'cost.read','cost.source.read','cost.file.read','cost.manage','cost.prepare',
    'cost.publish_import','cost.correct','cost.record_cash'
  ]::text[];
begin
  select role.id into v_accountant_role_id
  from public.roles role
  where role.id = '10000000-0000-4000-8000-000000000307'::uuid
    and role.tenant_id = v_tenant_id
    and role.company_id = v_company_id
    and role.code = 'accountant'
    and role.is_active;
  if v_accountant_role_id is null then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTANT_WRITE_ROLE_SCOPE_DRIFT';
  end if;

  select role.id into v_operator_role_id
  from public.roles role
  where role.tenant_id = v_tenant_id
    and role.company_id = v_company_id
    and role.code = 'c1_vqh_cost_operator'
    and role.is_active;
  if v_operator_role_id is null then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTING_WRITE_OPERATOR_SCOPE_DRIFT';
  end if;

  if (select array_agg(permission.code order by permission.code)
      from public.permissions permission
      where permission.code = any(v_required_catalog)) is distinct from
     (select array_agg(code order by code) from unnest(v_required_catalog) code) then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTING_WRITE_PERMISSION_CATALOG_DRIFT';
  end if;

  select array_agg(permission_code order by permission_code) into v_accountant_before
  from public.role_permissions where role_id = v_accountant_role_id;
  if v_accountant_before is distinct from array[
    'accounting_document.read','accounting_document.update','cost.read','cost.source.read',
    'inventory_value.read','supplier.read'
  ]::text[] then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTING_WRITE_ACCOUNTANT_PRESTATE_DRIFT';
  end if;

  select array_agg(permission_code order by permission_code) into v_operator_before
  from public.role_permissions where role_id = v_operator_role_id;
  if v_operator_before is distinct from array['cost.correct','cost.manage']::text[] then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTING_WRITE_OPERATOR_PRESTATE_DRIFT';
  end if;

  select coalesce(jsonb_agg(jsonb_build_array(role_id, permission_code) order by role_id, permission_code), '[]'::jsonb)
  into v_other_permissions_before
  from public.role_permissions
  where role_id not in (v_accountant_role_id, v_operator_role_id);

  insert into public.role_permissions(role_id, permission_code)
  select v_accountant_role_id, permission_code
  from unnest(array[
    'cost.file.read','cost.manage','cost.prepare','cost.publish_import','cost.correct','cost.record_cash'
  ]::text[]) permission_code
  on conflict do nothing;

  select array_agg(permission_code order by permission_code) into v_accountant_after
  from public.role_permissions where role_id = v_accountant_role_id;
  if v_accountant_after is distinct from array[
    'accounting_document.read','accounting_document.update','cost.correct','cost.file.read',
    'cost.manage','cost.prepare','cost.publish_import','cost.read','cost.record_cash',
    'cost.source.read','inventory_value.read','supplier.read'
  ]::text[] then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTING_WRITE_ACCOUNTANT_POSTSTATE_FAILED';
  end if;

  select array_agg(permission_code order by permission_code) into v_operator_after
  from public.role_permissions where role_id = v_operator_role_id;
  if v_operator_after is distinct from v_operator_before then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTING_WRITE_OPERATOR_CHANGED';
  end if;

  select coalesce(jsonb_agg(jsonb_build_array(role_id, permission_code) order by role_id, permission_code), '[]'::jsonb)
  into v_other_permissions_after
  from public.role_permissions
  where role_id not in (v_accountant_role_id, v_operator_role_id);
  if v_other_permissions_after is distinct from v_other_permissions_before then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTING_WRITE_UNRELATED_ROLE_CHANGED';
  end if;
end;
$$;

notify pgrst, 'reload schema';
