begin;

create function pg_temp.stage01_bootstrap_definition()
returns jsonb
language sql
immutable
as $$
  select $definition$
  {
    "nodes": [
      {"key":"01.1","type":"sub_stage","parentNodeKey":null},
      {"key":"01.2","type":"sub_stage","parentNodeKey":null}
    ],
    "dependencies": [
      {"from":"01.1","to":"01.2","requires":"completed_current_valid"}
    ],
    "dimensions": [
      "customer_need",
      "scope_capability",
      "resources_schedule",
      "commercial_viability",
      "risk_special_conditions"
    ],
    "taxonomies": {
      "customer_type":[{"code":"test_customer","label":"Test customer","semanticKey":"customer"}],
      "contact_relationship":[{"code":"test_primary","label":"Test primary","semanticKey":"primary"}],
      "scope":[{"code":"test_scope","label":"Test scope","semanticKey":"scope"}],
      "lead_source":[{"code":"test_direct","label":"Test direct","behavior":{"requiresReferrer":false}}],
      "referrer_type":[{"code":"test_person","label":"Test person","semanticKey":"person"}],
      "engagement_status":[{"code":"test_grounded","label":"Test grounded","semanticKey":"grounded"}],
      "invalid_reason":[
        {"code":"test_invalid","label":"Test invalid","semanticKey":"invalid"},
        {"code":"test_duplicate_invalid","label":"Test duplicate invalid","semanticKey":"duplicate_merged"}
      ],
      "budget_status":[{"code":"test_unknown","label":"Test unknown","semanticKey":"unknown"}],
      "timeline_status":[{"code":"test_unknown","label":"Test unknown","semanticKey":"unknown"}],
      "priority":[{"code":"test_normal","label":"Test normal","semanticKey":"normal"}],
      "intake_channel":[{"code":"test_phone","label":"Test phone","semanticKey":"phone"}],
      "blocker_category":[{"code":"test_follow_up","label":"Test follow up","semanticKey":"follow_up"}]
    },
    "criteria": [
      {"key":"test_customer_need","dimensionKey":"customer_need","label":"Test customer need","description":"Synthetic test criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":1},
      {"key":"test_scope_capability","dimensionKey":"scope_capability","label":"Test scope capability","description":"Synthetic test criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":2},
      {"key":"test_resources_schedule","dimensionKey":"resources_schedule","label":"Test resources schedule","description":"Synthetic test criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":3},
      {"key":"test_commercial_viability","dimensionKey":"commercial_viability","label":"Test commercial viability","description":"Synthetic test criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":4},
      {"key":"test_risk_special","dimensionKey":"risk_special_conditions","label":"Test risk special conditions","description":"Synthetic test criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":5}
    ],
    "capabilities": {
      "intakeOwner":"journey.assignment.manage",
      "evaluationOwner":"journey.assignment.manage",
      "start":"journey.node.start",
      "complete":"journey.node.complete",
      "decision":"stage01.decision.record"
    },
    "gates": {
      "intake":["approved_minimum","duplicate_resolved","no_blocking_blocker"],
      "evaluation":["required_applicable_evaluated","recommendation_current","final_decision_recorded"]
    }
  }
  $definition$::jsonb;
$$;

insert into auth.users (id, email) values
  ('54000000-0000-4000-8000-000000000001', 'stage01-bootstrap@test.invalid');

insert into public.tenants (id, code, name) values
  ('54000000-0000-4000-8000-000000000010', 'stage01-bootstrap', 'Stage 01 bootstrap test');

insert into public.companies (id, tenant_id, code, name) values
  ('54000000-0000-4000-8000-000000000020', '54000000-0000-4000-8000-000000000010', 'S01-BOOT', 'Stage 01 bootstrap company');

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  ('54000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000010', array['member']);

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  ('54000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000010', '54000000-0000-4000-8000-000000000020', array['member']);

insert into public.roles (id, tenant_id, company_id, code, name, description, is_system) values
  (
    '54000000-0000-4000-8000-000000000100', '54000000-0000-4000-8000-000000000010',
    '54000000-0000-4000-8000-000000000020', 'stage01_bootstrap_creator',
    'Stage 01 bootstrap creator', 'Test-only Opportunity creator', false
  );

insert into public.role_permissions (role_id, permission_code) values
  ('54000000-0000-4000-8000-000000000100', 'opportunity.create');

insert into public.company_role_assignments (
  tenant_id, company_id, user_id, role_id, granted_by, grant_reason
) values (
  '54000000-0000-4000-8000-000000000010', '54000000-0000-4000-8000-000000000020',
  '54000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000100',
  '54000000-0000-4000-8000-000000000001', 'Stage 01 bootstrap fixture'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"54000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.create_stage01_opportunity(
      '54000000-0000-4000-8000-000000000020',
      '{"primaryCustomerName":"No definition"}'::jsonb,
      '54000000-0000-4000-8000-000000000201'
    );
    raise exception 'DB-S01-BOOT-001 missing definition unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE' then raise; end if;
  end;
end $$;

reset role;

