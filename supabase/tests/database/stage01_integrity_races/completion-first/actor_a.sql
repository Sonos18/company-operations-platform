-- STAGE01 CLOUD DEV FIXED INTEGRITY RACE FIXTURE
begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.complete_stage01_intake(
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000053',
  '{"expectedOpportunityVersion":1,"expectedExecutionVersion":0}'::jsonb,
  '7c000000-0000-4000-8000-00000000a101'
);
reset role;
select nextval('public.stage01_integrity_race_signal');
select pg_catalog.pg_sleep(3);
insert into public.stage01_integrity_race_observations (actor, observed_at)
values ('actor_a', pg_catalog.clock_timestamp());
commit;
