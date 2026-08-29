create function private.assert_stage01_command_keys(target_input jsonb, allowed_keys text[])
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if target_input is null or pg_catalog.jsonb_typeof(target_input) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(target_input) as supplied(key)
    where not (supplied.key = any(allowed_keys))
  ) then
    raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
  end if;
end;
$$;

create function private.execute_stage01_opportunity_command(
  command_name text,
  target_company_id uuid,
  target_resource_id uuid,
  target_secondary_id uuid,
  target_input jsonb,
  target_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
end;
$$;

create function private.create_stage01_opportunity(target_company_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('create_opportunity', target_company_id, null, null, target_input, target_request_id) $$;
create function public.create_stage01_opportunity(target_company_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.create_stage01_opportunity(target_company_id, target_input, target_request_id) $$;

create function private.update_opportunity_current_data(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('update_opportunity', target_company_id, target_opportunity_id, null, target_input, target_request_id) $$;
create function public.update_opportunity_current_data(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.update_opportunity_current_data(target_company_id, target_opportunity_id, target_input, target_request_id) $$;

create function private.create_contact(target_company_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('create_contact', target_company_id, null, null, target_input, target_request_id) $$;
create function public.create_contact(target_company_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.create_contact(target_company_id, target_input, target_request_id) $$;

create function private.update_contact(target_company_id uuid, target_contact_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('update_contact', target_company_id, target_contact_id, null, target_input, target_request_id) $$;
create function public.update_contact(target_company_id uuid, target_contact_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.update_contact(target_company_id, target_contact_id, target_input, target_request_id) $$;

create function private.add_contact_method(target_company_id uuid, target_contact_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('add_contact_method', target_company_id, target_contact_id, null, target_input, target_request_id) $$;
create function public.add_contact_method(target_company_id uuid, target_contact_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.add_contact_method(target_company_id, target_contact_id, target_input, target_request_id) $$;

create function private.update_contact_method(target_company_id uuid, target_contact_id uuid, target_method_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('update_contact_method', target_company_id, target_contact_id, target_method_id, target_input, target_request_id) $$;
create function public.update_contact_method(target_company_id uuid, target_contact_id uuid, target_method_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.update_contact_method(target_company_id, target_contact_id, target_method_id, target_input, target_request_id) $$;

create function private.link_opportunity_contact(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('link_contact', target_company_id, target_opportunity_id, null, target_input, target_request_id) $$;
create function public.link_opportunity_contact(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.link_opportunity_contact(target_company_id, target_opportunity_id, target_input, target_request_id) $$;

create function private.set_opportunity_primary_contact(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('set_primary_contact', target_company_id, target_opportunity_id, null, target_input, target_request_id) $$;
create function public.set_opportunity_primary_contact(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.set_opportunity_primary_contact(target_company_id, target_opportunity_id, target_input, target_request_id) $$;

create function private.end_opportunity_contact(target_company_id uuid, target_opportunity_id uuid, target_relationship_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('end_contact', target_company_id, target_opportunity_id, target_relationship_id, target_input, target_request_id) $$;
create function public.end_opportunity_contact(target_company_id uuid, target_opportunity_id uuid, target_relationship_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.end_opportunity_contact(target_company_id, target_opportunity_id, target_relationship_id, target_input, target_request_id) $$;

create function private.add_opportunity_scope(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('add_scope', target_company_id, target_opportunity_id, null, target_input, target_request_id) $$;
create function public.add_opportunity_scope(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.add_opportunity_scope(target_company_id, target_opportunity_id, target_input, target_request_id) $$;

create function private.retire_opportunity_scope(target_company_id uuid, target_opportunity_id uuid, target_scope_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('retire_scope', target_company_id, target_opportunity_id, target_scope_id, target_input, target_request_id) $$;
create function public.retire_opportunity_scope(target_company_id uuid, target_opportunity_id uuid, target_scope_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.retire_opportunity_scope(target_company_id, target_opportunity_id, target_scope_id, target_input, target_request_id) $$;

create function private.add_opportunity_referrer(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('add_referrer', target_company_id, target_opportunity_id, null, target_input, target_request_id) $$;
create function public.add_opportunity_referrer(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.add_opportunity_referrer(target_company_id, target_opportunity_id, target_input, target_request_id) $$;

create function private.set_opportunity_primary_referrer(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('set_primary_referrer', target_company_id, target_opportunity_id, null, target_input, target_request_id) $$;
create function public.set_opportunity_primary_referrer(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.set_opportunity_primary_referrer(target_company_id, target_opportunity_id, target_input, target_request_id) $$;

create function private.end_opportunity_referrer(target_company_id uuid, target_opportunity_id uuid, target_referrer_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('end_referrer', target_company_id, target_opportunity_id, target_referrer_id, target_input, target_request_id) $$;
create function public.end_opportunity_referrer(target_company_id uuid, target_opportunity_id uuid, target_referrer_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.end_opportunity_referrer(target_company_id, target_opportunity_id, target_referrer_id, target_input, target_request_id) $$;

create function private.append_opportunity_intake_record(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('append_intake', target_company_id, target_opportunity_id, null, target_input, target_request_id) $$;
create function public.append_opportunity_intake_record(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.append_opportunity_intake_record(target_company_id, target_opportunity_id, target_input, target_request_id) $$;

create function private.correct_opportunity_intake_record(target_company_id uuid, target_opportunity_id uuid, target_record_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('correct_intake', target_company_id, target_opportunity_id, target_record_id, target_input, target_request_id) $$;
create function public.correct_opportunity_intake_record(target_company_id uuid, target_opportunity_id uuid, target_record_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.correct_opportunity_intake_record(target_company_id, target_opportunity_id, target_record_id, target_input, target_request_id) $$;

create function private.raise_opportunity_duplicate_concern(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = ''
as $$ select private.execute_stage01_opportunity_command('raise_duplicate', target_company_id, target_opportunity_id, null, target_input, target_request_id) $$;
create function public.raise_opportunity_duplicate_concern(target_company_id uuid, target_opportunity_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.raise_opportunity_duplicate_concern(target_company_id, target_opportunity_id, target_input, target_request_id) $$;

create function private.assert_stage01_required_keys(target_input jsonb, required_keys text[])
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if not (target_input ?& required_keys) then
    raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
  end if;
end;
$$;

create function private.stage01_actor_context(target_company_id uuid, target_permission text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  tenant_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select membership.tenant_id
  into tenant_id
  from public.company_memberships as membership
  where membership.company_id = target_company_id
    and membership.user_id = actor_id
    and membership.is_active;

  if tenant_id is null then
    raise exception using errcode = 'P0001', message = 'COMPANY_FORBIDDEN';
  end if;

  if not private.has_company_permission(tenant_id, target_company_id, target_permission) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  return pg_catalog.jsonb_build_object('actorId', actor_id, 'tenantId', tenant_id);
end;
$$;

create function private.write_stage01_audit(
  target_tenant_id uuid,
  target_company_id uuid,
  target_actor_id uuid,
  target_action text,
  target_resource_type text,
  target_resource_id text,
  target_request_id uuid,
  target_before jsonb,
  target_after jsonb
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_events (
    tenant_id, company_id, actor_id, action, resource_type, resource_id,
    request_id, before_summary, after_summary
  ) values (
    target_tenant_id, target_company_id, target_actor_id, target_action,
    target_resource_type, target_resource_id, target_request_id,
    target_before, target_after
  );
$$;

create or replace function private.execute_stage01_opportunity_command(
  command_name text,
  target_company_id uuid,
  target_resource_id uuid,
  target_secondary_id uuid,
  target_input jsonb,
  target_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  permission_code text;
  context jsonb;
  actor_id uuid;
  tenant_id uuid;
  current_version bigint;
  opportunity_id uuid;
  contact_id uuid;
  created_id uuid;
  definition_id uuid;
  definition_json jsonb;
  workflow_id uuid;
  intake_node_id uuid;
  evaluation_node_id uuid;
  intake_execution_id uuid;
  evaluation_execution_id uuid;
  decision_cycle_id uuid;
  old_summary jsonb;
  new_summary jsonb;
begin
  permission_code := case command_name
    when 'create_opportunity' then 'opportunity.create'
    when 'update_opportunity' then 'opportunity.update'
    when 'create_contact' then 'opportunity.contact.manage'
    when 'update_contact' then 'opportunity.contact.manage'
    when 'add_contact_method' then 'opportunity.contact.manage'
    when 'update_contact_method' then 'opportunity.contact.manage'
    when 'link_contact' then 'opportunity.contact.manage'
    when 'set_primary_contact' then 'opportunity.contact.manage'
    when 'end_contact' then 'opportunity.contact.manage'
    when 'add_scope' then 'opportunity.scope.manage'
    when 'retire_scope' then 'opportunity.scope.manage'
    when 'add_referrer' then 'opportunity.referrer.manage'
    when 'set_primary_referrer' then 'opportunity.referrer.manage'
    when 'end_referrer' then 'opportunity.referrer.manage'
    when 'append_intake' then 'opportunity.intake_record.create'
    when 'correct_intake' then 'opportunity.intake_record.create'
    when 'raise_duplicate' then 'opportunity.duplicate.raise'
    else null
  end;

  if permission_code is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
  end if;

  context := private.stage01_actor_context(target_company_id, permission_code);
  actor_id := (context ->> 'actorId')::uuid;
  tenant_id := (context ->> 'tenantId')::uuid;

  if command_name = 'create_opportunity' then
    perform private.assert_stage01_command_keys(target_input, array[
      'primaryCustomerName', 'customerTypeCode', 'needDescription', 'locationStatus',
      'locationText', 'primaryLeadSourceCode', 'engagementStatusCode', 'budgetStatusCode',
      'budgetMin', 'budgetMax', 'currencyCode', 'budgetNote', 'timelineStatusCode',
      'timelineStartDate', 'timelineEndDate', 'timelineNote', 'priorityCode'
    ]);
    perform private.assert_stage01_required_keys(target_input, array['primaryCustomerName']);
    if nullif(pg_catalog.btrim(target_input ->> 'primaryCustomerName'), '') is null then
      raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
    end if;

    select definition.id, definition.definition
    into definition_id, definition_json
    from public.workflow_definition_snapshots as definition
    where definition.tenant_id = tenant_id
      and definition.company_id = target_company_id
      and definition.workflow_key = 'vqh.stage01'
    order by definition.template_version desc
    limit 1;

    if definition_id is null then
      raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE';
    end if;
    perform private.assert_valid_stage01_definition(definition_json);

    opportunity_id := pg_catalog.gen_random_uuid();
    workflow_id := pg_catalog.gen_random_uuid();
    intake_node_id := pg_catalog.gen_random_uuid();
    evaluation_node_id := pg_catalog.gen_random_uuid();
    intake_execution_id := pg_catalog.gen_random_uuid();
    evaluation_execution_id := pg_catalog.gen_random_uuid();
    decision_cycle_id := pg_catalog.gen_random_uuid();

    insert into public.opportunities (
      id, tenant_id, company_id, primary_customer_name, customer_type_code,
      need_description, location_status, location_text, primary_lead_source_code,
      engagement_status_code, budget_status_code, budget_min, budget_max,
      currency_code, budget_note, timeline_status_code, timeline_start_date,
      timeline_end_date, timeline_note, priority_code, created_by
    ) values (
      opportunity_id, tenant_id, target_company_id,
      pg_catalog.btrim(target_input ->> 'primaryCustomerName'),
      nullif(pg_catalog.btrim(target_input ->> 'customerTypeCode'), ''),
      nullif(pg_catalog.btrim(target_input ->> 'needDescription'), ''),
      coalesce(nullif(target_input ->> 'locationStatus', ''), 'unknown'),
      nullif(pg_catalog.btrim(target_input ->> 'locationText'), ''),
      nullif(pg_catalog.btrim(target_input ->> 'primaryLeadSourceCode'), ''),
      nullif(pg_catalog.btrim(target_input ->> 'engagementStatusCode'), ''),
      nullif(pg_catalog.btrim(target_input ->> 'budgetStatusCode'), ''),
      case when target_input ? 'budgetMin' then (target_input ->> 'budgetMin')::numeric end,
      case when target_input ? 'budgetMax' then (target_input ->> 'budgetMax')::numeric end,
      nullif(pg_catalog.upper(pg_catalog.btrim(target_input ->> 'currencyCode')), ''),
      nullif(pg_catalog.btrim(target_input ->> 'budgetNote'), ''),
      nullif(pg_catalog.btrim(target_input ->> 'timelineStatusCode'), ''),
      case when target_input ? 'timelineStartDate' then (target_input ->> 'timelineStartDate')::date end,
      case when target_input ? 'timelineEndDate' then (target_input ->> 'timelineEndDate')::date end,
      nullif(pg_catalog.btrim(target_input ->> 'timelineNote'), ''),
      nullif(pg_catalog.btrim(target_input ->> 'priorityCode'), ''),
      actor_id
    );

    insert into public.workflow_instances (
      id, tenant_id, company_id, subject_type, subject_id, definition_snapshot_id, created_by
    ) values (
      workflow_id, tenant_id, target_company_id, 'opportunity', opportunity_id, definition_id, actor_id
    );

    insert into public.workflow_node_instances (
      id, tenant_id, company_id, workflow_instance_id, node_key, node_type
    ) values
      (intake_node_id, tenant_id, target_company_id, workflow_id, '01.1', 'sub_stage'),
      (evaluation_node_id, tenant_id, target_company_id, workflow_id, '01.2', 'sub_stage');

    insert into public.workflow_node_executions (
      id, tenant_id, company_id, node_instance_id, execution_no
    ) values
      (intake_execution_id, tenant_id, target_company_id, intake_node_id, 1),
      (evaluation_execution_id, tenant_id, target_company_id, evaluation_node_id, 1);

    insert into public.stage01_decision_cycles (
      id, tenant_id, company_id, opportunity_id, node_execution_id, cycle_no, created_by
    ) values (
      decision_cycle_id, tenant_id, target_company_id, opportunity_id, evaluation_execution_id, 1, actor_id
    );

    insert into public.workflow_node_events (
      tenant_id, company_id, node_execution_id, event_type, actor_id, payload, request_id
    ) values
      (
        tenant_id, target_company_id, intake_execution_id, 'created', actor_id,
        pg_catalog.jsonb_build_object('nodeKey', '01.1', 'executionNo', 1), target_request_id
      ),
      (
        tenant_id, target_company_id, evaluation_execution_id, 'created', actor_id,
        pg_catalog.jsonb_build_object('nodeKey', '01.2', 'executionNo', 1, 'decisionCycleId', decision_cycle_id),
        target_request_id
      );

    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id, 'opportunity.created', 'opportunity',
      opportunity_id::text, target_request_id, null,
      pg_catalog.jsonb_build_object(
        'workflowInstanceId', workflow_id,
        'definitionSnapshotId', definition_id,
        'decisionCycleId', decision_cycle_id
      )
    );

    return pg_catalog.jsonb_build_object(
      'opportunityId', opportunity_id,
      'workflowInstanceId', workflow_id,
      'intakeNodeInstanceId', intake_node_id,
      'intakeExecutionId', intake_execution_id,
      'evaluationNodeInstanceId', evaluation_node_id,
      'evaluationExecutionId', evaluation_execution_id,
      'decisionCycleId', decision_cycle_id,
      'opportunityVersion', 0,
      'intakeExecutionVersion', 0,
      'evaluationExecutionVersion', 0,
      'decisionCycleVersion', 0
    );
  end if;

  if command_name = 'update_opportunity' then
    perform private.assert_stage01_command_keys(target_input, array[
      'primaryCustomerName', 'customerTypeCode', 'needDescription', 'locationStatus',
      'locationText', 'primaryLeadSourceCode', 'engagementStatusCode', 'budgetStatusCode',
      'budgetMin', 'budgetMax', 'currencyCode', 'budgetNote', 'timelineStatusCode',
      'timelineStartDate', 'timelineEndDate', 'timelineNote', 'priorityCode',
      'expectedOpportunityVersion'
    ]);
    perform private.assert_stage01_required_keys(target_input, array['expectedOpportunityVersion']);

    select opportunity.version, pg_catalog.to_jsonb(opportunity)
    into current_version, old_summary
    from public.opportunities as opportunity
    where opportunity.id = target_resource_id
      and opportunity.tenant_id = tenant_id
      and opportunity.company_id = target_company_id
    for update;
    if current_version is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
    if current_version is distinct from (target_input ->> 'expectedOpportunityVersion')::bigint then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;

    update public.opportunities as opportunity set
      primary_customer_name = case when target_input ? 'primaryCustomerName' then nullif(pg_catalog.btrim(target_input ->> 'primaryCustomerName'), '') else opportunity.primary_customer_name end,
      customer_type_code = case when target_input ? 'customerTypeCode' then nullif(pg_catalog.btrim(target_input ->> 'customerTypeCode'), '') else opportunity.customer_type_code end,
      need_description = case when target_input ? 'needDescription' then nullif(pg_catalog.btrim(target_input ->> 'needDescription'), '') else opportunity.need_description end,
      location_status = case when target_input ? 'locationStatus' then target_input ->> 'locationStatus' else opportunity.location_status end,
      location_text = case when target_input ? 'locationText' then nullif(pg_catalog.btrim(target_input ->> 'locationText'), '') else opportunity.location_text end,
      primary_lead_source_code = case when target_input ? 'primaryLeadSourceCode' then nullif(pg_catalog.btrim(target_input ->> 'primaryLeadSourceCode'), '') else opportunity.primary_lead_source_code end,
      engagement_status_code = case when target_input ? 'engagementStatusCode' then nullif(pg_catalog.btrim(target_input ->> 'engagementStatusCode'), '') else opportunity.engagement_status_code end,
      budget_status_code = case when target_input ? 'budgetStatusCode' then nullif(pg_catalog.btrim(target_input ->> 'budgetStatusCode'), '') else opportunity.budget_status_code end,
      budget_min = case when target_input ? 'budgetMin' then (target_input ->> 'budgetMin')::numeric else opportunity.budget_min end,
      budget_max = case when target_input ? 'budgetMax' then (target_input ->> 'budgetMax')::numeric else opportunity.budget_max end,
      currency_code = case when target_input ? 'currencyCode' then nullif(pg_catalog.upper(pg_catalog.btrim(target_input ->> 'currencyCode')), '') else opportunity.currency_code end,
      budget_note = case when target_input ? 'budgetNote' then nullif(pg_catalog.btrim(target_input ->> 'budgetNote'), '') else opportunity.budget_note end,
      timeline_status_code = case when target_input ? 'timelineStatusCode' then nullif(pg_catalog.btrim(target_input ->> 'timelineStatusCode'), '') else opportunity.timeline_status_code end,
      timeline_start_date = case when target_input ? 'timelineStartDate' then (target_input ->> 'timelineStartDate')::date else opportunity.timeline_start_date end,
      timeline_end_date = case when target_input ? 'timelineEndDate' then (target_input ->> 'timelineEndDate')::date else opportunity.timeline_end_date end,
      timeline_note = case when target_input ? 'timelineNote' then nullif(pg_catalog.btrim(target_input ->> 'timelineNote'), '') else opportunity.timeline_note end,
      priority_code = case when target_input ? 'priorityCode' then nullif(pg_catalog.btrim(target_input ->> 'priorityCode'), '') else opportunity.priority_code end,
      version = opportunity.version + 1,
      updated_at = pg_catalog.statement_timestamp()
    where opportunity.id = target_resource_id
      and opportunity.tenant_id = tenant_id
      and opportunity.company_id = target_company_id
    returning pg_catalog.to_jsonb(opportunity), opportunity.version into new_summary, current_version;

    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id, 'opportunity.updated', 'opportunity',
      target_resource_id::text, target_request_id, old_summary, new_summary
    );
    return pg_catalog.jsonb_build_object('opportunityId', target_resource_id, 'opportunityVersion', current_version);
  end if;

  if command_name = 'create_contact' then
    perform private.assert_stage01_command_keys(target_input, array['displayName', 'notes']);
    perform private.assert_stage01_required_keys(target_input, array['displayName']);
    if nullif(pg_catalog.btrim(target_input ->> 'displayName'), '') is null then
      raise exception using errcode = '22023', message = 'INVALID_COMMAND_INPUT';
    end if;
    created_id := pg_catalog.gen_random_uuid();
    insert into public.contacts (id, tenant_id, company_id, display_name, notes, created_by)
    values (
      created_id, tenant_id, target_company_id, pg_catalog.btrim(target_input ->> 'displayName'),
      nullif(pg_catalog.btrim(target_input ->> 'notes'), ''), actor_id
    );
    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id, 'contact.created', 'contact', created_id::text,
      target_request_id, null, pg_catalog.jsonb_build_object('displayName', target_input ->> 'displayName')
    );
    return pg_catalog.jsonb_build_object('contactId', created_id, 'contactVersion', 0);
  end if;

  if command_name = 'update_contact' then
    perform private.assert_stage01_command_keys(target_input, array['displayName', 'notes', 'expectedContactVersion']);
    perform private.assert_stage01_required_keys(target_input, array['expectedContactVersion']);
    select contact.version, pg_catalog.to_jsonb(contact)
    into current_version, old_summary
    from public.contacts as contact
    where contact.id = target_resource_id and contact.tenant_id = tenant_id and contact.company_id = target_company_id
    for update;
    if current_version is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
    if current_version is distinct from (target_input ->> 'expectedContactVersion')::bigint then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;
    update public.contacts as contact set
      display_name = case when target_input ? 'displayName' then pg_catalog.btrim(target_input ->> 'displayName') else contact.display_name end,
      notes = case when target_input ? 'notes' then nullif(pg_catalog.btrim(target_input ->> 'notes'), '') else contact.notes end,
      version = contact.version + 1,
      updated_at = pg_catalog.statement_timestamp()
    where contact.id = target_resource_id and contact.tenant_id = tenant_id and contact.company_id = target_company_id
    returning pg_catalog.to_jsonb(contact), contact.version into new_summary, current_version;
    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id, 'contact.updated', 'contact', target_resource_id::text,
      target_request_id, old_summary, new_summary
    );
    return pg_catalog.jsonb_build_object('contactId', target_resource_id, 'contactVersion', current_version);
  end if;

  if command_name in ('add_contact_method', 'update_contact_method') then
    perform private.assert_stage01_command_keys(target_input, array[
      'methodType', 'value', 'isUsable', 'reliabilityState', 'expectedContactVersion'
    ]);
    perform private.assert_stage01_required_keys(
      target_input,
      case when command_name = 'add_contact_method'
        then array['methodType', 'value', 'isUsable', 'expectedContactVersion']
        else array['expectedContactVersion']
      end
    );
    contact_id := target_resource_id;
    select contact.version into current_version
    from public.contacts as contact
    where contact.id = contact_id and contact.tenant_id = tenant_id and contact.company_id = target_company_id
    for update;
    if current_version is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
    if current_version is distinct from (target_input ->> 'expectedContactVersion')::bigint then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;

    if command_name = 'add_contact_method' then
      created_id := pg_catalog.gen_random_uuid();
      insert into public.contact_methods (
        id, tenant_id, company_id, contact_id, method_type, value, is_usable, reliability_state
      ) values (
        created_id, tenant_id, target_company_id, contact_id,
        target_input ->> 'methodType', pg_catalog.btrim(target_input ->> 'value'),
        (target_input ->> 'isUsable')::boolean,
        nullif(target_input ->> 'reliabilityState', '')
      );
    else
      created_id := target_secondary_id;
      if not exists (
        select 1 from public.contact_methods as method
        where method.id = created_id and method.contact_id = contact_id
          and method.tenant_id = tenant_id and method.company_id = target_company_id
      ) then
        raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND';
      end if;
      update public.contact_methods as method set
        method_type = case when target_input ? 'methodType' then target_input ->> 'methodType' else method.method_type end,
        value = case when target_input ? 'value' then pg_catalog.btrim(target_input ->> 'value') else method.value end,
        is_usable = case when target_input ? 'isUsable' then (target_input ->> 'isUsable')::boolean else method.is_usable end,
        reliability_state = case when target_input ? 'reliabilityState' then nullif(target_input ->> 'reliabilityState', '') else method.reliability_state end,
        updated_at = pg_catalog.statement_timestamp()
      where method.id = created_id and method.contact_id = contact_id
        and method.tenant_id = tenant_id and method.company_id = target_company_id;
    end if;

    update public.contacts as contact
    set version = contact.version + 1, updated_at = pg_catalog.statement_timestamp()
    where contact.id = contact_id and contact.tenant_id = tenant_id and contact.company_id = target_company_id
    returning contact.version into current_version;
    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id,
      case when command_name = 'add_contact_method' then 'contact_method.created' else 'contact_method.updated' end,
      'contact_method', created_id::text, target_request_id, null,
      pg_catalog.jsonb_build_object('contactId', contact_id, 'contactVersion', current_version)
    );
    return pg_catalog.jsonb_build_object(
      'contactMethodId', created_id, 'contactId', contact_id, 'contactVersion', current_version
    );
  end if;

  if command_name in ('link_contact', 'set_primary_contact', 'end_contact') then
    perform private.assert_stage01_command_keys(
      target_input,
      case when command_name = 'end_contact'
        then array['endReason', 'expectedOpportunityVersion']
        else array['contactId', 'relationshipCode', 'isPrimary', 'reliabilityState', 'expectedOpportunityVersion']
      end
    );
    perform private.assert_stage01_required_keys(
      target_input,
      case when command_name = 'end_contact'
        then array['endReason', 'expectedOpportunityVersion']
        else array['contactId', 'relationshipCode', 'expectedOpportunityVersion']
      end
    );
    opportunity_id := target_resource_id;
    select opportunity.version into current_version
    from public.opportunities as opportunity
    where opportunity.id = opportunity_id and opportunity.tenant_id = tenant_id and opportunity.company_id = target_company_id
    for update;
    if current_version is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
    if current_version is distinct from (target_input ->> 'expectedOpportunityVersion')::bigint then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;

    if command_name = 'end_contact' then
      created_id := target_secondary_id;
      if not exists (
        select 1 from public.opportunity_contacts as relationship
        where relationship.id = created_id and relationship.opportunity_id = opportunity_id
          and relationship.tenant_id = tenant_id and relationship.company_id = target_company_id
      ) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
      if exists (
        select 1 from public.opportunity_contacts as relationship
        where relationship.id = created_id and relationship.ended_at is not null
      ) then raise exception using errcode = 'P0001', message = 'STAGE01_RESOURCE_ALREADY_ENDED'; end if;
      update public.opportunity_contacts as relationship
      set ended_by = actor_id, ended_at = pg_catalog.statement_timestamp(),
          end_reason = pg_catalog.btrim(target_input ->> 'endReason')
      where relationship.id = created_id and relationship.opportunity_id = opportunity_id
        and relationship.tenant_id = tenant_id and relationship.company_id = target_company_id;
    else
      contact_id := (target_input ->> 'contactId')::uuid;
      if not exists (
        select 1 from public.contacts as contact
        where contact.id = contact_id and contact.tenant_id = tenant_id and contact.company_id = target_company_id
      ) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
      if command_name = 'set_primary_contact' then
        update public.opportunity_contacts as relationship
        set ended_by = actor_id, ended_at = pg_catalog.statement_timestamp(),
            end_reason = 'Replaced as Primary Contact'
        where relationship.opportunity_id = opportunity_id
          and relationship.tenant_id = tenant_id and relationship.company_id = target_company_id
          and relationship.is_primary and relationship.ended_at is null;
      end if;
      created_id := pg_catalog.gen_random_uuid();
      insert into public.opportunity_contacts (
        id, tenant_id, company_id, opportunity_id, contact_id, relationship_code,
        is_primary, reliability_state, created_by
      ) values (
        created_id, tenant_id, target_company_id, opportunity_id, contact_id,
        pg_catalog.btrim(target_input ->> 'relationshipCode'),
        case when command_name = 'set_primary_contact' then true
             else coalesce((target_input ->> 'isPrimary')::boolean, false) end,
        nullif(target_input ->> 'reliabilityState', ''), actor_id
      );
    end if;

    update public.opportunities as opportunity
    set version = opportunity.version + 1, updated_at = pg_catalog.statement_timestamp()
    where opportunity.id = opportunity_id and opportunity.tenant_id = tenant_id and opportunity.company_id = target_company_id
    returning opportunity.version into current_version;
    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id,
      case command_name when 'link_contact' then 'opportunity.contact_linked'
        when 'set_primary_contact' then 'opportunity.primary_contact_changed'
        else 'opportunity.contact_ended' end,
      'opportunity_contact', created_id::text, target_request_id, null,
      pg_catalog.jsonb_build_object('opportunityId', opportunity_id, 'opportunityVersion', current_version)
    );
    return pg_catalog.jsonb_build_object(
      'relationshipId', created_id, 'opportunityId', opportunity_id, 'opportunityVersion', current_version
    );
  end if;

  if command_name in ('add_scope', 'retire_scope') then
    perform private.assert_stage01_command_keys(
      target_input,
      case when command_name = 'add_scope'
        then array['scopeCode', 'note', 'reliabilityState', 'expectedOpportunityVersion']
        else array['retireReason', 'expectedOpportunityVersion'] end
    );
    perform private.assert_stage01_required_keys(
      target_input,
      case when command_name = 'add_scope'
        then array['scopeCode', 'expectedOpportunityVersion']
        else array['retireReason', 'expectedOpportunityVersion'] end
    );
    opportunity_id := target_resource_id;
    select opportunity.version into current_version
    from public.opportunities as opportunity
    where opportunity.id = opportunity_id and opportunity.tenant_id = tenant_id and opportunity.company_id = target_company_id
    for update;
    if current_version is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
    if current_version is distinct from (target_input ->> 'expectedOpportunityVersion')::bigint then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;
    if command_name = 'add_scope' then
      created_id := pg_catalog.gen_random_uuid();
      insert into public.opportunity_scopes (
        id, tenant_id, company_id, opportunity_id, scope_code, note, reliability_state, created_by
      ) values (
        created_id, tenant_id, target_company_id, opportunity_id,
        pg_catalog.btrim(target_input ->> 'scopeCode'), nullif(pg_catalog.btrim(target_input ->> 'note'), ''),
        nullif(target_input ->> 'reliabilityState', ''), actor_id
      );
    else
      created_id := target_secondary_id;
      if not exists (
        select 1 from public.opportunity_scopes as scope
        where scope.id = created_id and scope.opportunity_id = opportunity_id
          and scope.tenant_id = tenant_id and scope.company_id = target_company_id
      ) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
      if exists (select 1 from public.opportunity_scopes where id = created_id and retired_at is not null) then
        raise exception using errcode = 'P0001', message = 'STAGE01_RESOURCE_ALREADY_RETIRED';
      end if;
      update public.opportunity_scopes
      set retired_by = actor_id, retired_at = pg_catalog.statement_timestamp(),
          retire_reason = pg_catalog.btrim(target_input ->> 'retireReason')
      where id = created_id;
    end if;
    update public.opportunities as opportunity
    set version = opportunity.version + 1, updated_at = pg_catalog.statement_timestamp()
    where opportunity.id = opportunity_id and opportunity.tenant_id = tenant_id and opportunity.company_id = target_company_id
    returning opportunity.version into current_version;
    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id,
      case when command_name = 'add_scope' then 'opportunity.scope_added' else 'opportunity.scope_retired' end,
      'opportunity_scope', created_id::text, target_request_id, null,
      pg_catalog.jsonb_build_object('opportunityId', opportunity_id, 'opportunityVersion', current_version)
    );
    return pg_catalog.jsonb_build_object('scopeId', created_id, 'opportunityVersion', current_version);
  end if;

  if command_name in ('add_referrer', 'set_primary_referrer', 'end_referrer') then
    perform private.assert_stage01_command_keys(
      target_input,
      case when command_name = 'end_referrer'
        then array['endReason', 'expectedOpportunityVersion']
        else array[
          'referrerTypeCode', 'displayName', 'contactId', 'note', 'reliabilityState',
          'isPrimary', 'expectedOpportunityVersion'
        ] end
    );
    perform private.assert_stage01_required_keys(
      target_input,
      case when command_name = 'end_referrer'
        then array['endReason', 'expectedOpportunityVersion']
        else array['referrerTypeCode', 'displayName', 'expectedOpportunityVersion'] end
    );
    opportunity_id := target_resource_id;
    select opportunity.version into current_version
    from public.opportunities as opportunity
    where opportunity.id = opportunity_id and opportunity.tenant_id = tenant_id and opportunity.company_id = target_company_id
    for update;
    if current_version is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
    if current_version is distinct from (target_input ->> 'expectedOpportunityVersion')::bigint then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;

    if command_name = 'end_referrer' then
      created_id := target_secondary_id;
      if not exists (
        select 1 from public.opportunity_referrers as referrer
        where referrer.id = created_id and referrer.opportunity_id = opportunity_id
          and referrer.tenant_id = tenant_id and referrer.company_id = target_company_id
      ) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
      if exists (select 1 from public.opportunity_referrers where id = created_id and ended_at is not null) then
        raise exception using errcode = 'P0001', message = 'STAGE01_RESOURCE_ALREADY_ENDED';
      end if;
      update public.opportunity_referrers as referrer
      set ended_by = actor_id, ended_at = pg_catalog.statement_timestamp(),
          end_reason = pg_catalog.btrim(target_input ->> 'endReason')
      where referrer.id = created_id;
    else
      contact_id := case when target_input ? 'contactId' and target_input ->> 'contactId' is not null
        then (target_input ->> 'contactId')::uuid end;
      if contact_id is not null and not exists (
        select 1 from public.contacts as contact
        where contact.id = contact_id and contact.tenant_id = tenant_id and contact.company_id = target_company_id
      ) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
      if command_name = 'set_primary_referrer' then
        update public.opportunity_referrers as referrer
        set ended_by = actor_id, ended_at = pg_catalog.statement_timestamp(),
            end_reason = 'Replaced as Primary Referrer'
        where referrer.opportunity_id = opportunity_id
          and referrer.tenant_id = tenant_id and referrer.company_id = target_company_id
          and referrer.is_primary and referrer.ended_at is null;
      end if;
      created_id := pg_catalog.gen_random_uuid();
      insert into public.opportunity_referrers (
        id, tenant_id, company_id, opportunity_id, referrer_type_code, display_name,
        contact_id, note, reliability_state, is_primary, created_by
      ) values (
        created_id, tenant_id, target_company_id, opportunity_id,
        pg_catalog.btrim(target_input ->> 'referrerTypeCode'),
        pg_catalog.btrim(target_input ->> 'displayName'), contact_id,
        nullif(pg_catalog.btrim(target_input ->> 'note'), ''),
        nullif(target_input ->> 'reliabilityState', ''),
        case when command_name = 'set_primary_referrer' then true
             else coalesce((target_input ->> 'isPrimary')::boolean, false) end,
        actor_id
      );
    end if;
    update public.opportunities as opportunity
    set version = opportunity.version + 1, updated_at = pg_catalog.statement_timestamp()
    where opportunity.id = opportunity_id and opportunity.tenant_id = tenant_id and opportunity.company_id = target_company_id
    returning opportunity.version into current_version;
    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id,
      case command_name when 'add_referrer' then 'opportunity.referrer_added'
        when 'set_primary_referrer' then 'opportunity.primary_referrer_changed'
        else 'opportunity.referrer_ended' end,
      'opportunity_referrer', created_id::text, target_request_id, null,
      pg_catalog.jsonb_build_object('opportunityId', opportunity_id, 'opportunityVersion', current_version)
    );
    return pg_catalog.jsonb_build_object('referrerId', created_id, 'opportunityVersion', current_version);
  end if;

  if command_name in ('append_intake', 'correct_intake') then
    perform private.assert_stage01_command_keys(
      target_input,
      case when command_name = 'append_intake'
        then array['channelCode', 'summary', 'expectedOpportunityVersion']
        else array['channelCode', 'summary', 'correctionReason', 'expectedOpportunityVersion'] end
    );
    perform private.assert_stage01_required_keys(
      target_input,
      case when command_name = 'append_intake'
        then array['channelCode', 'summary', 'expectedOpportunityVersion']
        else array['channelCode', 'summary', 'correctionReason', 'expectedOpportunityVersion'] end
    );
    opportunity_id := target_resource_id;
    select opportunity.version into current_version
    from public.opportunities as opportunity
    where opportunity.id = opportunity_id and opportunity.tenant_id = tenant_id and opportunity.company_id = target_company_id
    for update;
    if current_version is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
    if current_version is distinct from (target_input ->> 'expectedOpportunityVersion')::bigint then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;
    if command_name = 'correct_intake' and not exists (
      select 1 from public.opportunity_intake_records as intake
      where intake.id = target_secondary_id and intake.opportunity_id = opportunity_id
        and intake.tenant_id = tenant_id and intake.company_id = target_company_id
    ) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
    created_id := pg_catalog.gen_random_uuid();
    insert into public.opportunity_intake_records (
      id, tenant_id, company_id, opportunity_id, channel_code, summary,
      correction_of_record_id, correction_reason, created_by
    ) values (
      created_id, tenant_id, target_company_id, opportunity_id,
      pg_catalog.btrim(target_input ->> 'channelCode'), pg_catalog.btrim(target_input ->> 'summary'),
      case when command_name = 'correct_intake' then target_secondary_id end,
      case when command_name = 'correct_intake' then pg_catalog.btrim(target_input ->> 'correctionReason') end,
      actor_id
    );
    update public.opportunities as opportunity
    set version = opportunity.version + 1, updated_at = pg_catalog.statement_timestamp()
    where opportunity.id = opportunity_id and opportunity.tenant_id = tenant_id and opportunity.company_id = target_company_id
    returning opportunity.version into current_version;
    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id,
      case when command_name = 'append_intake' then 'opportunity.intake_record_added' else 'opportunity.intake_record_corrected' end,
      'opportunity_intake_record', created_id::text, target_request_id, null,
      pg_catalog.jsonb_build_object(
        'opportunityId', opportunity_id, 'correctionOfRecordId',
        case when command_name = 'correct_intake' then target_secondary_id end,
        'opportunityVersion', current_version
      )
    );
    return pg_catalog.jsonb_build_object('intakeRecordId', created_id, 'opportunityVersion', current_version);
  end if;

  if command_name = 'raise_duplicate' then
    perform private.assert_stage01_command_keys(target_input, array[
      'suspectedDuplicateOpportunityId', 'description', 'expectedOpportunityVersion'
    ]);
    perform private.assert_stage01_required_keys(target_input, array['description', 'expectedOpportunityVersion']);
    opportunity_id := target_resource_id;
    select opportunity.version into current_version
    from public.opportunities as opportunity
    where opportunity.id = opportunity_id and opportunity.tenant_id = tenant_id and opportunity.company_id = target_company_id
    for update;
    if current_version is null then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
    if current_version is distinct from (target_input ->> 'expectedOpportunityVersion')::bigint then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;
    if target_input ->> 'suspectedDuplicateOpportunityId' is not null and not exists (
      select 1 from public.opportunities as suspected
      where suspected.id = (target_input ->> 'suspectedDuplicateOpportunityId')::uuid
        and suspected.tenant_id = tenant_id and suspected.company_id = target_company_id
    ) then raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND'; end if;
    created_id := pg_catalog.gen_random_uuid();
    insert into public.opportunity_duplicate_concerns (
      id, tenant_id, company_id, opportunity_id, suspected_duplicate_opportunity_id,
      description, raised_by
    ) values (
      created_id, tenant_id, target_company_id, opportunity_id,
      case when target_input ->> 'suspectedDuplicateOpportunityId' is not null
        then (target_input ->> 'suspectedDuplicateOpportunityId')::uuid end,
      pg_catalog.btrim(target_input ->> 'description'), actor_id
    );
    update public.opportunities as opportunity
    set version = opportunity.version + 1, updated_at = pg_catalog.statement_timestamp()
    where opportunity.id = opportunity_id and opportunity.tenant_id = tenant_id and opportunity.company_id = target_company_id
    returning opportunity.version into current_version;
    perform private.write_stage01_audit(
      tenant_id, target_company_id, actor_id, 'opportunity.duplicate_concern_raised',
      'opportunity_duplicate_concern', created_id::text, target_request_id, null,
      pg_catalog.jsonb_build_object('opportunityId', opportunity_id, 'opportunityVersion', current_version)
    );
    return pg_catalog.jsonb_build_object('duplicateConcernId', created_id, 'opportunityVersion', current_version);
  end if;

  raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
end;
$$;

revoke all on function private.assert_stage01_command_keys(jsonb, text[]) from public, anon, authenticated;
revoke all on function private.assert_stage01_required_keys(jsonb, text[]) from public, anon, authenticated;
revoke all on function private.stage01_actor_context(uuid, text) from public, anon, authenticated;
revoke all on function private.write_stage01_audit(uuid, uuid, uuid, text, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.execute_stage01_opportunity_command(text, uuid, uuid, uuid, jsonb, uuid) from public, anon, authenticated;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'create_stage01_opportunity(uuid,jsonb,uuid)',
    'update_opportunity_current_data(uuid,uuid,jsonb,uuid)',
    'create_contact(uuid,jsonb,uuid)',
    'update_contact(uuid,uuid,jsonb,uuid)',
    'add_contact_method(uuid,uuid,jsonb,uuid)',
    'update_contact_method(uuid,uuid,uuid,jsonb,uuid)',
    'link_opportunity_contact(uuid,uuid,jsonb,uuid)',
    'set_opportunity_primary_contact(uuid,uuid,jsonb,uuid)',
    'end_opportunity_contact(uuid,uuid,uuid,jsonb,uuid)',
    'add_opportunity_scope(uuid,uuid,jsonb,uuid)',
    'retire_opportunity_scope(uuid,uuid,uuid,jsonb,uuid)',
    'add_opportunity_referrer(uuid,uuid,jsonb,uuid)',
    'set_opportunity_primary_referrer(uuid,uuid,jsonb,uuid)',
    'end_opportunity_referrer(uuid,uuid,uuid,jsonb,uuid)',
    'append_opportunity_intake_record(uuid,uuid,jsonb,uuid)',
    'correct_opportunity_intake_record(uuid,uuid,uuid,jsonb,uuid)',
    'raise_opportunity_duplicate_concern(uuid,uuid,jsonb,uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', function_signature);
    execute format('grant execute on function public.%s to authenticated', function_signature);
    execute format('revoke execute on function private.%s from public, anon, authenticated', function_signature);
    execute format('grant execute on function private.%s to authenticated', function_signature);
  end loop;
end $$;
