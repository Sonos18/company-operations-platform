begin;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.create_stage01_opportunity(uuid,jsonb,uuid)',
    'public.update_opportunity_current_data(uuid,uuid,jsonb,uuid)',
    'public.create_contact(uuid,jsonb,uuid)',
    'public.update_contact(uuid,uuid,jsonb,uuid)',
    'public.add_contact_method(uuid,uuid,jsonb,uuid)',
    'public.update_contact_method(uuid,uuid,uuid,jsonb,uuid)',
    'public.link_opportunity_contact(uuid,uuid,jsonb,uuid)',
    'public.set_opportunity_primary_contact(uuid,uuid,jsonb,uuid)',
    'public.end_opportunity_contact(uuid,uuid,uuid,jsonb,uuid)',
    'public.add_opportunity_scope(uuid,uuid,jsonb,uuid)',
    'public.retire_opportunity_scope(uuid,uuid,uuid,jsonb,uuid)',
    'public.add_opportunity_referrer(uuid,uuid,jsonb,uuid)',
    'public.set_opportunity_primary_referrer(uuid,uuid,jsonb,uuid)',
    'public.end_opportunity_referrer(uuid,uuid,uuid,jsonb,uuid)',
    'public.append_opportunity_intake_record(uuid,uuid,jsonb,uuid)',
    'public.correct_opportunity_intake_record(uuid,uuid,uuid,jsonb,uuid)',
    'public.raise_opportunity_duplicate_concern(uuid,uuid,jsonb,uuid)',
    'public.resolve_opportunity_duplicate(uuid,uuid,uuid,jsonb,uuid)',
    'public.assign_workflow_node(uuid,uuid,jsonb,uuid)',
    'public.end_workflow_assignment(uuid,uuid,jsonb,uuid)',
    'public.raise_workflow_blocker(uuid,uuid,jsonb,uuid)',
    'public.resolve_workflow_blocker(uuid,uuid,jsonb,uuid)',
    'public.start_workflow_node(uuid,uuid,jsonb,uuid)',
    'public.complete_stage01_intake(uuid,uuid,jsonb,uuid)',
    'public.invalidate_opportunity(uuid,uuid,jsonb,uuid)',
    'public.restore_opportunity(uuid,uuid,jsonb,uuid)',
    'public.reopen_workflow_node(uuid,uuid,jsonb,uuid)',
    'public.revalidate_workflow_node(uuid,uuid,jsonb,uuid)'
  ] loop
    if to_regprocedure(function_signature) is null then
      raise exception 'DB-S01-CMD missing function %', function_signature;
    end if;
  end loop;
end $$;

insert into auth.users (id, email) values
  ('55000000-0000-4000-8000-000000000001', 'stage01-commands@test.invalid');

insert into public.tenants (id, code, name) values
  ('55000000-0000-4000-8000-000000000010', 'stage01-commands', 'Stage 01 commands test');

insert into public.companies (id, tenant_id, code, name) values
  ('55000000-0000-4000-8000-000000000020', '55000000-0000-4000-8000-000000000010', 'S01-CMD', 'Stage 01 commands company');

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  ('55000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000010', array['member']);

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  ('55000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000010', '55000000-0000-4000-8000-000000000020', array['member']);

insert into public.roles (id, tenant_id, company_id, code, name, description, is_system) values
  (
    '55000000-0000-4000-8000-000000000100', '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020', 'stage01_command_actor',
    'Stage 01 command actor', 'Test-only Opportunity command role', false
  );

insert into public.role_permissions (role_id, permission_code) values
  ('55000000-0000-4000-8000-000000000100', 'opportunity.update'),
  ('55000000-0000-4000-8000-000000000100', 'opportunity.contact.manage'),
  ('55000000-0000-4000-8000-000000000100', 'opportunity.scope.manage'),
  ('55000000-0000-4000-8000-000000000100', 'opportunity.referrer.manage'),
  ('55000000-0000-4000-8000-000000000100', 'opportunity.intake_record.create'),
  ('55000000-0000-4000-8000-000000000100', 'opportunity.duplicate.raise'),
  ('55000000-0000-4000-8000-000000000100', 'opportunity.duplicate.resolve'),
  ('55000000-0000-4000-8000-000000000100', 'opportunity.invalidate'),
  ('55000000-0000-4000-8000-000000000100', 'opportunity.restore'),
  ('55000000-0000-4000-8000-000000000100', 'journey.assignment.manage'),
  ('55000000-0000-4000-8000-000000000100', 'journey.blocker.raise'),
  ('55000000-0000-4000-8000-000000000100', 'journey.blocker.resolve'),
  ('55000000-0000-4000-8000-000000000100', 'journey.node.start'),
  ('55000000-0000-4000-8000-000000000100', 'journey.node.complete'),
  ('55000000-0000-4000-8000-000000000100', 'journey.node.reopen'),
  ('55000000-0000-4000-8000-000000000100', 'journey.node.revalidate');

