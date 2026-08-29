begin;

create function pg_temp.stage01_valid_definition()
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
      "invalid_reason":[{"code":"test_invalid","label":"Test invalid","semanticKey":"invalid"}]
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

create function pg_temp.expect_stage01_definition_invalid(target_definition jsonb, case_name text)
returns void
language plpgsql
as $$
begin
  begin
    perform private.assert_valid_stage01_definition(target_definition);
  exception
    when sqlstate 'P0001' then
      if sqlerrm = 'STAGE01_DEFINITION_CONFIG_INVALID' then
        return;
      end if;
      raise exception 'DB-S01-DEFINITION % returned unexpected error %', case_name, sqlerrm;
  end;
  raise exception 'DB-S01-DEFINITION % unexpectedly passed validation', case_name;
end;
$$;

select private.assert_valid_stage01_definition(pg_temp.stage01_valid_definition());

select pg_temp.expect_stage01_definition_invalid(null, 'null definition');
select pg_temp.expect_stage01_definition_invalid('[]'::jsonb, 'non-object definition');
select pg_temp.expect_stage01_definition_invalid(
  jsonb_set(pg_temp.stage01_valid_definition(), '{nodes}', '[{"key":"01.1","type":"sub_stage","parentNodeKey":null}]'::jsonb),
  'missing node 01.2'
);
select pg_temp.expect_stage01_definition_invalid(
  jsonb_set(pg_temp.stage01_valid_definition(), '{dependencies}', '[]'::jsonb),
  'missing dependency'
);
select pg_temp.expect_stage01_definition_invalid(
  jsonb_set(pg_temp.stage01_valid_definition(), '{dimensions}', '["customer_need","scope_capability","resources_schedule","commercial_viability"]'::jsonb),
  'missing dimension'
);
select pg_temp.expect_stage01_definition_invalid(
  pg_temp.stage01_valid_definition() #- '{taxonomies,lead_source}',
  'missing taxonomy'
);
select pg_temp.expect_stage01_definition_invalid(
  jsonb_set(pg_temp.stage01_valid_definition(), '{criteria,0,criticality}', '"unknown"'::jsonb),
  'unknown criterion criticality'
);
select pg_temp.expect_stage01_definition_invalid(
  jsonb_set(pg_temp.stage01_valid_definition(), '{criteria,0,allowsNotApplicable}', '"false"'::jsonb),
  'invalid N/A allowance type'
);
select pg_temp.expect_stage01_definition_invalid(
  pg_temp.stage01_valid_definition() #- '{capabilities,decision}',
  'missing capability'
);
select pg_temp.expect_stage01_definition_invalid(
  pg_temp.stage01_valid_definition() #- '{gates,evaluation}',
  'missing evaluation gates'
);

select 'PASS DB-S01-DEFINITION fail-closed validator' as result;

rollback;
