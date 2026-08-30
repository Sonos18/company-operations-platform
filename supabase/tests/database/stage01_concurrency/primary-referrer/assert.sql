-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
do $$
declare
  winner_name text;
  race_audits integer;
begin
  if (select version from public.opportunities
      where id = '7c000000-0000-4000-8000-000000000030') <> 1 then
    raise exception 'primary-referrer opportunity version did not increment once';
  end if;
  select display_name into strict winner_name
  from public.opportunity_referrers
  where opportunity_id = '7c000000-0000-4000-8000-000000000030'
    and is_primary and ended_at is null;
  if winner_name not in ('Actor A Referrer', 'Actor B Referrer') then
    raise exception 'primary-referrer current winner is invalid';
  end if;
  if (select pg_catalog.count(*) from public.opportunity_referrers
      where opportunity_id = '7c000000-0000-4000-8000-000000000030') <> 2 then
    raise exception 'primary-referrer left losing relationship residue';
  end if;
  select pg_catalog.count(*) into race_audits
  from public.audit_events
  where request_id in (
    '7c000000-0000-4000-8000-00000000a003',
    '7c000000-0000-4000-8000-00000000b003'
  ) and action = 'opportunity.primary_referrer_changed';
  if race_audits <> 1 then
    raise exception 'primary-referrer winner audit count is %', race_audits;
  end if;
  if (select pg_catalog.count(*) from public.workflow_node_events
      where request_id in (
        '7c000000-0000-4000-8000-00000000f001',
        '7c000000-0000-4000-8000-00000000f002'
      )) <> 2 then
    raise exception 'primary-referrer damaged earlier immutable history';
  end if;
end;
$$;
select 'PASS primary-referrer' as result;
commit;
