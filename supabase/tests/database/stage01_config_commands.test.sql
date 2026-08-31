BEGIN;

-- A missing wrapper, grant, security boundary, version check, catalog update, or
-- rollback path makes one of the command contracts below fail.
create function pg_temp.stage01_config_definition()
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
      "customer_type":[
        {"code":"reserved_customer","label":"Reserved customer","semanticKey":"customer"},
        {"code":"legacy_business","label":"Legacy business"}
      ],
      "contact_relationship":[{"code":"reserved_primary","label":"Reserved primary","semanticKey":"primary"}],
      "scope":[{"code":"reserved_scope","label":"Reserved scope","semanticKey":"scope"}],
      "lead_source":[{"code":"reserved_direct","label":"Reserved direct","semanticKey":"direct","behavior":{"requiresReferrer":false}}],
      "referrer_type":[{"code":"reserved_person","label":"Reserved person","semanticKey":"person"}],
      "engagement_status":[{"code":"reserved_grounded","label":"Reserved grounded","semanticKey":"grounded"}],
      "invalid_reason":[{"code":"reserved_invalid","label":"Reserved invalid","semanticKey":"invalid"}],
      "budget_status":[{"code":"reserved_unknown","label":"Reserved unknown","semanticKey":"unknown"}],
      "timeline_status":[{"code":"reserved_unknown","label":"Reserved unknown","semanticKey":"unknown"}],
      "priority":[{"code":"reserved_normal","label":"Reserved normal","semanticKey":"normal"}],
      "intake_channel":[{"code":"reserved_phone","label":"Reserved phone","semanticKey":"phone"}],
      "blocker_category":[{"code":"reserved_follow_up","label":"Reserved follow up","semanticKey":"follow_up"}]
    },
    "criteria": [
      {"key":"customer_need","dimensionKey":"customer_need","label":"Customer need","description":"Synthetic customer need criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":1},
      {"key":"scope_capability","dimensionKey":"scope_capability","label":"Scope capability","description":"Synthetic scope capability criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":2},
      {"key":"resources_schedule","dimensionKey":"resources_schedule","label":"Resources schedule","description":"Synthetic resources schedule criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":3},
      {"key":"commercial_viability","dimensionKey":"commercial_viability","label":"Commercial viability","description":"Synthetic commercial viability criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":4},
      {"key":"risk_special_conditions","dimensionKey":"risk_special_conditions","label":"Risk and special conditions","description":"Synthetic risk criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":5}
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

create function pg_temp.stage01_config_business_taxonomies()
returns jsonb
language sql
immutable
as $$
  select $taxonomies$
  {
    "customer_type":[{"code":"reserved_customer","label":"Renamed reserved customer"}],
    "contact_relationship":[{"code":"reserved_primary","label":"Reserved primary"}],
    "scope":[{"code":"reserved_scope","label":"Reserved scope"}],
    "lead_source":[{"code":"reserved_direct","label":"Reserved direct","behavior":{"requiresReferrer":false}}],
    "referrer_type":[{"code":"reserved_person","label":"Reserved person"}],
    "engagement_status":[{"code":"reserved_grounded","label":"Reserved grounded"}],
    "invalid_reason":[{"code":"reserved_invalid","label":"Reserved invalid"}],
    "budget_status":[{"code":"reserved_unknown","label":"Reserved unknown"}],
    "timeline_status":[{"code":"reserved_unknown","label":"Reserved unknown"}],
    "priority":[
      {"code":"reserved_normal","label":"Reserved normal"},
      {"code":"business_priority","label":"Business priority"}
    ],
    "intake_channel":[{"code":"reserved_phone","label":"Reserved phone"}],
    "blocker_category":[{"code":"reserved_follow_up","label":"Reserved follow up"}]
  }
  $taxonomies$::jsonb;
$$;

create function pg_temp.stage01_config_business_criteria()
returns jsonb
language sql
immutable
as $$
  select $criteria$
  [
    {"key":"customer_need","dimensionKey":"customer_need","label":"Updated customer need","description":"Updated synthetic customer need criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":1},
    {"key":"scope_capability","dimensionKey":"scope_capability","label":"Scope capability","description":"Synthetic scope capability criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":2},
    {"key":"resources_schedule","dimensionKey":"resources_schedule","label":"Resources schedule","description":"Synthetic resources schedule criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":3},
    {"key":"commercial_viability","dimensionKey":"commercial_viability","label":"Commercial viability","description":"Synthetic commercial viability criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":4},
    {"key":"risk_special_conditions","dimensionKey":"risk_special_conditions","label":"Risk and special conditions","description":"Synthetic risk criterion","criticality":"required","applicabilityMode":"always","allowsNotApplicable":false,"displayOrder":5}
  ]
  $criteria$::jsonb;
$$;

create function pg_temp.stage01_config_historical_v2_definition()
returns jsonb
language sql
immutable
as $$
  select jsonb_set(
    pg_temp.stage01_config_definition(),
    '{taxonomies,customer_type}',
    '[{"code":"replacement_business","label":"Replacement business"}]'::jsonb
  );
$$;

create function pg_temp.stage01_config_historical_v2_business_taxonomies()
returns jsonb
language sql
immutable
as $$
  select jsonb_set(
    pg_temp.stage01_config_business_taxonomies(),
    '{customer_type}',
    '[{"code":"replacement_business","label":"Replacement business"}]'::jsonb
  );
$$;

create function pg_temp.assert_stage01_config_private_update_invalid(
  target_taxonomies jsonb,
  target_criteria jsonb,
  target_request_id uuid
)
returns void
language plpgsql
as $$
begin
  begin
    perform private.update_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object(
        'expectedDraftVersion', 1,
        'taxonomies', target_taxonomies,
        'criteria', target_criteria
      ),
      target_request_id
    );
    raise exception 'DB-S01-CONFIG-CMD direct private update accepted malformed business input';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_INVALID' then raise; end if;
  end;
end;
$$;

do $$
declare
  function_signature text;
  private_signature text;
  function_config text[];
