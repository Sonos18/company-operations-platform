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
    'public.revalidate_workflow_node(uuid,uuid,jsonb,uuid)',
    'public.record_stage01_criterion_evaluation(uuid,uuid,text,jsonb,uuid)',
    'public.submit_stage01_recommendation(uuid,uuid,jsonb,uuid)',
    'public.return_stage01_for_clarification(uuid,uuid,jsonb,uuid)',
    'public.record_stage01_final_decision(uuid,uuid,jsonb,uuid)',
    'public.complete_stage01_evaluation(uuid,uuid,jsonb,uuid)',
    'public.reactivate_stage01(uuid,uuid,jsonb,uuid)'
  ] loop
    if to_regprocedure(function_signature) is null then
      raise exception 'DB-S01-CMD missing function %', function_signature;
    end if;
  end loop;
end $$;

insert into auth.users (id, email) values
  ('55000000-0000-4000-8000-000000000001', 'stage01-commands@test.invalid'),
  ('55000000-0000-4000-8000-000000000002', 'stage01-commands-mismatch@test.invalid');

insert into public.tenants (id, code, name) values
  ('55000000-0000-4000-8000-000000000010', 'stage01-commands', 'Stage 01 commands test');

insert into public.companies (id, tenant_id, code, name) values
  ('55000000-0000-4000-8000-000000000020', '55000000-0000-4000-8000-000000000010', 'S01-CMD', 'Stage 01 commands company');

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  ('55000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000010', array['member']),
  ('55000000-0000-4000-8000-000000000002', '55000000-0000-4000-8000-000000000010', array['member']);

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  ('55000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000010', '55000000-0000-4000-8000-000000000020', array['member']),
  ('55000000-0000-4000-8000-000000000002', '55000000-0000-4000-8000-000000000010', '55000000-0000-4000-8000-000000000020', array['member']);

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
  ('55000000-0000-4000-8000-000000000100', 'journey.node.revalidate'),
  ('55000000-0000-4000-8000-000000000100', 'stage01.evaluation.update'),
  ('55000000-0000-4000-8000-000000000100', 'stage01.recommendation.submit'),
  ('55000000-0000-4000-8000-000000000100', 'stage01.clarification.return'),
  ('55000000-0000-4000-8000-000000000100', 'stage01.decision.record'),
  ('55000000-0000-4000-8000-000000000100', 'stage01.reactivate');

insert into public.company_role_assignments (
  tenant_id, company_id, user_id, role_id, granted_by, grant_reason
) values
(
  '55000000-0000-4000-8000-000000000010', '55000000-0000-4000-8000-000000000020',
  '55000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000100',
  '55000000-0000-4000-8000-000000000001', 'Stage 01 command fixture'
),
(
  '55000000-0000-4000-8000-000000000010', '55000000-0000-4000-8000-000000000020',
  '55000000-0000-4000-8000-000000000002', '55000000-0000-4000-8000-000000000100',
  '55000000-0000-4000-8000-000000000001', 'Stage 01 authority mismatch fixture'
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

insert into public.workflow_definition_snapshots (
  id, tenant_id, company_id, workflow_key, template_version, schema_version,
  definition, definition_hash
) values (
  '55000000-0000-4000-8000-000000000040',
  '55000000-0000-4000-8000-000000000010',
  '55000000-0000-4000-8000-000000000020',
  'vqh.stage01', 100, 1,
  '{
    "taxonomies":{
      "customer_type":[{"code":"customer","label":"Customer"}],
      "contact_relationship":[{"code":"decision_maker","label":"Decision maker"}],
      "scope":[{"code":"design","label":"Design"}],
      "lead_source":[{"code":"direct","label":"Direct","behavior":{"requiresReferrer":false}}],
      "referrer_type":[{"code":"partner","label":"Partner"}],
      "engagement_status":[{"code":"grounded","label":"Grounded"}],
      "invalid_reason":[
        {"code":"test_invalid","label":"Test invalid","semanticKey":"invalid"},
        {"code":"system_same_need_duplicate","label":"Same-need duplicate","semanticKey":"duplicate_merged"}
      ],
      "budget_status":[{"code":"unknown","label":"Unknown"}],
      "timeline_status":[{"code":"unknown","label":"Unknown"}],
      "priority":[{"code":"normal","label":"Normal"}],
      "intake_channel":[{"code":"phone","label":"Phone"}],
      "blocker_category":[{"code":"follow_up","label":"Follow up"}]
    }
  }'::jsonb,
  'stage01-direct-command-definition'
);