insert into public.company_role_assignments (
  tenant_id, company_id, user_id, role_id, granted_by, grant_reason
) values (
  '55000000-0000-4000-8000-000000000010', '55000000-0000-4000-8000-000000000020',
  '55000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000100',
  '55000000-0000-4000-8000-000000000001', 'Stage 01 command fixture'
);

insert into public.opportunities (id, tenant_id, company_id, primary_customer_name, created_by) values
  (
    '55000000-0000-4000-8000-000000000030', '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020', 'Command Opportunity',
    '55000000-0000-4000-8000-000000000001'
  ),
  (
    '55000000-0000-4000-8000-000000000031', '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020', 'Suspected duplicate',
    '55000000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  company_id constant uuid := '55000000-0000-4000-8000-000000000020';
  opportunity_id constant uuid := '55000000-0000-4000-8000-000000000030';
  result jsonb;
  first_contact_id uuid;
  second_contact_id uuid;
  scope_id uuid;
  current_referrer_id uuid;
  intake_id uuid;
begin
  result := public.create_contact(
    company_id, '{"displayName":"Primary contact"}'::jsonb,
    '55000000-0000-4000-8000-000000000201'
  );
  first_contact_id := (result ->> 'contactId')::uuid;

  perform public.add_contact_method(
    company_id, first_contact_id,
    '{"methodType":"phone","value":"0900000000","isUsable":true,"reliabilityState":"disputed","expectedContactVersion":0}'::jsonb,
    '55000000-0000-4000-8000-000000000202'
  );

  begin
    perform public.update_contact(
      company_id, first_contact_id,
      '{"displayName":"Stale update","expectedContactVersion":0}'::jsonb,
      '55000000-0000-4000-8000-000000000203'
    );
    raise exception 'DB-S01-CMD stale Contact mutation unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'VERSION_CONFLICT' then raise; end if;
  end;

  perform public.update_contact(
    company_id, first_contact_id,
    '{"displayName":"Primary contact updated","expectedContactVersion":1}'::jsonb,
    '55000000-0000-4000-8000-000000000204'
  );

  result := public.create_contact(
    company_id, '{"displayName":"Replacement contact"}'::jsonb,
    '55000000-0000-4000-8000-000000000205'
  );
  second_contact_id := (result ->> 'contactId')::uuid;

  perform public.update_opportunity_current_data(
    company_id, opportunity_id,
    '{"needDescription":"A governed command update","expectedOpportunityVersion":0}'::jsonb,
    '55000000-0000-4000-8000-000000000206'
  );

  perform public.set_opportunity_primary_contact(
    company_id, opportunity_id,
    pg_catalog.jsonb_build_object(
      'contactId', first_contact_id, 'relationshipCode', 'decision_maker',
      'reliabilityState', 'disputed', 'expectedOpportunityVersion', 1
    ),
    '55000000-0000-4000-8000-000000000207'
  );

  perform public.set_opportunity_primary_contact(
    company_id, opportunity_id,
    pg_catalog.jsonb_build_object(
      'contactId', second_contact_id, 'relationshipCode', 'decision_maker',
      'expectedOpportunityVersion', 2
    ),
    '55000000-0000-4000-8000-000000000208'
  );

  begin
    perform public.set_opportunity_primary_contact(
      company_id, opportunity_id,
      pg_catalog.jsonb_build_object(
        'contactId', first_contact_id, 'relationshipCode', 'stale',
        'expectedOpportunityVersion', 2
      ),
      '55000000-0000-4000-8000-000000000209'
    );
    raise exception 'DB-S01-CMD stale Opportunity mutation unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'VERSION_CONFLICT' then raise; end if;
  end;

  result := public.add_opportunity_scope(
    company_id, opportunity_id,
    '{"scopeCode":"design","reliabilityState":"unverified","expectedOpportunityVersion":3}'::jsonb,
    '55000000-0000-4000-8000-000000000210'
  );
  scope_id := (result ->> 'scopeId')::uuid;

  perform public.retire_opportunity_scope(
    company_id, opportunity_id, scope_id,
    '{"retireReason":"Scope replaced","expectedOpportunityVersion":4}'::jsonb,
    '55000000-0000-4000-8000-000000000211'
  );

  begin
    perform public.retire_opportunity_scope(
      company_id, opportunity_id, scope_id,
      '{"retireReason":"Second retirement","expectedOpportunityVersion":5}'::jsonb,
      '55000000-0000-4000-8000-000000000212'
    );
    raise exception 'DB-S01-CMD repeated retirement unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_RESOURCE_ALREADY_RETIRED' then raise; end if;
  end;

  perform public.add_opportunity_referrer(
    company_id, opportunity_id,
    '{"referrerTypeCode":"partner","displayName":"Initial referrer","isPrimary":true,"expectedOpportunityVersion":5}'::jsonb,
    '55000000-0000-4000-8000-000000000213'
  );

  result := public.set_opportunity_primary_referrer(
    company_id, opportunity_id,
    '{"referrerTypeCode":"partner","displayName":"Replacement referrer","expectedOpportunityVersion":6}'::jsonb,
    '55000000-0000-4000-8000-000000000214'
  );
  current_referrer_id := (result ->> 'referrerId')::uuid;

  perform public.end_opportunity_referrer(
    company_id, opportunity_id, current_referrer_id,
    '{"endReason":"No longer active","expectedOpportunityVersion":7}'::jsonb,
    '55000000-0000-4000-8000-000000000215'
  );

  result := public.append_opportunity_intake_record(
    company_id, opportunity_id,
    '{"channelCode":"phone","summary":"Original intake","expectedOpportunityVersion":8}'::jsonb,
    '55000000-0000-4000-8000-000000000216'
  );
  intake_id := (result ->> 'intakeRecordId')::uuid;

  perform public.correct_opportunity_intake_record(
    company_id, opportunity_id, intake_id,
    '{"channelCode":"phone","summary":"Corrected intake","correctionReason":"Clarified wording","expectedOpportunityVersion":9}'::jsonb,
    '55000000-0000-4000-8000-000000000217'
  );

  perform public.raise_opportunity_duplicate_concern(
    company_id, opportunity_id,
    '{"suspectedDuplicateOpportunityId":"55000000-0000-4000-8000-000000000031","description":"Possible same need","expectedOpportunityVersion":10}'::jsonb,
    '55000000-0000-4000-8000-000000000218'
  );

  begin
    perform public.update_opportunity_current_data(
      company_id, opportunity_id,
      '{"unexpectedField":true,"expectedOpportunityVersion":11}'::jsonb,
      '55000000-0000-4000-8000-000000000219'
    );
    raise exception 'DB-S01-CMD unknown command key unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
end $$;

reset role;

do $$
begin
  if (select version from public.opportunities where id = '55000000-0000-4000-8000-000000000030') <> 11 then
    raise exception 'DB-S01-CMD Opportunity version sequence is incorrect';
  end if;
  if (select count(*) from public.opportunity_contacts
      where opportunity_id = '55000000-0000-4000-8000-000000000030' and is_primary and ended_at is null) <> 1 then
    raise exception 'DB-S01-CMD Primary Contact replacement is not atomic';
  end if;
  if (select count(*) from public.opportunity_referrers
      where opportunity_id = '55000000-0000-4000-8000-000000000030' and is_primary and ended_at is null) <> 0 then
    raise exception 'DB-S01-CMD Referrer end lifecycle is incorrect';
  end if;
  if (select count(*) from public.opportunity_intake_records
      where opportunity_id = '55000000-0000-4000-8000-000000000030') <> 2 then
    raise exception 'DB-S01-CMD Intake correction did not append a second record';
  end if;
  if not exists (
    select 1 from public.opportunity_intake_records
    where opportunity_id = '55000000-0000-4000-8000-000000000030'
      and correction_of_record_id is not null
      and correction_reason = 'Clarified wording'
  ) then
    raise exception 'DB-S01-CMD Intake correction linkage is missing';
  end if;
  if (select count(*) from public.audit_events
      where company_id = '55000000-0000-4000-8000-000000000020'
        and action like 'opportunity.%') < 10 then
    raise exception 'DB-S01-CMD Opportunity command audit evidence is incomplete';
  end if;
end $$;

insert into public.workflow_definition_snapshots (
  id, tenant_id, company_id, workflow_key, template_version, schema_version,
  definition, definition_hash
) values (
  '56000000-0000-4000-8000-000000000040',
  '55000000-0000-4000-8000-000000000010',
  '55000000-0000-4000-8000-000000000020',
  'vqh.stage01', 1, 1,
  '{
    "nodes":[
      {"key":"01.1","type":"sub_stage","parentNodeKey":null},
      {"key":"01.2","type":"sub_stage","parentNodeKey":null}
    ],
    "dependencies":[{"from":"01.1","to":"01.2","requires":"completed_current_valid"}],
    "dimensions":["customer_need","scope_capability","resources_schedule","commercial_viability","risk_special_conditions"],
    "taxonomies":{
      "customer_type":[{"code":"customer","label":"Customer"}],
      "contact_relationship":[{"code":"decision_maker","label":"Decision maker"}],
      "scope":[{"code":"design","label":"Design"}],
      "lead_source":[{"code":"direct","label":"Direct","behavior":{"requiresReferrer":false}}],
      "referrer_type":[{"code":"person","label":"Person"}],
      "engagement_status":[{"code":"grounded","label":"Grounded"}],
      "invalid_reason":[{"code":"test_invalid","label":"Test invalid"}]
    },
    "criteria":[
      {"key":"customer_need","dimensionKey":"customer_need","label":"Customer need","description":"Test","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":1},
      {"key":"scope_capability","dimensionKey":"scope_capability","label":"Scope capability","description":"Test","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":2},
      {"key":"resources_schedule","dimensionKey":"resources_schedule","label":"Resources schedule","description":"Test","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":3},
      {"key":"commercial_viability","dimensionKey":"commercial_viability","label":"Commercial viability","description":"Test","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":4},
      {"key":"risk_special","dimensionKey":"risk_special_conditions","label":"Risk special","description":"Test","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":5}
    ],
    "capabilities":{"intakeOwner":"journey.assignment.manage","evaluationOwner":"journey.assignment.manage","start":"journey.node.start","complete":"journey.node.complete","decision":"stage01.decision.record"},
    "gates":{"intake":["approved_minimum","duplicate_resolved","no_blocking_blocker"],"evaluation":["required_applicable_evaluated","recommendation_current","final_decision_recorded"]}
  }'::jsonb,
  'stage01-command-definition'
);