begin
  foreach function_signature in array array[
    'public.create_stage01_config_draft(uuid,jsonb,uuid)',
    'public.update_stage01_config_draft(uuid,jsonb,uuid)',
    'public.discard_stage01_config_draft(uuid,jsonb,uuid)',
    'public.publish_stage01_config_draft(uuid,jsonb,uuid)'
  ] loop
    if to_regprocedure(function_signature) is null then
      raise exception 'DB-S01-CONFIG-CMD missing public command %', function_signature;
    end if;
    if (select prosecdef from pg_proc where oid = to_regprocedure(function_signature)) then
      raise exception 'DB-S01-CONFIG-CMD public command must be SECURITY INVOKER: %', function_signature;
    end if;
    if not has_function_privilege('authenticated', function_signature, 'execute')
       or has_function_privilege('anon', function_signature, 'execute') then
      raise exception 'DB-S01-CONFIG-CMD public command grant contract mismatch: %', function_signature;
    end if;
  end loop;

  foreach private_signature in array array[
    'private.create_stage01_config_draft(uuid,jsonb,uuid)',
    'private.update_stage01_config_draft(uuid,jsonb,uuid)',
    'private.discard_stage01_config_draft(uuid,jsonb,uuid)',
    'private.publish_stage01_config_draft(uuid,jsonb,uuid)'
  ] loop
    if to_regprocedure(private_signature) is null
       or not (select prosecdef from pg_proc where oid = to_regprocedure(private_signature)) then
      raise exception 'DB-S01-CONFIG-CMD missing SECURITY DEFINER implementation %', private_signature;
    end if;
    select proconfig into function_config
      from pg_proc where oid = to_regprocedure(private_signature);
    if coalesce(function_config, array[]::text[]) <> array['search_path=""']::text[] then
      raise exception 'DB-S01-CONFIG-CMD unsafe private search path: %', private_signature;
    end if;
    if not has_function_privilege('authenticated', private_signature, 'execute')
       or has_function_privilege('anon', private_signature, 'execute') then
      raise exception 'DB-S01-CONFIG-CMD private wrapper call grant contract mismatch: %', private_signature;
    end if;
  end loop;
end $$;

insert into auth.users (id, email) values
  ('63000000-0000-4000-8000-000000000001', 'stage01-config-editor@test.invalid'),
  ('63000000-0000-4000-8000-000000000002', 'stage01-config-publisher@test.invalid'),
  ('63000000-0000-4000-8000-000000000003', 'stage01-config-outsider@test.invalid');

insert into public.tenants (id, code, name) values
  ('63000000-0000-4000-8000-000000000010', 'stage01-config-commands', 'Stage 01 config commands tenant');

insert into public.companies (id, tenant_id, code, name) values
  ('63000000-0000-4000-8000-000000000020', '63000000-0000-4000-8000-000000000010', 'S01-CONFIG-CMD', 'Stage 01 config command company'),
  ('63000000-0000-4000-8000-000000000021', '63000000-0000-4000-8000-000000000010', 'S01-CONFIG-NONE', 'Stage 01 config no-definition company'),
  ('63000000-0000-4000-8000-000000000022', '63000000-0000-4000-8000-000000000010', 'S01-CONFIG-HISTORY', 'Stage 01 config history company');

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  ('63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000010', array['member']),
  ('63000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000010', array['member']),
  ('63000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000010', array['member']);

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  ('63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', array['member']),
  ('63000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', array['member']),
  ('63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000021', array['member']),
  ('63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000022', array['member']),
  ('63000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000022', array['member']);

