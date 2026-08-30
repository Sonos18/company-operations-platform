-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
do $$
declare
  old_execution public.workflow_node_executions%rowtype;
  new_reason text;
  race_events integer;
  race_audits integer;
begin
  select * into strict old_execution
  from public.workflow_node_executions
  where id = '7c000000-0000-4000-8000-000000000054';
  if old_execution.version <> 3 or old_execution.superseded_at is null then
    raise exception 'reactivation old execution was not superseded exactly once';
  end if;
  if (select pg_catalog.count(*) from public.workflow_node_executions
      where node_instance_id = '7c000000-0000-4000-8000-000000000052') <> 2
     or (select pg_catalog.count(*) from public.stage01_decision_cycles
         where opportunity_id = '7c000000-0000-4000-8000-000000000030') <> 2 then
    raise exception 'reactivation left losing execution or cycle residue';
  end if;
  select reactivation_reason into strict new_reason
  from public.stage01_decision_cycles
  where opportunity_id = '7c000000-0000-4000-8000-000000000030'
    and cycle_no = 2;
  if new_reason not in ('Actor A reactivation', 'Actor B reactivation') then
    raise exception 'reactivation new cycle winner is invalid';
  end if;
  if (select version from public.opportunities
      where id = '7c000000-0000-4000-8000-000000000030') <> 0 then
    raise exception 'reactivation unexpectedly changed Opportunity version';
  end if;
  select pg_catalog.count(*) into race_events
  from public.workflow_node_events
  where request_id in (
    '7c000000-0000-4000-8000-00000000a009',
    '7c000000-0000-4000-8000-00000000b009'
  ) and event_type = 'created';
  select pg_catalog.count(*) into race_audits
  from public.audit_events
  where request_id in (
    '7c000000-0000-4000-8000-00000000a009',
    '7c000000-0000-4000-8000-00000000b009'
  ) and action = 'stage01.reactivated';
  if race_events <> 1 or race_audits <> 1 then
    raise exception 'reactivation winner history is invalid: events %, audits %',
      race_events, race_audits;
  end if;
  if (select pg_catalog.count(*) from public.stage01_recommendations
      where decision_cycle_id = '7c000000-0000-4000-8000-000000000055') <> 1
     or (select pg_catalog.count(*) from public.stage01_criterion_evaluations
         where decision_cycle_id = '7c000000-0000-4000-8000-000000000055') <> 1 then
    raise exception 'reactivation damaged prior immutable decision history';
  end if;
  if (select pg_catalog.count(*) from public.workflow_node_events
      where request_id in (
        '7c000000-0000-4000-8000-00000000f001',
        '7c000000-0000-4000-8000-00000000f002'
      )) <> 2 then
    raise exception 'reactivation damaged earlier immutable node history';
  end if;
end;
$$;
select 'PASS reactivation' as result;
commit;
