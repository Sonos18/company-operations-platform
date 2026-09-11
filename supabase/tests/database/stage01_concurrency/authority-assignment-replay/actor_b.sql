-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claims', '{"sub":"7c000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare result jsonb;
begin
  result := public.assign_opportunity_decision_authority(
    '7c000000-0000-4000-8000-000000000020',
    '7c000000-0000-4000-8000-000000000030',
    '7c000000-0000-4000-8000-000000000055',
    '{"requestId":"7c000000-0000-4000-8000-00000000a010","action":"assign","authorityUserId":"7c000000-0000-4000-8000-000000000001","expectedCycleVersion":0,"reason":null}'::jsonb
  );
  if (result ->> 'cycleVersion')::bigint <> 1 then raise exception 'authority replay actor B returned cycle version %', result ->> 'cycleVersion'; end if;
end $$;
commit;
