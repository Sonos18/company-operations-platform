set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 16);

do $$
begin
  if to_regprocedure('private.has_company_permission(uuid,uuid,text)') is null
    or to_regclass('public.projects') is null
    or to_regclass('public.cost_categories') is null
    or to_regclass('public.company_cost_settings') is null then
    raise exception using errcode = 'P0001', message = 'C1_DRAFT_METADATA_BASELINE_MISSING';
  end if;
  if to_regprocedure('public.c1_read_project_cost_draft_management_metadata(uuid)') is not null then
    raise exception using errcode = 'P0001', message = 'C1_DRAFT_METADATA_ALREADY_APPLIED';
  end if;
end $$;

create function public.c1_read_project_cost_draft_management_metadata(target_company_id uuid)
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
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  select membership.tenant_id
  into v_tenant_id
  from public.company_memberships membership
  where membership.company_id = target_company_id
    and membership.user_id = v_actor_id
    and membership.is_active;

  if v_tenant_id is null
    or not exists (
      select 1 from public.company_cost_settings settings
      where settings.tenant_id = v_tenant_id
        and settings.company_id = target_company_id
        and settings.enabled
    ) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  if not (
    private.has_company_permission(v_tenant_id, target_company_id, 'cost.manage')
    or private.has_company_permission(v_tenant_id, target_company_id, 'cost.prepare')
  ) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  return pg_catalog.jsonb_build_object(
    'projects', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', project.id, 'code', project.code, 'name', project.name)
        order by project.code, project.id
      )
      from public.projects project
      where project.tenant_id = v_tenant_id
        and project.company_id = target_company_id
    ), '[]'::jsonb),
    'categories', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'categoryId', category.id,
          'code', category.code,
          'name', category.name,
          'isActive', category.is_active,
          'draftEligible', category.is_active and category.code <> 'subcontract_labor'
        )
        order by category.display_order, category.id
      )
      from public.cost_categories category
      where category.tenant_id = v_tenant_id
        and category.company_id = target_company_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.c1_read_project_cost_draft_management_metadata(uuid) from public, anon;
grant execute on function public.c1_read_project_cost_draft_management_metadata(uuid) to authenticated;

notify pgrst, 'reload schema';
