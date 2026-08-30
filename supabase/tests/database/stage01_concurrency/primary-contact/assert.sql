-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
do $$
declare
  winner_contact uuid;
  race_audits integer;
begin
  if (select version from public.opportunities
      where id = '7c000000-0000-4000-8000-000000000030') <> 1 then
    raise exception 'primary-contact opportunity version did not increment once';
  end if;
  select contact_id into strict winner_contact
  from public.opportunity_contacts
  where opportunity_id = '7c000000-0000-4000-8000-000000000030'
    and is_primary and ended_at is null;
  if winner_contact not in (
    '7c000000-0000-4000-8000-000000000061',
    '7c000000-0000-4000-8000-000000000062'
  ) then
    raise exception 'primary-contact current winner is invalid';
  end if;
  if (select pg_catalog.count(*) from public.opportunity_contacts
      where opportunity_id = '7c000000-0000-4000-8000-000000000030') <> 2 then
    raise exception 'primary-contact left losing relationship residue';
  end if;
  select pg_catalog.count(*) into race_audits
  from public.audit_events
  where request_id in (
    '7c000000-0000-4000-8000-00000000a002',
    '7c000000-0000-4000-8000-00000000b002'
  ) and action = 'opportunity.primary_contact_changed';
  if race_audits <> 1 then
    raise exception 'primary-contact winner audit count is %', race_audits;
  end if;
  if (select pg_catalog.count(*) from public.workflow_node_events
      where request_id in (
        '7c000000-0000-4000-8000-00000000f001',
        '7c000000-0000-4000-8000-00000000f002'
      )) <> 2 then
    raise exception 'primary-contact damaged earlier immutable history';
  end if;
end;
$$;
select 'PASS primary-contact' as result;
commit;
