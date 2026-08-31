begin;

do $$
declare
  missing_permission text;
begin
  select expected.code
  into missing_permission
  from (values
    ('opportunity.read'),
    ('opportunity.create'),
    ('opportunity.update'),
    ('opportunity.contact.manage'),
    ('opportunity.scope.manage'),
    ('opportunity.referrer.manage'),
    ('opportunity.intake_record.create'),
    ('opportunity.duplicate.raise'),
    ('opportunity.duplicate.resolve'),
    ('opportunity.invalidate'),
    ('opportunity.restore'),
    ('journey.read'),
    ('journey.assignment.manage'),
    ('journey.node.start'),
    ('journey.node.complete'),
    ('journey.node.reopen'),
    ('journey.node.revalidate'),
    ('journey.blocker.raise'),
    ('journey.blocker.resolve'),
    ('stage01.evaluation.update'),
    ('stage01.recommendation.submit'),
    ('stage01.clarification.return'),
    ('stage01.decision.record'),
    ('stage01.reactivate'),
    ('stage01.config.read'),
    ('stage01.config.update'),
    ('stage01.config.publish')
  ) as expected(code)
  where not exists (
    select 1 from public.permissions as actual where actual.code = expected.code
  )
  limit 1;

  if missing_permission is not null then
    raise exception 'DB-S01-SEC permission % is missing', missing_permission;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from public.role_permissions as role_permission
    join public.roles as company_role on company_role.id = role_permission.role_id
    where (
      role_permission.permission_code like 'opportunity.%'
      or role_permission.permission_code like 'journey.%'
      or (
        role_permission.permission_code like 'stage01.%'
        and role_permission.permission_code not in (
          'stage01.config.read',
          'stage01.config.update',
          'stage01.config.publish'
        )
      )
    )
      and company_role.code <> 'company_admin'
  ) then
    raise exception 'DB-S01-SEC non-config Stage 01 permission was inferred for an operational role';
  end if;

  if exists (
    select 1
    from public.roles as company_role
    cross join public.permissions as permission
    where company_role.code = 'company_admin'
      and company_role.is_active
      and (
        permission.code like 'opportunity.%'
        or permission.code like 'journey.%'
        or (
          permission.code like 'stage01.%'
          and permission.code not in (
            'stage01.config.read',
            'stage01.config.update',
            'stage01.config.publish'
          )
        )
      )
      and not exists (
        select 1
        from public.role_permissions as role_permission
        where role_permission.role_id = company_role.id
          and role_permission.permission_code = permission.code
      )
  ) then
    raise exception 'DB-S01-SEC company_admin does not have the complete non-config Stage 01 catalog';
  end if;

  if (select count(*)
      from public.role_permissions as role_permission
      where role_permission.role_id = '10000000-0000-4000-8000-000000000308'::uuid
        and role_permission.permission_code in (
          'stage01.config.read',
          'stage01.config.update',
          'stage01.config.publish'
        )) <> 3 then
    raise exception 'DB-S01-SEC canonical VQH company_admin config permissions are incomplete';
  end if;

  if exists (
    select 1
    from public.role_permissions as role_permission
    where role_permission.permission_code in (
      'stage01.config.read',
      'stage01.config.update',
      'stage01.config.publish'
    )
      and role_permission.role_id <> '10000000-0000-4000-8000-000000000308'::uuid
  ) then
    raise exception 'DB-S01-SEC config permission leaked beyond canonical VQH company_admin';
  end if;
end $$;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'workflow_definition_snapshots',
    'workflow_instances',
    'workflow_node_instances',
    'workflow_node_executions',
    'workflow_node_events',
    'workflow_node_assignments',
    'workflow_blockers',
    'opportunities',
    'stage01_taxonomy_values',
    'contacts',
    'contact_methods',
    'opportunity_contacts',
    'opportunity_scopes',
    'opportunity_referrers',
    'opportunity_intake_records',
    'opportunity_duplicate_concerns',
    'stage01_intake_completion_baselines',
    'stage01_decision_cycles',
    'stage01_criterion_evaluations',
    'stage01_recommendations',
    'stage01_clarification_returns'
  ] loop
    if not has_table_privilege('authenticated', format('public.%I', relation_name), 'select') then
      raise exception 'DB-S01-SEC authenticated SELECT missing for public.%', relation_name;
    end if;
    if has_table_privilege('authenticated', format('public.%I', relation_name), 'insert')
       or has_table_privilege('authenticated', format('public.%I', relation_name), 'update')
       or has_table_privilege('authenticated', format('public.%I', relation_name), 'delete') then
      raise exception 'DB-S01-SEC authenticated DML leaked for public.%', relation_name;
    end if;
    if has_table_privilege('anon', format('public.%I', relation_name), 'select')
       or has_table_privilege('anon', format('public.%I', relation_name), 'insert')
       or has_table_privilege('anon', format('public.%I', relation_name), 'update')
       or has_table_privilege('anon', format('public.%I', relation_name), 'delete') then
      raise exception 'DB-S01-SEC anon privilege leaked for public.%', relation_name;
    end if;
  end loop;
