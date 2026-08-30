-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;

insert into auth.users (id, email)
values ('7c000000-0000-4000-8000-000000000001', 'stage01-concurrency@test.invalid');

insert into public.tenants (id, code, name)
values (
  '7c000000-0000-4000-8000-000000000010',
  'stage01-concurrency',
  'Stage 01 concurrency verification'
);

insert into public.companies (id, tenant_id, code, name)
values (
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000010',
  'S01-RACE',
  'Stage 01 concurrency verification'
);

insert into public.tenant_memberships (user_id, tenant_id, roles)
values (
  '7c000000-0000-4000-8000-000000000001',
  '7c000000-0000-4000-8000-000000000010',
  array['member']
);

insert into public.company_memberships (user_id, tenant_id, company_id, roles)
values (
  '7c000000-0000-4000-8000-000000000001',
  '7c000000-0000-4000-8000-000000000010',
  '7c000000-0000-4000-8000-000000000020',
  array['member']
);

insert into public.roles (
  id, tenant_id, company_id, code, name, description, is_system
) values (
  '7c000000-0000-4000-8000-000000000100',
  '7c000000-0000-4000-8000-000000000010',
  '7c000000-0000-4000-8000-000000000020',
  'stage01_concurrency_actor',
  'Stage 01 concurrency actor',
  'Fixed Cloud DEV optimistic-concurrency verification role',
  false
);

insert into public.role_permissions (role_id, permission_code) values
  ('7c000000-0000-4000-8000-000000000100', 'opportunity.read'),
  ('7c000000-0000-4000-8000-000000000100', 'opportunity.update'),
  ('7c000000-0000-4000-8000-000000000100', 'opportunity.contact.manage'),
  ('7c000000-0000-4000-8000-000000000100', 'opportunity.referrer.manage'),
  ('7c000000-0000-4000-8000-000000000100', 'opportunity.duplicate.resolve'),
  ('7c000000-0000-4000-8000-000000000100', 'journey.read'),
  ('7c000000-0000-4000-8000-000000000100', 'journey.assignment.manage'),
  ('7c000000-0000-4000-8000-000000000100', 'journey.node.complete'),
  ('7c000000-0000-4000-8000-000000000100', 'stage01.decision.record'),
  ('7c000000-0000-4000-8000-000000000100', 'stage01.reactivate');

insert into public.company_role_assignments (
  tenant_id, company_id, user_id, role_id, granted_by, grant_reason
) values (
  '7c000000-0000-4000-8000-000000000010',
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000001',
  '7c000000-0000-4000-8000-000000000100',
  '7c000000-0000-4000-8000-000000000001',
  'Fixed concurrency fixture'
);

insert into public.workflow_definition_snapshots (
  id, tenant_id, company_id, workflow_key, template_version, schema_version,
  definition, definition_hash
) values (
  '7c000000-0000-4000-8000-000000000040',
  '7c000000-0000-4000-8000-000000000010',
  '7c000000-0000-4000-8000-000000000020',
  'vqh.stage01',
  901,
  1,
  '{
    "nodes":[
      {"key":"01.1","type":"sub_stage","parentNodeKey":null},
      {"key":"01.2","type":"sub_stage","parentNodeKey":null}
    ],
    "dependencies":[{"from":"01.1","to":"01.2","requires":"completed_current_valid"}],
    "dimensions":[
      "customer_need",
      "scope_capability",
      "resources_schedule",
      "commercial_viability",
      "risk_special_conditions"
    ],
    "taxonomies":{
      "customer_type":[{"code":"customer","label":"Customer"}],
      "contact_relationship":[{"code":"decision_maker","label":"Decision maker"}],
      "scope":[{"code":"design","label":"Design"}],
      "lead_source":[{"code":"direct","label":"Direct","behavior":{"requiresReferrer":false}}],
      "referrer_type":[{"code":"partner","label":"Partner"}],
      "engagement_status":[{"code":"grounded","label":"Grounded"}],
      "invalid_reason":[{"code":"invalid","label":"Invalid","semanticKey":"invalid"}],
      "budget_status":[{"code":"unknown","label":"Unknown"}],
      "timeline_status":[{"code":"unknown","label":"Unknown"}],
      "priority":[{"code":"normal","label":"Normal"}],
      "intake_channel":[{"code":"phone","label":"Phone"}],
      "blocker_category":[{"code":"follow_up","label":"Follow up"}]
    },
    "criteria":[
      {"key":"required_fit","dimensionKey":"customer_need","label":"Required fit","description":"Required fit","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":1},
      {"key":"scope_fit","dimensionKey":"scope_capability","label":"Scope fit","description":"Scope fit","criticality":"optional","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":2},
      {"key":"schedule_fit","dimensionKey":"resources_schedule","label":"Schedule fit","description":"Schedule fit","criticality":"optional","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":3},
      {"key":"commercial_fit","dimensionKey":"commercial_viability","label":"Commercial fit","description":"Commercial fit","criticality":"optional","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":4},
      {"key":"risk_fit","dimensionKey":"risk_special_conditions","label":"Risk fit","description":"Risk fit","criticality":"optional","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":5}
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
  }'::jsonb,
  'stage01-concurrency-definition'
);

