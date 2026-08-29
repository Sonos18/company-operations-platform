begin;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'workflow_definition_snapshots',
    'workflow_node_events',
    'opportunity_intake_records',
    'stage01_intake_completion_baselines',
    'stage01_criterion_evaluations',
    'stage01_recommendations',
    'stage01_clarification_returns'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_trigger as trigger
      join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = relation_name
        and trigger.tgname = relation_name || '_prevent_history_mutation'
        and not trigger.tgisinternal
    ) then
      raise exception 'DB-S01-HIST immutable guard missing for public.%', relation_name;
    end if;
  end loop;
end $$;

insert into auth.users (id, email) values
  ('53000000-0000-4000-8000-000000000001', 'stage01-history-authority@test.invalid'),
  ('53000000-0000-4000-8000-000000000002', 'stage01-history-other@test.invalid');

insert into public.tenants (id, code, name) values
  ('53000000-0000-4000-8000-000000000010', 'stage01-history', 'Stage 01 history test');

insert into public.companies (id, tenant_id, code, name) values
  ('53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000010', 'S01-HIST', 'Stage 01 history company');

insert into public.opportunities (id, tenant_id, company_id, primary_customer_name, created_by) values
  (
    '53000000-0000-4000-8000-000000000030', '53000000-0000-4000-8000-000000000010',
    '53000000-0000-4000-8000-000000000020', 'History Opportunity A',
    '53000000-0000-4000-8000-000000000001'
  ),
  (
    '53000000-0000-4000-8000-000000000031', '53000000-0000-4000-8000-000000000010',
    '53000000-0000-4000-8000-000000000020', 'History Opportunity B',
    '53000000-0000-4000-8000-000000000001'
  );

insert into public.workflow_definition_snapshots (
  id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash
) values (
  '53000000-0000-4000-8000-000000000040', '53000000-0000-4000-8000-000000000010',
  '53000000-0000-4000-8000-000000000020', 'stage01-history', 1, 1, '{}'::jsonb, 'history-definition'
);

insert into public.workflow_instances (
  id, tenant_id, company_id, subject_type, subject_id, definition_snapshot_id, created_by
) values
  (
    '53000000-0000-4000-8000-000000000050', '53000000-0000-4000-8000-000000000010',
    '53000000-0000-4000-8000-000000000020', 'opportunity',
    '53000000-0000-4000-8000-000000000030', '53000000-0000-4000-8000-000000000040',
    '53000000-0000-4000-8000-000000000001'
  ),
  (
    '53000000-0000-4000-8000-000000000051', '53000000-0000-4000-8000-000000000010',
    '53000000-0000-4000-8000-000000000020', 'opportunity',
    '53000000-0000-4000-8000-000000000031', '53000000-0000-4000-8000-000000000040',
    '53000000-0000-4000-8000-000000000001'
  );

insert into public.workflow_node_instances (
  id, tenant_id, company_id, workflow_instance_id, node_key, node_type
) values
  (
    '53000000-0000-4000-8000-000000000060', '53000000-0000-4000-8000-000000000010',
    '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000050',
    '01.2', 'child_stage'
  ),
  (
    '53000000-0000-4000-8000-000000000061', '53000000-0000-4000-8000-000000000010',
    '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000051',
    '01.2', 'child_stage'
  );

insert into public.workflow_node_executions (
  id, tenant_id, company_id, node_instance_id, execution_no, phase,
  started_by, started_at, completed_by, completed_at
) values
  (
    '53000000-0000-4000-8000-000000000070', '53000000-0000-4000-8000-000000000010',
    '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000060', 1,
    'completed', '53000000-0000-4000-8000-000000000001', now() - interval '1 minute',
    '53000000-0000-4000-8000-000000000001', now()
  ),
  (
    '53000000-0000-4000-8000-000000000071', '53000000-0000-4000-8000-000000000010',
    '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000061', 1,
    'active', '53000000-0000-4000-8000-000000000001', now(), null, null
  );

insert into public.workflow_node_events (
  tenant_id, company_id, node_execution_id, event_type, actor_id, payload, request_id
) values
  (
    '53000000-0000-4000-8000-000000000010', '53000000-0000-4000-8000-000000000020',
    '53000000-0000-4000-8000-000000000070', 'completed',
    '53000000-0000-4000-8000-000000000001',
    '{"baselineId":"53000000-0000-4000-8000-000000000080"}'::jsonb,
    '53000000-0000-4000-8000-000000000201'
  ),
  (
    '53000000-0000-4000-8000-000000000010', '53000000-0000-4000-8000-000000000020',
    '53000000-0000-4000-8000-000000000071', 'started',
    '53000000-0000-4000-8000-000000000001',
    '{"baselineId":"53000000-0000-4000-8000-000000000081"}'::jsonb,
    '53000000-0000-4000-8000-000000000202'
  );

