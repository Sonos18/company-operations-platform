-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.assign_opportunity_decision_authority(
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000030',
  '7c000000-0000-4000-8000-000000000055',
  '{"requestId":"7c000000-0000-4000-8000-00000000f010","action":"assign","authorityUserId":"7c000000-0000-4000-8000-000000000001","expectedCycleVersion":0,"reason":null}'::jsonb
);
reset role;
update public.workflow_node_executions
set phase = 'completed',
    completed_by = '7c000000-0000-4000-8000-000000000001',
    completed_at = pg_catalog.now() - interval '1 minute'
where id = '7c000000-0000-4000-8000-000000000053';

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
  'fit',
  'Fixed supported fit',
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
  'recommend_proceed',
  'Fixed current recommendation',
  '[]'::jsonb,
  '7c000000-0000-4000-8000-000000000001',
  pg_catalog.now() - interval '10 seconds'
);
commit;