insert into public.opportunities (
  id, tenant_id, company_id, primary_customer_name, customer_type_code,
  need_description, location_status, primary_lead_source_code,
  engagement_status_code, created_by
) values
  (
    '56000000-0000-4000-8000-000000000030',
    '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020',
    'Lifecycle Opportunity', 'customer', 'A qualified governed need', 'unknown',
    'direct', 'grounded', '55000000-0000-4000-8000-000000000001'
  ),
  (
    '56000000-0000-4000-8000-000000000031',
    '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020',
    'Canonical candidate', 'customer', 'A separate need', 'unknown',
    'direct', 'grounded', '55000000-0000-4000-8000-000000000001'
  );

insert into public.contacts (id, tenant_id, company_id, display_name, created_by) values (
  '56000000-0000-4000-8000-000000000080',
  '55000000-0000-4000-8000-000000000010',
  '55000000-0000-4000-8000-000000000020',
  'Lifecycle primary contact', '55000000-0000-4000-8000-000000000001'
);
insert into public.contact_methods (
  id, tenant_id, company_id, contact_id, method_type, value, is_usable
) values (
  '56000000-0000-4000-8000-000000000081',
  '55000000-0000-4000-8000-000000000010',
  '55000000-0000-4000-8000-000000000020',
  '56000000-0000-4000-8000-000000000080', 'phone', '0900000001', true
);
insert into public.opportunity_contacts (
  id, tenant_id, company_id, opportunity_id, contact_id, relationship_code,
  is_primary, created_by
) values (
  '56000000-0000-4000-8000-000000000082',
  '55000000-0000-4000-8000-000000000010',
  '55000000-0000-4000-8000-000000000020',
  '56000000-0000-4000-8000-000000000030',
  '56000000-0000-4000-8000-000000000080', 'decision_maker', true,
  '55000000-0000-4000-8000-000000000001'
);
insert into public.opportunity_scopes (
  id, tenant_id, company_id, opportunity_id, scope_code, created_by
) values (
  '56000000-0000-4000-8000-000000000083',
  '55000000-0000-4000-8000-000000000010',
  '55000000-0000-4000-8000-000000000020',
  '56000000-0000-4000-8000-000000000030', 'design',
  '55000000-0000-4000-8000-000000000001'
);
insert into public.opportunity_intake_records (
  id, tenant_id, company_id, opportunity_id, channel_code, summary, created_by
) values (
  '56000000-0000-4000-8000-000000000084',
  '55000000-0000-4000-8000-000000000010',
  '55000000-0000-4000-8000-000000000020',
  '56000000-0000-4000-8000-000000000030', 'phone', 'Qualified intake evidence',
  '55000000-0000-4000-8000-000000000001'
);
insert into public.opportunity_duplicate_concerns (
  id, tenant_id, company_id, opportunity_id, suspected_duplicate_opportunity_id,
  description, raised_by
) values (
  '56000000-0000-4000-8000-000000000085',
  '55000000-0000-4000-8000-000000000010',
  '55000000-0000-4000-8000-000000000020',
  '56000000-0000-4000-8000-000000000030',
  '56000000-0000-4000-8000-000000000031', 'Needs explicit duplicate resolution',
  '55000000-0000-4000-8000-000000000001'
);