insert into public.roles (id, tenant_id, company_id, code, name, description, is_system) values
  ('63000000-0000-4000-8000-000000000101', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', 'stage01_config_editor', 'Stage 01 config editor', 'Test-only configuration editor', false),
  ('63000000-0000-4000-8000-000000000102', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', 'stage01_config_publisher', 'Stage 01 config publisher', 'Test-only configuration publisher', false),
  ('63000000-0000-4000-8000-000000000103', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000021', 'stage01_config_missing_editor', 'Stage 01 missing editor', 'Test-only no-definition editor', false),
  ('63000000-0000-4000-8000-000000000104', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000022', 'stage01_config_history_editor', 'Stage 01 history editor', 'Test-only history editor', false),
  ('63000000-0000-4000-8000-000000000105', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000022', 'stage01_config_history_publisher', 'Stage 01 history publisher', 'Test-only history publisher', false);

insert into public.role_permissions (role_id, permission_code) values
  ('63000000-0000-4000-8000-000000000101', 'stage01.config.update'),
  ('63000000-0000-4000-8000-000000000101', 'opportunity.create'),
  ('63000000-0000-4000-8000-000000000102', 'stage01.config.publish'),
  ('63000000-0000-4000-8000-000000000103', 'stage01.config.update'),
  ('63000000-0000-4000-8000-000000000104', 'stage01.config.update'),
  ('63000000-0000-4000-8000-000000000105', 'stage01.config.publish');

insert into public.company_role_assignments (
  tenant_id, company_id, user_id, role_id, granted_by, grant_reason
) values
  ('63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', '63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000101', '63000000-0000-4000-8000-000000000001', 'Stage 01 config editor fixture'),
  ('63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', '63000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000102', '63000000-0000-4000-8000-000000000002', 'Stage 01 config publisher fixture'),
  ('63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000021', '63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000103', '63000000-0000-4000-8000-000000000001', 'Stage 01 config no-definition fixture'),
  ('63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000022', '63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000104', '63000000-0000-4000-8000-000000000001', 'Stage 01 config history editor fixture'),
  ('63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000022', '63000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000105', '63000000-0000-4000-8000-000000000002', 'Stage 01 config history publisher fixture');

insert into public.workflow_definition_snapshots (
  id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash
) values (
  '63000000-0000-4000-8000-000000000030',
  '63000000-0000-4000-8000-000000000010',
  '63000000-0000-4000-8000-000000000020',
  'vqh.stage01', 1, 1, pg_temp.stage01_config_definition(), 'stage01-config-v1'
);

-- Direct private execution remains callable only to let the public SECURITY
-- INVOKER wrappers work; each private command must still enforce its boundary.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

do $$
begin
  begin
    perform private.create_stage01_config_draft('63000000-0000-4000-8000-000000000020', jsonb_build_object('expectedPublishedSnapshotId', '63000000-0000-4000-8000-000000000030'::uuid), '63000000-0000-4000-8000-000000000181');
    raise exception 'DB-S01-CONFIG-CMD unauthenticated private create unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'AUTH_REQUIRED' then raise; end if; end;
  begin
    perform private.update_stage01_config_draft('63000000-0000-4000-8000-000000000020', jsonb_build_object('expectedDraftVersion', 0, 'taxonomies', pg_temp.stage01_config_business_taxonomies(), 'criteria', pg_temp.stage01_config_business_criteria()), '63000000-0000-4000-8000-000000000182');
    raise exception 'DB-S01-CONFIG-CMD unauthenticated private update unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'AUTH_REQUIRED' then raise; end if; end;
  begin
    perform private.discard_stage01_config_draft('63000000-0000-4000-8000-000000000020', jsonb_build_object('expectedDraftVersion', 0), '63000000-0000-4000-8000-000000000183');
    raise exception 'DB-S01-CONFIG-CMD unauthenticated private discard unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'AUTH_REQUIRED' then raise; end if; end;
  begin
    perform private.publish_stage01_config_draft('63000000-0000-4000-8000-000000000020', jsonb_build_object('expectedDraftVersion', 0), '63000000-0000-4000-8000-000000000184');
    raise exception 'DB-S01-CONFIG-CMD unauthenticated private publish unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'AUTH_REQUIRED' then raise; end if; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"63000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

do $$
begin
  begin
    perform private.create_stage01_config_draft('63000000-0000-4000-8000-000000000020', jsonb_build_object('expectedPublishedSnapshotId', '63000000-0000-4000-8000-000000000030'::uuid), '63000000-0000-4000-8000-000000000185');
    raise exception 'DB-S01-CONFIG-CMD cross-company private create unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'COMPANY_FORBIDDEN' then raise; end if; end;
  begin
    perform private.update_stage01_config_draft('63000000-0000-4000-8000-000000000020', jsonb_build_object('expectedDraftVersion', 0, 'taxonomies', pg_temp.stage01_config_business_taxonomies(), 'criteria', pg_temp.stage01_config_business_criteria()), '63000000-0000-4000-8000-000000000186');
    raise exception 'DB-S01-CONFIG-CMD cross-company private update unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'COMPANY_FORBIDDEN' then raise; end if; end;
  begin
    perform private.discard_stage01_config_draft('63000000-0000-4000-8000-000000000020', jsonb_build_object('expectedDraftVersion', 0), '63000000-0000-4000-8000-000000000187');
    raise exception 'DB-S01-CONFIG-CMD cross-company private discard unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'COMPANY_FORBIDDEN' then raise; end if; end;
  begin
    perform private.publish_stage01_config_draft('63000000-0000-4000-8000-000000000020', jsonb_build_object('expectedDraftVersion', 0), '63000000-0000-4000-8000-000000000188');
    raise exception 'DB-S01-CONFIG-CMD cross-company private publish unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'COMPANY_FORBIDDEN' then raise; end if; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"63000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

do $$
begin
  begin
    perform private.create_stage01_config_draft('63000000-0000-4000-8000-000000000020', jsonb_build_object('expectedPublishedSnapshotId', '63000000-0000-4000-8000-000000000030'::uuid), '63000000-0000-4000-8000-000000000189');
    raise exception 'DB-S01-CONFIG-CMD publish-only private create unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
  begin
    perform private.update_stage01_config_draft('63000000-0000-4000-8000-000000000020', jsonb_build_object('expectedDraftVersion', 0, 'taxonomies', pg_temp.stage01_config_business_taxonomies(), 'criteria', pg_temp.stage01_config_business_criteria()), '63000000-0000-4000-8000-000000000190');
    raise exception 'DB-S01-CONFIG-CMD publish-only private update unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
  begin
    perform private.discard_stage01_config_draft('63000000-0000-4000-8000-000000000020', jsonb_build_object('expectedDraftVersion', 0), '63000000-0000-4000-8000-000000000191');
    raise exception 'DB-S01-CONFIG-CMD publish-only private discard unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"63000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$
begin
  begin
    perform private.publish_stage01_config_draft('63000000-0000-4000-8000-000000000020', jsonb_build_object('expectedDraftVersion', 0), '63000000-0000-4000-8000-000000000192');
    raise exception 'DB-S01-CONFIG-CMD update-only private publish unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
  begin
    perform private.create_stage01_config_draft('63000000-0000-4000-8000-000000000020', '{"unexpected":true}'::jsonb, '63000000-0000-4000-8000-000000000193');
    raise exception 'DB-S01-CONFIG-CMD malformed private create unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if; end;
  begin
    perform private.discard_stage01_config_draft('63000000-0000-4000-8000-000000000020', '{"expectedDraftVersion":"0"}'::jsonb, '63000000-0000-4000-8000-000000000194');
    raise exception 'DB-S01-CONFIG-CMD malformed private discard unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if; end;
  begin
    perform private.publish_stage01_config_draft('63000000-0000-4000-8000-000000000020', '{"expectedDraftVersion":"0"}'::jsonb, '63000000-0000-4000-8000-000000000195');
    raise exception 'DB-S01-CONFIG-CMD malformed private publish unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if; end;
end $$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.create_stage01_config_draft(
      '63000000-0000-4000-8000-000000000021',
      jsonb_build_object('expectedPublishedSnapshotId', '63000000-0000-4000-8000-000000000039'::uuid),
      '63000000-0000-4000-8000-000000000201'
    );
    raise exception 'DB-S01-CONFIG-CMD missing newest definition unexpectedly created a draft';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE' then raise; end if;
  end;
end $$;

do $$
declare
  result jsonb;
begin
  result := public.create_stage01_config_draft(
    '63000000-0000-4000-8000-000000000020',
    jsonb_build_object('expectedPublishedSnapshotId', '63000000-0000-4000-8000-000000000030'::uuid),
    '63000000-0000-4000-8000-000000000202'
  );
  if result ->> 'baseSnapshotId' <> '63000000-0000-4000-8000-000000000030'
     or result ->> 'version' <> '0'
     or (result #> '{taxonomies,customer_type,0}') ? 'semanticKey' then
    raise exception 'DB-S01-CONFIG-CMD create result did not expose the expected business-safe draft';
  end if;

  if not exists (
    select 1 from public.workflow_definition_drafts as draft
    where draft.company_id = '63000000-0000-4000-8000-000000000020'
      and draft.workflow_key = 'vqh.stage01'
      and draft.base_snapshot_id = '63000000-0000-4000-8000-000000000030'
      and draft.version = 0
      and draft.definition = pg_temp.stage01_config_definition()
  ) or not exists (
    select 1 from public.audit_events as audit
    where audit.company_id = '63000000-0000-4000-8000-000000000020'
      and audit.action = 'stage01.config_draft.created'
      and audit.request_id = '63000000-0000-4000-8000-000000000202'
  ) then
    raise exception 'DB-S01-CONFIG-CMD create did not copy the newest definition and audit it';
  end if;

  begin
    perform public.create_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object('expectedPublishedSnapshotId', '63000000-0000-4000-8000-000000000039'::uuid),
      '63000000-0000-4000-8000-000000000203'
    );
    raise exception 'DB-S01-CONFIG-CMD stale published snapshot unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'VERSION_CONFLICT' then raise; end if;
  end;

  begin
    perform public.create_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object('expectedPublishedSnapshotId', '63000000-0000-4000-8000-000000000030'::uuid),
      '63000000-0000-4000-8000-000000000204'
    );
    raise exception 'DB-S01-CONFIG-CMD duplicate active draft unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_CONFIG_DRAFT_EXISTS' then raise; end if;
  end;
end $$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform private.create_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object('expectedPublishedSnapshotId', '63000000-0000-4000-8000-000000000030'::uuid),
      '63000000-0000-4000-8000-000000000205'
    );
    raise exception 'DB-S01-CONFIG-CMD direct private call bypassed update permission';
  exception when raise_exception then
    if sqlerrm <> 'PERMISSION_DENIED' then raise; end if;
  end;
end $$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  result jsonb;
  system_before jsonb;
  definition_before jsonb;
  audit_before bigint;
begin
  result := public.update_stage01_config_draft(
    '63000000-0000-4000-8000-000000000020',
    jsonb_build_object(
      'expectedDraftVersion', 0,
      'taxonomies', pg_temp.stage01_config_business_taxonomies(),
      'criteria', pg_temp.stage01_config_business_criteria()
    ),
    '63000000-0000-4000-8000-000000000206'
  );
  if result ->> 'version' <> '1' then
    raise exception 'DB-S01-CONFIG-CMD update did not increment the draft version exactly once';
  end if;

  if (
    select count(*)
    from public.audit_events as audit
    where audit.company_id = '63000000-0000-4000-8000-000000000020'
      and audit.action = 'stage01.config_draft.updated'
      and audit.request_id = '63000000-0000-4000-8000-000000000206'
      and audit.after_summary ?& array[
        'companyId', 'actorId', 'draftId', 'draftVersion', 'requestId'
      ]
      and audit.after_summary ->> 'draftVersion' = '1'
  ) <> 1 then
    raise exception 'DB-S01-CONFIG-CMD update audit action or metadata is incomplete';
  end if;

  select draft.definition - 'taxonomies' - 'criteria', draft.definition
    into system_before, definition_before
    from public.workflow_definition_drafts as draft
   where draft.company_id = '63000000-0000-4000-8000-000000000020'
     and draft.workflow_key = 'vqh.stage01';
  if system_before is distinct from (pg_temp.stage01_config_definition() - 'taxonomies' - 'criteria')
     or definition_before #>> '{taxonomies,customer_type,0,semanticKey}' <> 'customer'
     or (definition_before #> '{taxonomies,priority,1}') ? 'semanticKey'
     or definition_before #>> '{criteria,0,label}' <> 'Updated customer need' then
    raise exception 'DB-S01-CONFIG-CMD update changed system data or failed to preserve reserved identity';
  end if;

  begin
    perform public.update_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object('expectedDraftVersion', 0, 'taxonomies', pg_temp.stage01_config_business_taxonomies(), 'criteria', pg_temp.stage01_config_business_criteria()),
      '63000000-0000-4000-8000-000000000207'
    );
    raise exception 'DB-S01-CONFIG-CMD stale update unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'VERSION_CONFLICT' then raise; end if;
  end;

  select count(*) into audit_before from public.audit_events
   where company_id = '63000000-0000-4000-8000-000000000020';
  begin
    perform public.update_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object(
        'expectedDraftVersion', 1,
        'taxonomies', pg_temp.stage01_config_business_taxonomies() || jsonb_build_object('unknown_taxonomy', '[]'::jsonb),
        'criteria', pg_temp.stage01_config_business_criteria()
      ),
      '63000000-0000-4000-8000-000000000208'
    );
    raise exception 'DB-S01-CONFIG-CMD unknown taxonomy unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_INVALID' then raise; end if;
  end;
  if (select definition from public.workflow_definition_drafts where company_id = '63000000-0000-4000-8000-000000000020') is distinct from definition_before
     or (select count(*) from public.audit_events where company_id = '63000000-0000-4000-8000-000000000020') <> audit_before then
    raise exception 'DB-S01-CONFIG-CMD rejected update partially changed draft or audit history';
  end if;

  begin
    perform public.update_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object(
        'expectedDraftVersion', 1,
        'taxonomies', jsonb_set(pg_temp.stage01_config_business_taxonomies(), '{priority,1,semanticKey}', '"business_identity"'::jsonb),
        'criteria', pg_temp.stage01_config_business_criteria()
      ),
      '63000000-0000-4000-8000-000000000208'
    );
    raise exception 'DB-S01-CONFIG-CMD business semantic identity unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_INVALID' then raise; end if;
  end;

  begin
    perform public.update_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object(
        'expectedDraftVersion', 1,
        'taxonomies', jsonb_set(pg_temp.stage01_config_business_taxonomies(), '{lead_source,0,behavior,requiresReferrer}', '"false"'::jsonb),
        'criteria', pg_temp.stage01_config_business_criteria()
      ),
      '63000000-0000-4000-8000-000000000209'
    );
    raise exception 'DB-S01-CONFIG-CMD malformed approved taxonomy unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_INVALID' then raise; end if;
  end;

  begin
    perform public.update_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object(
        'expectedDraftVersion', 1,
        'taxonomies', jsonb_set(pg_temp.stage01_config_business_taxonomies(), '{customer_type,0,code}', '"taken_over_customer"'::jsonb),
        'criteria', pg_temp.stage01_config_business_criteria()
      ),
      '63000000-0000-4000-8000-000000000210'
    );
    raise exception 'DB-S01-CONFIG-CMD reserved taxonomy re-key unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_INVALID' then raise; end if;
  end;

  begin
    perform public.update_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object(
        'expectedDraftVersion', 1,
        'taxonomies', jsonb_set(pg_temp.stage01_config_business_taxonomies(), '{customer_type}', '[]'::jsonb),
        'criteria', pg_temp.stage01_config_business_criteria()
      ),
      '63000000-0000-4000-8000-000000000211'
    );
    raise exception 'DB-S01-CONFIG-CMD reserved taxonomy removal unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_INVALID' then raise; end if;
  end;

  begin
    perform public.update_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object(
        'expectedDraftVersion', 1,
        'taxonomies', pg_temp.stage01_config_business_taxonomies(),
        'criteria', pg_temp.stage01_config_business_criteria() - 0
      ),
      '63000000-0000-4000-8000-000000000212'
    );
    raise exception 'DB-S01-CONFIG-CMD published criterion removal unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_INVALID' then raise; end if;
  end;

  begin
    perform public.update_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object(
        'expectedDraftVersion', 1,
        'taxonomies', pg_temp.stage01_config_business_taxonomies(),
        'criteria', jsonb_set(pg_temp.stage01_config_business_criteria(), '{0,key}', '"renamed_customer_need"'::jsonb)
      ),
      '63000000-0000-4000-8000-000000000213'
    );
    raise exception 'DB-S01-CONFIG-CMD published criterion re-key unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_INVALID' then raise; end if;
  end;
