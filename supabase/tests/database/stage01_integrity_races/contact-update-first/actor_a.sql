-- STAGE01 CLOUD DEV FIXED INTEGRITY RACE FIXTURE
begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.update_contact_method(
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000060',
  '7c000000-0000-4000-8000-000000000093',
  '{"isUsable":false,"expectedContactVersion":0}'::jsonb,
  '7c000000-0000-4000-8000-00000000a102'
);
reset role;
select nextval('public.stage01_integrity_race_signal');
select pg_catalog.pg_sleep(3);
commit;