insert into public.workflow_instances (
  id, tenant_id, company_id, subject_type, subject_id, definition_snapshot_id, created_by
) values (
  '56000000-0000-4000-8000-000000000060',
  '55000000-0000-4000-8000-000000000010',
  '55000000-0000-4000-8000-000000000020', 'opportunity',
  '56000000-0000-4000-8000-000000000030',
  '56000000-0000-4000-8000-000000000040',
  '55000000-0000-4000-8000-000000000001'
);
insert into public.workflow_node_instances (
  id, tenant_id, company_id, workflow_instance_id, node_key, node_type
) values
  (
    '56000000-0000-4000-8000-000000000061',
    '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020',
    '56000000-0000-4000-8000-000000000060', '01.1', 'sub_stage'
  ),
  (
    '56000000-0000-4000-8000-000000000062',
    '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020',
    '56000000-0000-4000-8000-000000000060', '01.2', 'sub_stage'
  );
insert into public.workflow_node_executions (
  id, tenant_id, company_id, node_instance_id, execution_no
) values
  (
    '56000000-0000-4000-8000-000000000070',
    '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020',
    '56000000-0000-4000-8000-000000000061', 1
  ),
  (
    '56000000-0000-4000-8000-000000000071',
    '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020',
    '56000000-0000-4000-8000-000000000062', 1
  );