end $$;

-- The direct private command path must reject malformed JSON without altering
-- the locked draft or creating an audit row.  These cases mirror the strict
-- Zod contract rather than relying on jsonb text coercion.
do $$
declare
  definition_before jsonb;
  audit_before bigint;
begin
  select definition into definition_before
  from public.workflow_definition_drafts
  where company_id = '63000000-0000-4000-8000-000000000020'
    and workflow_key = 'vqh.stage01';
  select count(*) into audit_before
  from public.audit_events
  where company_id = '63000000-0000-4000-8000-000000000020';

  perform pg_temp.assert_stage01_config_private_update_invalid(
    jsonb_set(pg_temp.stage01_config_business_taxonomies(), '{priority,1,code}', '17'::jsonb),
    pg_temp.stage01_config_business_criteria(),
    '63000000-0000-4000-8000-000000000231'
  );
  perform pg_temp.assert_stage01_config_private_update_invalid(
    jsonb_set(pg_temp.stage01_config_business_taxonomies(), '{priority,1,label}', '{"nested":"label"}'::jsonb),
    pg_temp.stage01_config_business_criteria(),
    '63000000-0000-4000-8000-000000000232'
  );
  perform pg_temp.assert_stage01_config_private_update_invalid(
    jsonb_set(pg_temp.stage01_config_business_taxonomies(), '{priority,1,code}', '" reserved_normal "'::jsonb),
    pg_temp.stage01_config_business_criteria(),
    '63000000-0000-4000-8000-000000000233'
  );
  perform pg_temp.assert_stage01_config_private_update_invalid(
    jsonb_set(pg_temp.stage01_config_business_taxonomies(), '{lead_source,0,behavior}', '{}'::jsonb),
    pg_temp.stage01_config_business_criteria(),
    '63000000-0000-4000-8000-000000000248'
  );
  perform pg_temp.assert_stage01_config_private_update_invalid(
    pg_temp.stage01_config_business_taxonomies(),
    jsonb_set(pg_temp.stage01_config_business_criteria(), '{0,label}', '17'::jsonb),
    '63000000-0000-4000-8000-000000000234'
  );
  perform pg_temp.assert_stage01_config_private_update_invalid(
    pg_temp.stage01_config_business_taxonomies(),
    jsonb_set(pg_temp.stage01_config_business_criteria(), '{0,description}', '{"nested":"description"}'::jsonb),
    '63000000-0000-4000-8000-000000000235'
  );
  perform pg_temp.assert_stage01_config_private_update_invalid(
    pg_temp.stage01_config_business_taxonomies(),
    jsonb_set(pg_temp.stage01_config_business_criteria(), '{0,dimensionKey}', 'null'::jsonb),
    '63000000-0000-4000-8000-000000000236'
  );
  perform pg_temp.assert_stage01_config_private_update_invalid(
    pg_temp.stage01_config_business_taxonomies(),
    jsonb_set(pg_temp.stage01_config_business_criteria(), '{0,criticality}', 'null'::jsonb),
    '63000000-0000-4000-8000-000000000237'
  );
  perform pg_temp.assert_stage01_config_private_update_invalid(
    pg_temp.stage01_config_business_taxonomies(),
    jsonb_set(pg_temp.stage01_config_business_criteria(), '{0,applicabilityMode}', 'null'::jsonb),
    '63000000-0000-4000-8000-000000000238'
  );
  perform pg_temp.assert_stage01_config_private_update_invalid(
    pg_temp.stage01_config_business_taxonomies(),
    jsonb_set(pg_temp.stage01_config_business_criteria(), '{0,key}', '" scope_capability "'::jsonb),
    '63000000-0000-4000-8000-000000000239'
  );
  perform pg_temp.assert_stage01_config_private_update_invalid(
    pg_temp.stage01_config_business_taxonomies(),
    jsonb_set(pg_temp.stage01_config_business_criteria(), '{0,allowsNotApplicable}', '"false"'::jsonb),
    '63000000-0000-4000-8000-000000000240'
  );
  perform pg_temp.assert_stage01_config_private_update_invalid(
    pg_temp.stage01_config_business_taxonomies(),
    jsonb_set(pg_temp.stage01_config_business_criteria(), '{0,displayOrder}', '"1"'::jsonb),
    '63000000-0000-4000-8000-000000000241'
  );
  perform pg_temp.assert_stage01_config_private_update_invalid(
    pg_temp.stage01_config_business_taxonomies(),
    jsonb_set(pg_temp.stage01_config_business_criteria(), '{0,displayOrder}', '1.5'::jsonb),
    '63000000-0000-4000-8000-000000000246'
  );

  begin
    perform private.update_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object(
        'expectedDraftVersion', 1.5,
        'taxonomies', pg_temp.stage01_config_business_taxonomies(),
        'criteria', pg_temp.stage01_config_business_criteria()
      ),
      '63000000-0000-4000-8000-000000000247'
    );
    raise exception 'DB-S01-CONFIG-CMD direct private update accepted a fractional draft version';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_COMMAND_INPUT' then raise; end if;
  end;

  if (select definition from public.workflow_definition_drafts where company_id = '63000000-0000-4000-8000-000000000020') is distinct from definition_before
     or (select count(*) from public.audit_events where company_id = '63000000-0000-4000-8000-000000000020') <> audit_before then
    raise exception 'DB-S01-CONFIG-CMD malformed private updates changed draft or audit history';
  end if;