insert into public.opportunities (
  id, tenant_id, company_id, primary_customer_name, customer_type_code,
  need_description, location_status, primary_lead_source_code,
  engagement_status_code, budget_status_code, timeline_status_code,
  priority_code, created_by
) values
  (
    '7c000000-0000-4000-8000-000000000030',
    '7c000000-0000-4000-8000-000000000010',
    '7c000000-0000-4000-8000-000000000020',
    'Concurrency Opportunity',
    'customer',
    'Qualified fixed need',
    'unknown',
    'direct',
    'grounded',
    'unknown',
    'unknown',
    'normal',
    '7c000000-0000-4000-8000-000000000001'
  ),
  (
    '7c000000-0000-4000-8000-000000000031',
    '7c000000-0000-4000-8000-000000000010',
    '7c000000-0000-4000-8000-000000000020',
    'Concurrency comparison Opportunity',
    'customer',
    'Comparison need',
    'unknown',
    'direct',
    'grounded',
    'unknown',
    'unknown',
    'normal',
    '7c000000-0000-4000-8000-000000000001'
  );

insert into public.contacts (
  id, tenant_id, company_id, display_name, notes, created_by
) values
  (
    '7c000000-0000-4000-8000-000000000060',
    '7c000000-0000-4000-8000-000000000010',
    '7c000000-0000-4000-8000-000000000020',
    'Original Contact',
    'Preserved before race',
    '7c000000-0000-4000-8000-000000000001'
  ),
  (
    '7c000000-0000-4000-8000-000000000061',
    '7c000000-0000-4000-8000-000000000010',
    '7c000000-0000-4000-8000-000000000020',
    'Actor A Contact',
    null,
    '7c000000-0000-4000-8000-000000000001'
  ),
  (
    '7c000000-0000-4000-8000-000000000062',
    '7c000000-0000-4000-8000-000000000010',
    '7c000000-0000-4000-8000-000000000020',
    'Actor B Contact',
    null,
    '7c000000-0000-4000-8000-000000000001'
  );

insert into public.contact_methods (
  id, tenant_id, company_id, contact_id, method_type, value, is_usable,
  reliability_state
) values (
  '7c000000-0000-4000-8000-000000000093',
  '7c000000-0000-4000-8000-000000000010',
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000060',
  'phone',
  '+84000000000',
  true,
  'confirmed'
);

insert into public.opportunity_contacts (
  id, tenant_id, company_id, opportunity_id, contact_id,
  relationship_code, is_primary, reliability_state, created_by
) values (
  '7c000000-0000-4000-8000-000000000094',
  '7c000000-0000-4000-8000-000000000010',
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000030',
  '7c000000-0000-4000-8000-000000000060',
  'decision_maker',
  true,
  'confirmed',
  '7c000000-0000-4000-8000-000000000001'
);

insert into public.opportunity_scopes (
  id, tenant_id, company_id, opportunity_id, scope_code, note,
  reliability_state, created_by
) values (
  '7c000000-0000-4000-8000-000000000090',
  '7c000000-0000-4000-8000-000000000010',
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000030',
  'design',
  'Fixed scope',
  'confirmed',
  '7c000000-0000-4000-8000-000000000001'
);

insert into public.opportunity_referrers (
  id, tenant_id, company_id, opportunity_id, referrer_type_code,
  display_name, note, reliability_state, is_primary, created_by
) values (
  '7c000000-0000-4000-8000-000000000091',
  '7c000000-0000-4000-8000-000000000010',
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000030',
  'partner',
  'Original Referrer',
  'Preserved before race',
  'confirmed',
  true,
  '7c000000-0000-4000-8000-000000000001'
);

insert into public.opportunity_intake_records (
  id, tenant_id, company_id, opportunity_id, channel_code, summary, created_by
) values (
  '7c000000-0000-4000-8000-000000000092',
  '7c000000-0000-4000-8000-000000000010',
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000030',
  'phone',
  'Fixed intake history that must survive the race',
  '7c000000-0000-4000-8000-000000000001'
);

insert into public.opportunity_duplicate_concerns (
  id, tenant_id, company_id, opportunity_id, suspected_duplicate_opportunity_id,
  description, raised_by
) values (
  '7c000000-0000-4000-8000-000000000070',
  '7c000000-0000-4000-8000-000000000010',
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000030',
  '7c000000-0000-4000-8000-000000000031',
  'Fixed unresolved duplicate concern',
  '7c000000-0000-4000-8000-000000000001'
);

