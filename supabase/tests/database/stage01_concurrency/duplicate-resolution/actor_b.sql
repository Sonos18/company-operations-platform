-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.resolve_opportunity_duplicate(
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000030',
  '7c000000-0000-4000-8000-000000000070',
  '{
    "resolution":"different_need",
    "resolutionNote":"Actor B distinct need",
    "expectedOpportunityVersion":0
  }'::jsonb,
  '7c000000-0000-4000-8000-00000000b004'
);
commit;