insert into public.workflow_instances (
  id, tenant_id, company_id, subject_type, subject_id, definition_snapshot_id, created_by
) values
  (
    '55000000-0000-4000-8000-000000000050',
    '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020', 'opportunity',
    '55000000-0000-4000-8000-000000000030',
    '55000000-0000-4000-8000-000000000040',
    '55000000-0000-4000-8000-000000000001'
  ),
  (
    '55000000-0000-4000-8000-000000000051',
    '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020', 'opportunity',
    '55000000-0000-4000-8000-000000000031',
    '55000000-0000-4000-8000-000000000040',
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
  invalid_input jsonb;
begin
  for invalid_input in
    select value
    from pg_catalog.jsonb_array_elements(
      '[
        {"customerTypeCode":"unknown_code","expectedOpportunityVersion":0},
        {"primaryLeadSourceCode":"unknown_code","expectedOpportunityVersion":0},
        {"engagementStatusCode":"unknown_code","expectedOpportunityVersion":0},
        {"budgetStatusCode":"unknown_code","expectedOpportunityVersion":0},
        {"timelineStatusCode":"unknown_code","expectedOpportunityVersion":0},
        {"priorityCode":"unknown_code","expectedOpportunityVersion":0}
      ]'::jsonb
    )
  loop
    begin
      perform public.update_opportunity_current_data(
        company_id, opportunity_id, invalid_input, pg_catalog.gen_random_uuid()
      );
      raise exception 'DB-S01-CMD unknown Opportunity taxonomy code unexpectedly succeeded: %', invalid_input;
    exception when raise_exception then
      if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if;
    end;
  end loop;

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

  begin
    perform public.set_opportunity_primary_contact(
      company_id, opportunity_id,
      pg_catalog.jsonb_build_object(
        'contactId', first_contact_id, 'relationshipCode', 'unknown_code',
        'expectedOpportunityVersion', 1
      ),
      pg_catalog.gen_random_uuid()
    );
    raise exception 'DB-S01-CMD unknown contact relationship unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if;
  end;

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

  begin
    perform public.add_opportunity_scope(
      company_id, opportunity_id,
      '{"scopeCode":"unknown_code","expectedOpportunityVersion":3}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'DB-S01-CMD unknown scope code unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if;
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

  begin
    perform public.add_opportunity_referrer(
      company_id, opportunity_id,
      '{"referrerTypeCode":"unknown_code","displayName":"Invalid referrer","expectedOpportunityVersion":5}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'DB-S01-CMD unknown referrer type unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if;
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

  begin
    perform public.append_opportunity_intake_record(
      company_id, opportunity_id,
      '{"channelCode":"unknown_code","summary":"Invalid intake","expectedOpportunityVersion":8}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'DB-S01-CMD unknown intake channel unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if;
  end;

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
      "invalid_reason":[
        {"code":"test_invalid","label":"Test invalid","semanticKey":"invalid"},
        {"code":"system_same_need_duplicate","label":"Same-need duplicate","semanticKey":"duplicate_merged"}
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
) values
  (
    '56000000-0000-4000-8000-000000000060',
    '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020', 'opportunity',
    '56000000-0000-4000-8000-000000000030',
    '56000000-0000-4000-8000-000000000040',
    '55000000-0000-4000-8000-000000000001'
  ),
  (
    '56000000-0000-4000-8000-000000000063',
    '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020', 'opportunity',
    '56000000-0000-4000-8000-000000000031',
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

create function private.stage01_test_set_persisted_lead_source(target_code text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.opportunities
  set primary_lead_source_code = target_code
  where id = '56000000-0000-4000-8000-000000000030'::uuid;
$$;
revoke all on function private.stage01_test_set_persisted_lead_source(text) from public, anon;
grant execute on function private.stage01_test_set_persisted_lead_source(text) to authenticated;

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
  second_assignment_id uuid;
  blocker_id uuid;
  duplicate_concern_id uuid;
  baseline_snapshot_before jsonb;
  baseline_hash_before text;
  revalidation_execution_version_before bigint;
  revalidation_event_count_before bigint;
  revalidation_audit_count_before bigint;
begin
  result := public.assign_workflow_node(
    company_id, intake_execution_id,
    '{"assignmentKind":"accountable_owner","assigneeUserId":"55000000-0000-4000-8000-000000000001","assignmentReason":"Initial owner","expectedExecutionVersion":0}'::jsonb,
    '56000000-0000-4000-8000-000000000201'
  );
  first_assignment_id := (result ->> 'assignmentId')::uuid;

  result := public.assign_workflow_node(
    company_id, intake_execution_id,
    '{"assignmentKind":"accountable_owner","assigneeUserId":"55000000-0000-4000-8000-000000000001","assignmentReason":"Replacement owner","expectedExecutionVersion":1}'::jsonb,
    '56000000-0000-4000-8000-000000000202'
  );
  second_assignment_id := (result ->> 'assignmentId')::uuid;

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

  begin
    perform public.raise_workflow_blocker(
      company_id, intake_execution_id,
      '{"effect":"non_blocking","categoryCode":"unknown_code","description":"Invalid category","expectedExecutionVersion":2}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'DB-S01-CMD unknown blocker category unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if;
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

  perform private.stage01_test_set_persisted_lead_source('unknown_code');
  begin
    perform public.complete_stage01_intake(
      company_id, intake_execution_id,
      '{"expectedOpportunityVersion":1,"expectedExecutionVersion":4}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'DB-S01-CMD persisted unknown Lead Source bypassed completion taxonomy validation';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if;
  end;
  perform private.stage01_test_set_persisted_lead_source('direct');

  perform public.complete_stage01_intake(
    company_id, intake_execution_id,
    '{"expectedOpportunityVersion":1,"expectedExecutionVersion":4}'::jsonb,
    '56000000-0000-4000-8000-000000000207'
  );

  select baseline.snapshot, baseline.snapshot_hash
  into baseline_snapshot_before, baseline_hash_before
  from public.stage01_intake_completion_baselines as baseline
  where baseline.node_execution_id = intake_execution_id
    and baseline.baseline_version = 1;

  if baseline_snapshot_before ->> 'schemaVersion' <> '1'
     or baseline_snapshot_before #>> '{opportunity,id}' <> opportunity_id::text
     or baseline_snapshot_before #>> '{primaryContact,relationshipId}' <> '56000000-0000-4000-8000-000000000082'
     or baseline_snapshot_before #>> '{usableContactMethods,0,contactMethodId}' <> '56000000-0000-4000-8000-000000000081'
     or baseline_snapshot_before #>> '{usableContactMethods,0,isUsableAtCompletion}' <> 'true'
     or baseline_snapshot_before #>> '{activeScopes,0,scopeId}' <> '56000000-0000-4000-8000-000000000083'
     or baseline_snapshot_before #>> '{intakeRecordRefs,0,intakeRecordId}' <> '56000000-0000-4000-8000-000000000084'
     or baseline_snapshot_before #>> '{intakeOwnerAssignment,assignmentId}' <> second_assignment_id::text
     or baseline_snapshot_before #>> '{completion,actorId}' <> '55000000-0000-4000-8000-000000000001'
     or baseline_snapshot_before #>> '{completion,completedAt}' is null
     or baseline_snapshot_before #>> '{completion,opportunityVersion}' <> '1'
     or baseline_snapshot_before #>> '{completion,executionVersion}' <> '5'
     or baseline_snapshot_before -> 'gates' is distinct from '{
       "opportunityValid":true,
       "meaningfulNeed":true,
       "hasPrimaryContact":true,
       "hasUsableContactMethod":true,
       "hasActiveScope":true,
       "hasIntakeRecord":true,
       "noOpenBlockingBlocker":true,
       "noUnresolvedDuplicateConcern":true,
       "leadSourceRequiresReferrer":false,
       "conditionalReferrerSatisfied":true,
       "actorHadCompletionPermission":true,
       "executionWasActive":true
     }'::jsonb
     or baseline_snapshot_before::text like '%0900000001%'
     or baseline_hash_before <> pg_catalog.encode(
       extensions.digest(baseline_snapshot_before::text, 'sha256'), 'hex'
     ) then
    raise exception 'DB-S01-CMD explicit immutable Intake baseline evidence is incomplete';
  end if;

  perform public.update_contact_method(
    company_id, '56000000-0000-4000-8000-000000000081',
    '{"isUsable":false,"expectedContactVersion":0}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if exists (
    select 1
    from public.stage01_intake_completion_baselines as baseline
    where baseline.node_execution_id = intake_execution_id
      and baseline.baseline_version = 1
      and (baseline.snapshot is distinct from baseline_snapshot_before
           or baseline.snapshot_hash is distinct from baseline_hash_before)
  ) then
    raise exception 'DB-S01-CMD later Contact Method mutation changed historical baseline evidence';
  end if;
  perform public.update_contact_method(
    company_id, '56000000-0000-4000-8000-000000000081',
    '{"isUsable":true,"expectedContactVersion":1}'::jsonb,
    pg_catalog.gen_random_uuid()
  );

  begin
    perform public.invalidate_opportunity(
      company_id, opportunity_id,
      '{"invalidReasonCode":"unknown_code","reason":"Invalid taxonomy","expectedOpportunityVersion":1}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'DB-S01-CMD unknown invalid reason unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if;
  end;

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

  result := public.raise_opportunity_duplicate_concern(
    company_id, '56000000-0000-4000-8000-000000000031',
    '{"suspectedDuplicateOpportunityId":"56000000-0000-4000-8000-000000000030","description":"Same governed need","expectedOpportunityVersion":0}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  duplicate_concern_id := (result ->> 'duplicateConcernId')::uuid;
  perform public.resolve_opportunity_duplicate(
    company_id, '56000000-0000-4000-8000-000000000031', duplicate_concern_id,
    '{"resolution":"same_need","canonicalOpportunityId":"56000000-0000-4000-8000-000000000030","resolutionNote":"Merged after review","expectedOpportunityVersion":1}'::jsonb,
    pg_catalog.gen_random_uuid()
  );

  begin
    perform public.restore_opportunity(
      company_id, '56000000-0000-4000-8000-000000000031',
      '{"reason":"Unsupported separation","expectedOpportunityVersion":2}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'DB-S01-CMD duplicate_merged restore without evidence unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if;
  end;
  begin
    perform public.restore_opportunity(
      company_id, '56000000-0000-4000-8000-000000000031',
      '{"reason":"Unsupported separation","evidence":[],"expectedOpportunityVersion":2}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'DB-S01-CMD duplicate_merged restore with empty evidence unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if;
  end;
  perform public.restore_opportunity(
    company_id, '56000000-0000-4000-8000-000000000031',
    '{"reason":"Separated after correction","evidence":[{"kind":"separation_record","ref":"case:42"}],"expectedOpportunityVersion":2}'::jsonb,
    pg_catalog.gen_random_uuid()
  );
  if exists (
    select 1
    from public.opportunities as opportunity
    where opportunity.id = '56000000-0000-4000-8000-000000000031'
      and (
        opportunity.version <> 3
        or opportunity.validity_state <> 'valid'
        or opportunity.canonical_opportunity_id is not null
        or opportunity.current_invalid_reason_code is not null
        or opportunity.current_invalid_reason_semantic_key is not null
        or opportunity.current_invalidation_reason is not null
        or opportunity.invalidated_by is not null
        or opportunity.invalidated_at is not null
      )
  ) then
    raise exception 'DB-S01-CMD evidenced duplicate restore did not atomically clear invalidation metadata';
  end if;

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

  select execution.version,
         (select pg_catalog.count(*) from public.workflow_node_events as event
          where event.node_execution_id = evaluation_execution_id),
         (select pg_catalog.count(*) from public.audit_events as audit
          where audit.company_id = company_id)
  into revalidation_execution_version_before,
       revalidation_event_count_before,
       revalidation_audit_count_before
  from public.workflow_node_executions as execution
  where execution.id = evaluation_execution_id;

  begin
    perform public.revalidate_workflow_node(
      company_id, evaluation_execution_id,
      '{"reason":"Missing evidence","expectedExecutionVersion":1}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'DB-S01-CMD revalidation without evidence unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if;
  end;
  begin
    perform public.revalidate_workflow_node(
      company_id, evaluation_execution_id,
      '{"reason":"Wrong evidence type","evidence":{},"expectedExecutionVersion":1}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'DB-S01-CMD revalidation with non-array evidence unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if;
  end;
  begin
    perform public.revalidate_workflow_node(
      company_id, evaluation_execution_id,
      '{"reason":"Empty evidence","evidence":[],"expectedExecutionVersion":1}'::jsonb,
      pg_catalog.gen_random_uuid()
    );
    raise exception 'DB-S01-CMD revalidation with empty evidence unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if;
  end;
  if (select version from public.workflow_node_executions where id = evaluation_execution_id)
       is distinct from revalidation_execution_version_before
     or (select pg_catalog.count(*) from public.workflow_node_events as event
         where event.node_execution_id = evaluation_execution_id)
       <> revalidation_event_count_before
     or (select pg_catalog.count(*) from public.audit_events as audit
         where audit.company_id = company_id)
       <> revalidation_audit_count_before then
    raise exception 'DB-S01-CMD rejected revalidation left partial effects';
  end if;

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

insert into public.workflow_definition_snapshots (
  id, tenant_id, company_id, workflow_key, template_version, schema_version,
  definition, definition_hash
) values (
  '57000000-0000-4000-8000-000000000040',
  '55000000-0000-4000-8000-000000000010',
  '55000000-0000-4000-8000-000000000020',
  'vqh.stage01', 2, 1,
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
      "invalid_reason":[
        {"code":"test_invalid","label":"Test invalid","semanticKey":"invalid"},
        {"code":"system_same_need_duplicate","label":"Same-need duplicate","semanticKey":"duplicate_merged"}
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
      {"key":"required_fit","dimensionKey":"customer_need","label":"Required fit","description":"Required gate criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":1},
      {"key":"optional_na","dimensionKey":"scope_capability","label":"Optional N/A","description":"Optional N/A criterion","criticality":"optional","applicabilityMode":"manual","allowsNotApplicable":true,"displayOrder":2},
      {"key":"optional_schedule","dimensionKey":"resources_schedule","label":"Optional schedule","description":"Optional criterion","criticality":"optional","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":3},
      {"key":"optional_commercial","dimensionKey":"commercial_viability","label":"Optional commercial","description":"Optional criterion","criticality":"optional","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":4},
      {"key":"optional_risk","dimensionKey":"risk_special_conditions","label":"Optional risk","description":"Optional criterion","criticality":"optional","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":5}
    ],
    "capabilities":{"intakeOwner":"journey.assignment.manage","evaluationOwner":"journey.assignment.manage","start":"journey.node.start","complete":"journey.node.complete","decision":"stage01.decision.record"},
    "gates":{"intake":["approved_minimum","duplicate_resolved","no_blocking_blocker"],"evaluation":["required_applicable_evaluated","recommendation_current","final_decision_recorded"]}
  }'::jsonb,
  'stage01-decision-definition'
);

insert into public.opportunities (
  id, tenant_id, company_id, primary_customer_name, customer_type_code,
  need_description, location_status, primary_lead_source_code,
  engagement_status_code, created_by
) values (
  '57000000-0000-4000-8000-000000000030',
  '55000000-0000-4000-8000-000000000010',
  '55000000-0000-4000-8000-000000000020',
  'Decision Opportunity', 'customer', 'A qualified decision case', 'unknown',
  'direct', 'grounded', '55000000-0000-4000-8000-000000000001'
);
insert into public.workflow_instances (
  id, tenant_id, company_id, subject_type, subject_id, definition_snapshot_id, created_by
) values (
  '57000000-0000-4000-8000-000000000060',
  '55000000-0000-4000-8000-000000000010',
  '55000000-0000-4000-8000-000000000020', 'opportunity',
  '57000000-0000-4000-8000-000000000030',
  '57000000-0000-4000-8000-000000000040',
  '55000000-0000-4000-8000-000000000001'
);
insert into public.workflow_node_instances (
  id, tenant_id, company_id, workflow_instance_id, node_key, node_type
) values
  (
    '57000000-0000-4000-8000-000000000061',
    '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020',
    '57000000-0000-4000-8000-000000000060', '01.1', 'sub_stage'
  ),
  (
    '57000000-0000-4000-8000-000000000062',
    '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020',
    '57000000-0000-4000-8000-000000000060', '01.2', 'sub_stage'
  );
insert into public.workflow_node_executions (
  id, tenant_id, company_id, node_instance_id, execution_no, phase,
  started_by, started_at, completed_by, completed_at
) values
  (
    '57000000-0000-4000-8000-000000000070',
    '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020',
    '57000000-0000-4000-8000-000000000061', 1, 'completed',
    '55000000-0000-4000-8000-000000000001', now() - interval '2 minutes',
    '55000000-0000-4000-8000-000000000001', now() - interval '1 minute'
  ),
  (
    '57000000-0000-4000-8000-000000000071',
    '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020',
    '57000000-0000-4000-8000-000000000062', 1, 'active',
    '55000000-0000-4000-8000-000000000001', now() - interval '30 seconds',
    null, null
  );
insert into public.stage01_decision_cycles (
  id, tenant_id, company_id, opportunity_id, node_execution_id, cycle_no,
  decision_authority_user_id, authority_resolution_reference, created_by
) values (
  '57000000-0000-4000-8000-000000000090',
  '55000000-0000-4000-8000-000000000010',
  '55000000-0000-4000-8000-000000000020',
  '57000000-0000-4000-8000-000000000030',
  '57000000-0000-4000-8000-000000000071', 1,
  '55000000-0000-4000-8000-000000000001', 'test-authority-resolution',
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
  opportunity_id constant uuid := '57000000-0000-4000-8000-000000000030';
  evaluation_execution_id constant uuid := '57000000-0000-4000-8000-000000000071';
  result jsonb;
  recommendation_id uuid;
begin
  begin
    perform public.record_stage01_criterion_evaluation(
      company_id, opportunity_id, 'required_fit',
      '{"applicability":"not_applicable","result":null,"rationale":"Attempt forbidden N/A","evidence":[],"expectedCycleVersion":0}'::jsonb,
      '57000000-0000-4000-8000-000000000201'
    );
    raise exception 'DB-S01-CMD forbidden criterion N/A unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_CRITERION_NOT_APPLICABLE_FORBIDDEN' then raise; end if;
  end;

  perform public.record_stage01_criterion_evaluation(
    company_id, opportunity_id, 'required_fit',
    '{"applicability":"applicable","result":"fit","rationale":"Initial supported fit","evidence":[],"expectedCycleVersion":0}'::jsonb,
    '57000000-0000-4000-8000-000000000202'
  );
  perform public.record_stage01_criterion_evaluation(
    company_id, opportunity_id, 'optional_na',
    '{"applicability":"not_applicable","result":null,"rationale":"Not relevant to this case","evidence":[],"expectedCycleVersion":1}'::jsonb,
    '57000000-0000-4000-8000-000000000203'
  );
  perform public.submit_stage01_recommendation(
    company_id, opportunity_id,
    '{"recommendation":"recommend_proceed","rationale":"Initial recommendation","evidence":[],"expectedCycleVersion":2}'::jsonb,
    '57000000-0000-4000-8000-000000000204'
  );

  perform public.record_stage01_criterion_evaluation(
    company_id, opportunity_id, 'required_fit',
    '{"applicability":"applicable","result":"insufficient_information","rationale":"New evidence is incomplete","evidence":[],"expectedCycleVersion":3}'::jsonb,
    '57000000-0000-4000-8000-000000000205'
  );
  begin
    perform public.submit_stage01_recommendation(
      company_id, opportunity_id,
      '{"recommendation":"recommend_proceed","rationale":"Must not use stale evaluation","evidence":[],"expectedCycleVersion":4}'::jsonb,
      '57000000-0000-4000-8000-000000000206'
    );
    raise exception 'DB-S01-CMD insufficient-information Recommendation unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_EVALUATION_GATES_NOT_SATISFIED' then raise; end if;
  end;

  perform public.record_stage01_criterion_evaluation(
    company_id, opportunity_id, 'required_fit',
    '{"applicability":"applicable","result":"concern","rationale":"Known risk accepted for decision","evidence":[],"expectedCycleVersion":4}'::jsonb,
    '57000000-0000-4000-8000-000000000207'
  );
  result := public.submit_stage01_recommendation(
    company_id, opportunity_id,
    '{"recommendation":"recommend_proceed","rationale":"Current recommendation before clarification","evidence":[],"expectedCycleVersion":5}'::jsonb,
    '57000000-0000-4000-8000-000000000208'
  );
  recommendation_id := (result ->> 'recommendationId')::uuid;
  perform public.return_stage01_for_clarification(
    company_id, opportunity_id,
    pg_catalog.jsonb_build_object(
      'recommendationId', recommendation_id,
      'reason', 'Clarify known risk',
      'expectedCycleVersion', 6
    ),
    '57000000-0000-4000-8000-000000000209'
  );
  begin
    perform public.record_stage01_final_decision(
      company_id, opportunity_id,
      '{"outcome":"proceed","rationale":"Stale recommendation attempt","expectedCycleVersion":7}'::jsonb,
      '57000000-0000-4000-8000-000000000210'
    );
    raise exception 'DB-S01-CMD Final Decision accepted a clarified Recommendation';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_CURRENT_RECOMMENDATION_REQUIRED' then raise; end if;
  end;

  perform public.submit_stage01_recommendation(
    company_id, opportunity_id,
    '{"recommendation":"recommend_proceed","rationale":"Fresh recommendation after clarification","evidence":[],"expectedCycleVersion":7}'::jsonb,
    '57000000-0000-4000-8000-000000000211'
  );

  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"sub":"55000000-0000-4000-8000-000000000002","role":"authenticated"}', true
  );
  begin
    perform public.record_stage01_final_decision(
      company_id, opportunity_id,
      '{"outcome":"not_proceeding","rationale":"Wrong actor","overrideRationale":"Known risk outweighs fit","expectedCycleVersion":8}'::jsonb,
      '57000000-0000-4000-8000-000000000212'
    );
    raise exception 'DB-S01-CMD non-authority Final Decision unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DECISION_AUTHORITY_MISMATCH' then raise; end if;
  end;
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"sub":"55000000-0000-4000-8000-000000000001","role":"authenticated"}', true
  );

  begin
    perform public.record_stage01_final_decision(
      company_id, opportunity_id,
      '{"outcome":"not_proceeding","rationale":"Override without rationale","expectedCycleVersion":8}'::jsonb,
      '57000000-0000-4000-8000-000000000213'
    );
    raise exception 'DB-S01-CMD override without rationale unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_OVERRIDE_RATIONALE_REQUIRED' then raise; end if;
  end;
  perform public.record_stage01_final_decision(
    company_id, opportunity_id,
    '{"outcome":"not_proceeding","rationale":"Authority decided not to proceed","overrideRationale":"Known risk outweighs the proceed Recommendation","expectedCycleVersion":8}'::jsonb,
    '57000000-0000-4000-8000-000000000214'
  );
  begin
    perform public.record_stage01_final_decision(
      company_id, opportunity_id,
      '{"outcome":"not_proceeding","rationale":"Second decision","overrideRationale":"Not allowed","expectedCycleVersion":9}'::jsonb,
      '57000000-0000-4000-8000-000000000215'
    );
    raise exception 'DB-S01-CMD second Final Decision unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_FINAL_DECISION_EXISTS' then raise; end if;
  end;

  perform public.complete_stage01_evaluation(
    company_id, evaluation_execution_id,
    '{"expectedExecutionVersion":0,"expectedCycleVersion":9}'::jsonb,
    '57000000-0000-4000-8000-000000000216'
  );
end $$;

reset role;

do $$
begin
  if (select phase from public.workflow_node_executions
      where id = '57000000-0000-4000-8000-000000000071') <> 'completed'
     or (select final_outcome from public.stage01_decision_cycles
         where id = '57000000-0000-4000-8000-000000000090') <> 'not_proceeding'
     or (select validity_state from public.opportunities
         where id = '57000000-0000-4000-8000-000000000030') <> 'valid' then
    raise exception 'DB-S01-CMD explicit 01.2 completion or not_proceeding semantics failed';
  end if;
end $$;

create temporary table stage01_cycle_one_before as
select pg_catalog.to_jsonb(cycle) as snapshot
from public.stage01_decision_cycles as cycle
where cycle.id = '57000000-0000-4000-8000-000000000090';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  perform public.reactivate_stage01(
    '55000000-0000-4000-8000-000000000020',
    '57000000-0000-4000-8000-000000000030',
    '{"reason":"Reconsider after changed conditions","expectedOpportunityVersion":0,"expectedExecutionVersion":1,"expectedCycleVersion":9}'::jsonb,
    '57000000-0000-4000-8000-000000000217'
  );

  begin
    perform public.record_stage01_final_decision(
      '55000000-0000-4000-8000-000000000020',
      '57000000-0000-4000-8000-000000000030',
      '{"outcome":"proceed","rationale":"Authority unresolved in new cycle","expectedCycleVersion":0}'::jsonb,
      '57000000-0000-4000-8000-000000000218'
    );
    raise exception 'DB-S01-CMD unresolved Decision Authority unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DECISION_AUTHORITY_UNRESOLVED' then raise; end if;
  end;

  begin
    perform public.reactivate_stage01(
      '55000000-0000-4000-8000-000000000020',
      '57000000-0000-4000-8000-000000000030',
      '{"reason":"Duplicate reactivation","expectedOpportunityVersion":0,"expectedExecutionVersion":0,"expectedCycleVersion":0}'::jsonb,
      '57000000-0000-4000-8000-000000000219'
    );
    raise exception 'DB-S01-CMD duplicate Reactivation unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_NOT_REACTIVATABLE' then raise; end if;
  end;
end $$;

reset role;

do $$
begin
  if (select pg_catalog.to_jsonb(cycle)
      from public.stage01_decision_cycles as cycle
      where cycle.id = '57000000-0000-4000-8000-000000000090')
     is distinct from (select snapshot from stage01_cycle_one_before) then
    raise exception 'DB-S01-HIST Reactivation changed Cycle 1';
  end if;
  if (select count(*) from public.stage01_decision_cycles
      where opportunity_id = '57000000-0000-4000-8000-000000000030') <> 2
     or not exists (
       select 1
       from public.stage01_decision_cycles as cycle
       join public.workflow_node_executions as execution
         on execution.id = cycle.node_execution_id
       where cycle.opportunity_id = '57000000-0000-4000-8000-000000000030'
         and cycle.cycle_no = 2
         and cycle.reactivation_reason = 'Reconsider after changed conditions'
         and cycle.decision_authority_user_id is null
         and execution.execution_no = 2
         and execution.phase = 'not_started'
         and execution.superseded_at is null
     ) then
    raise exception 'DB-S01-CMD Reactivation did not atomically create execution and Cycle N+1';
  end if;
  if not exists (
    select 1 from public.workflow_node_executions
    where id = '57000000-0000-4000-8000-000000000071'
      and superseded_at is not null and phase = 'completed'
  ) then
    raise exception 'DB-S01-HIST Reactivation did not retain completed execution N';
  end if;
end $$;

select 'PASS DB-S01-CMD Tasks 8-10 lifecycle commands; DB-S01-COMP-001' as result;

rollback;