create function private.stage01_force_baseline_failure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('stage01.test.fail_baseline', true) = 'on'
     and new.opportunity_id = '56000000-0000-4000-8000-000000000030'::uuid then
    raise exception using errcode = 'P0001', message = 'DB-S01-COMP-001_FORCED';
  end if;
  return new;
end;
$$;
create trigger stage01_force_baseline_failure
  before insert on public.stage01_intake_completion_baselines
  for each row execute function private.stage01_force_baseline_failure();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  company_id constant uuid := '55000000-0000-4000-8000-000000000020';
  opportunity_id constant uuid := '56000000-0000-4000-8000-000000000030';
  intake_execution_id constant uuid := '56000000-0000-4000-8000-000000000070';
  evaluation_execution_id constant uuid := '56000000-0000-4000-8000-000000000071';
  result jsonb;
  first_assignment_id uuid;
  blocker_id uuid;
begin
  result := public.assign_workflow_node(
    company_id, intake_execution_id,
    '{"assignmentKind":"accountable_owner","assigneeUserId":"55000000-0000-4000-8000-000000000001","assignmentReason":"Initial owner","expectedExecutionVersion":0}'::jsonb,
    '56000000-0000-4000-8000-000000000201'
  );
  first_assignment_id := (result ->> 'assignmentId')::uuid;

  perform public.assign_workflow_node(
    company_id, intake_execution_id,
    '{"assignmentKind":"accountable_owner","assigneeUserId":"55000000-0000-4000-8000-000000000001","assignmentReason":"Replacement owner","expectedExecutionVersion":1}'::jsonb,
    '56000000-0000-4000-8000-000000000202'
  );

  begin
    perform public.end_workflow_assignment(
      company_id, first_assignment_id,
      '{"endReason":"Repeated end","expectedExecutionVersion":2}'::jsonb,
      '56000000-0000-4000-8000-000000000203'
    );
    raise exception 'DB-S01-CMD ended assignment unexpectedly ended twice';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_RESOURCE_ALREADY_ENDED' then raise; end if;
  end;

  perform public.raise_workflow_blocker(
    company_id, intake_execution_id,
    '{"effect":"non_blocking","categoryCode":"follow_up","description":"Does not block completion","expectedExecutionVersion":2}'::jsonb,
    '56000000-0000-4000-8000-000000000204'
  );
  perform public.start_workflow_node(
    company_id, intake_execution_id, '{"expectedExecutionVersion":3}'::jsonb,
    '56000000-0000-4000-8000-000000000205'
  );
  perform public.resolve_opportunity_duplicate(
    company_id, opportunity_id, '56000000-0000-4000-8000-000000000085',
    '{"resolution":"different_need","resolutionNote":"Verified as a separate need","expectedOpportunityVersion":0}'::jsonb,
    '56000000-0000-4000-8000-000000000206'
  );
  perform public.complete_stage01_intake(
    company_id, intake_execution_id,
    '{"expectedOpportunityVersion":1,"expectedExecutionVersion":4}'::jsonb,
    '56000000-0000-4000-8000-000000000207'
  );

  perform public.invalidate_opportunity(
    company_id, opportunity_id,
    '{"invalidReasonCode":"test_invalid","reason":"Temporary invalidation","expectedOpportunityVersion":1}'::jsonb,
    '56000000-0000-4000-8000-000000000208'
  );
  perform public.restore_opportunity(
    company_id, opportunity_id,
    '{"reason":"Evidence restored validity","expectedOpportunityVersion":2}'::jsonb,
    '56000000-0000-4000-8000-000000000209'
  );

  perform public.reopen_workflow_node(
    company_id, intake_execution_id,
    '{"reason":"Intake evidence changed","expectedExecutionVersion":5}'::jsonb,
    '56000000-0000-4000-8000-000000000210'
  );
  perform public.complete_stage01_intake(
    company_id, intake_execution_id,
    '{"expectedOpportunityVersion":3,"expectedExecutionVersion":6}'::jsonb,
    '56000000-0000-4000-8000-000000000211'
  );
  perform public.revalidate_workflow_node(
    company_id, evaluation_execution_id,
    '{"reason":"Current Intake completion verified","evidence":["baseline:2"],"expectedExecutionVersion":1}'::jsonb,
    '56000000-0000-4000-8000-000000000212'
  );

  perform public.assign_workflow_node(
    company_id, evaluation_execution_id,
    '{"assignmentKind":"accountable_owner","assigneeUserId":"55000000-0000-4000-8000-000000000001","expectedExecutionVersion":2}'::jsonb,
    '56000000-0000-4000-8000-000000000213'
  );
  result := public.raise_workflow_blocker(
    company_id, evaluation_execution_id,
    '{"effect":"blocking","categoryCode":"approval","description":"Requires resolution","expectedExecutionVersion":3}'::jsonb,
    '56000000-0000-4000-8000-000000000214'
  );
  blocker_id := (result ->> 'blockerId')::uuid;
  perform public.resolve_workflow_blocker(
    company_id, blocker_id,
    '{"resolution":"Approval evidence received","expectedExecutionVersion":4}'::jsonb,
    '56000000-0000-4000-8000-000000000215'
  );
  perform public.start_workflow_node(
    company_id, evaluation_execution_id, '{"expectedExecutionVersion":5}'::jsonb,
    '56000000-0000-4000-8000-000000000216'
  );

  perform public.reopen_workflow_node(
    company_id, intake_execution_id,
    '{"reason":"Exercise atomic completion rollback","expectedExecutionVersion":7}'::jsonb,
    '56000000-0000-4000-8000-000000000217'
  );
