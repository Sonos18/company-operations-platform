revoke all on function public.transition_opportunity_decision_policy(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
drop function public.transition_opportunity_decision_policy(uuid, uuid, uuid, jsonb);

do $$
declare
  routine regprocedure;
begin
  for routine in
    select proc.oid::regprocedure
    from pg_catalog.pg_proc proc
    join pg_catalog.pg_namespace namespace on namespace.oid = proc.pronamespace
    where (
      namespace.nspname in ('public', 'private')
      and proc.pronargs = 4
      and proc.proname ~ '^transition_.*_legacy_opportunity_decision_policy$'
    ) or (
      namespace.nspname = 'private'
      and proc.pronargs = 3
      and proc.proname ~ '_opportunity_decision_policy_snapshot$'
    )
    order by case
      when namespace.nspname = 'public' then 1
      when proc.pronargs = 4 then 2
      else 3
    end
  loop
    execute format('drop function %s', routine);
  end loop;
end;
$$;

alter table public.opportunity_decision_policy_binding_events
  drop constraint opportunity_decision_policy_binding_events_transition_metadata_check;

alter table public.opportunity_decision_policy_binding_events
  add constraint opportunity_decision_policy_binding_events_transition_metadata_check check (
    (action = 'new_cycle' and transition_code is null and reason is null)
    or (
      action = 'legacy_transition'
      and nullif(btrim(transition_code), '') is not null
      and nullif(btrim(reason), '') is not null
    )
  );

create or replace function public.get_opportunity_decision_authority_projection(target_company_id uuid, target_opportunity_id uuid, target_cycle_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  context jsonb;
  tenant_id uuid;
  cycle public.stage01_decision_cycles%rowtype;
  event public.opportunity_decision_authority_events%rowtype;
  employee_id uuid;
  eligible boolean;
  policy_binding jsonb;
begin
  context := private.stage01_actor_context(target_company_id, 'opportunity.read');
  tenant_id := (context ->> 'tenantId')::uuid;
  select * into cycle from public.stage01_decision_cycles cycle_row
  where cycle_row.id = target_cycle_id and cycle_row.tenant_id = tenant_id
    and cycle_row.company_id = target_company_id and cycle_row.opportunity_id = target_opportunity_id;
  if cycle.id is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
  if not private.company_opportunity_decision_authority_enabled(tenant_id, target_company_id) then
    return jsonb_build_object(
      'status', 'not_required', 'userId', null, 'employeeId', null, 'displayName', null,
      'positionTitle', null, 'currentActorIsAuthority', false, 'locked', cycle.final_outcome is not null,
      'policyBinding', jsonb_build_object('status', 'not_required', 'policySnapshotId', null)
    );
  end if;
  policy_binding := jsonb_build_object(
    'status', case when cycle.decision_policy_snapshot_id is null then 'legacy_unbound' else 'bound' end,
    'policySnapshotId', cycle.decision_policy_snapshot_id
  );
  if cycle.authority_resolution_event_id is null then
    if cycle.decision_authority_user_id is null and cycle.authority_resolution_reference is null then
      return jsonb_build_object('status','unresolved','userId',null,'employeeId',null,'displayName',null,'positionTitle',null,'currentActorIsAuthority',false,'locked',cycle.final_outcome is not null,'policyBinding',policy_binding);
    end if;
    if cycle.decision_authority_user_id is not null and cycle.authority_resolution_reference is null then
      return jsonb_build_object('status','legacy_unknown','userId',cycle.decision_authority_user_id,'employeeId',null,'displayName',null,'positionTitle',null,'currentActorIsAuthority',auth.uid() = cycle.decision_authority_user_id,'locked',cycle.final_outcome is not null,'policyBinding',policy_binding);
    end if;
    return jsonb_build_object('status','invalid','userId',cycle.decision_authority_user_id,'employeeId',null,'displayName',null,'positionTitle',null,'currentActorIsAuthority',false,'locked',cycle.final_outcome is not null,'policyBinding',policy_binding);
  end if;
  select * into event from public.opportunity_decision_authority_events event_row
  where event_row.id = cycle.authority_resolution_event_id
    and event_row.tenant_id = cycle.tenant_id and event_row.company_id = cycle.company_id
    and event_row.opportunity_id = cycle.opportunity_id and event_row.decision_cycle_id = cycle.id;
  select employee.id into employee_id from public.employees employee
  where employee.tenant_id = cycle.tenant_id and employee.company_id = cycle.company_id and employee.user_id = cycle.decision_authority_user_id;
  eligible := event.id is not null and cycle.decision_authority_user_id = event.authority_user_id
    and cycle.authority_resolution_reference = event.id::text
    and private.opportunity_decision_authority_eligible(cycle.tenant_id, cycle.company_id, cycle.decision_authority_user_id);
  return jsonb_build_object('status', case when eligible then 'resolved' else 'invalid' end, 'userId',cycle.decision_authority_user_id,
    'employeeId',employee_id,'displayName',event.authority_display_name_snapshot,'positionTitle',event.authority_position_snapshot,
    'currentActorIsAuthority',auth.uid() = cycle.decision_authority_user_id,'locked',cycle.final_outcome is not null,'policyBinding',policy_binding);
end;
$$;