end $$;

do $$
declare
  snapshot_count bigint;
begin
  select count(*) into snapshot_count from public.workflow_definition_snapshots
   where company_id = '63000000-0000-4000-8000-000000000020';
  begin
    perform public.discard_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object('expectedDraftVersion', 0),
      '63000000-0000-4000-8000-000000000213'
    );
    raise exception 'DB-S01-CONFIG-CMD stale discard unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'VERSION_CONFLICT' then raise; end if;
  end;

  perform public.discard_stage01_config_draft(
    '63000000-0000-4000-8000-000000000020',
    jsonb_build_object('expectedDraftVersion', 1),
    '63000000-0000-4000-8000-000000000214'
  );
  if exists (select 1 from public.workflow_definition_drafts where company_id = '63000000-0000-4000-8000-000000000020')
     or (select count(*) from public.workflow_definition_snapshots where company_id = '63000000-0000-4000-8000-000000000020') <> snapshot_count
     or (
       select count(*)
       from public.audit_events as audit
       where audit.company_id = '63000000-0000-4000-8000-000000000020'
         and audit.action = 'stage01.config_draft.discarded'
         and audit.request_id = '63000000-0000-4000-8000-000000000214'
         and audit.after_summary ?& array[
           'companyId', 'actorId', 'draftId', 'baseSnapshotId',
           'draftVersion', 'requestId'
         ]
         and audit.after_summary ->> 'draftVersion' = '1'
     ) <> 1 then
    raise exception 'DB-S01-CONFIG-CMD discard changed published snapshots or retained the draft';
  end if;

  begin
    perform public.discard_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object('expectedDraftVersion', 1),
      '63000000-0000-4000-8000-000000000215'
    );
    raise exception 'DB-S01-CONFIG-CMD missing draft discard unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_CONFIG_DRAFT_NOT_FOUND' then raise; end if;
  end;
