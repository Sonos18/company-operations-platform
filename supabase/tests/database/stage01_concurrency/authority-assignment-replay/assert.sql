-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
begin;
do $$
declare cycle_row public.stage01_decision_cycles%rowtype; event_count integer; audit_count integer;
begin
  select * into cycle_row from public.stage01_decision_cycles where id = '7c000000-0000-4000-8000-000000000055';
  select count(*) into event_count from public.opportunity_decision_authority_events
    where decision_cycle_id = cycle_row.id and request_id = '7c000000-0000-4000-8000-00000000a010';
  select count(*) into audit_count from public.audit_events
    where request_id = '7c000000-0000-4000-8000-00000000a010' and action = 'opportunity.decision_authority.assigned';
  if event_count <> 1 or audit_count <> 1 or cycle_row.version <> 1
     or not exists (select 1 from public.opportunity_decision_authority_events where id = cycle_row.authority_resolution_event_id and assignment_cycle_version = 1) then
    raise exception 'same-request authority replay created duplicate event, audit, or cycle version';
  end if;
end $$;
select 'PASS authority-assignment-replay' as result;
commit;
