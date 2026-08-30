-- STAGE01 CLOUD DEV FIXED INTEGRITY RACE FIXTURE
begin;
do $$
begin
  if (select phase from public.workflow_node_executions
      where id = '7c000000-0000-4000-8000-000000000053') <> 'active'
     or (select version from public.workflow_node_executions
         where id = '7c000000-0000-4000-8000-000000000053') <> 0
     or (select version from public.contacts
         where id = '7c000000-0000-4000-8000-000000000060') <> 1
     or (select is_usable from public.contact_methods
         where id = '7c000000-0000-4000-8000-000000000093')
     or exists (
       select 1 from public.stage01_intake_completion_baselines
       where node_execution_id = '7c000000-0000-4000-8000-000000000053'
     )
     or exists (
       select 1 from public.workflow_node_events
       where request_id = '7c000000-0000-4000-8000-00000000b102'
     )
     or exists (
       select 1 from public.audit_events
       where request_id = '7c000000-0000-4000-8000-00000000b102'
     ) then
    raise exception 'contact-update-first integrity race left completion residue';
  end if;
end;
$$;
select 'PASS contact-update-first integrity race' as result;
commit;
