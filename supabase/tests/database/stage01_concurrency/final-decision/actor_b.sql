-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.record_stage01_final_decision(
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000030',
  '{
    "outcome":"not_proceeding",
    "rationale":"Actor B final decision",
    "overrideRationale":"Actor B documented override",
    "expectedCycleVersion":0
  }'::jsonb,
  '7c000000-0000-4000-8000-00000000b008'
);
commit;