end $$;

do $$
begin
  perform public.create_stage01_config_draft(
    '63000000-0000-4000-8000-000000000020',
    jsonb_build_object('expectedPublishedSnapshotId', '63000000-0000-4000-8000-000000000030'::uuid),
    '63000000-0000-4000-8000-000000000216'
  );
  perform public.update_stage01_config_draft(
    '63000000-0000-4000-8000-000000000020',
    jsonb_build_object('expectedDraftVersion', 0, 'taxonomies', pg_temp.stage01_config_business_taxonomies(), 'criteria', pg_temp.stage01_config_business_criteria()),
    '63000000-0000-4000-8000-000000000217'
  );
end $$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.publish_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object('expectedDraftVersion', 1),
      '63000000-0000-4000-8000-000000000218'
    );
    raise exception 'DB-S01-CONFIG-CMD update permission unexpectedly published';
  exception when raise_exception then
    if sqlerrm <> 'PERMISSION_DENIED' then raise; end if;
  end;
end $$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.publish_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object('expectedDraftVersion', 0),
      '63000000-0000-4000-8000-000000000219'
    );
    raise exception 'DB-S01-CONFIG-CMD stale publish version unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'VERSION_CONFLICT' then raise; end if;
  end;
end $$;

reset role;
insert into public.workflow_definition_snapshots (
  id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash
) values (
  '63000000-0000-4000-8000-000000000031',
  '63000000-0000-4000-8000-000000000010',
  '63000000-0000-4000-8000-000000000020',
  'vqh.stage01', 2, 1, pg_temp.stage01_config_definition(), 'stage01-config-v2'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.publish_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object('expectedDraftVersion', 1),
      '63000000-0000-4000-8000-000000000220'
    );
    raise exception 'DB-S01-CONFIG-CMD stale draft base unexpectedly published';
  exception when raise_exception then
    if sqlerrm <> 'VERSION_CONFLICT' then raise; end if;
  end;
end $$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  perform public.discard_stage01_config_draft(
    '63000000-0000-4000-8000-000000000020',
    jsonb_build_object('expectedDraftVersion', 1),
    '63000000-0000-4000-8000-000000000221'
  );
  perform public.create_stage01_config_draft(
    '63000000-0000-4000-8000-000000000020',
    jsonb_build_object('expectedPublishedSnapshotId', '63000000-0000-4000-8000-000000000031'::uuid),
    '63000000-0000-4000-8000-000000000222'
  );
  perform public.update_stage01_config_draft(
    '63000000-0000-4000-8000-000000000020',
    jsonb_build_object('expectedDraftVersion', 0, 'taxonomies', pg_temp.stage01_config_business_taxonomies(), 'criteria', pg_temp.stage01_config_business_criteria()),
    '63000000-0000-4000-8000-000000000223'
  );

  insert into public.stage01_taxonomy_values (
    tenant_id, company_id, taxonomy_key, code, label, semantic_key, behavior, is_active
  ) values (
    '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020',
    'customer_type', 'legacy_business', 'Legacy business', null, '{}'::jsonb, true
  );
end $$;

do $$
declare
  opportunity_result jsonb;
  workflow_id uuid;
begin
  opportunity_result := public.create_stage01_opportunity(
    '63000000-0000-4000-8000-000000000020',
    '{"primaryCustomerName":"Opportunity A before configuration publication"}'::jsonb,
    '63000000-0000-4000-8000-000000000224'
  );
  workflow_id := (opportunity_result ->> 'workflowInstanceId')::uuid;
  if (select definition_snapshot_id from public.workflow_instances where id = workflow_id)
       <> '63000000-0000-4000-8000-000000000031'::uuid then
    raise exception 'DB-S01-CONFIG-CMD Opportunity A did not bind the pre-publication snapshot';
  end if;
end $$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  result jsonb;
  new_snapshot_id uuid;
begin
  result := public.publish_stage01_config_draft(
    '63000000-0000-4000-8000-000000000020',
    jsonb_build_object('expectedDraftVersion', 1),
    '63000000-0000-4000-8000-000000000225'
  );
  new_snapshot_id := (result ->> 'snapshotId')::uuid;
  if result ->> 'templateVersion' <> '3'
     or result ->> 'schemaVersion' <> '1'
     or coalesce(nullif(result ->> 'definitionHash', ''), '') = ''
     or new_snapshot_id is null
     or (select count(*) from public.workflow_definition_snapshots where company_id = '63000000-0000-4000-8000-000000000020' and template_version = 3) <> 1
     or (select schema_version from public.workflow_definition_snapshots where id = new_snapshot_id) <> 1
     or (select definition_hash from public.workflow_definition_snapshots where id = new_snapshot_id)
          <> (select pg_catalog.encode(extensions.digest(definition::text, 'sha256'), 'hex') from public.workflow_definition_snapshots where id = new_snapshot_id)
     or not exists (select 1 from public.workflow_definition_snapshots where id = '63000000-0000-4000-8000-000000000031' and definition_hash = 'stage01-config-v2')
     or exists (select 1 from public.workflow_definition_drafts where company_id = '63000000-0000-4000-8000-000000000020') then
    raise exception 'DB-S01-CONFIG-CMD publish did not atomically create the required immutable next snapshot';
  end if;

  if not exists (
    select 1 from public.stage01_taxonomy_values
    where company_id = '63000000-0000-4000-8000-000000000020'
      and taxonomy_key = 'priority' and code = 'business_priority'
      and semantic_key is null and is_active
  ) or not exists (
    select 1 from public.stage01_taxonomy_values
    where company_id = '63000000-0000-4000-8000-000000000020'
      and taxonomy_key = 'customer_type' and code = 'legacy_business'
      and not is_active
  ) or not exists (
    select 1 from public.stage01_taxonomy_values
    where company_id = '63000000-0000-4000-8000-000000000020'
      and taxonomy_key = 'customer_type' and code = 'reserved_customer'
      and semantic_key = 'customer' and is_active
  ) then
    raise exception 'DB-S01-CONFIG-CMD publish did not synchronize active, inactive, and reserved taxonomy catalog rows';
  end if;

  if not exists (
    select 1 from public.audit_events as audit
    where audit.company_id = '63000000-0000-4000-8000-000000000020'
      and audit.action = 'stage01.config.published'
      and audit.request_id = '63000000-0000-4000-8000-000000000225'
      and audit.after_summary ?& array[
        'companyId', 'actorId', 'draftId', 'baseSnapshotId', 'draftVersion',
        'newSnapshotId', 'templateVersion', 'definitionHash', 'requestId', 'publishedAt'
      ]
  ) then
    raise exception 'DB-S01-CONFIG-CMD publish audit metadata is incomplete';
  end if;