end $$;

reset role;

create temporary table stage01_comp001_before as
select
  (select phase from public.workflow_node_executions where id = '56000000-0000-4000-8000-000000000070') as execution_phase,
  (select version from public.workflow_node_executions where id = '56000000-0000-4000-8000-000000000070') as execution_version,
  (select count(*) from public.workflow_node_events where node_execution_id = '56000000-0000-4000-8000-000000000070') as event_count,
  (select count(*) from public.stage01_intake_completion_baselines where node_execution_id = '56000000-0000-4000-8000-000000000070') as baseline_count,
  (select count(*) from public.audit_events where company_id = '55000000-0000-4000-8000-000000000020') as audit_count;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config('stage01.test.fail_baseline', 'on', true);

do $$
begin
  begin
    perform public.complete_stage01_intake(
      '55000000-0000-4000-8000-000000000020',
      '56000000-0000-4000-8000-000000000070',
      '{"expectedOpportunityVersion":3,"expectedExecutionVersion":8}'::jsonb,
      '56000000-0000-4000-8000-000000000218'
    );
    raise exception 'DB-S01-COMP-001 forced baseline failure unexpectedly committed';
  exception when raise_exception then
    if sqlerrm <> 'DB-S01-COMP-001_FORCED' then raise; end if;
  end;
