-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
do $$
declare
  target_version bigint;
  concern_count integer;
  race_audits integer;
begin
  select version into strict target_version
  from public.opportunities
  where id = '7c000000-0000-4000-8000-000000000030';
  if target_version <> 1 then
    raise exception 'duplicate-resolution opportunity version did not increment once';
  end if;
  select pg_catalog.count(*) into concern_count
  from public.opportunity_duplicate_concerns
  where id = '7c000000-0000-4000-8000-000000000070'
    and resolution = 'different_need'
    and resolution_note in ('Actor A distinct need', 'Actor B distinct need')
    and resolved_at is not null;
  if concern_count <> 1 then
    raise exception 'duplicate-resolution final concern is invalid';
  end if;
  select pg_catalog.count(*) into race_audits
  from public.audit_events
  where request_id in (
    '7c000000-0000-4000-8000-00000000a004',
    '7c000000-0000-4000-8000-00000000b004'
  ) and action = 'opportunity.duplicate_resolved';
  if race_audits <> 1 then
    raise exception 'duplicate-resolution winner audit count is %', race_audits;
  end if;
  if (select pg_catalog.count(*) from public.workflow_node_events
      where request_id in (
        '7c000000-0000-4000-8000-00000000f001',
        '7c000000-0000-4000-8000-00000000f002'
      )) <> 2 then
    raise exception 'duplicate-resolution damaged earlier immutable history';
  end if;
end;
$$;
select 'PASS duplicate-resolution' as result;
commit;
