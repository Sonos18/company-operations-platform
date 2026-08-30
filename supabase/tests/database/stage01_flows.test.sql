begin;

create function pg_temp.stage01_flow_definition()
returns jsonb
language sql
immutable
as $$
  select $definition$
  {
    "nodes":[
      {"key":"01.1","type":"sub_stage","parentNodeKey":null},
      {"key":"01.2","type":"sub_stage","parentNodeKey":null}
    ],
    "dependencies":[{"from":"01.1","to":"01.2","requires":"completed_current_valid"}],
    "dimensions":[
      "customer_need","scope_capability","resources_schedule",
      "commercial_viability","risk_special_conditions"
    ],
    "taxonomies":{
      "customer_type":[{"code":"customer","label":"Customer"}],
      "contact_relationship":[{"code":"decision_maker","label":"Decision maker"}],
      "scope":[{"code":"design","label":"Design"}],
      "lead_source":[
        {"code":"direct","label":"Direct","behavior":{"requiresReferrer":false}},
        {"code":"referral","label":"Referral","behavior":{"requiresReferrer":true}}
      ],
      "referrer_type":[{"code":"person","label":"Person"}],
      "engagement_status":[{"code":"grounded","label":"Grounded"}],
      "invalid_reason":[
        {"code":"test_invalid","label":"Test invalid","semanticKey":"invalid"},
        {"code":"test_duplicate_invalid","label":"Test duplicate invalid","semanticKey":"duplicate_merged"}
      ],
      "budget_status":[{"code":"unknown","label":"Unknown"}],
      "timeline_status":[{"code":"unknown","label":"Unknown"}],
      "priority":[{"code":"normal","label":"Normal"}],
      "intake_channel":[{"code":"phone","label":"Phone"}],
      "blocker_category":[
        {"code":"follow_up","label":"Follow up"},
        {"code":"approval","label":"Approval"}
      ]
    },
    "criteria":[
      {"key":"required_fit","dimensionKey":"customer_need","label":"Required fit","description":"Synthetic required criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":1},
      {"key":"optional_scope","dimensionKey":"scope_capability","label":"Optional scope","description":"Synthetic optional criterion","criticality":"optional","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":2},
      {"key":"optional_schedule","dimensionKey":"resources_schedule","label":"Optional schedule","description":"Synthetic optional criterion","criticality":"optional","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":3},
      {"key":"optional_commercial","dimensionKey":"commercial_viability","label":"Optional commercial","description":"Synthetic optional criterion","criticality":"optional","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":4},
      {"key":"optional_risk","dimensionKey":"risk_special_conditions","label":"Optional risk","description":"Synthetic optional criterion","criticality":"optional","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":5}
    ],
    "capabilities":{
      "intakeOwner":"journey.assignment.manage",
      "evaluationOwner":"journey.assignment.manage",
      "start":"journey.node.start",
      "complete":"journey.node.complete",
      "decision":"stage01.decision.record"
    },
    "gates":{
      "intake":["approved_minimum","duplicate_resolved","no_blocking_blocker"],
      "evaluation":["required_applicable_evaluated","recommendation_current","final_decision_recorded"]
    }
  }
  $definition$::jsonb;
$$;

-- Only synthetic identity, tenancy, permission, definition, and authority fixtures
-- are written directly. Every business mutation below crosses a public RPC while
-- the session role is authenticated. The outer transaction rolls every fixture back.
insert into auth.users (id, email) values
  ('58000000-0000-4000-8000-000000000001', 'stage01-flows@test.invalid');

insert into public.tenants (id, code, name) values
  ('58000000-0000-4000-8000-000000000010', 'stage01-flows', 'Stage 01 flow verification');

insert into public.companies (id, tenant_id, code, name) values
  ('58000000-0000-4000-8000-000000000020', '58000000-0000-4000-8000-000000000010', 'S01-FLOW-A', 'Stage 01 flow company A'),
  ('58000000-0000-4000-8000-000000000021', '58000000-0000-4000-8000-000000000010', 'S01-FLOW-B', 'Stage 01 flow company B');

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  ('58000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000010', array['member']);

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  ('58000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000010', '58000000-0000-4000-8000-000000000020', array['member']),
  ('58000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000010', '58000000-0000-4000-8000-000000000021', array['member']);

insert into public.roles (id, tenant_id, company_id, code, name, description, is_system) values
  ('58000000-0000-4000-8000-000000000100', '58000000-0000-4000-8000-000000000010', '58000000-0000-4000-8000-000000000020', 'stage01_flow_actor_a', 'Stage 01 flow actor A', 'Synthetic verification role', false),
  ('58000000-0000-4000-8000-000000000101', '58000000-0000-4000-8000-000000000010', '58000000-0000-4000-8000-000000000021', 'stage01_flow_actor_b', 'Stage 01 flow actor B', 'Synthetic verification role', false);

