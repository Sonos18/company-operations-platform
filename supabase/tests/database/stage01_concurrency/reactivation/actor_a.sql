-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.reactivate_stage01(
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000030',
  '{
    "reason":"Actor A reactivation",
    "expectedOpportunityVersion":0,
    "expectedExecutionVersion":2,
    "expectedCycleVersion":3
  }'::jsonb,
  '7c000000-0000-4000-8000-00000000a009'
);
commit;
