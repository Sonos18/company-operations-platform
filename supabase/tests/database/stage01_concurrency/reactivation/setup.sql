-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
update public.workflow_node_executions
set phase = 'completed',
    completed_by = '7c000000-0000-4000-8000-000000000001',
    completed_at = pg_catalog.now() - interval '1 minute',
    version = case
      when id = '7c000000-0000-4000-8000-000000000054' then 2
      else version
    end
where id in (
  '7c000000-0000-4000-8000-000000000053',
  '7c000000-0000-4000-8000-000000000054'
);

insert into public.stage01_criterion_evaluations (
  id, tenant_id, company_id, decision_cycle_id, criterion_key, revision,
  applicability, result, rationale, evidence, evaluated_by, evaluated_at
) values (
  '7c000000-0000-4000-8000-0000000000a1',
  '7c000000-0000-4000-8000-000000000010',
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000055',
  'required_fit',
  1,
  'applicable',
  'not_fit',
  'Fixed not-proceeding evaluation',
  '[]'::jsonb,
  '7c000000-0000-4000-8000-000000000001',
  pg_catalog.now() - interval '30 seconds'
);

insert into public.stage01_recommendations (
  id, tenant_id, company_id, decision_cycle_id, version, recommendation,
  rationale, evidence, submitted_by, submitted_at
) values (
  '7c000000-0000-4000-8000-0000000000a2',
  '7c000000-0000-4000-8000-000000000010',
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000055',
  1,
  'recommend_not_proceeding',
  'Fixed current recommendation',
  '[]'::jsonb,
  '7c000000-0000-4000-8000-000000000001',
  pg_catalog.now() - interval '10 seconds'
);

update public.stage01_decision_cycles
set final_outcome = 'not_proceeding',
    final_decision_by = '7c000000-0000-4000-8000-000000000001',
    final_decision_at = pg_catalog.now(),
    final_rationale = 'Fixed completed not-proceeding cycle',
    final_recommendation_id = '7c000000-0000-4000-8000-0000000000a2',
    version = 3
where id = '7c000000-0000-4000-8000-000000000055';
commit;