insert into public.role_permissions (role_id, permission_code)
select role_id, permission_code
from (values
  ('58000000-0000-4000-8000-000000000100'::uuid),
  ('58000000-0000-4000-8000-000000000101'::uuid)
) as target_role(role_id)
cross join (values
  ('opportunity.read'), ('opportunity.create'), ('opportunity.update'),
  ('opportunity.contact.manage'), ('opportunity.scope.manage'),
  ('opportunity.referrer.manage'), ('opportunity.intake_record.create'),
  ('opportunity.duplicate.raise'), ('opportunity.duplicate.resolve'),
  ('opportunity.invalidate'), ('opportunity.restore'), ('journey.read'),
  ('journey.assignment.manage'), ('journey.node.start'), ('journey.node.complete'),
  ('journey.node.reopen'), ('journey.node.revalidate'),
  ('journey.blocker.raise'), ('journey.blocker.resolve'),
  ('stage01.evaluation.update'), ('stage01.recommendation.submit'),
  ('stage01.clarification.return'), ('stage01.decision.record'), ('stage01.reactivate')
) as permission(permission_code);

insert into public.company_role_assignments (
  tenant_id, company_id, user_id, role_id, granted_by, grant_reason
) values
  ('58000000-0000-4000-8000-000000000010', '58000000-0000-4000-8000-000000000020', '58000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000100', '58000000-0000-4000-8000-000000000001', 'Stage 01 flow fixture'),
  ('58000000-0000-4000-8000-000000000010', '58000000-0000-4000-8000-000000000021', '58000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000101', '58000000-0000-4000-8000-000000000001', 'Stage 01 flow fixture');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"58000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.create_stage01_opportunity(
      '58000000-0000-4000-8000-000000000020',
      '{"primaryCustomerName":"No definition"}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'E2E 01 no definition unexpectedly accepted bootstrap';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE' then raise; end if;
  end;
  raise notice 'PASS E2E 01 no definition rejects bootstrap and commits nothing';
end $$;

reset role;

do $$
begin
  if exists (
    select 1 from public.opportunities
    where company_id = '58000000-0000-4000-8000-000000000020'
  ) then
    raise exception 'E2E 01 failed bootstrap retained an Opportunity';
  end if;
end $$;

