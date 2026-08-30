-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
do $$
declare
  target public.workflow_node_executions%rowtype;
  race_events integer;
  race_audits integer;
begin
  select * into strict target
  from public.workflow_node_executions
  where id = '7c000000-0000-4000-8000-000000000053';
  if target.version <> 1 or target.phase <> 'completed' then
    raise exception 'intake-complete final execution state is invalid';
  end if;
  if (select version from public.opportunities
      where id = '7c000000-0000-4000-8000-000000000030') <> 1 then
    raise exception 'intake-complete unexpectedly changed Opportunity version';
  end if;
  if (select pg_catalog.count(*) from public.stage01_intake_completion_baselines
      where node_execution_id = '7c000000-0000-4000-8000-000000000053') <> 1 then
    raise exception 'intake-complete baseline count is not exactly one';
  end if;
  select pg_catalog.count(*) into race_events
  from public.workflow_node_events
  where request_id in (
    '7c000000-0000-4000-8000-00000000a006',
    '7c000000-0000-4000-8000-00000000b006'
  ) and event_type = 'completed';
  select pg_catalog.count(*) into race_audits
  from public.audit_events
  where request_id in (
    '7c000000-0000-4000-8000-00000000a006',
    '7c000000-0000-4000-8000-00000000b006'
  ) and action = 'journey.intake_completed';
  if race_events <> 1 or race_audits <> 1 then
    raise exception 'intake-complete winner history is invalid: events %, audits %',
      race_events, race_audits;
  end if;
  if (select pg_catalog.count(*) from public.workflow_node_events
      where request_id in (
        '7c000000-0000-4000-8000-00000000f001',
        '7c000000-0000-4000-8000-00000000f002'
      )) <> 2 then
    raise exception 'intake-complete damaged earlier immutable history';
  end if;
end;
$$;
select 'PASS intake-complete' as result;
commit;