end $$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  workflow_a_snapshot uuid;
  opportunity_result jsonb;
  workflow_b_snapshot uuid;
begin
  select workflow.definition_snapshot_id into workflow_a_snapshot
  from public.workflow_instances as workflow
  join public.opportunities as opportunity on opportunity.id = workflow.subject_id
  where opportunity.company_id = '63000000-0000-4000-8000-000000000020'
    and opportunity.primary_customer_name = 'Opportunity A before configuration publication';
  if workflow_a_snapshot <> '63000000-0000-4000-8000-000000000031'::uuid then
    raise exception 'DB-S01-CONFIG-CMD publication rewrote Opportunity A workflow binding';
  end if;

  opportunity_result := public.create_stage01_opportunity(
    '63000000-0000-4000-8000-000000000020',
    '{"primaryCustomerName":"Opportunity B after configuration publication"}'::jsonb,
    '63000000-0000-4000-8000-000000000226'
  );
  select definition_snapshot_id into workflow_b_snapshot
  from public.workflow_instances
  where id = (opportunity_result ->> 'workflowInstanceId')::uuid;
  if workflow_b_snapshot = workflow_a_snapshot
     or (select template_version from public.workflow_definition_snapshots where id = workflow_b_snapshot) <> 3 then
    raise exception 'DB-S01-CONFIG-CMD Opportunity B did not bind the newly published snapshot';
  end if;
end $$;

do $$
begin
  perform public.create_stage01_config_draft(
    '63000000-0000-4000-8000-000000000020',
    jsonb_build_object('expectedPublishedSnapshotId', (
      select id from public.workflow_definition_snapshots
      where company_id = '63000000-0000-4000-8000-000000000020'
        and workflow_key = 'vqh.stage01' and template_version = 3
    )),
    '63000000-0000-4000-8000-000000000227'
  );
end $$;

reset role;
update public.stage01_taxonomy_values
   set semantic_key = 'mismatched_customer'
 where company_id = '63000000-0000-4000-8000-000000000020'
   and taxonomy_key = 'customer_type'
   and code = 'reserved_customer'
   and semantic_key = 'customer';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  snapshot_count bigint;
  catalog_state jsonb;
  audit_count bigint;
begin
  select count(*) into snapshot_count
  from public.workflow_definition_snapshots
  where company_id = '63000000-0000-4000-8000-000000000020';
  select jsonb_agg(
    jsonb_build_object(
      'id', id,
      'tenantId', tenant_id,
      'companyId', company_id,
      'taxonomyKey', taxonomy_key,
      'code', code,
      'label', label,
      'semanticKey', semantic_key,
      'behavior', behavior,
      'isActive', is_active,
      'createdAt', created_at,
      'updatedAt', updated_at
    ) order by id
  ) into catalog_state
  from public.stage01_taxonomy_values
  where company_id = '63000000-0000-4000-8000-000000000020';
  select count(*) into audit_count
  from public.audit_events
  where company_id = '63000000-0000-4000-8000-000000000020';

  begin
    perform public.publish_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object('expectedDraftVersion', 0),
      '63000000-0000-4000-8000-000000000242'
    );
    raise exception 'DB-S01-CONFIG-CMD catalog semantic mismatch unexpectedly published';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_INVALID' then raise; end if;
  end;

  if (select count(*) from public.workflow_definition_snapshots where company_id = '63000000-0000-4000-8000-000000000020') <> snapshot_count
     or (
       select jsonb_agg(
         jsonb_build_object(
           'id', id,
           'tenantId', tenant_id,
           'companyId', company_id,
           'taxonomyKey', taxonomy_key,
           'code', code,
           'label', label,
           'semanticKey', semantic_key,
           'behavior', behavior,
           'isActive', is_active,
           'createdAt', created_at,
           'updatedAt', updated_at
         ) order by id
       )
       from public.stage01_taxonomy_values
       where company_id = '63000000-0000-4000-8000-000000000020'
     ) is distinct from catalog_state
     or (select count(*) from public.audit_events where company_id = '63000000-0000-4000-8000-000000000020') <> audit_count
     or not exists (
       select 1
       from public.workflow_definition_drafts
       where company_id = '63000000-0000-4000-8000-000000000020'
         and workflow_key = 'vqh.stage01'
         and version = 0
     ) then
    raise exception 'DB-S01-CONFIG-CMD catalog semantic mismatch was not fail-closed and atomic';
  end if;
end $$;

reset role;
update public.stage01_taxonomy_values
   set semantic_key = 'customer'
 where company_id = '63000000-0000-4000-8000-000000000020'
   and taxonomy_key = 'customer_type'
   and code = 'reserved_customer'
   and semantic_key = 'mismatched_customer';

create function pg_temp.fail_stage01_config_draft_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'DB-S01-CONFIG-CMD forced late publication failure';
end;
$$;

create trigger stage01_config_commands_forced_late_failure
before delete on public.workflow_definition_drafts
for each row
when (old.company_id = '63000000-0000-4000-8000-000000000020'::uuid and old.workflow_key = 'vqh.stage01')
execute function pg_temp.fail_stage01_config_draft_delete();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  snapshot_count bigint;
  taxonomy_state jsonb;
  audit_count bigint;