insert into public.workflow_definition_snapshots (
  tenant_id, company_id, workflow_key, template_version, schema_version,
  definition, definition_hash
) values
  ('58000000-0000-4000-8000-000000000010', '58000000-0000-4000-8000-000000000020', 'vqh.stage01', 1, 1, pg_temp.stage01_flow_definition(), 'stage01-flow-valid-a-v1'),
  ('58000000-0000-4000-8000-000000000010', '58000000-0000-4000-8000-000000000020', 'vqh.stage01', 2, 1, pg_temp.stage01_flow_definition() #- '{capabilities,decision}', 'stage01-flow-invalid-a-v2');

set local role authenticated;

do $$
begin
  begin
    perform public.create_stage01_opportunity(
      '58000000-0000-4000-8000-000000000020',
      '{"primaryCustomerName":"Invalid newest definition"}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'E2E 02 invalid newest definition unexpectedly accepted bootstrap';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_INVALID' then raise; end if;
  end;
  raise notice 'PASS E2E 02 invalid newest definition rejects without fallback';
end $$;

reset role;

do $$
begin
  if exists (
    select 1 from public.opportunities
    where company_id = '58000000-0000-4000-8000-000000000020'
  ) then
    raise exception 'E2E 02 invalid definition retained an Opportunity or fell back';
  end if;
end $$;

insert into public.workflow_definition_snapshots (
  tenant_id, company_id, workflow_key, template_version, schema_version,
  definition, definition_hash
) values (
  '58000000-0000-4000-8000-000000000010',
  '58000000-0000-4000-8000-000000000021',
  'vqh.stage01', 1, 1, pg_temp.stage01_flow_definition(), 'stage01-flow-valid-b-v1'
);

set local role authenticated;

do $$
#variable_conflict use_variable
declare
  result jsonb;
begin
  result := public.create_stage01_opportunity(
    '58000000-0000-4000-8000-000000000021',
    '{"primaryCustomerName":"Acceptance Opportunity"}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if not (result ?& array[
    'opportunityId', 'workflowInstanceId', 'intakeNodeInstanceId',
    'intakeExecutionId', 'evaluationNodeInstanceId', 'evaluationExecutionId',
    'decisionCycleId', 'opportunityVersion', 'intakeExecutionVersion',
    'evaluationExecutionVersion', 'decisionCycleVersion'
  ]) then
    raise exception 'E2E 03 bootstrap response is incomplete';
  end if;
end $$;

reset role;

do $$
#variable_conflict use_variable
declare
  opportunity_id uuid;
  workflow_id uuid;
begin
  select id into opportunity_id
  from public.opportunities
  where company_id = '58000000-0000-4000-8000-000000000021'
    and primary_customer_name = 'Acceptance Opportunity';
  select id into workflow_id
  from public.workflow_instances
  where company_id = '58000000-0000-4000-8000-000000000021'
    and subject_type = 'opportunity' and subject_id = opportunity_id;

  if opportunity_id is null or workflow_id is null
     or (select count(*) from public.opportunities as target where target.id = opportunity_id) <> 1
     or (select count(*) from public.workflow_instances as target where target.id = workflow_id) <> 1
     or (select count(*) from public.workflow_node_instances as target where target.workflow_instance_id = workflow_id) <> 2
     or (select count(*) from public.workflow_node_executions as execution
         join public.workflow_node_instances as node on node.id = execution.node_instance_id
         where node.workflow_instance_id = workflow_id) <> 2
     or (select count(*) from public.stage01_decision_cycles as target where target.opportunity_id = opportunity_id) <> 1 then
    raise exception 'E2E 03 aggregate shape is not exactly 1 Opportunity/Workflow, 2 nodes/executions, and Cycle 1';
  end if;
  if (select array_agg(node_key order by node_key) from public.workflow_node_instances where workflow_instance_id = workflow_id)
     is distinct from array['01.1', '01.2']::text[] then
    raise exception 'E2E 03 created an excluded parent Stage 01 or Stage 02 runtime';
  end if;
  if to_regclass('public.projects') is not null then
    raise exception 'E2E 03 unexpected Project persistence exists in the Phase A schema';
  end if;
  raise notice 'PASS E2E 03 valid definition creates the exact Phase A aggregate';
end $$;

-- Authority resolution is deliberately outside Phase A. This is the allowed,
-- rolled-back synthetic authority fixture for the decision acceptance flows.
-- The history guard correctly makes these fields immutable after insert. The
-- trigger DDL and authority update are transaction-local and never become visible
-- to other Cloud DEV sessions because this verification always rolls back.
alter table public.stage01_decision_cycles
  disable trigger stage01_decision_cycles_guard_history;
update public.stage01_decision_cycles as cycle
set decision_authority_user_id = '58000000-0000-4000-8000-000000000001',
    authority_resolution_reference = 'synthetic-flow-authority'
from public.opportunities as opportunity
where cycle.opportunity_id = opportunity.id
  and opportunity.company_id = '58000000-0000-4000-8000-000000000021'
  and opportunity.primary_customer_name = 'Acceptance Opportunity';
alter table public.stage01_decision_cycles
  enable trigger stage01_decision_cycles_guard_history;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"58000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
#variable_conflict use_variable
declare
  company_id constant uuid := '58000000-0000-4000-8000-000000000021';
  actor_id constant uuid := '58000000-0000-4000-8000-000000000001';
  opportunity_id uuid;
  candidate_id uuid;
  intake_execution_id uuid;
  evaluation_execution_id uuid;
  evaluation_assignment_id uuid;
  first_contact_id uuid;
  second_contact_id uuid;
  first_scope_id uuid;
  original_intake_id uuid;
  first_concern_id uuid;
  second_concern_id uuid;
  result jsonb;
begin
  select opportunity.id, intake_execution.id, evaluation_execution.id
  into opportunity_id, intake_execution_id, evaluation_execution_id
  from public.opportunities as opportunity
  join public.workflow_instances as workflow
    on workflow.subject_id = opportunity.id and workflow.subject_type = 'opportunity'
  join public.workflow_node_instances as intake_node
    on intake_node.workflow_instance_id = workflow.id and intake_node.node_key = '01.1'
  join public.workflow_node_executions as intake_execution
    on intake_execution.node_instance_id = intake_node.id and intake_execution.superseded_at is null
  join public.workflow_node_instances as evaluation_node
    on evaluation_node.workflow_instance_id = workflow.id and evaluation_node.node_key = '01.2'
  join public.workflow_node_executions as evaluation_execution
    on evaluation_execution.node_instance_id = evaluation_node.id and evaluation_execution.superseded_at is null
  where opportunity.company_id = company_id
    and opportunity.primary_customer_name = 'Acceptance Opportunity';

  begin
    perform public.start_workflow_node(
      company_id, intake_execution_id, '{"expectedExecutionVersion":0}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'E2E 04 Intake started without an accountable owner';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_ACCOUNTABLE_OWNER_REQUIRED' then raise; end if;
  end;
  raise notice 'PASS E2E 04 01.1 cannot Start without Intake Owner';

  perform public.assign_workflow_node(
    company_id, intake_execution_id,
    pg_catalog.jsonb_build_object(
      'assignmentKind', 'accountable_owner', 'assigneeUserId', actor_id,
      'assignmentReason', 'Synthetic Intake Owner', 'expectedExecutionVersion', 0
    ), pg_catalog.gen_random_uuid()
  );
  perform public.start_workflow_node(
    company_id, intake_execution_id, '{"expectedExecutionVersion":1}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if (select execution.phase from public.workflow_node_executions as execution where execution.id = intake_execution_id) <> 'active'
     or (select opportunity.need_description from public.opportunities as opportunity where opportunity.id = opportunity_id) is not null then
    raise exception 'E2E 05 Intake did not start independently of complete intake data';
  end if;
  raise notice 'PASS E2E 05 01.1 Start does not require complete intake data';

  result := public.assign_workflow_node(
    company_id, evaluation_execution_id,
    pg_catalog.jsonb_build_object(
      'assignmentKind', 'accountable_owner', 'assigneeUserId', actor_id,
      'assignmentReason', 'Temporary dependency probe', 'expectedExecutionVersion', 0
    ), pg_catalog.gen_random_uuid()
  );
  evaluation_assignment_id := (result ->> 'assignmentId')::uuid;
  begin
    perform public.start_workflow_node(
      company_id, evaluation_execution_id, '{"expectedExecutionVersion":1}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'E2E 16 Evaluation started before current-valid Intake completion';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEPENDENCY_NOT_SATISFIED' then raise; end if;
  end;
  perform public.end_workflow_assignment(
    company_id, evaluation_assignment_id,
    '{"endReason":"Dependency probe complete","expectedExecutionVersion":1}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if (select execution.phase from public.workflow_node_executions as execution where execution.id = evaluation_execution_id) <> 'not_started' then
    raise exception 'E2E 16 Evaluation did not remain locked/not-started';
  end if;
  raise notice 'PASS E2E 16 01.2 remains locked before current-valid 01.1 completion';

  result := public.create_contact(company_id, '{"displayName":"First primary contact"}'::jsonb, pg_catalog.gen_random_uuid());
  first_contact_id := (result ->> 'contactId')::uuid;
  perform public.add_contact_method(
    company_id, first_contact_id,
    '{"methodType":"phone","value":"0900000001","isUsable":true,"expectedContactVersion":0}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  perform public.set_opportunity_primary_contact(
    company_id, opportunity_id,
    pg_catalog.jsonb_build_object(
      'contactId', first_contact_id, 'relationshipCode', 'decision_maker',
      'expectedOpportunityVersion', 0
    ), pg_catalog.gen_random_uuid()
  );
  result := public.create_contact(company_id, '{"displayName":"Current primary contact"}'::jsonb, pg_catalog.gen_random_uuid());
  second_contact_id := (result ->> 'contactId')::uuid;
  perform public.add_contact_method(
    company_id, second_contact_id,
    '{"methodType":"phone","value":"0900000002","isUsable":true,"expectedContactVersion":0}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  perform public.set_opportunity_primary_contact(
    company_id, opportunity_id,
    pg_catalog.jsonb_build_object(
      'contactId', second_contact_id, 'relationshipCode', 'decision_maker',
      'expectedOpportunityVersion', 1
    ), pg_catalog.gen_random_uuid()
  );
  if (select count(*) from public.opportunity_contacts as relationship where relationship.opportunity_id = opportunity_id) <> 2
     or (select count(*) from public.opportunity_contacts as relationship where relationship.opportunity_id = opportunity_id and relationship.is_primary and relationship.ended_at is null) <> 1
     or not exists (
       select 1 from public.opportunity_contacts as relationship
       where relationship.opportunity_id = opportunity_id and relationship.contact_id = first_contact_id and relationship.ended_at is not null
     ) then
    raise exception 'E2E 06 Primary Contact replacement did not preserve relationship history';
  end if;
  raise notice 'PASS E2E 06 Primary Contact replacement preserves prior relationship history';

  result := public.add_opportunity_scope(
    company_id, opportunity_id,
    '{"scopeCode":"design","note":"Original scope","expectedOpportunityVersion":2}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  first_scope_id := (result ->> 'scopeId')::uuid;
  perform public.retire_opportunity_scope(
    company_id, opportunity_id, first_scope_id,
    '{"retireReason":"Scope refined","expectedOpportunityVersion":3}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  perform public.add_opportunity_scope(
    company_id, opportunity_id,
    '{"scopeCode":"design","note":"Current scope","expectedOpportunityVersion":4}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  perform public.add_opportunity_referrer(
    company_id, opportunity_id,
    '{"referrerTypeCode":"person","displayName":"First referrer","isPrimary":true,"expectedOpportunityVersion":5}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  result := public.set_opportunity_primary_referrer(
    company_id, opportunity_id,
    '{"referrerTypeCode":"person","displayName":"Replacement referrer","expectedOpportunityVersion":6}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  perform public.end_opportunity_referrer(
    company_id, opportunity_id, (result ->> 'referrerId')::uuid,
    '{"endReason":"Referral relationship ended","expectedOpportunityVersion":7}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if (select count(*) from public.opportunity_scopes as scope where scope.opportunity_id = opportunity_id) <> 2
     or not exists (select 1 from public.opportunity_scopes as scope where scope.id = first_scope_id and scope.retired_at is not null)
     or (select count(*) from public.opportunity_referrers as referrer where referrer.opportunity_id = opportunity_id) <> 2
     or exists (select 1 from public.opportunity_referrers as referrer where referrer.opportunity_id = opportunity_id and referrer.ended_at is null) then
    raise exception 'E2E 07 Scope or Primary Referrer history was not preserved';
  end if;
  raise notice 'PASS E2E 07 Scope retirement and Primary Referrer replacement preserve history';

  result := public.append_opportunity_intake_record(
    company_id, opportunity_id,
    '{"channelCode":"phone","summary":"Original intake","expectedOpportunityVersion":8}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  original_intake_id := (result ->> 'intakeRecordId')::uuid;
  perform public.correct_opportunity_intake_record(
    company_id, opportunity_id, original_intake_id,
    '{"channelCode":"phone","summary":"Corrected intake","correctionReason":"Clarified wording","expectedOpportunityVersion":9}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if (select count(*) from public.opportunity_intake_records as intake where intake.opportunity_id = opportunity_id) <> 2
     or (select intake.summary from public.opportunity_intake_records as intake where intake.id = original_intake_id) <> 'Original intake'
     or not exists (
       select 1 from public.opportunity_intake_records as intake
       where intake.opportunity_id = opportunity_id and intake.correction_of_record_id = original_intake_id
         and intake.correction_reason = 'Clarified wording' and intake.summary = 'Corrected intake'
     ) then
    raise exception 'E2E 08 Intake correction edited the original or missed append linkage';
  end if;
  raise notice 'PASS E2E 08 Intake correction appends without editing the original';

  begin
    perform public.complete_stage01_intake(
      company_id, intake_execution_id,
      '{"expectedOpportunityVersion":10,"expectedExecutionVersion":2}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'E2E 09 Intake completed with missing approved minimum';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_INTAKE_GATES_NOT_SATISFIED' then raise; end if;
  end;
  raise notice 'PASS E2E 09 missing approved minimum rejects 01.1 Complete';

  if exists (
    select 1 from public.opportunities as opportunity
    where opportunity.id = opportunity_id
      and (opportunity.budget_status_code is not null or opportunity.budget_min is not null or opportunity.budget_max is not null
           or opportunity.timeline_status_code is not null or opportunity.timeline_start_date is not null
           or opportunity.timeline_end_date is not null)
  ) or exists (
    select 1 from public.workflow_node_assignments as assignment
    where assignment.node_execution_id = intake_execution_id and assignment.assignment_kind = 'project_manager'
  ) then
    raise exception 'E2E 10 optional budget/timeline/PM data was inferred';
  end if;
  raise notice 'PASS E2E 10 budget, timeline, files, and PM may be absent';

  perform public.update_opportunity_current_data(
    company_id, opportunity_id,
    '{"customerTypeCode":"customer","needDescription":"A qualified governed need","locationStatus":"unknown","primaryLeadSourceCode":"referral","engagementStatusCode":"grounded","expectedOpportunityVersion":10}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  begin
    perform public.complete_stage01_intake(
      company_id, intake_execution_id,
      '{"expectedOpportunityVersion":11,"expectedExecutionVersion":2}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'E2E 11 referral-like Lead Source completed without Primary Referrer';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_INTAKE_GATES_NOT_SATISFIED' then raise; end if;
  end;
  raise notice 'PASS E2E 11 referral-like Lead Source requires Primary Referrer';

  perform public.set_opportunity_primary_referrer(
    company_id, opportunity_id,
    '{"referrerTypeCode":"person","displayName":"Current referrer","expectedOpportunityVersion":11}'::jsonb,
    pg_catalog.gen_random_uuid()
  );

  result := public.create_stage01_opportunity(
    company_id, '{"primaryCustomerName":"Duplicate candidate"}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  candidate_id := (result ->> 'opportunityId')::uuid;
  result := public.raise_opportunity_duplicate_concern(
    company_id, opportunity_id,
    pg_catalog.jsonb_build_object(
      'suspectedDuplicateOpportunityId', candidate_id,
      'description', 'Possible separate need', 'expectedOpportunityVersion', 12
    ), pg_catalog.gen_random_uuid()
  );
  first_concern_id := (result ->> 'duplicateConcernId')::uuid;
  begin
    perform public.complete_stage01_intake(
      company_id, intake_execution_id,
      '{"expectedOpportunityVersion":13,"expectedExecutionVersion":2}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'E2E 12 Intake completed with an unresolved duplicate concern';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_INTAKE_GATES_NOT_SATISFIED' then raise; end if;
  end;
  raise notice 'PASS E2E 12 raised duplicate concern rejects 01.1 Complete';

  perform public.resolve_opportunity_duplicate(
    company_id, opportunity_id, first_concern_id,
    '{"resolution":"different_need","resolutionNote":"Verified as a separate need","expectedOpportunityVersion":13}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  perform public.complete_stage01_intake(
    company_id, intake_execution_id,
    '{"expectedOpportunityVersion":14,"expectedExecutionVersion":2}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if (select execution.phase from public.workflow_node_executions as execution where execution.id = intake_execution_id) <> 'completed'
     or (select concern.resolution from public.opportunity_duplicate_concerns as concern where concern.id = first_concern_id) <> 'different_need' then
    raise exception 'E2E 13 different-need resolution did not permit Intake completion';
  end if;
  raise notice 'PASS E2E 13 different-need duplicate resolution permits later completion';

  result := public.raise_opportunity_duplicate_concern(
    company_id, candidate_id,
    pg_catalog.jsonb_build_object(
      'suspectedDuplicateOpportunityId', opportunity_id,
      'description', 'Confirmed same need', 'expectedOpportunityVersion', 0
    ), pg_catalog.gen_random_uuid()
  );
  second_concern_id := (result ->> 'duplicateConcernId')::uuid;
  perform public.resolve_opportunity_duplicate(
    company_id, candidate_id, second_concern_id,
    pg_catalog.jsonb_build_object(
      'resolution', 'same_need', 'canonicalOpportunityId', opportunity_id,
      'resolutionNote', 'Retain both records and mark canonical', 'expectedOpportunityVersion', 1
    ), pg_catalog.gen_random_uuid()
  );
  if (select count(*) from public.opportunities as opportunity where opportunity.id in (opportunity_id, candidate_id)) <> 2
     or (select opportunity.canonical_opportunity_id from public.opportunities as opportunity where opportunity.id = candidate_id) is distinct from opportunity_id
     or (select count(*) from public.opportunity_duplicate_concerns as concern where concern.opportunity_id in (opportunity_id, candidate_id)) <> 2
     or (select concern.resolution from public.opportunity_duplicate_concerns as concern where concern.id = second_concern_id) <> 'same_need' then
    raise exception 'E2E 14 same-need resolution deleted or rewrote retained history';
  end if;
  raise notice 'PASS E2E 14 same-need duplicate resolution preserves both records and history';

  if (select count(*) from public.stage01_intake_completion_baselines as baseline where baseline.node_execution_id = intake_execution_id) <> 1
     or exists (
       select 1
       from public.stage01_intake_completion_baselines as baseline
       left join public.workflow_node_events as event
         on event.id = baseline.completion_event_id
        and event.node_execution_id = baseline.node_execution_id
        and event.event_type = 'completed'
        and event.payload ->> 'baselineId' = baseline.id::text
       where baseline.node_execution_id = intake_execution_id and event.id is null
     )
     or exists (
       select 1
       from public.stage01_intake_completion_baselines as baseline
       where baseline.node_execution_id = intake_execution_id
         and (
           baseline.snapshot ->> 'schemaVersion' <> '1'
           or baseline.snapshot #>> '{usableContactMethods,0,isUsableAtCompletion}' <> 'true'
           or baseline.snapshot -> 'intakeOwnerAssignment' is null
           or baseline.snapshot -> 'gates' is null
           or baseline.snapshot #>> '{completion,actorId}' <> actor_id::text
           or baseline.snapshot #>> '{completion,completedAt}' is null
         )
     ) then
    raise exception 'E2E 15 immutable Intake baseline lacks its event-linked completion evidence';
  end if;
  raise notice 'PASS E2E 15 01.1 Complete creates explicit immutable baseline linked to completion event';

  begin
    perform public.start_workflow_node(
      company_id, evaluation_execution_id, '{"expectedExecutionVersion":2}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'E2E 17 Evaluation started without an accountable owner';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_ACCOUNTABLE_OWNER_REQUIRED' then raise; end if;
  end;
  raise notice 'PASS E2E 17 01.2 cannot Start without Evaluation Owner';

  perform public.assign_workflow_node(
    company_id, evaluation_execution_id,
    pg_catalog.jsonb_build_object(
      'assignmentKind', 'accountable_owner', 'assigneeUserId', actor_id,
      'assignmentReason', 'Synthetic Evaluation Owner', 'expectedExecutionVersion', 2
    ), pg_catalog.gen_random_uuid()
  );
  perform public.start_workflow_node(
    company_id, evaluation_execution_id, '{"expectedExecutionVersion":3}'::jsonb,
    pg_catalog.gen_random_uuid()
  );

  result := public.raise_workflow_blocker(
    company_id, evaluation_execution_id,
    '{"effect":"non_blocking","categoryCode":"follow_up","description":"Track without blocking","expectedExecutionVersion":4}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if (select execution.phase from public.workflow_node_executions as execution where execution.id = evaluation_execution_id) <> 'active'
     or exists (
       select 1 from public.workflow_blockers as blocker
       where blocker.node_execution_id = evaluation_execution_id and blocker.effect = 'blocking' and blocker.resolved_at is null
     ) then
    raise exception 'E2E 33 non-blocking issue incorrectly produced blocking inputs';
  end if;
  raise notice 'PASS E2E 33 non-blocking issue does not derive blocked';

  result := public.raise_workflow_blocker(
    company_id, evaluation_execution_id,
    '{"effect":"blocking","categoryCode":"approval","description":"Blocking approval","expectedExecutionVersion":5}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if (select execution.phase from public.workflow_node_executions as execution where execution.id = evaluation_execution_id) <> 'active'
     or not exists (
       select 1 from public.workflow_blockers
       where id = (result ->> 'blockerId')::uuid and effect = 'blocking' and resolved_at is null
     ) then
    raise exception 'E2E 32 blocking Blocker did not produce the effective blocked inputs';
  end if;
  raise notice 'PASS E2E 32 open blocking Blocker derives blocked';
  perform public.resolve_workflow_blocker(
    company_id, (result ->> 'blockerId')::uuid,
    '{"resolution":"Approval received","expectedExecutionVersion":6}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
end $$;

do $$
#variable_conflict use_variable
declare
  company_id constant uuid := '58000000-0000-4000-8000-000000000021';
  opportunity_id uuid;
  intake_execution_id uuid;
  evaluation_execution_id uuid;
  cycle_id uuid;
  recommendation_id uuid;
  recommendation_one_snapshot jsonb;
  cycle_one_snapshot jsonb;
  reactivation_result jsonb;
  result jsonb;
begin
  select opportunity.id, intake_execution.id, evaluation_execution.id, cycle.id
  into opportunity_id, intake_execution_id, evaluation_execution_id, cycle_id
  from public.opportunities as opportunity
  join public.workflow_instances as workflow
    on workflow.subject_id = opportunity.id and workflow.subject_type = 'opportunity'
  join public.workflow_node_instances as intake_node
    on intake_node.workflow_instance_id = workflow.id and intake_node.node_key = '01.1'
  join public.workflow_node_executions as intake_execution
    on intake_execution.node_instance_id = intake_node.id and intake_execution.superseded_at is null
  join public.workflow_node_instances as evaluation_node
    on evaluation_node.workflow_instance_id = workflow.id and evaluation_node.node_key = '01.2'
  join public.workflow_node_executions as evaluation_execution
    on evaluation_execution.node_instance_id = evaluation_node.id and evaluation_execution.superseded_at is null
  join public.stage01_decision_cycles as cycle on cycle.node_execution_id = evaluation_execution.id
  where opportunity.company_id = company_id
    and opportunity.primary_customer_name = 'Acceptance Opportunity';

  perform public.record_stage01_criterion_evaluation(
    company_id, opportunity_id, 'required_fit',
    '{"applicability":"applicable","result":"insufficient_information","rationale":"Evidence is incomplete","evidence":[],"expectedCycleVersion":0}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  begin
    perform public.submit_stage01_recommendation(
      company_id, opportunity_id,
      '{"recommendation":"recommend_not_proceeding","rationale":"Must not proceed yet","evidence":[],"expectedCycleVersion":1}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'E2E 18 Recommendation accepted insufficient required information';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_EVALUATION_GATES_NOT_SATISFIED' then raise; end if;
  end;
  if exists (select 1 from public.stage01_recommendations as recommendation where recommendation.decision_cycle_id = cycle_id) then
    raise exception 'E2E 18 failed Recommendation was retained';
  end if;
  raise notice 'PASS E2E 18 required insufficient_information cannot proceed';

  perform public.record_stage01_criterion_evaluation(
    company_id, opportunity_id, 'required_fit',
    '{"applicability":"applicable","result":"concern","rationale":"Known concern","evidence":[],"expectedCycleVersion":1}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if (select cycle.final_outcome from public.stage01_decision_cycles as cycle where cycle.id = cycle_id) is not null then
    raise exception 'E2E 19 concern mechanically decided the outcome';
  end if;
  perform public.record_stage01_criterion_evaluation(
    company_id, opportunity_id, 'required_fit',
    '{"applicability":"applicable","result":"not_fit","rationale":"Current evidence is not fit","evidence":[],"expectedCycleVersion":2}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if (select cycle.final_outcome from public.stage01_decision_cycles as cycle where cycle.id = cycle_id) is not null then
    raise exception 'E2E 19 not_fit mechanically decided the outcome';
  end if;
  raise notice 'PASS E2E 19 concern or not_fit never auto-decides the outcome';

  perform public.record_stage01_criterion_evaluation(
    company_id, opportunity_id, 'required_fit',
    '{"applicability":"applicable","result":"fit","rationale":"Updated evidence supports readiness","evidence":[],"expectedCycleVersion":3}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  result := public.submit_stage01_recommendation(
    company_id, opportunity_id,
    '{"recommendation":"recommend_not_proceeding","rationale":"Documented business recommendation","evidence":[],"expectedCycleVersion":4}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  recommendation_id := (result ->> 'recommendationId')::uuid;
  select pg_catalog.to_jsonb(recommendation) into recommendation_one_snapshot
  from public.stage01_recommendations as recommendation where recommendation.id = recommendation_id;
  if (select recommendation.version from public.stage01_recommendations as recommendation where recommendation.id = recommendation_id) <> 1 then
    raise exception 'E2E 20 first Recommendation version was not immutable version 1';
  end if;
  raise notice 'PASS E2E 20 Recommendation submission records an immutable version';

  perform public.return_stage01_for_clarification(
    company_id, opportunity_id,
    pg_catalog.jsonb_build_object(
      'recommendationId', recommendation_id,
      'reason', 'Clarify the current evidence', 'expectedCycleVersion', 5
    ), pg_catalog.gen_random_uuid()
  );
  if (select count(*) from public.stage01_decision_cycles as cycle where cycle.opportunity_id = opportunity_id) <> 1
     or not exists (
       select 1 from public.stage01_clarification_returns as clarification
       where clarification.decision_cycle_id = cycle_id and clarification.recommendation_id = recommendation_id
     ) then
    raise exception 'E2E 21 clarification did not preserve the cycle and Recommendation';
  end if;
  raise notice 'PASS E2E 21 clarification return preserves the cycle and invalidates current Recommendation';

  result := public.submit_stage01_recommendation(
    company_id, opportunity_id,
    '{"recommendation":"recommend_not_proceeding","rationale":"Fresh recommendation after clarification","evidence":[],"expectedCycleVersion":6}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if (select version from public.stage01_recommendations where id = (result ->> 'recommendationId')::uuid) <> 2
     or (select pg_catalog.to_jsonb(recommendation) from public.stage01_recommendations as recommendation where recommendation.id = recommendation_id)
        is distinct from recommendation_one_snapshot then
    raise exception 'E2E 22 newer Recommendation did not append or changed Recommendation 1';
  end if;
  raise notice 'PASS E2E 22 newer Recommendation restores decision readiness';

  begin
    perform public.record_stage01_final_decision(
      company_id, opportunity_id,
      '{"outcome":"proceed","rationale":"Override attempt without rationale","expectedCycleVersion":7}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'E2E 24 override without meaningful rationale was accepted';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_OVERRIDE_RATIONALE_REQUIRED' then raise; end if;
  end;
  raise notice 'PASS E2E 24 override requires meaningful rationale';

  perform public.record_stage01_final_decision(
    company_id, opportunity_id,
    '{"outcome":"not_proceeding","rationale":"Authority matches the current Recommendation","expectedCycleVersion":7}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if (select cycle.final_outcome from public.stage01_decision_cycles as cycle where cycle.id = cycle_id) <> 'not_proceeding'
     or (select cycle.final_recommendation_id from public.stage01_decision_cycles as cycle where cycle.id = cycle_id)
        is distinct from (result ->> 'recommendationId')::uuid then
    raise exception 'E2E 23 matching Final Decision did not retain its Recommendation link';
  end if;
  raise notice 'PASS E2E 23 Final Decision may match Recommendation';

  begin
    perform public.record_stage01_final_decision(
      company_id, opportunity_id,
      '{"outcome":"not_proceeding","rationale":"Second decision","expectedCycleVersion":8}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'E2E 25 second Final Decision was accepted';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_FINAL_DECISION_EXISTS' then raise; end if;
  end;
  if (select count(*) from public.stage01_decision_cycles as cycle where cycle.id = cycle_id and cycle.final_decision_at is not null) <> 1 then
    raise exception 'E2E 25 Final Decision was edited';
  end if;
  raise notice 'PASS E2E 25 Final Decision cannot be edited or submitted twice';

  if (select execution.phase from public.workflow_node_executions as execution where execution.id = evaluation_execution_id) <> 'active' then
    raise exception 'E2E 26 Final Decision auto-completed Evaluation';
  end if;
  raise notice 'PASS E2E 26 Final Decision does not auto-complete 01.2';

  perform public.complete_stage01_evaluation(
    company_id, evaluation_execution_id,
    '{"expectedExecutionVersion":7,"expectedCycleVersion":8}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if (select execution.phase from public.workflow_node_executions as execution where execution.id = evaluation_execution_id) <> 'completed' then
    raise exception 'E2E 27 explicit Evaluation completion did not complete 01.2';
  end if;
  raise notice 'PASS E2E 27 explicit 01.2 Complete succeeds only after current gates';

  if not exists (
    select 1 from public.opportunities as opportunity
    where opportunity.id = opportunity_id and opportunity.validity_state = 'valid'
  ) or (select cycle.final_outcome from public.stage01_decision_cycles as cycle where cycle.id = cycle_id) <> 'not_proceeding' then
    raise exception 'E2E 28 not_proceeding Opportunity is not queryable as a retained valid record';
  end if;
  raise notice 'PASS E2E 28 not_proceeding Opportunity remains queryable';

  select pg_catalog.to_jsonb(cycle) into cycle_one_snapshot
  from public.stage01_decision_cycles as cycle where cycle.id = cycle_id;
  reactivation_result := public.reactivate_stage01(
    company_id, opportunity_id,
    '{"reason":"Changed conditions justify reconsideration","expectedOpportunityVersion":14,"expectedExecutionVersion":8,"expectedCycleVersion":8}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if (select pg_catalog.to_jsonb(cycle) from public.stage01_decision_cycles as cycle where cycle.id = cycle_id)
        is distinct from cycle_one_snapshot
     or (select count(*) from public.stage01_decision_cycles as cycle where cycle.opportunity_id = opportunity_id) <> 2
     or not exists (
       select 1 from public.stage01_decision_cycles as cycle
       join public.workflow_node_executions as execution on execution.id = cycle.node_execution_id
       where cycle.opportunity_id = opportunity_id and cycle.cycle_no = 2
         and cycle.reactivation_reason = 'Changed conditions justify reconsideration'
         and execution.execution_no = 2 and execution.phase = 'not_started'
     ) then
    raise exception 'E2E 29 Reactivation changed Cycle 1 or did not append Cycle 2';
  end if;
  raise notice 'PASS E2E 29 Reactivation creates Cycle 2 and preserves Cycle 1';

  perform public.invalidate_opportunity(
    company_id, opportunity_id,
    '{"invalidReasonCode":"test_invalid","reason":"Independent record validity issue","expectedOpportunityVersion":14}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if (select opportunity.validity_state from public.opportunities as opportunity where opportunity.id = opportunity_id) <> 'invalid'
     or (select cycle.final_outcome from public.stage01_decision_cycles as cycle where cycle.id = cycle_id) <> 'not_proceeding' then
    raise exception 'E2E 30 invalidity collapsed into the prior not_proceeding outcome';
  end if;
  raise notice 'PASS E2E 30 invalidity remains distinct from not_proceeding';
  perform public.restore_opportunity(
    company_id, opportunity_id,
    '{"reason":"Validity evidence restored","expectedOpportunityVersion":15}'::jsonb,
    pg_catalog.gen_random_uuid()
  );

  perform public.reopen_workflow_node(
    company_id, intake_execution_id,
    '{"reason":"Intake evidence changed","expectedExecutionVersion":3}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  perform public.complete_stage01_intake(
    company_id, intake_execution_id,
    '{"expectedOpportunityVersion":16,"expectedExecutionVersion":4}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  perform public.revalidate_workflow_node(
    company_id, (reactivation_result ->> 'nodeExecutionId')::uuid,
    '{"reason":"Current Intake baseline verified","evidence":["baseline:2"],"expectedExecutionVersion":1}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if (select count(*) from public.stage01_intake_completion_baselines as baseline where baseline.node_execution_id = intake_execution_id) <> 2
     or (select count(*) from public.workflow_node_events as event where event.node_execution_id = intake_execution_id and event.event_type = 'completed') <> 2
     or exists (
       select 1
       from public.stage01_intake_completion_baselines as baseline
       left join public.workflow_node_events as event
         on event.id = baseline.completion_event_id
        and event.payload ->> 'baselineId' = baseline.id::text
       where baseline.node_execution_id = intake_execution_id and event.id is null
     )
     or (select needs_revalidation from public.workflow_node_executions where id = (reactivation_result ->> 'nodeExecutionId')::uuid) then
    raise exception 'E2E 31 reopen/revalidation lost old completion history or current validity';
  end if;
  raise notice 'PASS E2E 31 reopen/revalidation preserves old completion history';
end $$;

reset role;

select 'PASS E2E 01-33 Stage 01 public-RPC acceptance flows' as result;

rollback;