insert into public.opportunity_intake_records (
  id, tenant_id, company_id, opportunity_id, channel_code, summary, created_by
) values (
  '53000000-0000-4000-8000-000000000090', '53000000-0000-4000-8000-000000000010',
  '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000030',
  'test', 'Immutable intake evidence', '53000000-0000-4000-8000-000000000001'
);

insert into public.stage01_intake_completion_baselines (
  id, tenant_id, company_id, opportunity_id, node_execution_id, completion_event_id,
  baseline_version, snapshot, snapshot_hash, created_by
) values (
  '53000000-0000-4000-8000-000000000080', '53000000-0000-4000-8000-000000000010',
  '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000030',
  '53000000-0000-4000-8000-000000000070',
  (select id from public.workflow_node_events where request_id = '53000000-0000-4000-8000-000000000201'),
  1, '{"gateResult":"satisfied"}'::jsonb, 'history-baseline',
  '53000000-0000-4000-8000-000000000001'
);

insert into public.stage01_decision_cycles (
  id, tenant_id, company_id, opportunity_id, node_execution_id, cycle_no,
  decision_authority_user_id, authority_resolution_reference, created_by
) values
  (
    '53000000-0000-4000-8000-000000000100', '53000000-0000-4000-8000-000000000010',
    '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000030',
    '53000000-0000-4000-8000-000000000070', 1,
    '53000000-0000-4000-8000-000000000001', 'history-authority-a',
    '53000000-0000-4000-8000-000000000001'
  ),
  (
    '53000000-0000-4000-8000-000000000101', '53000000-0000-4000-8000-000000000010',
    '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000031',
    '53000000-0000-4000-8000-000000000071', 1,
    '53000000-0000-4000-8000-000000000001', 'history-authority-b',
    '53000000-0000-4000-8000-000000000001'
  );

insert into public.stage01_criterion_evaluations (
  id, tenant_id, company_id, decision_cycle_id, criterion_key, revision,
  applicability, result, rationale, evidence, evaluated_by
) values (
  '53000000-0000-4000-8000-000000000110', '53000000-0000-4000-8000-000000000010',
  '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000100',
  'history-criterion', 1, 'applicable', 'fit', 'History evidence', '[]'::jsonb,
  '53000000-0000-4000-8000-000000000001'
);

insert into public.stage01_recommendations (
  id, tenant_id, company_id, decision_cycle_id, version, recommendation,
  rationale, evidence, submitted_by
) values
  (
    '53000000-0000-4000-8000-000000000120', '53000000-0000-4000-8000-000000000010',
    '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000100',
    1, 'recommend_proceed', 'Proceed recommendation', '[]'::jsonb,
    '53000000-0000-4000-8000-000000000001'
  ),
  (
    '53000000-0000-4000-8000-000000000121', '53000000-0000-4000-8000-000000000010',
    '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000101',
    1, 'recommend_not_proceeding', 'Do not proceed recommendation', '[]'::jsonb,
    '53000000-0000-4000-8000-000000000001'
  );

insert into public.stage01_clarification_returns (
  id, tenant_id, company_id, decision_cycle_id, recommendation_id, reason, returned_by
) values (
  '53000000-0000-4000-8000-000000000130', '53000000-0000-4000-8000-000000000010',
  '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000100',
  '53000000-0000-4000-8000-000000000120', 'History clarification',
  '53000000-0000-4000-8000-000000000001'
);

insert into public.contacts (
  id, tenant_id, company_id, display_name, created_by
) values (
  '53000000-0000-4000-8000-000000000140', '53000000-0000-4000-8000-000000000010',
  '53000000-0000-4000-8000-000000000020', 'History contact',
  '53000000-0000-4000-8000-000000000001'
);

insert into public.opportunity_contacts (
  id, tenant_id, company_id, opportunity_id, contact_id, relationship_code, is_primary, created_by
) values (
  '53000000-0000-4000-8000-000000000141', '53000000-0000-4000-8000-000000000010',
  '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000030',
  '53000000-0000-4000-8000-000000000140', 'owner', true,
  '53000000-0000-4000-8000-000000000001'
);

insert into public.opportunity_scopes (
  id, tenant_id, company_id, opportunity_id, scope_code, created_by
) values (
  '53000000-0000-4000-8000-000000000142', '53000000-0000-4000-8000-000000000010',
  '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000030',
  'scope-a', '53000000-0000-4000-8000-000000000001'
);