end $$;

insert into auth.users (id, email) values
  ('52000000-0000-4000-8000-000000000001', 'stage01-security@test.invalid');

insert into public.tenants (id, code, name) values
  ('52000000-0000-4000-8000-000000000010', 'stage01-security', 'Stage 01 security test');

insert into public.companies (id, tenant_id, code, name) values
  ('52000000-0000-4000-8000-000000000020', '52000000-0000-4000-8000-000000000010', 'S01-SEC-A', 'Stage 01 security A'),
  ('52000000-0000-4000-8000-000000000021', '52000000-0000-4000-8000-000000000010', 'S01-SEC-B', 'Stage 01 security B');

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  ('52000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000010', array['member']);

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  ('52000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000010', '52000000-0000-4000-8000-000000000020', array['member']),
  ('52000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000010', '52000000-0000-4000-8000-000000000021', array['member']);

insert into public.roles (
  id, tenant_id, company_id, code, name, description, is_system
) values
  (
    '52000000-0000-4000-8000-000000000101',
    '52000000-0000-4000-8000-000000000010',
    '52000000-0000-4000-8000-000000000020',
    'stage01_test_opportunity_reader', 'Stage 01 test Opportunity reader', 'Test-only permission role', false
  ),
  (
    '52000000-0000-4000-8000-000000000102',
    '52000000-0000-4000-8000-000000000010',
    '52000000-0000-4000-8000-000000000020',
    'stage01_test_journey_reader', 'Stage 01 test Journey reader', 'Test-only permission role', false
  );

insert into public.role_permissions (role_id, permission_code) values
  ('52000000-0000-4000-8000-000000000101', 'opportunity.read'),
  ('52000000-0000-4000-8000-000000000102', 'journey.read');

insert into public.company_role_assignments (
  tenant_id, company_id, user_id, role_id, granted_by, grant_reason
) values
  (
    '52000000-0000-4000-8000-000000000010', '52000000-0000-4000-8000-000000000020',
    '52000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000101',
    '52000000-0000-4000-8000-000000000001', 'Stage 01 security fixture'
  ),
  (
    '52000000-0000-4000-8000-000000000010', '52000000-0000-4000-8000-000000000020',
    '52000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000102',
    '52000000-0000-4000-8000-000000000001', 'Stage 01 security fixture'
  );

insert into public.opportunities (id, tenant_id, company_id, primary_customer_name, created_by) values
  (
    '52000000-0000-4000-8000-000000000030', '52000000-0000-4000-8000-000000000010',
    '52000000-0000-4000-8000-000000000020', 'Visible company A',
    '52000000-0000-4000-8000-000000000001'
  ),
  (
    '52000000-0000-4000-8000-000000000031', '52000000-0000-4000-8000-000000000010',
    '52000000-0000-4000-8000-000000000021', 'Hidden company B',
    '52000000-0000-4000-8000-000000000001'
  );

insert into public.workflow_definition_snapshots (
  id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash
) values
  (
    '52000000-0000-4000-8000-000000000040', '52000000-0000-4000-8000-000000000010',
    '52000000-0000-4000-8000-000000000020', 'stage01-security', 1, 1, '{}'::jsonb, 'security-a'
  ),
  (
    '52000000-0000-4000-8000-000000000041', '52000000-0000-4000-8000-000000000010',
    '52000000-0000-4000-8000-000000000021', 'stage01-security', 1, 1, '{}'::jsonb, 'security-b'
  );

