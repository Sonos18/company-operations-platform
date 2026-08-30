-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
do $$
declare
  target public.opportunities%rowtype;
  race_audits integer;
begin
  select * into strict target
  from public.opportunities
  where id = '7c000000-0000-4000-8000-000000000030';
  if target.version <> 1
     or target.primary_customer_name not in ('Actor A Opportunity', 'Actor B Opportunity') then
    raise exception 'opportunity-update final current state is invalid';
  end if;
  select pg_catalog.count(*) into race_audits
  from public.audit_events
  where request_id in (
    '7c000000-0000-4000-8000-00000000a001',
    '7c000000-0000-4000-8000-00000000b001'
  ) and action = 'opportunity.updated';
  if race_audits <> 1 then
    raise exception 'opportunity-update winner audit count is %', race_audits;
  end if;
  if (select pg_catalog.count(*) from public.workflow_node_events
      where request_id in (
        '7c000000-0000-4000-8000-00000000f001',
        '7c000000-0000-4000-8000-00000000f002'
      )) <> 2 then
    raise exception 'opportunity-update damaged earlier immutable history';
  end if;
end;
$$;
select 'PASS opportunity-update' as result;
commit;
