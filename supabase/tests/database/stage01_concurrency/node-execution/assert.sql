-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
do $$
declare
  current_reason text;
  race_events integer;
  race_audits integer;
begin
  if (select version from public.workflow_node_executions
      where id = '7c000000-0000-4000-8000-000000000054') <> 1 then
    raise exception 'node-execution version did not increment once';
  end if;
  select assignment_reason into strict current_reason
  from public.workflow_node_assignments
  where node_execution_id = '7c000000-0000-4000-8000-000000000054'
    and assignment_kind = 'accountable_owner'
    and ended_at is null;
  if current_reason not in ('Actor A assignment', 'Actor B assignment') then
    raise exception 'node-execution current assignment is invalid';
  end if;
  if (select pg_catalog.count(*) from public.workflow_node_assignments
      where node_execution_id = '7c000000-0000-4000-8000-000000000054') <> 2 then
    raise exception 'node-execution left losing assignment residue';
  end if;
  select pg_catalog.count(*) into race_events
  from public.workflow_node_events
  where request_id in (
    '7c000000-0000-4000-8000-00000000a007',
    '7c000000-0000-4000-8000-00000000b007'
  ) and event_type = 'assignment_added';
  select pg_catalog.count(*) into race_audits
  from public.audit_events
  where request_id in (
    '7c000000-0000-4000-8000-00000000a007',
    '7c000000-0000-4000-8000-00000000b007'
  ) and action = 'journey.assignment_added';
  if race_events <> 1 or race_audits <> 1 then
    raise exception 'node-execution winner history is invalid: events %, audits %',
      race_events, race_audits;
  end if;
  if (select pg_catalog.count(*) from public.workflow_node_events
      where request_id in (
        '7c000000-0000-4000-8000-00000000f001',
        '7c000000-0000-4000-8000-00000000f002'
      )) <> 2 then
    raise exception 'node-execution damaged earlier immutable history';
  end if;
end;
$$;
select 'PASS node-execution' as result;
commit;
