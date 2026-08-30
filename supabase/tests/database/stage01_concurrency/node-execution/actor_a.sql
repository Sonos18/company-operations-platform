-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.assign_workflow_node(
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000054',
  '{
    "assignmentKind":"accountable_owner",
    "assigneeUserId":"7c000000-0000-4000-8000-000000000001",
    "assignmentReason":"Actor A assignment",
    "expectedExecutionVersion":0
  }'::jsonb,
  '7c000000-0000-4000-8000-00000000a007'
);
commit;