insert into public.workflow_instances (
  id, tenant_id, company_id, subject_type, subject_id, definition_snapshot_id, created_by
) values
  (
    '52000000-0000-4000-8000-000000000050', '52000000-0000-4000-8000-000000000010',
    '52000000-0000-4000-8000-000000000020', 'opportunity',
    '52000000-0000-4000-8000-000000000030', '52000000-0000-4000-8000-000000000040',
    '52000000-0000-4000-8000-000000000001'
  ),
  (
    '52000000-0000-4000-8000-000000000051', '52000000-0000-4000-8000-000000000010',
    '52000000-0000-4000-8000-000000000021', 'opportunity',
    '52000000-0000-4000-8000-000000000031', '52000000-0000-4000-8000-000000000041',
    '52000000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"52000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  if (select count(*) from public.opportunities) <> 1
     or not exists (
       select 1 from public.opportunities where id = '52000000-0000-4000-8000-000000000030'
     ) then
    raise exception 'DB-S01-SEC Opportunity RLS did not isolate Company A';
  end if;

  if (select count(*) from public.workflow_instances) <> 1
     or not exists (
       select 1 from public.workflow_instances where id = '52000000-0000-4000-8000-000000000050'
     ) then
    raise exception 'DB-S01-SEC Workflow RLS did not require scoped journey.read';
  end if;

  begin
    insert into public.opportunities (tenant_id, company_id, primary_customer_name, created_by)
    values (
      '52000000-0000-4000-8000-000000000010', '52000000-0000-4000-8000-000000000020',
      'Forbidden direct insert', '52000000-0000-4000-8000-000000000001'
    );
    raise exception 'DB-S01-SEC direct INSERT unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.opportunities
    set primary_customer_name = 'Forbidden direct update'
    where id = '52000000-0000-4000-8000-000000000030';
    raise exception 'DB-S01-SEC direct UPDATE unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.opportunities
    where id = '52000000-0000-4000-8000-000000000030';
    raise exception 'DB-S01-SEC direct DELETE unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

update public.company_role_assignments
set revoked_by = '52000000-0000-4000-8000-000000000001',
    revoked_at = now(),
    revoke_reason = 'Verify immediate journey permission revocation'
where role_id = '52000000-0000-4000-8000-000000000102'
  and revoked_at is null;

set local role authenticated;

do $$
begin
  if (select count(*) from public.workflow_instances) <> 0 then
    raise exception 'DB-S01-SEC revoked journey.read was not effective immediately';
  end if;
  if (select count(*) from public.opportunities) <> 1 then
    raise exception 'DB-S01-SEC revoking journey.read affected opportunity.read';
  end if;
end $$;

reset role;

update public.company_role_assignments
set revoked_by = '52000000-0000-4000-8000-000000000001',
    revoked_at = now(),
    revoke_reason = 'Verify immediate Opportunity permission revocation'
where role_id = '52000000-0000-4000-8000-000000000101'
  and revoked_at is null;

set local role authenticated;

do $$
begin
  if (select count(*) from public.opportunities) <> 0 then
    raise exception 'DB-S01-SEC revoked opportunity.read was not effective immediately';
  end if;
end $$;

reset role;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'create_stage01_opportunity(uuid,jsonb,uuid)',
    'update_opportunity_current_data(uuid,uuid,jsonb,uuid)',
    'create_contact(uuid,jsonb,uuid)',
    'update_contact(uuid,uuid,jsonb,uuid)',
    'add_contact_method(uuid,uuid,jsonb,uuid)',
    'update_contact_method(uuid,uuid,uuid,jsonb,uuid)',
    'link_opportunity_contact(uuid,uuid,jsonb,uuid)',
    'set_opportunity_primary_contact(uuid,uuid,jsonb,uuid)',
    'end_opportunity_contact(uuid,uuid,uuid,jsonb,uuid)',
    'add_opportunity_scope(uuid,uuid,jsonb,uuid)',
    'retire_opportunity_scope(uuid,uuid,uuid,jsonb,uuid)',
    'add_opportunity_referrer(uuid,uuid,jsonb,uuid)',
    'set_opportunity_primary_referrer(uuid,uuid,jsonb,uuid)',
    'end_opportunity_referrer(uuid,uuid,uuid,jsonb,uuid)',
    'append_opportunity_intake_record(uuid,uuid,jsonb,uuid)',
    'correct_opportunity_intake_record(uuid,uuid,uuid,jsonb,uuid)',
    'raise_opportunity_duplicate_concern(uuid,uuid,jsonb,uuid)',
    'resolve_opportunity_duplicate(uuid,uuid,uuid,jsonb,uuid)',
    'assign_workflow_node(uuid,uuid,jsonb,uuid)',
    'end_workflow_assignment(uuid,uuid,jsonb,uuid)',
    'raise_workflow_blocker(uuid,uuid,jsonb,uuid)',
    'resolve_workflow_blocker(uuid,uuid,jsonb,uuid)',
    'start_workflow_node(uuid,uuid,jsonb,uuid)',
    'complete_stage01_intake(uuid,uuid,jsonb,uuid)',
    'invalidate_opportunity(uuid,uuid,jsonb,uuid)',
    'restore_opportunity(uuid,uuid,jsonb,uuid)',
    'reopen_workflow_node(uuid,uuid,jsonb,uuid)',
    'revalidate_workflow_node(uuid,uuid,jsonb,uuid)',
    'record_stage01_criterion_evaluation(uuid,uuid,text,jsonb,uuid)',
    'submit_stage01_recommendation(uuid,uuid,jsonb,uuid)',
    'return_stage01_for_clarification(uuid,uuid,jsonb,uuid)',
    'record_stage01_final_decision(uuid,uuid,jsonb,uuid)',
    'complete_stage01_evaluation(uuid,uuid,jsonb,uuid)',
    'reactivate_stage01(uuid,uuid,jsonb,uuid)'
  ] loop
    if not has_function_privilege('authenticated', 'public.' || function_signature, 'execute')
       or has_function_privilege('anon', 'public.' || function_signature, 'execute')
       or has_function_privilege('public', 'public.' || function_signature, 'execute') then
      raise exception 'DB-S01-SEC public function privilege mismatch for %', function_signature;
    end if;
    if not has_function_privilege('authenticated', 'private.' || function_signature, 'execute')
       or has_function_privilege('anon', 'private.' || function_signature, 'execute')
       or has_function_privilege('public', 'private.' || function_signature, 'execute') then
      raise exception 'DB-S01-SEC private function privilege mismatch for %', function_signature;
    end if;
  end loop;
