-- STAGE01 CLOUD DEV FIXED INTEGRITY RACE FIXTURE
begin;
do $$
declare
  baseline_snapshot jsonb;
  baseline_hash text;
begin
  select baseline.snapshot, baseline.snapshot_hash
  into strict baseline_snapshot, baseline_hash
  from public.stage01_intake_completion_baselines as baseline
  where baseline.node_execution_id = '7c000000-0000-4000-8000-000000000053'
    and baseline.baseline_version = 1;

  if (select phase from public.workflow_node_executions
      where id = '7c000000-0000-4000-8000-000000000053') <> 'completed'
     or (select version from public.workflow_node_executions
         where id = '7c000000-0000-4000-8000-000000000053') <> 1
     or (select version from public.contacts
         where id = '7c000000-0000-4000-8000-000000000060') <> 1
     or (select is_usable from public.contact_methods
         where id = '7c000000-0000-4000-8000-000000000093')
     or baseline_snapshot #>> '{usableContactMethods,0,contactMethodId}'
          <> '7c000000-0000-4000-8000-000000000093'
     or baseline_snapshot #>> '{usableContactMethods,0,isUsableAtCompletion}' <> 'true'
     or baseline_snapshot #>> '{gates,hasUsableContactMethod}' <> 'true'
     or baseline_hash <> pg_catalog.encode(
       extensions.digest(baseline_snapshot::text, 'sha256'), 'hex'
     )
     or (select pg_catalog.count(*) from public.workflow_node_events
         where request_id = '7c000000-0000-4000-8000-00000000a101'
           and event_type = 'completed') <> 1
     or (select pg_catalog.count(*) from public.audit_events
         where request_id = '7c000000-0000-4000-8000-00000000a101'
           and action = 'journey.intake_completed') <> 1 then
    raise exception 'completion-first integrity race persisted inconsistent evidence';
  end if;
  if (select observed_at from public.stage01_integrity_race_observations
      where actor = 'actor_a') >
     (select observed_at from public.stage01_integrity_race_observations
      where actor = 'actor_b') then
    raise exception 'completion-first Contact Method update bypassed the completion Contact lock';
  end if;
end;
$$;
select 'PASS completion-first integrity race' as result;
commit;