insert into public.opportunity_referrers (
  id, tenant_id, company_id, opportunity_id, referrer_type_code, display_name, is_primary, created_by
) values (
  '53000000-0000-4000-8000-000000000143', '53000000-0000-4000-8000-000000000010',
  '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000030',
  'partner', 'History referrer', true, '53000000-0000-4000-8000-000000000001'
);

insert into public.workflow_node_assignments (
  id, tenant_id, company_id, node_execution_id, assignment_kind, assignee_user_id, assigned_by
) values (
  '53000000-0000-4000-8000-000000000144', '53000000-0000-4000-8000-000000000010',
  '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000070',
  'accountable_owner', '53000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000001'
);

insert into public.workflow_blockers (
  id, tenant_id, company_id, node_execution_id, effect, category_code, description, raised_by
) values (
  '53000000-0000-4000-8000-000000000145', '53000000-0000-4000-8000-000000000010',
  '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000070',
  'non_blocking', 'history', 'History blocker', '53000000-0000-4000-8000-000000000001'
);

insert into public.opportunity_duplicate_concerns (
  id, tenant_id, company_id, opportunity_id, suspected_duplicate_opportunity_id, description, raised_by
) values (
  '53000000-0000-4000-8000-000000000146', '53000000-0000-4000-8000-000000000010',
  '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000030',
  '53000000-0000-4000-8000-000000000031', 'Possible duplicate',
  '53000000-0000-4000-8000-000000000001'
);

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'workflow_definition_snapshots',
    'workflow_node_events',
    'opportunity_intake_records',
    'stage01_intake_completion_baselines',
    'stage01_criterion_evaluations',
    'stage01_recommendations',
    'stage01_clarification_returns'
  ] loop
    begin
      execute format(
        'update public.%I set tenant_id = tenant_id where company_id = $1',
        relation_name
      ) using '53000000-0000-4000-8000-000000000020'::uuid;
      raise exception 'DB-S01-HIST direct UPDATE accepted for public.%', relation_name;
    exception when raise_exception then
      if sqlerrm <> 'STAGE01_HISTORY_IMMUTABLE' then
        raise;
      end if;
    end;

    begin
      execute format(
        'delete from public.%I where company_id = $1',
        relation_name
      ) using '53000000-0000-4000-8000-000000000020'::uuid;
      raise exception 'DB-S01-HIST direct DELETE accepted for public.%', relation_name;
    exception when raise_exception then
      if sqlerrm <> 'STAGE01_HISTORY_IMMUTABLE' then
        raise;
      end if;
    end;
  end loop;
end $$;