end $$;

do $$
begin
  if has_function_privilege(
       'authenticated', 'private.stage01_taxonomy_entry(jsonb,text,text)', 'execute'
     )
     or has_function_privilege(
       'anon', 'private.stage01_taxonomy_entry(jsonb,text,text)', 'execute'
     )
     or has_function_privilege(
       'public', 'private.stage01_taxonomy_entry(jsonb,text,text)', 'execute'
     ) then
    raise exception 'DB-S01-SEC private taxonomy helper must not be executable by API roles';
  end if;
end $$;

set local role authenticated;

do $$
begin
  begin
    perform private.create_stage01_opportunity(
      '52000000-0000-4000-8000-000000000020',
      '{"primaryCustomerName":"Private bypass attempt"}'::jsonb,
      '52000000-0000-4000-8000-000000000299'
    );
    raise exception 'DB-S01-SEC direct private implementation bypass unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'PERMISSION_DENIED' then raise; end if;
  end;

  begin
    perform private.assign_workflow_node(
      '52000000-0000-4000-8000-000000000020',
      '52000000-0000-4000-8000-000000000099',
      '{"assignmentKind":"accountable_owner","assigneeUserId":"52000000-0000-4000-8000-000000000001","expectedExecutionVersion":0}'::jsonb,
      '52000000-0000-4000-8000-000000000298'
    );
    raise exception 'DB-S01-SEC direct private Workflow implementation bypass unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'PERMISSION_DENIED' then raise; end if;
  end;

  begin
    perform private.record_stage01_final_decision(
      '52000000-0000-4000-8000-000000000020',
      '52000000-0000-4000-8000-000000000030',
      '{"outcome":"proceed","rationale":"Private bypass attempt","expectedCycleVersion":0}'::jsonb,
      '52000000-0000-4000-8000-000000000297'
    );
    raise exception 'DB-S01-SEC direct private Decision implementation bypass unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'PERMISSION_DENIED' then raise; end if;
  end;
end $$;

reset role;

select 'PASS DB-S01-SEC foundational grants and RLS' as result;

rollback;
