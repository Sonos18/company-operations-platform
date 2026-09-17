create function private.c1_read_project_cost_project_metadata(
  target_company_id uuid,
  target_project_ids uuid[]
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
  v_result jsonb;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  v_context := private.c1_master_context(target_company_id, 'cost.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('projectId', project.id, 'projectCode', project.code, 'projectName', project.name)
      order by project.code, project.id
    ),
    '[]'::jsonb
  ) into v_result
  from public.projects project
  where project.tenant_id = v_tenant_id
    and project.company_id = target_company_id
    and project.id = any(target_project_ids);

  return v_result;
end;
$$;

create function public.c1_read_project_cost_project_metadata(
  target_company_id uuid,
  target_project_ids uuid[]
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.c1_read_project_cost_project_metadata(target_company_id, target_project_ids);
$$;

revoke all on function private.c1_read_project_cost_project_metadata(uuid,uuid[]) from public, anon, authenticated;
revoke all on function public.c1_read_project_cost_project_metadata(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.c1_read_project_cost_project_metadata(uuid,uuid[]) to authenticated;
