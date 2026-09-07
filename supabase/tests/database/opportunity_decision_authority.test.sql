begin;

-- Amendment 25 Slice 1 authority test contract. This is intentionally a
-- transactional pgTAP artifact; execution requires the approved Cloud DEV
-- test target and is not invoked by this task.
select plan(103);

select has_table('public', 'opportunity_decision_authority_events', 'authority events are stored in Opportunity Decision domain');
select has_table('public', 'opportunity_decision_policy_snapshots', 'authority policy snapshots are stored in the Opportunity Decision domain');
select has_table('public', 'opportunity_decision_policy_binding_events', 'authority policy bindings have append-only audit history');
select has_table('public', 'company_opportunity_decision_capabilities', 'company-scoped Decision Authority capability is stored separately from policy');
select has_column('public', 'company_opportunity_decision_capabilities', 'enabled', 'company Decision Authority capability has an explicit enabled state');
select has_function('private', 'company_opportunity_decision_authority_enabled', array['uuid', 'uuid'], 'company Decision Authority requirement has one authoritative lookup');
select has_column('public', 'opportunity_decision_policy_snapshots', 'status', 'authority policy snapshots have an immutable publication status');
select has_column('public', 'opportunity_decision_policy_snapshots', 'published_at', 'authority policy snapshots retain publication time');
select has_column('public', 'opportunity_decision_policy_snapshots', 'approved_at', 'authority policy snapshots retain approval time');
select has_column('public', 'opportunity_decision_policy_snapshots', 'source_policy_snapshot_id', 'derived authority policy snapshots retain their immutable source pointer');
select has_column('public', 'opportunity_decision_policy_binding_events', 'previous_policy_snapshot_id', 'policy binding audit retains the previous pointer');
select has_constraint('public', 'opportunity_decision_policy_snapshots', 'opportunity_decision_policy_snapshots_publication_state_check', 'policy snapshots constrain publication and approval timestamps');
select has_column('public', 'stage01_decision_cycles', 'authority_resolution_event_id', 'transitional cycle stores authority event pointer');
select has_column('public', 'stage01_decision_cycles', 'decision_policy_snapshot_id', 'decision cycle binds its authority policy snapshot');
select col_is_fk('public', 'stage01_decision_cycles', 'authority_resolution_event_id', 'authority pointer is referentially constrained');
select col_is_fk('public', 'stage01_decision_cycles', 'decision_policy_snapshot_id', 'decision policy pointer is referentially constrained');
select has_function('public', 'assign_opportunity_decision_authority', array['uuid', 'uuid', 'uuid', 'jsonb'], 'initial authority command is public RPC');
select has_function('public', 'list_opportunity_decision_authority_candidates', array['uuid', 'uuid', 'uuid'], 'candidate read is public RPC');
select has_function('public', 'get_opportunity_decision_authority_projection', array['uuid', 'uuid', 'uuid'], 'canonical authority projection is public RPC');
select has_function('public', 'transition_b4_legacy_opportunity_decision_policy', array['uuid', 'uuid', 'uuid', 'jsonb'], 'B4 legacy policy transition is an explicit public RPC');
select has_function('public', 'transition_opportunity_decision_policy', array['uuid', 'uuid', 'uuid', 'jsonb'], 'canonical policy transition is a public RPC');
select has_function('private', 'opportunity_decision_authority_eligible', array['uuid', 'uuid', 'uuid'], 'eligibility is server authoritative');
select has_constraint('public', 'opportunity_decision_authority_events', 'opportunity_decision_authority_events_idempotency_key', 'idempotency is company scoped');
select has_constraint('public', 'opportunity_decision_authority_events', 'opportunity_decision_authority_events_assigned_target', 'initial authority events require an assigned user');
select has_trigger('public', 'opportunity_decision_authority_events', 'opportunity_decision_authority_events_prevent_mutation', 'authority events are immutable');
select has_trigger('public', 'opportunity_decision_authority_events', 'opportunity_decision_authority_events_guard_cycle', 'authority events are bound to their exact cycle opportunity scope');
select has_trigger('public', 'opportunity_decision_policy_snapshots', 'opportunity_decision_policy_snapshots_prevent_mutation', 'authority policy snapshots are immutable');
select has_trigger('public', 'opportunity_decision_policy_binding_events', 'opportunity_decision_policy_binding_events_prevent_mutation', 'authority policy binding history is immutable');
select has_trigger('public', 'opportunity_decision_policy_binding_events', 'opportunity_decision_policy_binding_events_guard_scope', 'authority policy binding audits enforce cycle scope');
select has_trigger('public', 'stage01_decision_cycles', 'stage01_decision_cycles_bind_decision_policy', 'new decision cycles bind the active authority policy');
select is(
  (select class.relrowsecurity from pg_catalog.pg_class as class join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace where namespace.nspname = 'public' and class.relname = 'opportunity_decision_authority_events'),
  true,
  'authority event table has RLS enabled'
);
select table_privs_are('public', 'opportunity_decision_authority_events', 'authenticated', array[]::text[], 'authenticated has no direct event-table access');
select table_privs_are('public', 'company_opportunity_decision_capabilities', 'authenticated', array[]::text[], 'authenticated has no direct company capability-table access');
select function_privs_are('public', 'assign_opportunity_decision_authority', array['uuid','uuid','uuid','jsonb'], 'authenticated', array['EXECUTE'], 'authenticated can call authority command only through RPC');
select function_privs_are('public', 'list_opportunity_decision_authority_candidates', array['uuid','uuid','uuid'], 'authenticated', array['EXECUTE'], 'authenticated can read eligible candidates through RPC');
select function_privs_are('public', 'get_opportunity_decision_authority_projection', array['uuid','uuid','uuid'], 'authenticated', array['EXECUTE'], 'authenticated can read canonical authority projection through RPC');
select function_privs_are('public', 'get_opportunity_decision_authority_projection', array['uuid','uuid','uuid'], 'anon', array[]::text[], 'anonymous callers cannot execute authority projection');
select function_privs_are('public', 'get_opportunity_decision_authority_projection', array['uuid','uuid','uuid'], 'PUBLIC', array[]::text[], 'PUBLIC does not inherit authority projection execution');
select function_privs_are('public', 'record_stage01_final_decision', array['uuid','uuid','jsonb','uuid'], 'authenticated', array['EXECUTE'], 'final-decision compatibility RPC remains callable');
select function_privs_are('public', 'transition_opportunity_decision_policy', array['uuid','uuid','uuid','jsonb'], 'authenticated', array['EXECUTE'], 'authenticated can invoke the canonical policy-transition RPC');
select function_privs_are('private', 'assert_opportunity_decision_authority_policy', array['jsonb'], 'authenticated', array[]::text[], 'authenticated cannot execute the private policy assertion helper');
select function_privs_are('private', 'active_opportunity_decision_policy_snapshot', array['uuid','uuid'], 'authenticated', array[]::text[], 'authenticated cannot execute the private active-policy helper');
select function_privs_are('private', 'bind_new_stage01_decision_cycle_policy', array[]::text[], 'authenticated', array[]::text[], 'authenticated cannot execute the private new-cycle binding trigger helper');
select function_privs_are('private', 'company_opportunity_decision_authority_enabled', array['uuid','uuid'], 'authenticated', array[]::text[], 'authenticated cannot execute the private company capability lookup');
select function_privs_are('private', 'audit_new_stage01_decision_cycle_policy', array[]::text[], 'authenticated', array[]::text[], 'authenticated cannot execute the private new-cycle audit trigger helper');
select function_privs_are('private', 'b4_opportunity_decision_policy_snapshot', array['uuid','uuid','uuid'], 'authenticated', array[]::text[], 'authenticated cannot execute the private B4 policy helper');
select function_privs_are('private', 'transition_b4_legacy_opportunity_decision_policy', array['uuid','uuid','uuid','jsonb'], 'authenticated', array[]::text[], 'authenticated cannot execute the private policy-transition implementation');
select lives_ok($$ select private.stage01_current_recommendation_id('00000000-0000-0000-0000-000000000000'::uuid) $$, 'recommendation freshness predicate remains independent of authority cycle version');
select lives_ok($$ select private.opportunity_decision_authority_eligible('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid) $$, 'eligibility check is safe for an ineligible user');
select has_function('private', 'record_opportunity_decision_final_decision', array['uuid', 'uuid', 'jsonb', 'uuid'], 'final decision is authority-gated in private command');

-- Behaviour fixture: all authority mutations below use the public RPC under
-- an authenticated actor context. Direct writes only establish ordinary
-- workflow/evaluation history needed to isolate authority behaviour.
reset role;
do $$
declare
  tenant_id constant uuid := '25000000-0000-4000-8000-000000000010';
  company_id constant uuid := '25000000-0000-4000-8000-000000000020';
  actor_id constant uuid := '25000000-0000-4000-8000-000000000001';
  wrong_actor_id constant uuid := '25000000-0000-4000-8000-000000000002';
  ineligible_id constant uuid := '25000000-0000-4000-8000-000000000003';
  inactive_target_id constant uuid := '25000000-0000-4000-8000-000000000004';
  foreign_target_id constant uuid := '25000000-0000-4000-8000-000000000005';
  actor_role_id constant uuid := '25000000-0000-4000-8000-000000000100';
  wrong_role_id constant uuid := '25000000-0000-4000-8000-000000000101';
  ineligible_role_id constant uuid := '25000000-0000-4000-8000-000000000102';
  inactive_role_id constant uuid := '25000000-0000-4000-8000-000000000103';
  foreign_role_id constant uuid := '25000000-0000-4000-8000-000000000104';
  department_id constant uuid := '25000000-0000-4000-8000-000000000200';
  foreign_company_id constant uuid := '25000000-0000-4000-8000-000000000021';
  foreign_department_id constant uuid := '25000000-0000-4000-8000-000000000201';
  snapshot_id constant uuid := '25000000-0000-4000-8000-000000000210';
  policy_snapshot_id constant uuid := '25000000-0000-4000-8000-000000000211';
  fixture record;
  criterion text;
begin
  insert into auth.users (id, email) values
    (actor_id, 'authority-actor@taskovia.invalid'),
    (wrong_actor_id, 'authority-wrong@taskovia.invalid'),
    (ineligible_id, 'authority-ineligible@taskovia.invalid'),
    (inactive_target_id, 'authority-inactive@taskovia.invalid'),
    (foreign_target_id, 'authority-foreign@taskovia.invalid');
  insert into public.tenants (id, code, name) values (tenant_id, 'authority-pgtap', 'Authority pgTAP');
  insert into public.companies (id, tenant_id, code, name) values (company_id, tenant_id, 'AUTHORITY_PGTAP', 'Authority pgTAP');
  insert into public.companies (id, tenant_id, code, name) values (foreign_company_id, tenant_id, 'AUTHORITY_FOREIGN', 'Authority foreign company');
  insert into public.tenant_memberships (user_id, tenant_id, roles) values
    (actor_id, tenant_id, array['member']), (wrong_actor_id, tenant_id, array['member']), (ineligible_id, tenant_id, array['member']),
    (inactive_target_id, tenant_id, array['member']), (foreign_target_id, tenant_id, array['member']);
  insert into public.company_memberships (user_id, tenant_id, company_id, roles, is_active) values
    (actor_id, tenant_id, company_id, array['member'], true), (wrong_actor_id, tenant_id, company_id, array['member'], true), (ineligible_id, tenant_id, company_id, array['member'], true),
    (inactive_target_id, tenant_id, company_id, array['member'], false), (foreign_target_id, tenant_id, foreign_company_id, array['member'], true);
  insert into public.departments (id, tenant_id, company_id, code, name) values (department_id, tenant_id, company_id, 'AUTH', 'Authority');
  insert into public.departments (id, tenant_id, company_id, code, name) values (foreign_department_id, tenant_id, foreign_company_id, 'AUTH-F', 'Authority foreign');
  insert into public.roles (id, tenant_id, company_id, code, name, description, is_system) values
    (actor_role_id, tenant_id, company_id, 'authority_actor', 'Authority actor', 'Authority pgTAP actor', false),
    (wrong_role_id, tenant_id, company_id, 'authority_wrong', 'Wrong authority actor', 'Authority pgTAP mismatch actor', false),
    (ineligible_role_id, tenant_id, company_id, 'authority_ineligible', 'Ineligible authority actor', 'Authority pgTAP ineligible target', false),
    (inactive_role_id, tenant_id, company_id, 'authority_inactive', 'Inactive authority target', 'Authority pgTAP inactive target', false),
    (foreign_role_id, tenant_id, foreign_company_id, 'authority_foreign', 'Foreign authority target', 'Authority pgTAP foreign target', false);
  insert into public.role_permissions (role_id, permission_code) values
    (actor_role_id, 'opportunity.read'), (actor_role_id, 'opportunity.decision_authority.assign'), (actor_role_id, 'opportunity.decision.record'), (actor_role_id, 'journey.node.complete'), (actor_role_id, 'stage01.reactivate'),
    (wrong_role_id, 'opportunity.read'), (wrong_role_id, 'opportunity.decision.record'),
    (ineligible_role_id, 'opportunity.read'),
    (inactive_role_id, 'opportunity.decision.record'), (foreign_role_id, 'opportunity.decision.record');
  insert into public.company_role_assignments (tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values
    (tenant_id, company_id, actor_id, actor_role_id, actor_id, 'Authority pgTAP actor'),
    (tenant_id, company_id, wrong_actor_id, wrong_role_id, actor_id, 'Authority pgTAP wrong actor'),
    (tenant_id, company_id, ineligible_id, ineligible_role_id, actor_id, 'Authority pgTAP ineligible target'),
    (tenant_id, company_id, inactive_target_id, inactive_role_id, actor_id, 'Authority pgTAP inactive target'),
    (tenant_id, foreign_company_id, foreign_target_id, foreign_role_id, actor_id, 'Authority pgTAP foreign target');
  insert into public.employees (id, tenant_id, company_id, user_id, employee_code, full_name, work_email, department_id, employment_status, created_by) values
    ('25000000-0000-4000-8000-000000000301', tenant_id, company_id, actor_id, 'AUTH-ACTOR', 'Authority actor', 'authority-actor@taskovia.invalid', department_id, 'active', actor_id),
    ('25000000-0000-4000-8000-000000000302', tenant_id, company_id, wrong_actor_id, 'AUTH-WRONG', 'Wrong authority actor', 'authority-wrong@taskovia.invalid', department_id, 'active', actor_id),
    ('25000000-0000-4000-8000-000000000303', tenant_id, company_id, ineligible_id, 'AUTH-INELIGIBLE', 'Ineligible authority actor', 'authority-ineligible@taskovia.invalid', department_id, 'active', actor_id),
    ('25000000-0000-4000-8000-000000000304', tenant_id, company_id, inactive_target_id, 'AUTH-INACTIVE', 'Inactive authority target', 'authority-inactive@taskovia.invalid', department_id, 'active', actor_id),
    ('25000000-0000-4000-8000-000000000305', tenant_id, foreign_company_id, foreign_target_id, 'AUTH-FOREIGN', 'Foreign authority target', 'authority-foreign@taskovia.invalid', foreign_department_id, 'active', actor_id);
  insert into public.workflow_definition_snapshots (id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash) values
    (snapshot_id, tenant_id, company_id, 'vqh.stage01', 1, 1,
     '{"nodes":[{"key":"01.1","type":"sub_stage","parentNodeKey":null},{"key":"01.2","type":"sub_stage","parentNodeKey":null}],"dependencies":[{"from":"01.1","to":"01.2","requires":"completed_current_valid"}],"dimensions":["customer_need","scope_capability","resources_schedule","commercial_viability","risk_special_conditions"],"taxonomies":{"customer_type":[{"code":"customer","label":"Customer"}],"contact_relationship":[{"code":"decision_maker","label":"Decision maker"}],"scope":[{"code":"design","label":"Design"}],"lead_source":[{"code":"direct","label":"Direct","behavior":{"requiresReferrer":false}}],"referrer_type":[{"code":"partner","label":"Partner"}],"engagement_status":[{"code":"grounded","label":"Grounded"}],"invalid_reason":[{"code":"invalid","label":"Invalid"}],"budget_status":[{"code":"unknown","label":"Unknown"}],"timeline_status":[{"code":"unknown","label":"Unknown"}],"priority":[{"code":"normal","label":"Normal"}],"intake_channel":[{"code":"phone","label":"Phone"}],"blocker_category":[{"code":"follow_up","label":"Follow up"}]},"criteria":[{"key":"customer_need","dimensionKey":"customer_need","label":"Customer need","description":"Required","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":1},{"key":"scope_capability","dimensionKey":"scope_capability","label":"Scope","description":"Required","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":2},{"key":"resources_schedule","dimensionKey":"resources_schedule","label":"Schedule","description":"Required","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":3},{"key":"commercial_viability","dimensionKey":"commercial_viability","label":"Commercial","description":"Required","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":4},{"key":"risk_special","dimensionKey":"risk_special_conditions","label":"Risk","description":"Required","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":5}],"capabilities":{"intakeOwner":"journey.assignment.manage","evaluationOwner":"journey.assignment.manage","start":"journey.node.start","complete":"journey.node.complete","assignDecisionAuthority":"opportunity.decision_authority.assign","decision":"opportunity.decision.record"},"decisionGovernance":{"authority":{"required":true,"resolutionMode":"explicit_per_cycle","requiredBeforeFinalDecision":true,"requiredBeforeEvaluation":false,"selfAssignmentAllowed":true,"carryForwardOnNewCycle":false,"showPreviousAuthorityAsSuggestion":true,"assignPermission":"opportunity.decision_authority.assign","decisionPermission":"opportunity.decision.record","eligibility":{"requireActiveMembership":true,"requireAccountBacking":true,"requireActiveEmployee":true}}},"gates":{"intake":["approved_minimum","duplicate_resolved","no_blocking_blocker"],"evaluation":["required_applicable_evaluated","recommendation_current","final_decision_recorded"]}}'::jsonb,
     'authority-pgtap-definition');
  insert into public.opportunity_decision_policy_snapshots (id, tenant_id, company_id, policy_key, policy_version, policy, policy_hash, status, published_at, approved_at, created_by) values
    (policy_snapshot_id, tenant_id, company_id, 'opportunity.decision_authority', 1,
     '{"authority":{"required":true,"resolutionMode":"explicit_per_cycle","requiredBeforeFinalDecision":true,"requiredBeforeEvaluation":false,"selfAssignmentAllowed":true,"carryForwardOnNewCycle":false,"showPreviousAuthorityAsSuggestion":true,"assignPermission":"opportunity.decision_authority.assign","decisionPermission":"opportunity.decision.record","eligibility":{"requireActiveMembership":true,"requireAccountBacking":true,"requireActiveEmployee":true}}}'::jsonb,
     'authority-pgtap-policy-v1', 'published', clock_timestamp(), clock_timestamp(), actor_id);
  insert into public.company_opportunity_decision_capabilities (
    tenant_id, company_id, capability_key, enabled, configured_by
  ) values (
    tenant_id, company_id, 'opportunity.decision_authority', true, actor_id
  );
  for fixture in select * from (values
    ('25000000-0000-4000-8000-000000000401'::uuid, '25000000-0000-4000-8000-000000000411'::uuid, '25000000-0000-4000-8000-000000000421'::uuid, '25000000-0000-4000-8000-000000000431'::uuid, '25000000-0000-4000-8000-000000000441'::uuid, '25000000-0000-4000-8000-000000000451'::uuid, 1),
    ('25000000-0000-4000-8000-000000000402'::uuid, '25000000-0000-4000-8000-000000000412'::uuid, '25000000-0000-4000-8000-000000000422'::uuid, '25000000-0000-4000-8000-000000000432'::uuid, '25000000-0000-4000-8000-000000000442'::uuid, '25000000-0000-4000-8000-000000000452'::uuid, 1)
  ) as seeded(opportunity_id, workflow_id, intake_node_id, evaluation_node_id, intake_execution_id, evaluation_execution_id, cycle_no) loop
    insert into public.opportunities (id, tenant_id, company_id, primary_customer_name, customer_type_code, need_description, location_status, primary_lead_source_code, engagement_status_code, budget_status_code, timeline_status_code, priority_code, created_by)
    values (fixture.opportunity_id, tenant_id, company_id, 'Authority fixture ' || fixture.cycle_no || fixture.opportunity_id::text, 'customer', 'Authority fixture', 'unknown', 'direct', 'grounded', 'unknown', 'unknown', 'normal', actor_id);
    insert into public.workflow_instances (id, tenant_id, company_id, subject_type, subject_id, definition_snapshot_id, created_by)
    values (fixture.workflow_id, tenant_id, company_id, 'opportunity', fixture.opportunity_id, snapshot_id, actor_id);
    insert into public.workflow_node_instances (id, tenant_id, company_id, workflow_instance_id, node_key, node_type) values
      (fixture.intake_node_id, tenant_id, company_id, fixture.workflow_id, '01.1', 'sub_stage'),
      (fixture.evaluation_node_id, tenant_id, company_id, fixture.workflow_id, '01.2', 'sub_stage');
    insert into public.workflow_node_executions (id, tenant_id, company_id, node_instance_id, execution_no, phase, completed_by, completed_at, version) values
      (fixture.intake_execution_id, tenant_id, company_id, fixture.intake_node_id, 1, 'completed', actor_id, now(), 1),
      (fixture.evaluation_execution_id, tenant_id, company_id, fixture.evaluation_node_id, 1, 'active', null, null, 0);
    insert into public.stage01_decision_cycles (id, tenant_id, company_id, opportunity_id, node_execution_id, cycle_no, created_by) values
      (fixture.evaluation_execution_id, tenant_id, company_id, fixture.opportunity_id, fixture.evaluation_execution_id, fixture.cycle_no, actor_id);
    foreach criterion in array array['customer_need','scope_capability','resources_schedule','commercial_viability','risk_special'] loop
      insert into public.stage01_criterion_evaluations (tenant_id, company_id, decision_cycle_id, criterion_key, revision, applicability, result, rationale, evidence, evaluated_by, evaluated_at)
      values (tenant_id, company_id, fixture.evaluation_execution_id, criterion, 1, 'applicable', 'fit', 'Authority fixture evidence', '[]'::jsonb, actor_id, now() - interval '2 minutes');
    end loop;
    insert into public.stage01_recommendations (id, tenant_id, company_id, decision_cycle_id, version, recommendation, rationale, evidence, submitted_by, submitted_at)
    values (case when fixture.opportunity_id = '25000000-0000-4000-8000-000000000401'::uuid then '25000000-0000-4000-8000-000000000501'::uuid else '25000000-0000-4000-8000-000000000502'::uuid end, tenant_id, company_id, fixture.evaluation_execution_id, 1, 'recommend_proceed', 'Authority fixture recommendation', '[]'::jsonb, actor_id, now() - interval '1 minute');
  end loop;
end $$;

-- Amendment 31 keeps company capability configuration independent from both
-- workflow definitions and Decision Policy existence.  These fixtures use one
-- tenant so a policy lookup cannot accidentally pass by tenant-only fallback.
do $$
declare
  tenant_id constant uuid := '25000000-0000-4000-8000-000000000010';
  actor_id constant uuid := '25000000-0000-4000-8000-000000000001';
  source_snapshot_id constant uuid := '25000000-0000-4000-8000-000000000210';
  source_policy_id constant uuid := '25000000-0000-4000-8000-000000000211';
begin
  insert into public.companies (id, tenant_id, code, name) values
    ('25000000-0000-4000-8000-000000000022', tenant_id, 'AUTHORITY_GENERIC', 'Authority generic company'),
    ('25000000-0000-4000-8000-000000000023', tenant_id, 'AUTHORITY_REQUIRED_MISSING', 'Authority required policy missing'),
    ('25000000-0000-4000-8000-000000000024', tenant_id, 'AUTHORITY_REQUIRED_POLICY', 'Authority required policy present');
  insert into public.company_memberships (user_id, tenant_id, company_id, roles, is_active) values
    (actor_id, tenant_id, '25000000-0000-4000-8000-000000000022', array['member'], true),
    (actor_id, tenant_id, '25000000-0000-4000-8000-000000000023', array['member'], true),
    (actor_id, tenant_id, '25000000-0000-4000-8000-000000000024', array['member'], true);
  insert into public.roles (id, tenant_id, company_id, code, name, description, is_system) values
    ('25000000-0000-4000-8000-000000000107', tenant_id, '25000000-0000-4000-8000-000000000022', 'authority_generic_actor', 'Authority generic actor', 'Authority generic final-decision actor', false);
  insert into public.role_permissions (role_id, permission_code) values
    ('25000000-0000-4000-8000-000000000107', 'opportunity.read'),
    ('25000000-0000-4000-8000-000000000107', 'opportunity.decision.record'),
    ('25000000-0000-4000-8000-000000000107', 'opportunity.decision_authority.assign');
  insert into public.company_role_assignments (tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values
    (tenant_id, '25000000-0000-4000-8000-000000000022', actor_id, '25000000-0000-4000-8000-000000000107', actor_id, 'Authority generic final-decision actor');
  insert into public.company_opportunity_decision_capabilities (tenant_id, company_id, capability_key, enabled, configured_by) values
    (tenant_id, '25000000-0000-4000-8000-000000000023', 'opportunity.decision_authority', true, actor_id),
    (tenant_id, '25000000-0000-4000-8000-000000000024', 'opportunity.decision_authority', true, actor_id);
  insert into public.workflow_definition_snapshots (id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash)
  select seeded.id, '25000000-0000-4000-8000-000000000010'::uuid,
    seeded.company_id, 'vqh.stage01', 1, 1, source.definition, seeded.definition_hash
  from (values
    ('25000000-0000-4000-8000-000000000226'::uuid, '25000000-0000-4000-8000-000000000022'::uuid, 'authority-generic-definition'),
    ('25000000-0000-4000-8000-000000000227'::uuid, '25000000-0000-4000-8000-000000000023'::uuid, 'authority-missing-definition'),
    ('25000000-0000-4000-8000-000000000228'::uuid, '25000000-0000-4000-8000-000000000024'::uuid, 'authority-policy-definition')
  ) as seeded(id, company_id, definition_hash)
  cross join public.workflow_definition_snapshots source
  where source.id = source_snapshot_id;
  insert into public.opportunity_decision_policy_snapshots (id, tenant_id, company_id, policy_key, policy_version, policy, policy_hash, status, published_at, approved_at, created_by)
  select '25000000-0000-4000-8000-000000000255'::uuid,
    '25000000-0000-4000-8000-000000000010'::uuid,
    '25000000-0000-4000-8000-000000000024'::uuid,
    source.policy_key, 1, source.policy, 'authority-policy-company-v1', 'published', clock_timestamp(), clock_timestamp(), actor_id
  from public.opportunity_decision_policy_snapshots source where source.id = source_policy_id;
  insert into public.opportunities (id, tenant_id, company_id, primary_customer_name, customer_type_code, need_description, location_status, primary_lead_source_code, engagement_status_code, budget_status_code, timeline_status_code, priority_code, created_by) values
    ('25000000-0000-4000-8000-000000000426', tenant_id, '25000000-0000-4000-8000-000000000022', 'Authority generic', 'customer', 'Generic Decision Authority capability disabled', 'unknown', 'direct', 'grounded', 'unknown', 'unknown', 'normal', actor_id),
    ('25000000-0000-4000-8000-000000000427', tenant_id, '25000000-0000-4000-8000-000000000023', 'Authority missing', 'customer', 'Enabled Decision Authority policy missing', 'unknown', 'direct', 'grounded', 'unknown', 'unknown', 'normal', actor_id),
    ('25000000-0000-4000-8000-000000000428', tenant_id, '25000000-0000-4000-8000-000000000024', 'Authority policy', 'customer', 'Enabled Decision Authority policy present', 'unknown', 'direct', 'grounded', 'unknown', 'unknown', 'normal', actor_id);
  insert into public.workflow_instances (id, tenant_id, company_id, subject_type, subject_id, definition_snapshot_id, created_by) values
    ('25000000-0000-4000-8000-000000000436', tenant_id, '25000000-0000-4000-8000-000000000022', 'opportunity', '25000000-0000-4000-8000-000000000426', '25000000-0000-4000-8000-000000000226', actor_id),
    ('25000000-0000-4000-8000-000000000437', tenant_id, '25000000-0000-4000-8000-000000000023', 'opportunity', '25000000-0000-4000-8000-000000000427', '25000000-0000-4000-8000-000000000227', actor_id),
    ('25000000-0000-4000-8000-000000000438', tenant_id, '25000000-0000-4000-8000-000000000024', 'opportunity', '25000000-0000-4000-8000-000000000428', '25000000-0000-4000-8000-000000000228', actor_id);
  insert into public.workflow_node_instances (id, tenant_id, company_id, workflow_instance_id, node_key, node_type) values
    ('25000000-0000-4000-8000-000000000446', tenant_id, '25000000-0000-4000-8000-000000000022', '25000000-0000-4000-8000-000000000436', '01.1', 'sub_stage'),
    ('25000000-0000-4000-8000-000000000456', tenant_id, '25000000-0000-4000-8000-000000000022', '25000000-0000-4000-8000-000000000436', '01.2', 'sub_stage'),
    ('25000000-0000-4000-8000-000000000457', tenant_id, '25000000-0000-4000-8000-000000000023', '25000000-0000-4000-8000-000000000437', '01.2', 'sub_stage'),
    ('25000000-0000-4000-8000-000000000458', tenant_id, '25000000-0000-4000-8000-000000000024', '25000000-0000-4000-8000-000000000438', '01.2', 'sub_stage');
  insert into public.workflow_node_executions (id, tenant_id, company_id, node_instance_id, execution_no, phase, completed_by, completed_at) values
    ('25000000-0000-4000-8000-000000000466', tenant_id, '25000000-0000-4000-8000-000000000022', '25000000-0000-4000-8000-000000000446', 1, 'completed', actor_id, clock_timestamp()),
    ('25000000-0000-4000-8000-000000000476', tenant_id, '25000000-0000-4000-8000-000000000022', '25000000-0000-4000-8000-000000000456', 1, 'active', null, null),
    ('25000000-0000-4000-8000-000000000477', tenant_id, '25000000-0000-4000-8000-000000000023', '25000000-0000-4000-8000-000000000457', 1, 'active', null, null),
    ('25000000-0000-4000-8000-000000000478', tenant_id, '25000000-0000-4000-8000-000000000024', '25000000-0000-4000-8000-000000000458', 1, 'active', null, null);
end $$;

select lives_ok(
  $$ insert into public.stage01_decision_cycles (id, tenant_id, company_id, opportunity_id, node_execution_id, cycle_no, created_by) values ('25000000-0000-4000-8000-000000000486', '25000000-0000-4000-8000-000000000010', '25000000-0000-4000-8000-000000000022', '25000000-0000-4000-8000-000000000426', '25000000-0000-4000-8000-000000000476', 1, '25000000-0000-4000-8000-000000000001') $$,
  'a company without Decision Authority capability creates a cycle without a policy'
);
select is(
  (select decision_policy_snapshot_id from public.stage01_decision_cycles where id = '25000000-0000-4000-8000-000000000486'::uuid),
  null::uuid,
  'a disabled company does not fall back to another company policy snapshot'
);
select is(
  (select count(*) from public.opportunity_decision_policy_binding_events where decision_cycle_id = '25000000-0000-4000-8000-000000000486'::uuid),
  0::bigint,
  'a disabled company cycle has no Decision Policy binding audit event'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"25000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.list_opportunity_decision_authority_candidates('25000000-0000-4000-8000-000000000022', '25000000-0000-4000-8000-000000000426', '25000000-0000-4000-8000-000000000486') $$,
  'P0001', 'OPPORTUNITY_DECISION_AUTHORITY_NOT_ENABLED',
  'a disabled company does not expose the authority-candidate path'
);
select throws_ok(
  $$ select public.assign_opportunity_decision_authority('25000000-0000-4000-8000-000000000022', '25000000-0000-4000-8000-000000000426', '25000000-0000-4000-8000-000000000486', '{"requestId":"25000000-0000-4000-8000-000000000627","action":"assign","authorityUserId":"25000000-0000-4000-8000-000000000001","expectedCycleVersion":0,"reason":null}'::jsonb) $$,
  'P0001', 'OPPORTUNITY_DECISION_AUTHORITY_NOT_ENABLED',
  'a disabled company rejects the authority-assignment command'
);
select throws_ok(
  $$ insert into public.stage01_decision_cycles (id, tenant_id, company_id, opportunity_id, node_execution_id, cycle_no, created_by) values ('25000000-0000-4000-8000-000000000487', '25000000-0000-4000-8000-000000000010', '25000000-0000-4000-8000-000000000023', '25000000-0000-4000-8000-000000000427', '25000000-0000-4000-8000-000000000477', 1, '25000000-0000-4000-8000-000000000001') $$,
  'P0001', 'OPPORTUNITY_DECISION_POLICY_UNAVAILABLE',
  'an enabled company without its own published policy remains fail closed'
);
select lives_ok(
  $$ insert into public.stage01_decision_cycles (id, tenant_id, company_id, opportunity_id, node_execution_id, cycle_no, created_by) values ('25000000-0000-4000-8000-000000000488', '25000000-0000-4000-8000-000000000010', '25000000-0000-4000-8000-000000000024', '25000000-0000-4000-8000-000000000428', '25000000-0000-4000-8000-000000000478', 1, '25000000-0000-4000-8000-000000000001') $$,
  'an enabled company with its own published policy creates a bound unresolved cycle'
);
select is(
  (select decision_policy_snapshot_id from public.stage01_decision_cycles where id = '25000000-0000-4000-8000-000000000488'::uuid),
  '25000000-0000-4000-8000-000000000255'::uuid,
  'an enabled company binds its exact company-scoped policy rather than another company policy'
);

insert into public.stage01_criterion_evaluations (tenant_id, company_id, decision_cycle_id, criterion_key, revision, applicability, result, rationale, evidence, evaluated_by, evaluated_at)
select '25000000-0000-4000-8000-000000000010'::uuid, '25000000-0000-4000-8000-000000000022'::uuid, '25000000-0000-4000-8000-000000000486'::uuid,
  criterion, 1, 'applicable', 'fit', 'Generic capability-disabled final decision evidence', '[]'::jsonb, '25000000-0000-4000-8000-000000000001'::uuid, clock_timestamp()
from unnest(array['customer_need','scope_capability','resources_schedule','commercial_viability','risk_special']) as criterion;
insert into public.stage01_recommendations (id, tenant_id, company_id, decision_cycle_id, version, recommendation, rationale, evidence, submitted_by, submitted_at) values
  ('25000000-0000-4000-8000-000000000506', '25000000-0000-4000-8000-000000000010', '25000000-0000-4000-8000-000000000022', '25000000-0000-4000-8000-000000000486', 1, 'recommend_proceed', 'Generic capability-disabled recommendation', '[]'::jsonb, '25000000-0000-4000-8000-000000000001', clock_timestamp());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"25000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.record_stage01_final_decision('25000000-0000-4000-8000-000000000022', '25000000-0000-4000-8000-000000000426', '{"outcome":"proceed","rationale":"Generic company follows non-authority Final Decision rules","expectedCycleVersion":0}'::jsonb, '25000000-0000-4000-8000-000000000626') $$,
  'a capability-disabled company Final Decision is not rejected solely because authority is unresolved'
);
select is(
  (select final_outcome from public.stage01_decision_cycles where id = '25000000-0000-4000-8000-000000000486'::uuid),
  'proceed',
  'a capability-disabled company records Final Decision through normal non-authority gates'
);
reset role;

select throws_ok(
  $$ insert into public.opportunity_decision_authority_events (tenant_id, company_id, opportunity_id, decision_cycle_id, request_id, request_fingerprint, assignment_cycle_version, action, authority_user_id, performed_by_user_id, authority_display_name_snapshot, performer_display_name_snapshot) values ('25000000-0000-4000-8000-000000000010', '25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000401', '25000000-0000-4000-8000-000000000452', '25000000-0000-4000-8000-000000000601', 'mismatched-cycle', 1, 'assigned', '25000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000001', 'Authority actor', 'Authority actor') $$,
  'P0001', 'OPPORTUNITY_DECISION_AUTHORITY_EVENT_CYCLE_MISMATCH',
  'authority events cannot bind an opportunity to a different decision cycle'
);

select throws_ok(
  $$ update public.stage01_decision_cycles set decision_authority_user_id = '25000000-0000-4000-8000-000000000001'::uuid where id = '25000000-0000-4000-8000-000000000452'::uuid $$,
  'P0001', 'OPPORTUNITY_DECISION_AUTHORITY_POINTER_INVALID', 'changed authority pointers reject a partial triple'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"25000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.assign_opportunity_decision_authority('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000401', '25000000-0000-4000-8000-000000000451', '{"requestId":"25000000-0000-4000-8000-000000000611","action":"assign","authorityUserId":"25000000-0000-4000-8000-000000000001","expectedCycleVersion":99,"reason":null}'::jsonb) $$,
  'P0001', 'VERSION_CONFLICT', 'authority assignment rejects stale cycle versions'
);
select throws_ok(
  $$ select public.assign_opportunity_decision_authority('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000401', '25000000-0000-4000-8000-000000000451', '{"requestId":"25000000-0000-4000-8000-000000000612","action":"assign","authorityUserId":"25000000-0000-4000-8000-000000000003","expectedCycleVersion":0,"reason":null}'::jsonb) $$,
  'P0001', 'OPPORTUNITY_DECISION_AUTHORITY_TARGET_INELIGIBLE', 'authority assignment rejects an ineligible target'
);
select throws_ok(
  $$ select public.assign_opportunity_decision_authority('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000402', '25000000-0000-4000-8000-000000000452', '{"requestId":"25000000-0000-4000-8000-000000000616","action":"assign","authorityUserId":"25000000-0000-4000-8000-000000000004","expectedCycleVersion":0,"reason":null}'::jsonb) $$,
  'P0001', 'OPPORTUNITY_DECISION_AUTHORITY_TARGET_INELIGIBLE', 'authority assignment rejects an inactive target membership'
);
select throws_ok(
  $$ select public.assign_opportunity_decision_authority('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000402', '25000000-0000-4000-8000-000000000452', '{"requestId":"25000000-0000-4000-8000-000000000617","action":"assign","authorityUserId":"25000000-0000-4000-8000-000000000005","expectedCycleVersion":0,"reason":null}'::jsonb) $$,
  'P0001', 'OPPORTUNITY_DECISION_AUTHORITY_TARGET_INELIGIBLE', 'authority assignment rejects a target from another company'
);
select set_config('request.jwt.claims', '{"sub":"25000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.assign_opportunity_decision_authority('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000401', '25000000-0000-4000-8000-000000000451', '{"requestId":"25000000-0000-4000-8000-000000000613","action":"assign","authorityUserId":"25000000-0000-4000-8000-000000000002","expectedCycleVersion":0,"reason":null}'::jsonb) $$,
  'P0001', 'PERMISSION_DENIED', 'authority assignment rejects an actor without assign permission'
);
select set_config('request.jwt.claims', '{"sub":"25000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (public.assign_opportunity_decision_authority('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000401', '25000000-0000-4000-8000-000000000451', '{"requestId":"25000000-0000-4000-8000-000000000614","action":"assign","authorityUserId":"25000000-0000-4000-8000-000000000001","expectedCycleVersion":0,"reason":null}'::jsonb) ->> 'authorityUserId')::uuid,
  '25000000-0000-4000-8000-000000000001'::uuid, 'authority assignment succeeds through the public RPC'
);
select is(
  (public.assign_opportunity_decision_authority('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000401', '25000000-0000-4000-8000-000000000451', '{"requestId":"25000000-0000-4000-8000-000000000614","action":"assign","authorityUserId":"25000000-0000-4000-8000-000000000001","expectedCycleVersion":0,"reason":null}'::jsonb) ->> 'cycleVersion')::bigint,
  1::bigint, 'same request replay retains its immutable assignment cycle version'
);
reset role;
select is(private.stage01_current_recommendation_id('25000000-0000-4000-8000-000000000451'::uuid), '25000000-0000-4000-8000-000000000501'::uuid, 'recommendation remains current after authority version change');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"25000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (public.assign_opportunity_decision_authority('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000401', '25000000-0000-4000-8000-000000000451', '{"requestId":"25000000-0000-4000-8000-000000000614","action":"assign","authorityUserId":"25000000-0000-4000-8000-000000000001","expectedCycleVersion":0,"reason":null}'::jsonb) ->> 'authorityResolutionEventId')::uuid,
  (select authority_resolution_event_id from public.stage01_decision_cycles where id = '25000000-0000-4000-8000-000000000451'::uuid), 'same request replays its original authority event'
);
select throws_ok(
  $$ select public.assign_opportunity_decision_authority('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000401', '25000000-0000-4000-8000-000000000451', '{"requestId":"25000000-0000-4000-8000-000000000614","action":"assign","authorityUserId":"25000000-0000-4000-8000-000000000001","expectedCycleVersion":0,"reason":"different fingerprint"}'::jsonb) $$,
  'P0001', 'IDEMPOTENCY_CONFLICT', 'same request ID with a changed fingerprint is rejected'
);
select throws_ok(
  $$ select public.assign_opportunity_decision_authority('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000401', '25000000-0000-4000-8000-000000000451', '{"requestId":"25000000-0000-4000-8000-000000000615","action":"assign","authorityUserId":"25000000-0000-4000-8000-000000000001","expectedCycleVersion":1,"reason":null}'::jsonb) $$,
  'P0001', 'OPPORTUNITY_DECISION_AUTHORITY_ALREADY_RESOLVED', 'a resolved authority cycle cannot be reassigned'
);
select throws_ok(
  $$ select public.record_stage01_final_decision('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000402', '{"outcome":"proceed","rationale":"unresolved authority","expectedCycleVersion":0}'::jsonb, '25000000-0000-4000-8000-000000000621') $$,
  'P0001', 'STAGE01_DECISION_AUTHORITY_UNRESOLVED', 'final decision rejects an unresolved authority cycle'
);
select set_config('request.jwt.claims', '{"sub":"25000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.record_stage01_final_decision('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000401', '{"outcome":"proceed","rationale":"wrong authority","expectedCycleVersion":1}'::jsonb, '25000000-0000-4000-8000-000000000622') $$,
  'P0001', 'STAGE01_DECISION_AUTHORITY_MISMATCH', 'final decision rejects a non-authority actor'
);
select set_config('request.jwt.claims', '{"sub":"25000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  public.record_stage01_final_decision('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000401', '{"outcome":"not_proceeding","rationale":"correct authority","overrideRationale":"reactivate after authority","expectedCycleVersion":1}'::jsonb, '25000000-0000-4000-8000-000000000623') ->> 'finalOutcome',
  'not_proceeding', 'the resolved authority records final decision'
);
select is(
  (public.complete_stage01_evaluation('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000451', '{"expectedExecutionVersion":0,"expectedCycleVersion":2}'::jsonb, '25000000-0000-4000-8000-000000000624') ->> 'executionVersion')::bigint,
  1::bigint, 'evaluation completes after the correct authority decision'
);
select throws_ok(
  $$ select public.assign_opportunity_decision_authority('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000401', '25000000-0000-4000-8000-000000000451', '{"requestId":"25000000-0000-4000-8000-000000000626","action":"assign","authorityUserId":"25000000-0000-4000-8000-000000000001","expectedCycleVersion":2,"reason":null}'::jsonb) $$,
  'P0001', 'STAGE01_FINAL_DECISION_EXISTS', 'completed decision cycles are locked against authority assignment'
);
select is(
  public.reactivate_stage01('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000401', '{"reason":"S08 new cycle","expectedOpportunityVersion":0,"expectedExecutionVersion":1,"expectedCycleVersion":2}'::jsonb, '25000000-0000-4000-8000-000000000625') ->> 'cycleNo',
  '2', 'S08 reactivation creates a second decision cycle'
);
select ok(
  exists (select 1 from public.stage01_decision_cycles where opportunity_id = '25000000-0000-4000-8000-000000000401'::uuid and cycle_no = 2 and decision_authority_user_id is null and authority_resolution_event_id is null and authority_resolution_reference is null and decision_policy_snapshot_id is not null),
  'S08 new cycle has unresolved authority fields and a bound decision policy snapshot'
);

-- Explicit B4-only transition fixture. The replication-role insert simulates a
-- pre-Addendum immutable legacy row without backfilling it through the new
-- cycle trigger; all transition behaviour below uses the public RPC.
reset role;
do $$
declare
  tenant_id constant uuid := 'b4000000-0000-4000-8000-000000000010';
  company_id constant uuid := 'b4000000-0000-4000-8000-000000000020';
  actor_id constant uuid := '25000000-0000-4000-8000-000000000006';
  role_id constant uuid := '25000000-0000-4000-8000-000000000106';
  department_id constant uuid := '25000000-0000-4000-8000-000000000202';
  snapshot_id constant uuid := '25000000-0000-4000-8000-000000000220';
  fixture record;
begin
  insert into auth.users (id, email) values (actor_id, 'authority-b4-transition@taskovia.invalid');
  insert into public.tenants (id, code, name) values (tenant_id, 'authority-b4-transition', 'Authority B4 transition') on conflict (id) do nothing;
  insert into public.companies (id, tenant_id, code, name) values (company_id, tenant_id, 'AUTHORITY_B4', 'Authority B4 transition') on conflict (id) do nothing;
  insert into public.tenant_memberships (user_id, tenant_id, roles) values (actor_id, tenant_id, array['member']);
  insert into public.company_memberships (user_id, tenant_id, company_id, roles, is_active) values (actor_id, tenant_id, company_id, array['member'], true);
  insert into public.departments (id, tenant_id, company_id, code, name) values (department_id, tenant_id, company_id, 'AUTH-B4', 'Authority B4');
  insert into public.roles (id, tenant_id, company_id, code, name, description, is_system) values (role_id, tenant_id, company_id, 'authority_b4_transition', 'Authority B4 transition', 'Authority B4 transition actor', false);
  insert into public.role_permissions (role_id, permission_code) values (role_id, 'opportunity.read'), (role_id, 'opportunity.decision_authority.assign'), (role_id, 'opportunity.decision.record');
  insert into public.company_role_assignments (tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values (tenant_id, company_id, actor_id, role_id, actor_id, 'Authority B4 transition actor');
  insert into public.tenant_memberships (user_id, tenant_id, roles) values (actor_id, '25000000-0000-4000-8000-000000000010'::uuid, array['member']);
  insert into public.company_memberships (user_id, tenant_id, company_id, roles, is_active) values (actor_id, '25000000-0000-4000-8000-000000000010'::uuid, '25000000-0000-4000-8000-000000000020'::uuid, array['member'], true);
  insert into public.company_role_assignments (tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values ('25000000-0000-4000-8000-000000000010'::uuid, '25000000-0000-4000-8000-000000000020'::uuid, actor_id, '25000000-0000-4000-8000-000000000100'::uuid, '25000000-0000-4000-8000-000000000001'::uuid, 'Authority B4 transition scope-denial fixture');
  insert into public.employees (id, tenant_id, company_id, user_id, employee_code, full_name, work_email, department_id, employment_status, created_by) values ('25000000-0000-4000-8000-000000000306', tenant_id, company_id, actor_id, 'AUTH-B4', 'Authority B4 actor', 'authority-b4-transition@taskovia.invalid', department_id, 'active', actor_id);
  insert into public.workflow_definition_snapshots (id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash) values (snapshot_id, tenant_id, company_id, 'vqh.stage01', 1, 1, '{"nodes":[{"key":"01.2","type":"sub_stage","parentNodeKey":null}]}'::jsonb, 'authority-b4-transition-definition');
  for fixture in select * from (values
    ('25000000-0000-4000-8000-000000000403'::uuid, '25000000-0000-4000-8000-000000000413'::uuid, '25000000-0000-4000-8000-000000000423'::uuid, '25000000-0000-4000-8000-000000000433'::uuid, '25000000-0000-4000-8000-000000000453'::uuid, null::text),
    ('25000000-0000-4000-8000-000000000404'::uuid, '25000000-0000-4000-8000-000000000414'::uuid, '25000000-0000-4000-8000-000000000424'::uuid, '25000000-0000-4000-8000-000000000434'::uuid, '25000000-0000-4000-8000-000000000454'::uuid, 'proceed'),
    ('25000000-0000-4000-8000-000000000405'::uuid, '25000000-0000-4000-8000-000000000415'::uuid, '25000000-0000-4000-8000-000000000425'::uuid, '25000000-0000-4000-8000-000000000435'::uuid, '25000000-0000-4000-8000-000000000455'::uuid, 'authority')
  ) as seeded(opportunity_id, workflow_id, node_id, execution_id, cycle_id, legacy_state) loop
    insert into public.opportunities (id, tenant_id, company_id, primary_customer_name, customer_type_code, need_description, location_status, primary_lead_source_code, engagement_status_code, budget_status_code, timeline_status_code, priority_code, created_by) values (fixture.opportunity_id, tenant_id, company_id, 'Authority B4 ' || fixture.cycle_id::text, 'customer', 'Authority B4 legacy transition', 'unknown', 'direct', 'grounded', 'unknown', 'unknown', 'normal', actor_id);
    insert into public.workflow_instances (id, tenant_id, company_id, subject_type, subject_id, definition_snapshot_id, created_by) values (fixture.workflow_id, tenant_id, company_id, 'opportunity', fixture.opportunity_id, snapshot_id, actor_id);
    insert into public.workflow_node_instances (id, tenant_id, company_id, workflow_instance_id, node_key, node_type) values (fixture.node_id, tenant_id, company_id, fixture.workflow_id, '01.2', 'sub_stage');
    insert into public.workflow_node_executions (id, tenant_id, company_id, node_instance_id, execution_no, phase) values (fixture.execution_id, tenant_id, company_id, fixture.node_id, 1, 'active');
    perform set_config('session_replication_role', 'replica', true);
    insert into public.stage01_decision_cycles (id, tenant_id, company_id, opportunity_id, node_execution_id, cycle_no, decision_authority_user_id, authority_resolution_reference, final_outcome, created_by)
    values (fixture.cycle_id, tenant_id, company_id, fixture.opportunity_id, fixture.execution_id, 1,
      case when fixture.legacy_state = 'authority' then actor_id else null end,
      case when fixture.legacy_state = 'authority' then 'legacy-authority' else null end,
      case when fixture.legacy_state = 'proceed' then 'proceed' else null end, actor_id);
    perform set_config('session_replication_role', 'origin', true);
  end loop;
  insert into public.stage01_recommendations (id, tenant_id, company_id, decision_cycle_id, version, recommendation, rationale, evidence, submitted_by)
  values ('25000000-0000-4000-8000-000000000503', tenant_id, company_id, '25000000-0000-4000-8000-000000000453', 1, 'recommend_proceed', 'B4 transition recommendation must remain immutable', '[]'::jsonb, actor_id);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"25000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select throws_ok(
  $$ select public.transition_opportunity_decision_policy('b4000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000403', '25000000-0000-4000-8000-000000000453', '{"requestId":"25000000-0000-4000-8000-000000000629","expectedCycleVersion":0,"reason":"Bind policy"}'::jsonb) $$,
  '22023', 'INVALID_COMMAND_INPUT', 'policy transition requires its approved transition code'
);
select throws_ok(
  $$ select public.transition_opportunity_decision_policy('b4000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000403', '25000000-0000-4000-8000-000000000453', '{"requestId":"25000000-0000-4000-8000-000000000630","expectedCycleVersion":0,"transitionCode":"b4_acceptance_policy_transition","reason":"   "}'::jsonb) $$,
  '22023', 'INVALID_COMMAND_INPUT', 'policy transition requires a nonblank audited reason'
);
select is(
  public.get_opportunity_decision_authority_projection('b4000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000403', '25000000-0000-4000-8000-000000000453') -> 'policyBinding',
  '{"status":"legacy_unbound","policySnapshotId":null,"transitionEligible":true}'::jsonb,
  'projection exposes an eligible B4 legacy-unbound policy binding'
);
select throws_ok(
  $$ select public.transition_opportunity_decision_policy('25000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000402', '25000000-0000-4000-8000-000000000452', '{"requestId":"25000000-0000-4000-8000-000000000635","expectedCycleVersion":0,"transitionCode":"b4_acceptance_policy_transition","reason":"Bind policy"}'::jsonb) $$,
  'P0001', 'OPPORTUNITY_DECISION_POLICY_TRANSITION_SCOPE_DENIED', 'legacy policy transition is limited to the approved B4 tenant and company'
);
select is(
  (public.transition_opportunity_decision_policy('b4000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000403', '25000000-0000-4000-8000-000000000453', '{"requestId":"25000000-0000-4000-8000-000000000631","expectedCycleVersion":0,"transitionCode":"b4_acceptance_policy_transition","reason":"Bind VQH Decision Policy v1 for this unresolved acceptance cycle."}'::jsonb) ->> 'cycleVersion')::bigint,
  1::bigint, 'B4 legacy active unresolved cycle binds a policy and increments its version'
);
select is(
  (select id from public.stage01_recommendations where id = '25000000-0000-4000-8000-000000000503'::uuid),
  '25000000-0000-4000-8000-000000000503'::uuid, 'B4 policy transition preserves the current recommendation history'
);
select is(
  (public.transition_opportunity_decision_policy('b4000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000403', '25000000-0000-4000-8000-000000000453', '{"requestId":"25000000-0000-4000-8000-000000000631","expectedCycleVersion":0,"transitionCode":"b4_acceptance_policy_transition","reason":"Bind VQH Decision Policy v1 for this unresolved acceptance cycle."}'::jsonb) ->> 'policySnapshotId')::uuid,
  (select decision_policy_snapshot_id from public.stage01_decision_cycles where id = '25000000-0000-4000-8000-000000000453'::uuid), 'same B4 transition request replays the original policy snapshot'
);
select throws_ok(
  $$ select public.transition_opportunity_decision_policy('b4000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000403', '25000000-0000-4000-8000-000000000453', '{"requestId":"25000000-0000-4000-8000-000000000631","expectedCycleVersion":1,"transitionCode":"b4_acceptance_policy_transition","reason":"Bind VQH Decision Policy v1 for this unresolved acceptance cycle."}'::jsonb) $$,
  'P0001', 'IDEMPOTENCY_CONFLICT', 'B4 policy transition rejects a changed same-request fingerprint'
);
select throws_ok(
  $$ select public.transition_opportunity_decision_policy('b4000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000404', '25000000-0000-4000-8000-000000000454', '{"requestId":"25000000-0000-4000-8000-000000000632","expectedCycleVersion":0,"transitionCode":"b4_acceptance_policy_transition","reason":"Bind policy"}'::jsonb) $$,
  'P0001', 'STAGE01_FINAL_DECISION_EXISTS', 'B4 policy transition rejects a completed legacy cycle'
);
select throws_ok(
  $$ select public.transition_opportunity_decision_policy('b4000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000405', '25000000-0000-4000-8000-000000000455', '{"requestId":"25000000-0000-4000-8000-000000000633","expectedCycleVersion":0,"transitionCode":"b4_acceptance_policy_transition","reason":"Bind policy"}'::jsonb) $$,
  'P0001', 'OPPORTUNITY_DECISION_AUTHORITY_ALREADY_RESOLVED', 'B4 policy transition rejects a legacy cycle with an existing authority'
);
reset role;
select throws_ok(
  $$ insert into public.opportunity_decision_policy_binding_events (tenant_id, company_id, opportunity_id, decision_cycle_id, policy_snapshot_id, request_id, request_fingerprint, binding_cycle_version, action, performed_by_user_id) values ('b4000000-0000-4000-8000-000000000010', 'b4000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000404', '25000000-0000-4000-8000-000000000453', (select decision_policy_snapshot_id from public.stage01_decision_cycles where id = '25000000-0000-4000-8000-000000000453'), '25000000-0000-4000-8000-000000000634', 'wrong-scope', 1, 'legacy_transition', '25000000-0000-4000-8000-000000000006') $$,
  'P0001', 'OPPORTUNITY_DECISION_POLICY_BINDING_SCOPE_INVALID', 'policy binding audit rejects a mismatched opportunity and decision-cycle scope'
);
select throws_ok(
  $$ insert into public.opportunity_decision_policy_binding_events (tenant_id, company_id, opportunity_id, decision_cycle_id, previous_policy_snapshot_id, policy_snapshot_id, request_id, request_fingerprint, binding_cycle_version, action, transition_code, reason, performed_by_user_id) values ('b4000000-0000-4000-8000-000000000010', 'b4000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000403', '25000000-0000-4000-8000-000000000453', (select decision_policy_snapshot_id from public.stage01_decision_cycles where id = '25000000-0000-4000-8000-000000000453'), (select decision_policy_snapshot_id from public.stage01_decision_cycles where id = '25000000-0000-4000-8000-000000000453'), '25000000-0000-4000-8000-000000000636', 'non-null-legacy-prior', 1, 'legacy_transition', 'b4_acceptance_policy_transition', 'invalid legacy prior pointer', '25000000-0000-4000-8000-000000000006') $$,
  'P0001', 'OPPORTUNITY_DECISION_POLICY_BINDING_SCOPE_INVALID', 'legacy policy binding audit rejects a non-null prior policy pointer'
);
select throws_ok(
  $$ insert into public.opportunity_decision_policy_binding_events (tenant_id, company_id, opportunity_id, decision_cycle_id, previous_policy_snapshot_id, policy_snapshot_id, request_id, request_fingerprint, binding_cycle_version, action, transition_code, reason, performed_by_user_id) values ('b4000000-0000-4000-8000-000000000010', 'b4000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000403', '25000000-0000-4000-8000-000000000453', null, (select decision_policy_snapshot_id from public.stage01_decision_cycles where id = '25000000-0000-4000-8000-000000000453'), '25000000-0000-4000-8000-000000000637', 'null-transition-code', 1, 'legacy_transition', null, null, '25000000-0000-4000-8000-000000000006') $$,
  '23514', 'new row for relation "opportunity_decision_policy_binding_events" violates check constraint "opportunity_decision_policy_binding_events_transition_metadata_check"', 'legacy policy binding audit rejects NULL transition metadata'
);
select throws_ok(
  $$ update public.stage01_decision_cycles set decision_policy_snapshot_id = null where id = '25000000-0000-4000-8000-000000000453'::uuid $$,
  'P0001', 'OPPORTUNITY_DECISION_POLICY_POINTER_IMMUTABLE', 'a bound cycle policy pointer cannot be cleared or rebound'
);
select is(
  (select jsonb_build_object('transitionCode', transition_code, 'reason', reason) from public.opportunity_decision_policy_binding_events where request_id = '25000000-0000-4000-8000-000000000631'::uuid),
  '{"transitionCode":"b4_acceptance_policy_transition","reason":"Bind VQH Decision Policy v1 for this unresolved acceptance cycle."}'::jsonb,
  'legacy policy binding audit retains its transition code and reason'
);
select is(
  (select previous_policy_snapshot_id from public.opportunity_decision_policy_binding_events where request_id = '25000000-0000-4000-8000-000000000631'::uuid),
  null::uuid,
  'legacy policy binding audit records the null prior policy pointer'
);
select ok(
  exists (
    select 1
    from public.opportunity_decision_policy_snapshots b4_policy
    join public.opportunity_decision_policy_snapshots canonical_policy on canonical_policy.id = b4_policy.source_policy_snapshot_id
    where b4_policy.tenant_id = 'b4000000-0000-4000-8000-000000000010'::uuid
      and b4_policy.company_id = 'b4000000-0000-4000-8000-000000000020'::uuid
      and canonical_policy.tenant_id = '10000000-0000-4000-8000-000000000010'::uuid
      and canonical_policy.company_id = '10000000-0000-4000-8000-000000000020'::uuid
      and b4_policy.policy = canonical_policy.policy and b4_policy.policy_hash = canonical_policy.policy_hash
  ),
  'B4 policy snapshot is cloned from the canonical VQH policy snapshot'
);
insert into public.opportunity_decision_policy_snapshots (tenant_id, company_id, policy_key, policy_version, policy, policy_hash, status, published_at, approved_at, source_policy_snapshot_id)
select 'b4000000-0000-4000-8000-000000000010'::uuid, 'b4000000-0000-4000-8000-000000000020'::uuid,
  'opportunity.decision_authority', 2, policy, 'b4-opportunity-decision-authority-v2-draft', 'draft', null, null, id
from public.opportunity_decision_policy_snapshots
where tenant_id = 'b4000000-0000-4000-8000-000000000010'::uuid and company_id = 'b4000000-0000-4000-8000-000000000020'::uuid and policy_version = 1;
select is(
  (select policy_version from private.active_opportunity_decision_policy_snapshot('b4000000-0000-4000-8000-000000000010'::uuid, 'b4000000-0000-4000-8000-000000000020'::uuid)),
  1,
  'current policy selection excludes an unapproved draft snapshot'
);
insert into public.opportunity_decision_policy_snapshots (tenant_id, company_id, policy_key, policy_version, policy, policy_hash, status, published_at, approved_at, source_policy_snapshot_id)
select 'b4000000-0000-4000-8000-000000000010'::uuid, 'b4000000-0000-4000-8000-000000000020'::uuid,
  'opportunity.decision_authority', 3, policy, 'b4-opportunity-decision-authority-v3', 'published', clock_timestamp(), clock_timestamp(), id
from public.opportunity_decision_policy_snapshots
where tenant_id = 'b4000000-0000-4000-8000-000000000010'::uuid and company_id = 'b4000000-0000-4000-8000-000000000020'::uuid and policy_version = 1;
select is(
  (select policy_version from private.active_opportunity_decision_policy_snapshot('b4000000-0000-4000-8000-000000000010'::uuid, 'b4000000-0000-4000-8000-000000000020'::uuid)),
  3,
  'current policy selection advances to the latest approved immutable version'
);
select throws_ok(
  $$ insert into public.opportunity_decision_policy_snapshots (tenant_id, company_id, policy_key, policy_version, policy, policy_hash, status, published_at, approved_at, source_policy_snapshot_id) select 'b4000000-0000-4000-8000-000000000010'::uuid, 'b4000000-0000-4000-8000-000000000020'::uuid, 'opportunity.decision_authority', 4, policy, 'b4-invalid-published-policy', 'published', null, null, id from public.opportunity_decision_policy_snapshots where tenant_id = 'b4000000-0000-4000-8000-000000000010'::uuid and company_id = 'b4000000-0000-4000-8000-000000000020'::uuid and policy_version = 1 $$,
  '23514', 'new row for relation "opportunity_decision_policy_snapshots" violates check constraint "opportunity_decision_policy_snapshots_publication_state_check"', 'published policy snapshots require both publication and approval timestamps'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"25000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is(
  (public.transition_opportunity_decision_policy('b4000000-0000-4000-8000-000000000020', '25000000-0000-4000-8000-000000000403', '25000000-0000-4000-8000-000000000453', '{"requestId":"25000000-0000-4000-8000-000000000631","expectedCycleVersion":0,"transitionCode":"b4_acceptance_policy_transition","reason":"Bind VQH Decision Policy v1 for this unresolved acceptance cycle."}'::jsonb) ->> 'policySnapshotId')::uuid,
  (select decision_policy_snapshot_id from public.stage01_decision_cycles where id = '25000000-0000-4000-8000-000000000453'::uuid),
  'replay returns the original B4 policy binding after a newer policy snapshot is published'
);
reset role;
select throws_ok(
  $$ update public.opportunity_decision_policy_snapshots set policy_hash = 'rewrite' where tenant_id = 'b4000000-0000-4000-8000-000000000010'::uuid $$,
  'P0001', 'OPPORTUNITY_DECISION_POLICY_SNAPSHOT_IMMUTABLE', 'decision policy snapshots are immutable'
);
select throws_ok(
  $$ update public.opportunity_decision_policy_binding_events set request_fingerprint = 'rewrite' where request_id = '25000000-0000-4000-8000-000000000631'::uuid $$,
  'P0001', 'OPPORTUNITY_DECISION_POLICY_BINDING_IMMUTABLE', 'decision policy binding audit history is immutable'
);

select * from finish();
rollback;