create function pg_temp.try_delete_stage01_intake(target_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.opportunity_intake_records where id = target_id;
$$;

grant execute on function pg_temp.try_delete_stage01_intake(uuid) to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"53000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform pg_temp.try_delete_stage01_intake('53000000-0000-4000-8000-000000000090');
    raise exception 'DB-S01-HIST privileged append-only DELETE unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_HISTORY_IMMUTABLE' then
      raise;
    end if;
  end;
end $$;

reset role;

do $$
declare
  test_statement text;
begin
  foreach test_statement in array array[
    'update public.workflow_node_assignments set assignee_user_id = ''53000000-0000-4000-8000-000000000002'' where id = ''53000000-0000-4000-8000-000000000144''',
    'update public.opportunity_contacts set relationship_code = ''rewritten'' where id = ''53000000-0000-4000-8000-000000000141''',
    'update public.opportunity_scopes set scope_code = ''rewritten'' where id = ''53000000-0000-4000-8000-000000000142''',
    'update public.opportunity_referrers set display_name = ''Rewritten'' where id = ''53000000-0000-4000-8000-000000000143''',
    'update public.workflow_blockers set description = ''Rewritten'' where id = ''53000000-0000-4000-8000-000000000145''',
    'update public.opportunity_duplicate_concerns set description = ''Rewritten'' where id = ''53000000-0000-4000-8000-000000000146'''
  ] loop
    begin
      execute test_statement;
      raise exception 'DB-S01-HIST lifecycle fact rewrite unexpectedly succeeded';
    exception when raise_exception then
      if sqlerrm <> 'STAGE01_HISTORY_IMMUTABLE' then
        raise;
      end if;
    end;
  end loop;
end $$;

do $$
begin
  begin
    insert into public.stage01_criterion_evaluations (
      tenant_id, company_id, decision_cycle_id, criterion_key, revision,
      applicability, result, rationale, evidence, evaluated_by
    ) values (
      '53000000-0000-4000-8000-000000000010', '53000000-0000-4000-8000-000000000020',
      '53000000-0000-4000-8000-000000000100', 'missing-evidence', 1,
      'applicable', 'fit', null, '[]'::jsonb,
      '53000000-0000-4000-8000-000000000001'
    );
    raise exception 'DB-S01-HIST malformed evaluation unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_EVALUATION_EVIDENCE_REQUIRED' then
      raise;
    end if;
  end;

  begin
    insert into public.stage01_intake_completion_baselines (
      id, tenant_id, company_id, opportunity_id, node_execution_id, completion_event_id,
      baseline_version, snapshot, snapshot_hash, created_by
    ) values (
      '53000000-0000-4000-8000-000000000081', '53000000-0000-4000-8000-000000000010',
      '53000000-0000-4000-8000-000000000020', '53000000-0000-4000-8000-000000000031',
      '53000000-0000-4000-8000-000000000071',
      (select id from public.workflow_node_events where request_id = '53000000-0000-4000-8000-000000000202'),
      1, '{}'::jsonb, 'invalid-baseline', '53000000-0000-4000-8000-000000000001'
    );
    raise exception 'DB-S01-HIST malformed baseline-event link unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_BASELINE_EVENT_INVALID' then
      raise;
    end if;
  end;

  begin
    insert into public.stage01_clarification_returns (
      tenant_id, company_id, decision_cycle_id, recommendation_id, reason, returned_by
    ) values (
      '53000000-0000-4000-8000-000000000010', '53000000-0000-4000-8000-000000000020',
      '53000000-0000-4000-8000-000000000100', '53000000-0000-4000-8000-000000000121',
      'Cross-cycle clarification', '53000000-0000-4000-8000-000000000001'
    );
    raise exception 'DB-S01-HIST cross-cycle clarification unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_CLARIFICATION_RECOMMENDATION_CYCLE_MISMATCH' then
      raise;
    end if;
  end;

  begin
    update public.stage01_decision_cycles
    set final_outcome = 'not_proceeding',
        final_decision_by = '53000000-0000-4000-8000-000000000001',
        final_decision_at = now(),
        final_rationale = 'Cross-cycle recommendation',
        final_recommendation_id = '53000000-0000-4000-8000-000000000121',
        version = version + 1
    where id = '53000000-0000-4000-8000-000000000100';
    raise exception 'DB-S01-HIST cross-cycle Final Decision recommendation unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_FINAL_RECOMMENDATION_CYCLE_MISMATCH' then
      raise;
    end if;
  end;

  begin
    update public.stage01_decision_cycles
    set final_outcome = 'proceed',
        final_decision_by = '53000000-0000-4000-8000-000000000001',
        final_decision_at = now(),
        final_rationale = 'Matching recommendation',
        final_recommendation_id = '53000000-0000-4000-8000-000000000120',
        override_rationale = 'Unnecessary override',
        version = version + 1
    where id = '53000000-0000-4000-8000-000000000100';
    raise exception 'DB-S01-HIST matching outcome accepted override rationale';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_DECISION_OVERRIDE_INVALID' then
      raise;
    end if;
  end;

  begin
    update public.stage01_decision_cycles
    set final_outcome = 'not_proceeding',
        final_decision_by = '53000000-0000-4000-8000-000000000001',
        final_decision_at = now(),
        final_rationale = 'Different outcome',
        final_recommendation_id = '53000000-0000-4000-8000-000000000120',
        version = version + 1
    where id = '53000000-0000-4000-8000-000000000100';
    raise exception 'DB-S01-HIST differing outcome omitted override rationale';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_OVERRIDE_RATIONALE_REQUIRED' then
      raise;
    end if;
  end;
end $$;

update public.stage01_decision_cycles
set final_outcome = 'proceed',
    final_decision_by = '53000000-0000-4000-8000-000000000001',
    final_decision_at = now(),
    final_rationale = 'Immutable final decision',
    final_recommendation_id = '53000000-0000-4000-8000-000000000120',
    version = version + 1
where id = '53000000-0000-4000-8000-000000000100';

do $$
begin
  begin
    update public.stage01_decision_cycles
    set final_rationale = 'Rewritten decision'
    where id = '53000000-0000-4000-8000-000000000100';
    raise exception 'DB-S01-HIST decided cycle mutation unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_HISTORY_IMMUTABLE' then
      raise;
    end if;
  end;

  begin
    delete from public.stage01_decision_cycles
    where id = '53000000-0000-4000-8000-000000000100';
    raise exception 'DB-S01-HIST Decision Cycle deletion unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_HISTORY_IMMUTABLE' then
      raise;
    end if;
  end;
end $$;

select 'PASS DB-S01-HIST foundational history guards' as result;

rollback;
