-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
do $$
declare
  target public.contacts%rowtype;
  race_audits integer;
begin
  select * into strict target
  from public.contacts
  where id = '7c000000-0000-4000-8000-000000000060';
  if target.version <> 1
     or target.display_name not in ('Actor A Contact Update', 'Actor B Contact Update') then
    raise exception 'contact-update final current state is invalid';
  end if;
  select pg_catalog.count(*) into race_audits
  from public.audit_events
  where request_id in (
    '7c000000-0000-4000-8000-00000000a005',
    '7c000000-0000-4000-8000-00000000b005'
  ) and action = 'contact.updated';
  if race_audits <> 1 then
    raise exception 'contact-update winner audit count is %', race_audits;
  end if;
  if (select pg_catalog.count(*) from public.workflow_node_events
      where request_id in (
        '7c000000-0000-4000-8000-00000000f001',
        '7c000000-0000-4000-8000-00000000f002'
      )) <> 2 then
    raise exception 'contact-update damaged earlier immutable history';
  end if;
end;
$$;
select 'PASS contact-update' as result;
commit;
