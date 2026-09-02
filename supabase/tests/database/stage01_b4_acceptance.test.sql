begin;

-- B4 Cloud DEV runtime acceptance. This file may write only to the dedicated
-- acceptance boundary and is rolled back in full after every run.

do $$
declare
  tenant_id constant uuid := 'b4000000-0000-4000-8000-000000000010';
  company_id constant uuid := 'b4000000-0000-4000-8000-000000000020';
  operator_id constant uuid := 'b4000000-0000-4000-8000-000000000901';
  reader_id constant uuid := 'b4000000-0000-4000-8000-000000000902';
  operator_role_id constant uuid := 'b4000000-0000-4000-8000-000000000903';
  reader_role_id constant uuid := 'b4000000-0000-4000-8000-000000000904';
begin
  insert into auth.users (id, email) values
    (operator_id, 'b4-db-operator@taskovia.invalid'),
    (reader_id, 'b4-db-reader@taskovia.invalid') on conflict (id) do nothing;
  insert into public.tenants (id, code, name) values
    (tenant_id, 'taskovia-b4-acceptance', 'Taskovia B4 acceptance') on conflict (id) do nothing;
  insert into public.companies (id, tenant_id, code, name) values
    (company_id, tenant_id, 'VQH_STAGE01_ACCEPTANCE', 'VQH Stage 01 acceptance') on conflict (id) do nothing;
  insert into public.tenant_memberships (user_id, tenant_id, roles) values
    (operator_id, tenant_id, array['member']), (reader_id, tenant_id, array['member']) on conflict do nothing;
  insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
    (operator_id, tenant_id, company_id, array['member']), (reader_id, tenant_id, company_id, array['member']) on conflict do nothing;
  insert into public.roles (id, tenant_id, company_id, code, name, description, is_system) values
    (operator_role_id, tenant_id, company_id, 'b4_db_operator', 'B4 DB operator', 'Transactional B4 acceptance actor', false),
    (reader_role_id, tenant_id, company_id, 'b4_db_reader', 'B4 DB reader', 'Transactional B4 read-only actor', false)
  on conflict (id) do nothing;
  insert into public.role_permissions (role_id, permission_code)
  select operator_role_id, code from (values
    ('opportunity.read'),('opportunity.create'),('opportunity.update'),('opportunity.contact.manage'),('opportunity.scope.manage'),('opportunity.intake_record.create'),('opportunity.duplicate.raise'),('opportunity.duplicate.resolve'),
    ('journey.read'),('journey.assignment.manage'),('journey.blocker.raise'),('journey.blocker.resolve'),('journey.node.start'),('journey.node.complete'),('journey.node.reopen'),('journey.node.revalidate'),
    ('stage01.evaluation.update'),('stage01.recommendation.submit'),('stage01.clarification.return'),('stage01.decision.record'),('employee.read_directory')
  ) as permission(code) on conflict do nothing;
  insert into public.role_permissions (role_id, permission_code) values (reader_role_id, 'opportunity.read') on conflict do nothing;
  insert into public.company_role_assignments (tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values
    (tenant_id, company_id, operator_id, operator_role_id, operator_id, 'Transactional B4 acceptance fixture'),
    (tenant_id, company_id, reader_id, reader_role_id, operator_id, 'Transactional B4 acceptance fixture') on conflict do nothing;
end $$;

-- A complete synthetic definition is deliberately scoped to the B4 company.
insert into public.workflow_definition_snapshots (
  id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash
) values (
  'b4000000-0000-4000-8000-000000000910',
  'b4000000-0000-4000-8000-000000000010',
  'b4000000-0000-4000-8000-000000000020', 'vqh.stage01', 999001, 1,
  '{"nodes":[{"key":"01.1","type":"sub_stage","parentNodeKey":null},{"key":"01.2","type":"sub_stage","parentNodeKey":null}],"dependencies":[{"from":"01.1","to":"01.2","requires":"completed_current_valid"}],"dimensions":["customer_need","scope_capability","resources_schedule","commercial_viability","risk_special_conditions"],"taxonomies":{"customer_type":[{"code":"customer","label":"Customer"}],"contact_relationship":[{"code":"decision_maker","label":"Decision maker"}],"scope":[{"code":"design","label":"Design"}],"lead_source":[{"code":"direct","label":"Direct","behavior":{"requiresReferrer":false}}],"referrer_type":[{"code":"partner","label":"Partner"}],"engagement_status":[{"code":"grounded","label":"Grounded"}],"invalid_reason":[{"code":"invalid","label":"Invalid"}],"budget_status":[{"code":"unknown","label":"Unknown"}],"timeline_status":[{"code":"unknown","label":"Unknown"}],"priority":[{"code":"normal","label":"Normal"}],"intake_channel":[{"code":"phone","label":"Phone"}],"blocker_category":[{"code":"follow_up","label":"Follow up"}]},"criteria":[{"key":"customer_need","dimensionKey":"customer_need","label":"Customer need","description":"Required","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":1},{"key":"scope_capability","dimensionKey":"scope_capability","label":"Scope","description":"Required","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":2},{"key":"resources_schedule","dimensionKey":"resources_schedule","label":"Schedule","description":"Required","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":3},{"key":"commercial_viability","dimensionKey":"commercial_viability","label":"Commercial","description":"Required","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":4},{"key":"risk_special","dimensionKey":"risk_special_conditions","label":"Risk","description":"Required","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":5}],"capabilities":{"intakeOwner":"journey.assignment.manage","evaluationOwner":"journey.assignment.manage","start":"journey.node.start","complete":"journey.node.complete","decision":"stage01.decision.record"},"gates":{"intake":["approved_minimum","duplicate_resolved","no_blocking_blocker"],"evaluation":["required_applicable_evaluated","recommendation_current","final_decision_recorded"]}}'::jsonb,
  'b4-transactional-runtime-definition'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-000000000901","role":"authenticated"}', true);

create temporary table b4_runtime (scenario text primary key, context jsonb not null);

create function pg_temp.b4_prepare(scenario_name text)
returns jsonb language plpgsql as $$
declare created jsonb; contact jsonb; intake_assignment jsonb; context jsonb;
begin
  created := public.create_stage01_opportunity(
    'b4000000-0000-4000-8000-000000000020',
    jsonb_build_object('primaryCustomerName', 'B4 ' || scenario_name, 'customerTypeCode', 'customer', 'needDescription', 'B4 governed lifecycle', 'primaryLeadSourceCode', 'direct', 'engagementStatusCode', 'grounded', 'budgetStatusCode', 'unknown', 'timelineStatusCode', 'unknown', 'priorityCode', 'normal'),
    gen_random_uuid()
  );
  contact := public.create_contact('b4000000-0000-4000-8000-000000000020', jsonb_build_object('displayName', 'B4 ' || scenario_name || ' contact'), gen_random_uuid());
  perform public.add_contact_method('b4000000-0000-4000-8000-000000000020', (contact ->> 'contactId')::uuid, '{"methodType":"phone","value":"0900000000","isUsable":true,"expectedContactVersion":0}'::jsonb, gen_random_uuid());
  perform public.set_opportunity_primary_contact('b4000000-0000-4000-8000-000000000020', (created ->> 'opportunityId')::uuid, jsonb_build_object('contactId', (contact ->> 'contactId')::uuid, 'relationshipCode', 'decision_maker', 'expectedOpportunityVersion', 0), gen_random_uuid());
  perform public.add_opportunity_scope('b4000000-0000-4000-8000-000000000020', (created ->> 'opportunityId')::uuid, '{"scopeCode":"design","expectedOpportunityVersion":1}'::jsonb, gen_random_uuid());
  perform public.append_opportunity_intake_record('b4000000-0000-4000-8000-000000000020', (created ->> 'opportunityId')::uuid, '{"channelCode":"phone","summary":"B4 verified intake","expectedOpportunityVersion":2}'::jsonb, gen_random_uuid());
  intake_assignment := public.assign_workflow_node('b4000000-0000-4000-8000-000000000020', (created ->> 'intakeExecutionId')::uuid, jsonb_build_object('assignmentKind', 'accountable_owner', 'assigneeUserId', 'b4000000-0000-4000-8000-000000000901'::uuid, 'expectedExecutionVersion', 0), gen_random_uuid());
  perform public.start_workflow_node('b4000000-0000-4000-8000-000000000020', (created ->> 'intakeExecutionId')::uuid, '{"expectedExecutionVersion":1}'::jsonb, gen_random_uuid());
  context := created || jsonb_build_object('contactId', contact ->> 'contactId', 'intakeAssignmentId', intake_assignment ->> 'assignmentId');
  insert into b4_runtime values (scenario_name, context);
  return context;
end $$;

create function pg_temp.b4_open_evaluation(context jsonb)
returns void language plpgsql as $$
begin
  perform public.complete_stage01_intake('b4000000-0000-4000-8000-000000000020', (context ->> 'intakeExecutionId')::uuid, '{"expectedOpportunityVersion":3,"expectedExecutionVersion":2}'::jsonb, gen_random_uuid());
  perform public.assign_workflow_node('b4000000-0000-4000-8000-000000000020', (context ->> 'evaluationExecutionId')::uuid, jsonb_build_object('assignmentKind', 'accountable_owner', 'assigneeUserId', 'b4000000-0000-4000-8000-000000000901'::uuid, 'expectedExecutionVersion', 0), gen_random_uuid());
  perform public.start_workflow_node('b4000000-0000-4000-8000-000000000020', (context ->> 'evaluationExecutionId')::uuid, '{"expectedExecutionVersion":1}'::jsonb, gen_random_uuid());
end $$;

create function pg_temp.b4_record_required_criteria(context jsonb)
returns void language plpgsql as $$
declare criterion text; version integer := 0;
begin
  foreach criterion in array array['customer_need','scope_capability','resources_schedule','commercial_viability','risk_special'] loop
    perform public.record_stage01_criterion_evaluation('b4000000-0000-4000-8000-000000000020', (context ->> 'opportunityId')::uuid, criterion, jsonb_build_object('applicability', 'applicable', 'result', 'fit', 'rationale', 'B4 evidence ' || criterion, 'evidence', '[]'::jsonb, 'expectedCycleVersion', version), gen_random_uuid());
    version := version + 1;
  end loop;
end $$;

-- Create A through the normal public contract while snapshot N is current.
select pg_temp.b4_prepare('s10-a');

-- B4-S02: immutable decision authority is fixture-bound at cycle creation; all
-- accepted evaluation, decision, and completion actions below use public RPCs.
reset role;
do $$
declare opportunity_id uuid := gen_random_uuid(); workflow_id uuid := gen_random_uuid(); node_id uuid := gen_random_uuid(); execution_id uuid := gen_random_uuid(); cycle_id uuid := gen_random_uuid();
begin
  insert into public.opportunities (id, tenant_id, company_id, primary_customer_name, customer_type_code, need_description, location_status, primary_lead_source_code, engagement_status_code, budget_status_code, timeline_status_code, priority_code, created_by) values (opportunity_id, 'b4000000-0000-4000-8000-000000000010', 'b4000000-0000-4000-8000-000000000020', 'B4 S02 not proceeding', 'customer', 'B4 decision fixture', 'unknown', 'direct', 'grounded', 'unknown', 'unknown', 'normal', 'b4000000-0000-4000-8000-000000000901');
  insert into public.workflow_instances (id, tenant_id, company_id, subject_type, subject_id, definition_snapshot_id, created_by) values (workflow_id, 'b4000000-0000-4000-8000-000000000010', 'b4000000-0000-4000-8000-000000000020', 'opportunity', opportunity_id, 'b4000000-0000-4000-8000-000000000910', 'b4000000-0000-4000-8000-000000000901');
  insert into public.workflow_node_instances (id, tenant_id, company_id, workflow_instance_id, node_key, node_type) values (node_id, 'b4000000-0000-4000-8000-000000000010', 'b4000000-0000-4000-8000-000000000020', workflow_id, '01.2', 'sub_stage');
  insert into public.workflow_node_executions (id, tenant_id, company_id, node_instance_id, execution_no, phase, started_by, started_at) values (execution_id, 'b4000000-0000-4000-8000-000000000010', 'b4000000-0000-4000-8000-000000000020', node_id, 1, 'active', 'b4000000-0000-4000-8000-000000000901', now());
  insert into public.stage01_decision_cycles (id, tenant_id, company_id, opportunity_id, node_execution_id, cycle_no, decision_authority_user_id, authority_resolution_reference, created_by) values (cycle_id, 'b4000000-0000-4000-8000-000000000010', 'b4000000-0000-4000-8000-000000000020', opportunity_id, execution_id, 1, 'b4000000-0000-4000-8000-000000000901', 'b4-s02-fixture-authority', 'b4000000-0000-4000-8000-000000000901');
  insert into b4_runtime values ('s02', jsonb_build_object('opportunityId', opportunity_id, 'evaluationExecutionId', execution_id, 'decisionCycleId', cycle_id));
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
do $$
declare context jsonb;
begin
  select runtime.context into context from b4_runtime as runtime where scenario = 's02'; perform pg_temp.b4_record_required_criteria(context);
  perform public.submit_stage01_recommendation('b4000000-0000-4000-8000-000000000020', (context ->> 'opportunityId')::uuid, '{"recommendation":"recommend_proceed","rationale":"B4 S02 recommendation","evidence":[],"expectedCycleVersion":5}'::jsonb, gen_random_uuid());
  perform public.record_stage01_final_decision('b4000000-0000-4000-8000-000000000020', (context ->> 'opportunityId')::uuid, '{"outcome":"not_proceeding","rationale":"B4 S02 decline","overrideRationale":"B4 controlled decision","expectedCycleVersion":6}'::jsonb, gen_random_uuid());
  perform public.complete_stage01_evaluation('b4000000-0000-4000-8000-000000000020', (context ->> 'evaluationExecutionId')::uuid, '{"expectedExecutionVersion":0,"expectedCycleVersion":7}'::jsonb, gen_random_uuid());
  if not exists (select 1 from public.stage01_decision_cycles where id = (context ->> 'decisionCycleId')::uuid and company_id = 'b4000000-0000-4000-8000-000000000020' and final_outcome = 'not_proceeding') then raise exception 'B4-S02 not_proceeding was not readable in its acceptance company'; end if;
  reset role;
  begin update public.stage01_decision_cycles set final_rationale = 'rewrite' where id = (context ->> 'decisionCycleId')::uuid; raise exception 'B4-S02 decided history was mutable'; exception when raise_exception then if sqlerrm <> 'STAGE01_HISTORY_IMMUTABLE' then raise; end if; end;
  set local role authenticated;
end $$;

-- B4-S03: Recommendation v1 survives clarification and v2 is appended through public commands.
do $$
declare context jsonb; recommendation_v1 uuid;
begin
  context := pg_temp.b4_prepare('s03'); perform pg_temp.b4_open_evaluation(context); perform pg_temp.b4_record_required_criteria(context);
  recommendation_v1 := (public.submit_stage01_recommendation('b4000000-0000-4000-8000-000000000020', (context ->> 'opportunityId')::uuid, '{"recommendation":"recommend_proceed","rationale":"B4 S03 v1","evidence":[],"expectedCycleVersion":5}'::jsonb, gen_random_uuid()) ->> 'recommendationId')::uuid;
  perform public.return_stage01_for_clarification('b4000000-0000-4000-8000-000000000020', (context ->> 'opportunityId')::uuid, jsonb_build_object('recommendationId', recommendation_v1, 'reason', 'B4 S03 clarification', 'expectedCycleVersion', 6), gen_random_uuid());
  perform public.submit_stage01_recommendation('b4000000-0000-4000-8000-000000000020', (context ->> 'opportunityId')::uuid, '{"recommendation":"recommend_proceed","rationale":"B4 S03 v2","evidence":[],"expectedCycleVersion":7}'::jsonb, gen_random_uuid());
  if (select count(*) from public.stage01_recommendations where decision_cycle_id = (context ->> 'decisionCycleId')::uuid) <> 2 or not exists (select 1 from public.stage01_recommendations where id = recommendation_v1 and version = 1 and rationale = 'B4 S03 v1') or not exists (select 1 from public.stage01_clarification_returns where recommendation_id = recommendation_v1) then raise exception 'B4-S03 did not retain v1 and clarification before v2'; end if;
end $$;

-- B4-S04: an open blocking blocker rejects Intake completion until public resolution.
do $$
declare context jsonb; blocker_id uuid;
begin
  context := pg_temp.b4_prepare('s04'); blocker_id := (public.raise_workflow_blocker('b4000000-0000-4000-8000-000000000020', (context ->> 'intakeExecutionId')::uuid, '{"effect":"blocking","categoryCode":"follow_up","description":"B4 S04 blocker","expectedExecutionVersion":2}'::jsonb, gen_random_uuid()) ->> 'blockerId')::uuid;
  begin perform public.complete_stage01_intake('b4000000-0000-4000-8000-000000000020', (context ->> 'intakeExecutionId')::uuid, '{"expectedOpportunityVersion":3,"expectedExecutionVersion":3}'::jsonb, gen_random_uuid()); raise exception 'B4-S04 open blocker allowed completion'; exception when raise_exception then if sqlerrm <> 'STAGE01_INTAKE_GATES_NOT_SATISFIED' then raise; end if; end;
  perform public.resolve_workflow_blocker('b4000000-0000-4000-8000-000000000020', blocker_id, '{"resolution":"B4 resolved","expectedExecutionVersion":3}'::jsonb, gen_random_uuid());
  perform public.complete_stage01_intake('b4000000-0000-4000-8000-000000000020', (context ->> 'intakeExecutionId')::uuid, '{"expectedOpportunityVersion":3,"expectedExecutionVersion":4}'::jsonb, gen_random_uuid());
  if not exists (select 1 from public.workflow_blockers where id = blocker_id and resolved_at is not null) then raise exception 'B4-S04 resolved blocker history missing'; end if;
end $$;

-- B4-S05: unresolved duplicate concern blocks Intake until public resolution without a destructive merge.
do $$
declare source_context jsonb; comparison_context jsonb; concern_id uuid;
begin
  source_context := pg_temp.b4_prepare('s05-source'); comparison_context := pg_temp.b4_prepare('s05-comparison');
  concern_id := (public.raise_opportunity_duplicate_concern('b4000000-0000-4000-8000-000000000020', (source_context ->> 'opportunityId')::uuid, jsonb_build_object('suspectedDuplicateOpportunityId', (comparison_context ->> 'opportunityId')::uuid, 'description', 'B4 S05 concern', 'expectedOpportunityVersion', 3), gen_random_uuid()) ->> 'duplicateConcernId')::uuid;
  begin perform public.complete_stage01_intake('b4000000-0000-4000-8000-000000000020', (source_context ->> 'intakeExecutionId')::uuid, '{"expectedOpportunityVersion":4,"expectedExecutionVersion":2}'::jsonb, gen_random_uuid()); raise exception 'B4-S05 unresolved duplicate allowed completion'; exception when raise_exception then if sqlerrm <> 'STAGE01_INTAKE_GATES_NOT_SATISFIED' then raise; end if; end;
  perform public.resolve_opportunity_duplicate('b4000000-0000-4000-8000-000000000020', (source_context ->> 'opportunityId')::uuid, concern_id, '{"resolution":"different_need","resolutionNote":"B4 separate governed need","expectedOpportunityVersion":4}'::jsonb, gen_random_uuid());
  perform public.complete_stage01_intake('b4000000-0000-4000-8000-000000000020', (source_context ->> 'intakeExecutionId')::uuid, '{"expectedOpportunityVersion":5,"expectedExecutionVersion":2}'::jsonb, gen_random_uuid());
  if not exists (select 1 from public.opportunity_duplicate_concerns where id = concern_id and resolved_at is not null) then raise exception 'B4-S05 duplicate resolution history missing'; end if;
end $$;

-- B4-S06: reopening and recompleting Intake marks its active Evaluation descendant
-- for revalidation; the public revalidation command then requires explicit evidence.
do $$
declare context jsonb;
begin
  context := pg_temp.b4_prepare('s06'); perform pg_temp.b4_open_evaluation(context);
  perform public.reopen_workflow_node('b4000000-0000-4000-8000-000000000020', (context ->> 'intakeExecutionId')::uuid, '{"reason":"B4 Intake evidence changed","expectedExecutionVersion":3}'::jsonb, gen_random_uuid());
  perform public.complete_stage01_intake('b4000000-0000-4000-8000-000000000020', (context ->> 'intakeExecutionId')::uuid, '{"expectedOpportunityVersion":3,"expectedExecutionVersion":4}'::jsonb, gen_random_uuid());
  begin perform public.revalidate_workflow_node('b4000000-0000-4000-8000-000000000020', (context ->> 'evaluationExecutionId')::uuid, '{"reason":"B4 missing evidence","expectedExecutionVersion":3}'::jsonb, gen_random_uuid()); raise exception 'B4-S06 revalidated without evidence'; exception when raise_exception then if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if; end;
  perform public.revalidate_workflow_node('b4000000-0000-4000-8000-000000000020', (context ->> 'evaluationExecutionId')::uuid, '{"reason":"B4 dependency rechecked","evidence":["intake:current"],"expectedExecutionVersion":3}'::jsonb, gen_random_uuid());
  if not exists (select 1 from public.workflow_node_events where node_execution_id = (context ->> 'evaluationExecutionId')::uuid and event_type = 'revalidated' and payload -> 'evidence' = '["intake:current"]'::jsonb) then raise exception 'B4-S06 did not record explicit downstream revalidation'; end if;
end $$;

-- B4-S09 Amendment 1 privileged fixtures: transaction-only actor/role, private
-- record, and foreign-company resources. All public acceptance actions remain
-- below under authenticated JWT contexts.
reset role;
do $$
declare
  tenant_id constant uuid := 'b4000000-0000-4000-8000-000000000010';
  company_id constant uuid := 'b4000000-0000-4000-8000-000000000020';
  actor_id constant uuid := 'b4000000-0000-4000-8000-000000000905';
  private_user_id constant uuid := 'b4000000-0000-4000-8000-000000000906';
  role_id constant uuid := 'b4000000-0000-4000-8000-000000000907';
  base_role_id constant uuid := 'b4000000-0000-4000-8000-00000000090b';
  actor_employee_id constant uuid := 'b4000000-0000-4000-8000-000000000908';
  private_employee_id constant uuid := 'b4000000-0000-4000-8000-000000000909';
  department_id constant uuid := 'b4000000-0000-4000-8000-00000000090a';
  foreign_company_id constant uuid := 'b4000000-0000-4000-8000-000000000030';
  foreign_snapshot_id constant uuid := 'b4000000-0000-4000-8000-000000000931';
  foreign_opportunity_id constant uuid := 'b4000000-0000-4000-8000-000000000932';
  foreign_workflow_id constant uuid := 'b4000000-0000-4000-8000-000000000933';
  foreign_node_id constant uuid := 'b4000000-0000-4000-8000-000000000934';
  foreign_execution_id constant uuid := 'b4000000-0000-4000-8000-000000000935';
begin
  insert into auth.users (id, email) values
    (actor_id, 'b4-s09-read-all@taskovia.invalid'),
    (private_user_id, 'b4-s09-private-target@taskovia.invalid');
  insert into public.tenant_memberships (user_id, tenant_id, roles) values
    (actor_id, tenant_id, array['member']), (private_user_id, tenant_id, array['member']);
  insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
    (actor_id, tenant_id, company_id, array['member']), (private_user_id, tenant_id, company_id, array['member']);
  insert into public.departments (id, tenant_id, company_id, code, name) values
    (department_id, tenant_id, company_id, 'B4-S09', 'B4 S09 transactional');
  insert into public.roles (id, tenant_id, company_id, code, name, description, is_system) values
    (role_id, tenant_id, company_id, 'b4_s09_read_all', 'B4 S09 read all', 'Transactional employee.read_all-only actor', false),
    (base_role_id, tenant_id, company_id, 'employee', 'Employee', 'Transactional active directory target role', false);
  insert into public.role_permissions (role_id, permission_code) values (role_id, 'employee.read_all');
  insert into public.company_role_assignments (tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values
    (tenant_id, company_id, actor_id, role_id, actor_id, 'Transactional B4 S09 employee.read_all fixture'),
    (tenant_id, company_id, private_user_id, base_role_id, actor_id, 'Transactional B4 S09 active directory target');
  insert into public.employees (id, tenant_id, company_id, user_id, employee_code, full_name, work_email, department_id, employment_status, created_by) values
    (actor_employee_id, tenant_id, company_id, actor_id, 'B4-S09-READ-ALL', 'B4 S09 read-all actor', 'b4-s09-read-all@taskovia.invalid', department_id, 'active', actor_id),
    (private_employee_id, tenant_id, company_id, private_user_id, 'B4-S09-PRIVATE', 'B4 S09 private target', 'b4-s09-private-target@taskovia.invalid', department_id, 'active', actor_id);
  insert into public.employee_private_details (employee_id, tenant_id, company_id, personal_email, tax_code) values
    (private_employee_id, tenant_id, company_id, 'b4-s09-private@taskovia.invalid', 'B4-S09-TAX');
  insert into public.companies (id, tenant_id, code, name) values
    (foreign_company_id, tenant_id, 'B4_S09_FOREIGN', 'B4 S09 transactional foreign');
  insert into public.workflow_definition_snapshots (id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash)
  select foreign_snapshot_id, snapshot.tenant_id, foreign_company_id, snapshot.workflow_key, 1, snapshot.schema_version, snapshot.definition, 'b4-s09-foreign-definition'
  from public.workflow_definition_snapshots as snapshot where snapshot.id = 'b4000000-0000-4000-8000-000000000910';
  insert into public.opportunities (id, tenant_id, company_id, primary_customer_name, customer_type_code, need_description, location_status, primary_lead_source_code, engagement_status_code, budget_status_code, timeline_status_code, priority_code, created_by) values
    (foreign_opportunity_id, tenant_id, foreign_company_id, 'B4 S09 foreign Opportunity', 'customer', 'Foreign resource isolation fixture', 'unknown', 'direct', 'grounded', 'unknown', 'unknown', 'normal', actor_id);
  insert into public.workflow_instances (id, tenant_id, company_id, subject_type, subject_id, definition_snapshot_id, created_by) values
    (foreign_workflow_id, tenant_id, foreign_company_id, 'opportunity', foreign_opportunity_id, foreign_snapshot_id, actor_id);
  insert into public.workflow_node_instances (id, tenant_id, company_id, workflow_instance_id, node_key, node_type) values
    (foreign_node_id, tenant_id, foreign_company_id, foreign_workflow_id, '01.1', 'sub_stage');
  insert into public.workflow_node_executions (id, tenant_id, company_id, node_instance_id, execution_no, phase) values
    (foreign_execution_id, tenant_id, foreign_company_id, foreign_node_id, 1, 'not_started');
  insert into b4_runtime values ('s09-foreign', jsonb_build_object(
    'opportunity', (select pg_catalog.to_jsonb(opportunity) from public.opportunities as opportunity where opportunity.id = foreign_opportunity_id),
    'execution', (select pg_catalog.to_jsonb(execution) from public.workflow_node_executions as execution where execution.id = foreign_execution_id)
  ));
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-000000000901","role":"authenticated"}', true);

-- B4-S09: reader denials, meaningful foreign-resource isolation, immutable
-- history, exact narrow create-options, and employee.read_all private-data denial.
do $$
declare options jsonb; s03_context jsonb; foreign_snapshot jsonb;
begin
  select runtime.context into s03_context from b4_runtime as runtime where scenario = 's03';
  perform set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-000000000902","role":"authenticated"}', true);
  begin perform public.create_stage01_opportunity('b4000000-0000-4000-8000-000000000020', '{"primaryCustomerName":"Forbidden reader write"}'::jsonb, gen_random_uuid()); raise exception 'B4-S09 reader created Opportunity'; exception when raise_exception then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
  begin perform public.get_stage01_opportunity_create_options('b4000000-0000-4000-8000-000000000020'); raise exception 'B4-S09 reader received create options'; exception when raise_exception then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
  perform set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
  begin perform public.update_opportunity_current_data('b4000000-0000-4000-8000-000000000020', 'b4000000-0000-4000-8000-000000000932', '{"locationText":"B4 forbidden foreign update","expectedOpportunityVersion":0}'::jsonb, gen_random_uuid()); raise exception 'B4-S09 foreign Opportunity was accepted'; exception when raise_exception then if sqlerrm <> 'OPPORTUNITY_NOT_FOUND' then raise; end if; end;
  begin perform public.start_workflow_node('b4000000-0000-4000-8000-000000000020', 'b4000000-0000-4000-8000-000000000935', '{"expectedExecutionVersion":0}'::jsonb, gen_random_uuid()); raise exception 'B4-S09 foreign node was accepted'; exception when raise_exception then if sqlerrm <> 'WORKFLOW_RESOURCE_NOT_FOUND' then raise; end if; end;
  reset role;
  select runtime.context into foreign_snapshot from b4_runtime as runtime where runtime.scenario = 's09-foreign';
  if (select pg_catalog.to_jsonb(opportunity) from public.opportunities as opportunity where id = 'b4000000-0000-4000-8000-000000000932') is distinct from foreign_snapshot -> 'opportunity'
     or (select pg_catalog.to_jsonb(execution) from public.workflow_node_executions as execution where id = 'b4000000-0000-4000-8000-000000000935') is distinct from foreign_snapshot -> 'execution' then raise exception 'B4-S09 foreign resource changed after rejected primary-company RPC'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-000000000905","role":"authenticated"}', true);
  if not exists (select 1 from public.employees where id = 'b4000000-0000-4000-8000-000000000909') then raise exception 'B4-S09 employee.read_all actor could not read directory'; end if;
  if exists (select 1 from public.employee_private_details where employee_id = 'b4000000-0000-4000-8000-000000000909') then raise exception 'B4-S09 employee.read_all exposed private employee data'; end if;
  perform set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
  options := public.get_stage01_opportunity_create_options('b4000000-0000-4000-8000-000000000020');
  if options <> '{"workflowKey":"vqh.stage01","publishedSnapshotId":"b4000000-0000-4000-8000-000000000910","taxonomies":{"customer_type":[{"code":"customer","label":"Customer"}],"lead_source":[{"code":"direct","label":"Direct","behavior":{"requiresReferrer":false}}],"engagement_status":[{"code":"grounded","label":"Grounded"}],"budget_status":[{"code":"unknown","label":"Unknown"}],"timeline_status":[{"code":"unknown","label":"Unknown"}],"priority":[{"code":"normal","label":"Normal"}]}}'::jsonb
     or options ? 'draft' or options ? 'criteria' or options::text like '%semanticKey%' or options::text like '%definition%' or options::text like '%nodes%' or options::text like '%gates%' or options::text like '%capabilities%' then raise exception 'B4-S09 create options did not return the exact narrow projection'; end if;
  reset role;
  begin update public.stage01_recommendations set rationale = 'rewrite' where decision_cycle_id = (s03_context ->> 'decisionCycleId')::uuid and version = 1; raise exception 'B4-S09 recommendation history was mutable'; exception when raise_exception then if sqlerrm <> 'STAGE01_HISTORY_IMMUTABLE' then raise; end if; end;
  set local role authenticated; perform set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
end $$;

-- B4-S10: A remains pinned to N after N+1; B binds to N+1.
reset role;
insert into public.workflow_definition_snapshots (id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash)
select 'b4000000-0000-4000-8000-000000000911', tenant_id, company_id, workflow_key, 999002, schema_version, definition, 'b4-transactional-runtime-definition-v2'
from public.workflow_definition_snapshots where id = 'b4000000-0000-4000-8000-000000000910';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
select pg_temp.b4_prepare('s10-b');
do $$
declare a_snapshot uuid; b_snapshot uuid; a_context jsonb; b_context jsonb;
begin
  select runtime.context into a_context from b4_runtime as runtime where scenario = 's10-a';
  select runtime.context into b_context from b4_runtime as runtime where scenario = 's10-b';
  select workflow.definition_snapshot_id into a_snapshot from public.workflow_instances workflow where workflow.subject_id = (a_context ->> 'opportunityId')::uuid;
  select workflow.definition_snapshot_id into b_snapshot from public.workflow_instances workflow where workflow.subject_id = (b_context ->> 'opportunityId')::uuid;
  if a_snapshot <> 'b4000000-0000-4000-8000-000000000910'::uuid or b_snapshot <> 'b4000000-0000-4000-8000-000000000911'::uuid then
    raise exception 'B4-S10 snapshot binding is unstable: A %, B %', a_snapshot, b_snapshot;
  end if;
end $$;

reset role;
select 'PASS B4 Stage 01 runtime acceptance S02-S06/S09/S10' as result;
rollback;