do $$
begin
  if exists (
    select 1 from public.opportunities
    where company_id = '54000000-0000-4000-8000-000000000020'
  ) then
    raise exception 'DB-S01-BOOT-001 failed bootstrap committed aggregate rows';
  end if;
end $$;

insert into public.workflow_definition_snapshots (
  tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash
) values
  (
    '54000000-0000-4000-8000-000000000010', '54000000-0000-4000-8000-000000000020',
    'vqh.stage01', 1, 1, pg_temp.stage01_bootstrap_definition(), 'bootstrap-valid-v1'
  ),
  (
    '54000000-0000-4000-8000-000000000010', '54000000-0000-4000-8000-000000000020',
    'vqh.stage01', 2, 1,
    pg_temp.stage01_bootstrap_definition() #- '{capabilities,decision}', 'bootstrap-invalid-v2'
  );

set local role authenticated;

do $$
begin
  begin
    perform public.create_stage01_opportunity(
      '54000000-0000-4000-8000-000000000020',
      '{"primaryCustomerName":"Invalid newest definition"}'::jsonb,
      '54000000-0000-4000-8000-000000000202'
    );
    raise exception 'DB-S01-BOOT-002 invalid newest definition unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_INVALID' then raise; end if;
  end;
end $$;

reset role;

do $$
begin
  if exists (
    select 1 from public.opportunities
    where company_id = '54000000-0000-4000-8000-000000000020'
  ) then
    raise exception 'DB-S01-BOOT-002 invalid definition fell back or committed aggregate rows';
  end if;
end $$;

insert into public.workflow_definition_snapshots (
  tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash
) values (
  '54000000-0000-4000-8000-000000000010', '54000000-0000-4000-8000-000000000020',
  'vqh.stage01', 3, 1, pg_temp.stage01_bootstrap_definition(), 'bootstrap-valid-v3'
);

set local role authenticated;

do $$
declare
  result jsonb;
begin
  begin
    perform public.create_stage01_opportunity(
      '54000000-0000-4000-8000-000000000020',
      '{"primaryCustomerName":"Unknown taxonomy","customerTypeCode":"unknown_code"}'::jsonb,
      '54000000-0000-4000-8000-000000000203'
    );
    raise exception 'DB-S01-BOOT-004 unknown taxonomy code unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if;
  end;

  result := public.create_stage01_opportunity(
    '54000000-0000-4000-8000-000000000020',
    '{"primaryCustomerName":"Successful bootstrap"}'::jsonb,
    '54000000-0000-4000-8000-000000000204'
  );

  if not (result ?& array[
    'opportunityId', 'workflowInstanceId', 'intakeNodeInstanceId', 'intakeExecutionId',
    'evaluationNodeInstanceId', 'evaluationExecutionId', 'decisionCycleId',
    'opportunityVersion', 'intakeExecutionVersion', 'evaluationExecutionVersion',
    'decisionCycleVersion'
  ]) then
    raise exception 'DB-S01-BOOT-003 bootstrap result contract is incomplete';
  end if;
end $$;

reset role;

do $$
declare
  v_opportunity_id uuid;
  v_workflow_id uuid;
begin
  select opportunity.id into v_opportunity_id
  from public.opportunities as opportunity
  where opportunity.company_id = '54000000-0000-4000-8000-000000000020';

  select workflow.id into v_workflow_id
  from public.workflow_instances as workflow
  where workflow.company_id = '54000000-0000-4000-8000-000000000020'
    and workflow.subject_type = 'opportunity'
    and workflow.subject_id = v_opportunity_id;

  if v_opportunity_id is null or v_workflow_id is null then
    raise exception 'DB-S01-BOOT-003 aggregate root or Workflow Instance missing';
  end if;
  if (select count(*) from public.workflow_node_instances where workflow_instance_id = v_workflow_id) <> 2 then
    raise exception 'DB-S01-BOOT-003 expected exactly two Stage 01 child nodes';
  end if;
  if (select array_agg(node_key order by node_key) from public.workflow_node_instances where workflow_instance_id = v_workflow_id)
     is distinct from array['01.1', '01.2']::text[] then
    raise exception 'DB-S01-BOOT-003 unexpected parent Stage or Stage 02 node created';
  end if;
  if (select count(*) from public.workflow_node_executions as execution
      join public.workflow_node_instances as node on node.id = execution.node_instance_id
      where node.workflow_instance_id = v_workflow_id) <> 2 then
    raise exception 'DB-S01-BOOT-003 expected one initial execution per child node';
  end if;
  if (select count(*) from public.stage01_decision_cycles where opportunity_id = v_opportunity_id) <> 1 then
    raise exception 'DB-S01-BOOT-003 expected Decision Cycle #1';
  end if;
  if exists (
    select 1
    from public.workflow_node_assignments as assignment
    join public.workflow_node_executions as execution on execution.id = assignment.node_execution_id
    join public.workflow_node_instances as node on node.id = execution.node_instance_id
    where node.workflow_instance_id = v_workflow_id
  ) then
    raise exception 'DB-S01-BOOT-003 bootstrap inferred an owner or Project Manager assignment';
  end if;
end $$;

select 'PASS DB-S01-BOOT-001..004 atomic bootstrap and taxonomy boundary' as result;

rollback;
