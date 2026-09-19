create function private.c1_read_project_cost_read_context(
  target_company_id uuid,
  target_project_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_actor_id uuid;
  v_tenant_id uuid;
  v_project record;
  v_settings record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  v_context := private.c1_master_context(target_company_id, 'cost.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;

  if (v_context->>'actorId')::uuid is distinct from v_actor_id then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  select p.id, p.code, p.name into v_project
  from public.projects p
  where p.tenant_id = v_tenant_id
    and p.company_id = target_company_id
    and p.id = target_project_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  select s.default_currency_code, s.money_scale, s.time_zone into v_settings
  from public.company_cost_settings s
  where s.tenant_id = v_tenant_id
    and s.company_id = target_company_id
    and s.enabled = true;

  if not found then
    raise exception using errcode = 'P0001', message = 'MODULE_DISABLED';
  end if;

  return jsonb_build_object(
    'projectId', v_project.id,
    'projectCode', v_project.code,
    'projectName', v_project.name,
    'defaultCurrencyCode', v_settings.default_currency_code,
    'moneyScale', v_settings.money_scale,
    'timeZone', v_settings.time_zone
  );
end;
$$;
create function public.c1_read_project_cost_read_context(
  target_company_id uuid,
  target_project_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.c1_read_project_cost_read_context(target_company_id, target_project_id);
$$;
revoke all on function private.c1_read_project_cost_read_context(uuid, uuid) from public, anon, authenticated;
revoke all on function public.c1_read_project_cost_read_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.c1_read_project_cost_read_context(uuid, uuid) to authenticated;
