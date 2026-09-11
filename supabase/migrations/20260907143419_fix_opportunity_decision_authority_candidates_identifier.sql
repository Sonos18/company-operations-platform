create or replace function public.list_opportunity_decision_authority_candidates(
  target_company_id uuid, target_opportunity_id uuid, target_cycle_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare context jsonb; v_tenant_id uuid;
begin
  context := private.stage01_actor_context(target_company_id, 'opportunity.decision_authority.assign');
  v_tenant_id := (context ->> 'tenantId')::uuid;
  if not private.company_opportunity_decision_authority_enabled(v_tenant_id, target_company_id) then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_NOT_ENABLED';
  end if;
  if not exists (
    select 1 from public.stage01_decision_cycles cycle
    where cycle.id = target_cycle_id and cycle.tenant_id = v_tenant_id
      and cycle.company_id = target_company_id and cycle.opportunity_id = target_opportunity_id
  ) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
  return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object(
    'userId', employee.user_id, 'employeeId', employee.id, 'displayName', employee.full_name, 'positionTitle', position.name
  ) order by employee.full_name, employee.id)
  from public.employees employee
  join public.company_memberships membership on membership.tenant_id = employee.tenant_id and membership.company_id = employee.company_id and membership.user_id = employee.user_id and membership.is_active
  left join public.positions position on position.id = employee.position_id and position.tenant_id = employee.tenant_id and position.company_id = employee.company_id
  where employee.tenant_id = v_tenant_id and employee.company_id = target_company_id and employee.employment_status = 'active'
    and private.opportunity_decision_authority_eligible(v_tenant_id, target_company_id, employee.user_id)), '[]'::jsonb));
end;
$$;
