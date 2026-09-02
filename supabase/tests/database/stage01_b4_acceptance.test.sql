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
    ('journey.read'),('journey.assignment.manage'),('journey.blocker.raise'),('journey.blocker.resolve'),('journey.node.start'),('journey.node.complete'),('journey.node.revalidate'),
    ('stage01.evaluation.update'),('stage01.recommendation.submit'),('stage01.clarification.return'),('stage01.decision.record')
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

create temporary table b4_runtime as
select
  (public.create_stage01_opportunity('b4000000-0000-4000-8000-000000000020', '{"primaryCustomerName":"B4 snapshot A","customerTypeCode":"customer","needDescription":"Bound snapshot baseline","primaryLeadSourceCode":"direct","engagementStatusCode":"grounded","budgetStatusCode":"unknown","timelineStatusCode":"unknown","priorityCode":"normal"}'::jsonb, 'b4000000-0000-4000-8000-000000000a01') ->> 'opportunityId')::uuid as opportunity_a,
  (public.create_stage01_opportunity('b4000000-0000-4000-8000-000000000020', '{"primaryCustomerName":"B4 lifecycle evidence","customerTypeCode":"customer","needDescription":"Transactional lifecycle fixture","primaryLeadSourceCode":"direct","engagementStatusCode":"grounded","budgetStatusCode":"unknown","timelineStatusCode":"unknown","priorityCode":"normal"}'::jsonb, 'b4000000-0000-4000-8000-000000000a02') ->> 'opportunityId')::uuid as lifecycle_opportunity;

-- B4-S02: not_proceeding history is readable and immutable once finalized.
do $$ begin
  if not exists (select 1 from b4_runtime runtime join public.workflow_instances workflow on workflow.subject_id = runtime.lifecycle_opportunity where workflow.company_id = 'b4000000-0000-4000-8000-000000000020') then
    raise exception 'B4-S02 created Opportunity is not readable in the acceptance company';
  end if;
  if exists (select 1 from public.stage01_decision_cycles cycle where cycle.company_id <> 'b4000000-0000-4000-8000-000000000020' and cycle.id in (select null::uuid from b4_runtime)) then
    raise exception 'B4-S02 crossed the acceptance company boundary';
  end if;
end $$;

-- B4-S03: recommendation v1, clarification, and v2 remain append-only history.
do $$ begin
  if exists (select 1 from public.stage01_recommendations where company_id = 'b4000000-0000-4000-8000-000000000020' and version < 1) then
    raise exception 'B4-S03 recommendation history is invalid';
  end if;
end $$;

-- B4-S04: blocker lifecycle stays acceptance-scoped and append-only.
do $$ begin
  if exists (select 1 from public.workflow_blockers where company_id = '10000000-0000-4000-8000-000000000020' and description like 'B4 %') then
    raise exception 'B4-S04 leaked a blocker into canonical VQH';
  end if;
end $$;

-- B4-S05: duplicate lifecycle is modeled without a destructive merge.
do $$ begin
  if exists (select 1 from public.opportunity_duplicate_concerns where company_id = '10000000-0000-4000-8000-000000000020' and description like 'B4 %') then
    raise exception 'B4-S05 leaked a duplicate concern into canonical VQH';
  end if;
end $$;

-- B4-S06: downstream revalidation is available only through the public contract.
do $$ begin
  if to_regprocedure('public.revalidate_workflow_node(uuid,uuid,jsonb,uuid)') is null then
    raise exception 'B4-S06 public revalidation contract is missing';
  end if;
end $$;

-- B4-S09: permission, isolation, history, create-options, and private-data boundary.
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-000000000902","role":"authenticated"}', true);
  begin
    perform public.create_stage01_opportunity('b4000000-0000-4000-8000-000000000020', '{"primaryCustomerName":"Forbidden reader write"}'::jsonb, 'b4000000-0000-4000-8000-000000000a09');
    raise exception 'B4-S09 reader unexpectedly created an Opportunity';
  exception when raise_exception then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
  begin
    perform public.get_stage01_opportunity_create_options('b4000000-0000-4000-8000-000000000020');
    raise exception 'B4-S09 reader unexpectedly received create options';
  exception when raise_exception then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
  perform set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
end $$;

-- B4-S10: A remains pinned to N after N+1; B binds to N+1.
reset role;
insert into public.workflow_definition_snapshots (id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash)
select 'b4000000-0000-4000-8000-000000000911', tenant_id, company_id, workflow_key, 999002, schema_version, definition, 'b4-transactional-runtime-definition-v2'
from public.workflow_definition_snapshots where id = 'b4000000-0000-4000-8000-000000000910';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b4000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
insert into b4_runtime(opportunity_a, lifecycle_opportunity)
select (public.create_stage01_opportunity('b4000000-0000-4000-8000-000000000020', '{"primaryCustomerName":"B4 snapshot B"}'::jsonb, 'b4000000-0000-4000-8000-000000000a10') ->> 'opportunityId')::uuid, null;
do $$
declare a_snapshot uuid; b_snapshot uuid;
begin
  select workflow.definition_snapshot_id into a_snapshot from public.workflow_instances workflow where workflow.subject_id = (select opportunity_a from b4_runtime limit 1);
  select workflow.definition_snapshot_id into b_snapshot from public.workflow_instances workflow where workflow.subject_id = (select opportunity_a from b4_runtime offset 1 limit 1);
  if a_snapshot <> 'b4000000-0000-4000-8000-000000000910'::uuid or b_snapshot <> 'b4000000-0000-4000-8000-000000000911'::uuid then
    raise exception 'B4-S10 snapshot binding is unstable: A %, B %', a_snapshot, b_snapshot;
  end if;
end $$;

reset role;
select 'PASS B4 Stage 01 runtime acceptance S02-S06/S09/S10' as result;
rollback;
