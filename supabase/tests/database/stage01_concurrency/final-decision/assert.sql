-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
do $$
declare
  target public.stage01_decision_cycles%rowtype;
  race_audits integer;
begin
  select * into strict target
  from public.stage01_decision_cycles
  where id = '7c000000-0000-4000-8000-000000000055';
  if target.version <> 1
     or target.final_outcome not in ('proceed', 'not_proceeding')
     or target.final_rationale not in ('Actor A final decision', 'Actor B final decision') then
    raise exception 'final-decision current cycle is invalid';
  end if;
  select pg_catalog.count(*) into race_audits
  from public.audit_events
  where request_id in (
    '7c000000-0000-4000-8000-00000000a008',
    '7c000000-0000-4000-8000-00000000b008'
  ) and action = 'stage01.final_decision_recorded';
  if race_audits <> 1 then
    raise exception 'final-decision winner audit count is %', race_audits;
  end if;
  if (select pg_catalog.count(*) from public.stage01_recommendations
      where decision_cycle_id = '7c000000-0000-4000-8000-000000000055') <> 1
     or (select pg_catalog.count(*) from public.stage01_criterion_evaluations
         where decision_cycle_id = '7c000000-0000-4000-8000-000000000055') <> 1 then
    raise exception 'final-decision damaged earlier decision history';
  end if;
  if (select pg_catalog.count(*) from public.workflow_node_events
      where request_id in (
        '7c000000-0000-4000-8000-00000000f001',
        '7c000000-0000-4000-8000-00000000f002'
      )) <> 2 then
    raise exception 'final-decision damaged earlier immutable node history';
  end if;
end;
$$;
select 'PASS final-decision' as result;
commit;