insert into public.workflow_instances (
  id, tenant_id, company_id, subject_type, subject_id, definition_snapshot_id,
  created_by
) values (
  '7c000000-0000-4000-8000-000000000050',
  '7c000000-0000-4000-8000-000000000010',
  '7c000000-0000-4000-8000-000000000020',
  'opportunity',
  '7c000000-0000-4000-8000-000000000030',
  '7c000000-0000-4000-8000-000000000040',
  '7c000000-0000-4000-8000-000000000001'
);

insert into public.workflow_node_instances (
  id, tenant_id, company_id, workflow_instance_id, node_key, node_type
) values
  (
    '7c000000-0000-4000-8000-000000000051',
    '7c000000-0000-4000-8000-000000000010',
    '7c000000-0000-4000-8000-000000000020',
    '7c000000-0000-4000-8000-000000000050',
    '01.1',
    'sub_stage'
  ),
  (
    '7c000000-0000-4000-8000-000000000052',
    '7c000000-0000-4000-8000-000000000010',
    '7c000000-0000-4000-8000-000000000020',
    '7c000000-0000-4000-8000-000000000050',
    '01.2',
    'sub_stage'
  );

insert into public.workflow_node_executions (
  id, tenant_id, company_id, node_instance_id, execution_no, phase,
  started_by, started_at
) values
  (
    '7c000000-0000-4000-8000-000000000053',
    '7c000000-0000-4000-8000-000000000010',
    '7c000000-0000-4000-8000-000000000020',
    '7c000000-0000-4000-8000-000000000051',
    1,
    'active',
    '7c000000-0000-4000-8000-000000000001',
    pg_catalog.now() - interval '2 minutes'
  ),
  (
    '7c000000-0000-4000-8000-000000000054',
    '7c000000-0000-4000-8000-000000000010',
    '7c000000-0000-4000-8000-000000000020',
    '7c000000-0000-4000-8000-000000000052',
    1,
    'active',
    '7c000000-0000-4000-8000-000000000001',
    pg_catalog.now() - interval '2 minutes'
  );

insert into public.workflow_node_assignments (
  id, tenant_id, company_id, node_execution_id, assignment_kind,
  assignee_user_id, assigned_by, assignment_reason
) values
  (
    '7c000000-0000-4000-8000-000000000080',
    '7c000000-0000-4000-8000-000000000010',
    '7c000000-0000-4000-8000-000000000020',
    '7c000000-0000-4000-8000-000000000053',
    'accountable_owner',
    '7c000000-0000-4000-8000-000000000001',
    '7c000000-0000-4000-8000-000000000001',
    'Fixed Intake Owner'
  ),
  (
    '7c000000-0000-4000-8000-000000000081',
    '7c000000-0000-4000-8000-000000000010',
    '7c000000-0000-4000-8000-000000000020',
    '7c000000-0000-4000-8000-000000000054',
    'accountable_owner',
    '7c000000-0000-4000-8000-000000000001',
    '7c000000-0000-4000-8000-000000000001',
    'Fixed Evaluation Owner'
  );

insert into public.stage01_decision_cycles (
  id, tenant_id, company_id, opportunity_id, node_execution_id, cycle_no,
  decision_authority_user_id, authority_resolution_reference, created_by
) values (
  '7c000000-0000-4000-8000-000000000055',
  '7c000000-0000-4000-8000-000000000010',
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000030',
  '7c000000-0000-4000-8000-000000000054',
  1,
  '7c000000-0000-4000-8000-000000000001',
  'fixed-authority-resolution',
  '7c000000-0000-4000-8000-000000000001'
);

insert into public.workflow_node_events (
  tenant_id, company_id, node_execution_id, event_type, actor_id, payload,
  request_id
) values
  (
    '7c000000-0000-4000-8000-000000000010',
    '7c000000-0000-4000-8000-000000000020',
    '7c000000-0000-4000-8000-000000000053',
    'created',
    '7c000000-0000-4000-8000-000000000001',
    '{"nodeKey":"01.1","historyMarker":"preserve"}'::jsonb,
    '7c000000-0000-4000-8000-00000000f001'
  ),
  (
    '7c000000-0000-4000-8000-000000000010',
    '7c000000-0000-4000-8000-000000000020',
    '7c000000-0000-4000-8000-000000000054',
    'created',
    '7c000000-0000-4000-8000-000000000001',
    '{"nodeKey":"01.2","historyMarker":"preserve"}'::jsonb,
    '7c000000-0000-4000-8000-00000000f002'
  );