begin
  select count(*) into snapshot_count from public.workflow_definition_snapshots
   where company_id = '63000000-0000-4000-8000-000000000020';
  select jsonb_agg(
    jsonb_build_object(
      'id', id,
      'tenantId', tenant_id,
      'companyId', company_id,
      'taxonomyKey', taxonomy_key,
      'code', code,
      'label', label,
      'semanticKey', semantic_key,
      'behavior', behavior,
      'isActive', is_active,
      'createdAt', created_at,
      'updatedAt', updated_at
    ) order by id
  )
    into taxonomy_state
    from public.stage01_taxonomy_values
   where company_id = '63000000-0000-4000-8000-000000000020';
  select count(*) into audit_count from public.audit_events
   where company_id = '63000000-0000-4000-8000-000000000020';

  begin
    perform public.publish_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object('expectedDraftVersion', 0),
      '63000000-0000-4000-8000-000000000228'
    );
    raise exception 'DB-S01-CONFIG-CMD forced late publication failure unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'DB-S01-CONFIG-CMD forced late publication failure' then raise; end if;
  end;

  if (select count(*) from public.workflow_definition_snapshots where company_id = '63000000-0000-4000-8000-000000000020') <> snapshot_count
     or (
       select jsonb_agg(
         jsonb_build_object(
           'id', id,
           'tenantId', tenant_id,
           'companyId', company_id,
           'taxonomyKey', taxonomy_key,
           'code', code,
           'label', label,
           'semanticKey', semantic_key,
           'behavior', behavior,
           'isActive', is_active,
           'createdAt', created_at,
           'updatedAt', updated_at
         ) order by id
       )
       from public.stage01_taxonomy_values
       where company_id = '63000000-0000-4000-8000-000000000020'
     ) is distinct from taxonomy_state
     or (select count(*) from public.audit_events where company_id = '63000000-0000-4000-8000-000000000020') <> audit_count
     or not exists (select 1 from public.workflow_definition_drafts where company_id = '63000000-0000-4000-8000-000000000020' and version = 0) then
    raise exception 'DB-S01-CONFIG-CMD late publish failure was not fully atomic';
  end if;
end $$;

reset role;
drop trigger stage01_config_commands_forced_late_failure on public.workflow_definition_drafts;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  perform public.discard_stage01_config_draft(
    '63000000-0000-4000-8000-000000000020',
    jsonb_build_object('expectedDraftVersion', 0),
    '63000000-0000-4000-8000-000000000229'
  );
end $$;

reset role;
insert into public.workflow_definition_snapshots (
  id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash
) values (
  '63000000-0000-4000-8000-000000000032',
  '63000000-0000-4000-8000-000000000010',
  '63000000-0000-4000-8000-000000000020',
  'vqh.stage01', 4, 1, pg_temp.stage01_config_definition() #- '{capabilities,decision}', 'stage01-config-invalid-v4'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  audit_count bigint;
begin
  select count(*) into audit_count from public.audit_events
   where company_id = '63000000-0000-4000-8000-000000000020';
  begin
    perform public.create_stage01_config_draft(
      '63000000-0000-4000-8000-000000000020',
      jsonb_build_object('expectedPublishedSnapshotId', '63000000-0000-4000-8000-000000000039'::uuid),
      '63000000-0000-4000-8000-000000000230'
    );
    raise exception 'DB-S01-CONFIG-CMD invalid newest definition unexpectedly fell back';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_INVALID' then raise; end if;
  end;
  if exists (select 1 from public.workflow_definition_drafts where company_id = '63000000-0000-4000-8000-000000000020')
     or (select count(*) from public.audit_events where company_id = '63000000-0000-4000-8000-000000000020') <> audit_count then
    raise exception 'DB-S01-CONFIG-CMD invalid newest definition partially created a draft or audit';
  end if;
end $$;

reset role;
insert into public.workflow_definition_snapshots (
  id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash
) values
  (
    '63000000-0000-4000-8000-000000000033',
    '63000000-0000-4000-8000-000000000010',
    '63000000-0000-4000-8000-000000000022',
    'vqh.stage01', 1, 1, pg_temp.stage01_config_definition(), 'stage01-history-v1'
  ),
  (
    '63000000-0000-4000-8000-000000000034',
    '63000000-0000-4000-8000-000000000010',
    '63000000-0000-4000-8000-000000000022',
    'vqh.stage01', 2, 1, pg_temp.stage01_config_historical_v2_definition(), 'stage01-history-v2'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  definition_before jsonb;
  audit_count bigint;
begin
  perform public.create_stage01_config_draft(
    '63000000-0000-4000-8000-000000000022',
    jsonb_build_object('expectedPublishedSnapshotId', '63000000-0000-4000-8000-000000000034'::uuid),
    '63000000-0000-4000-8000-000000000243'
  );
  select definition into definition_before
  from public.workflow_definition_drafts
  where company_id = '63000000-0000-4000-8000-000000000022'
    and workflow_key = 'vqh.stage01';
  select count(*) into audit_count
  from public.audit_events
  where company_id = '63000000-0000-4000-8000-000000000022';

  begin
    perform public.update_stage01_config_draft(
      '63000000-0000-4000-8000-000000000022',
      jsonb_build_object(
        'expectedDraftVersion', 0,
        'taxonomies', pg_temp.stage01_config_historical_v2_business_taxonomies(),
        'criteria', pg_temp.stage01_config_business_criteria()
      ),
      '63000000-0000-4000-8000-000000000244'
    );
    raise exception 'DB-S01-CONFIG-CMD historical v1 reserved identity was not protected by update';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_INVALID' then raise; end if;
  end;

  if (select definition from public.workflow_definition_drafts where company_id = '63000000-0000-4000-8000-000000000022') is distinct from definition_before
     or (select count(*) from public.audit_events where company_id = '63000000-0000-4000-8000-000000000022') <> audit_count
     or not exists (
       select 1 from public.workflow_definition_drafts
       where company_id = '63000000-0000-4000-8000-000000000022'
         and workflow_key = 'vqh.stage01'
         and version = 0
     ) then
    raise exception 'DB-S01-CONFIG-CMD historical identity update failure was not atomic';
  end if;
end $$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  snapshot_count bigint;
  audit_count bigint;
begin
  select count(*) into snapshot_count
  from public.workflow_definition_snapshots
  where company_id = '63000000-0000-4000-8000-000000000022';
  select count(*) into audit_count
  from public.audit_events
  where company_id = '63000000-0000-4000-8000-000000000022';

  begin
    perform public.publish_stage01_config_draft(
      '63000000-0000-4000-8000-000000000022',
      jsonb_build_object('expectedDraftVersion', 0),
      '63000000-0000-4000-8000-000000000245'
    );
    raise exception 'DB-S01-CONFIG-CMD historical v1 reserved identity was not protected by publish';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DEFINITION_CONFIG_INVALID' then raise; end if;
  end;

  if (select count(*) from public.workflow_definition_snapshots where company_id = '63000000-0000-4000-8000-000000000022') <> snapshot_count
     or (select count(*) from public.audit_events where company_id = '63000000-0000-4000-8000-000000000022') <> audit_count
     or not exists (
       select 1 from public.workflow_definition_drafts
       where company_id = '63000000-0000-4000-8000-000000000022'
         and workflow_key = 'vqh.stage01'
         and version = 0
     ) then
    raise exception 'DB-S01-CONFIG-CMD historical identity publish failure was not atomic';
  end if;
end $$;

reset role;
select 'PASS DB-S01-CONFIG-CMD transactional Stage 01 configuration command contract' as result;

ROLLBACK;
