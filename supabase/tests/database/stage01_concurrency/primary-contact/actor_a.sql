-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.set_opportunity_primary_contact(
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000030',
  '{
    "contactId":"7c000000-0000-4000-8000-000000000061",
    "relationshipCode":"decision_maker",
    "reliabilityState":"confirmed",
    "expectedOpportunityVersion":0
  }'::jsonb,
  '7c000000-0000-4000-8000-00000000a002'
);
commit;