end $$;

reset role;

do $$
declare
  before_row record;
begin
  select * into before_row from stage01_comp001_before;
  if (select count(*) from public.workflow_node_assignments
      where node_execution_id = '56000000-0000-4000-8000-000000000070'
        and assignment_kind = 'accountable_owner' and ended_at is null) <> 1 then
    raise exception 'DB-S01-CMD accountable owner replacement invariant failed';
  end if;
  if (select count(*) from public.stage01_intake_completion_baselines
      where node_execution_id = '56000000-0000-4000-8000-000000000070') <> 2 then
    raise exception 'DB-S01-CMD Intake baseline version history is incorrect';
  end if;
  if (select count(*) from public.workflow_node_events
      where node_execution_id = '56000000-0000-4000-8000-000000000070'
        and event_type = 'completed') <> 2
     or exists (
       select 1
       from public.stage01_intake_completion_baselines as baseline
       left join public.workflow_node_events as event
         on event.id = baseline.completion_event_id
        and event.node_execution_id = baseline.node_execution_id
        and event.payload ->> 'baselineId' = baseline.id::text
       where baseline.node_execution_id = '56000000-0000-4000-8000-000000000070'
         and event.id is null
     ) then
    raise exception 'DB-S01-HIST reopen did not preserve completion event and baseline history';
  end if;
  if (select validity_state from public.opportunities
      where id = '56000000-0000-4000-8000-000000000030') <> 'valid' then
    raise exception 'DB-S01-CMD validity restore transition failed';
  end if;
  if (select resolution from public.opportunity_duplicate_concerns
      where id = '56000000-0000-4000-8000-000000000085') <> 'different_need' then
    raise exception 'DB-S01-CMD duplicate resolution semantics failed';
  end if;
  if not (select needs_revalidation from public.workflow_node_executions
          where id = '56000000-0000-4000-8000-000000000071') then
    raise exception 'DB-S01-CMD reopen did not propagate revalidation to descendant';
  end if;
  if (select phase from public.workflow_node_executions
      where id = '56000000-0000-4000-8000-000000000070') is distinct from before_row.execution_phase
     or (select version from public.workflow_node_executions
         where id = '56000000-0000-4000-8000-000000000070') is distinct from before_row.execution_version
     or (select count(*) from public.workflow_node_events
         where node_execution_id = '56000000-0000-4000-8000-000000000070') <> before_row.event_count
     or (select count(*) from public.stage01_intake_completion_baselines
         where node_execution_id = '56000000-0000-4000-8000-000000000070') <> before_row.baseline_count
     or (select count(*) from public.audit_events
         where company_id = '55000000-0000-4000-8000-000000000020') <> before_row.audit_count then
    raise exception 'DB-S01-COMP-001 completion failure was not fully atomic';
  end if;
end $$;

select 'PASS DB-S01-CMD Task 8 and Task 9 lifecycle commands; DB-S01-COMP-001' as result;

rollback;
