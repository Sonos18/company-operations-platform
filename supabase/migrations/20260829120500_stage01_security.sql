insert into public.permissions (code, module, name, description) values
  ('opportunity.read', 'opportunity', 'Read opportunities', 'Read company Opportunity aggregates and Stage 01 decision data'),
  ('opportunity.create', 'opportunity', 'Create opportunities', 'Create an Opportunity with its initial Stage 01 runtime'),
  ('opportunity.update', 'opportunity', 'Update opportunities', 'Update current Opportunity-owned data'),
  ('opportunity.contact.manage', 'opportunity', 'Manage Opportunity contacts', 'Manage Contact relationships and Contact Methods for an Opportunity'),
  ('opportunity.scope.manage', 'opportunity', 'Manage Opportunity scopes', 'Manage lifecycle-preserving Opportunity Scope relationships'),
  ('opportunity.referrer.manage', 'opportunity', 'Manage Opportunity referrers', 'Manage lifecycle-preserving Opportunity Referrer relationships'),
  ('opportunity.intake_record.create', 'opportunity', 'Create Intake Records', 'Append Opportunity Intake Records and explicit corrections'),
  ('opportunity.duplicate.raise', 'opportunity', 'Raise duplicate concerns', 'Raise an Opportunity duplicate concern'),
  ('opportunity.duplicate.resolve', 'opportunity', 'Resolve duplicate concerns', 'Resolve an Opportunity duplicate concern without destructive merge'),
  ('opportunity.invalidate', 'opportunity', 'Invalidate opportunities', 'Invalidate an Opportunity using an approved structured reason'),
  ('opportunity.restore', 'opportunity', 'Restore opportunities', 'Restore an eligible invalid Opportunity'),
  ('journey.read', 'journey', 'Read Journey runtime', 'Read company Workflow Core runtime and history'),
  ('journey.assignment.manage', 'journey', 'Manage Journey assignments', 'Assign, reassign, or end Workflow node assignments'),
  ('journey.node.start', 'journey', 'Start Journey nodes', 'Start an eligible Workflow node execution'),
  ('journey.node.complete', 'journey', 'Complete Journey nodes', 'Complete an eligible Workflow node execution'),
  ('journey.node.reopen', 'journey', 'Reopen Journey nodes', 'Reopen a completed Workflow node with history preservation'),
  ('journey.node.revalidate', 'journey', 'Revalidate Journey nodes', 'Revalidate a Workflow node whose prerequisites changed'),
  ('journey.blocker.raise', 'journey', 'Raise Journey blockers', 'Raise blocking or non-blocking Workflow blockers'),
  ('journey.blocker.resolve', 'journey', 'Resolve Journey blockers', 'Resolve Workflow blockers with retained history'),
  ('stage01.evaluation.update', 'stage01', 'Record Stage 01 evaluations', 'Append Stage 01 criterion evaluation revisions'),
  ('stage01.recommendation.submit', 'stage01', 'Submit Stage 01 recommendations', 'Append Stage 01 Recommendation versions'),
  ('stage01.clarification.return', 'stage01', 'Return Stage 01 clarification', 'Return a Stage 01 Recommendation for clarification'),
  ('stage01.decision.record', 'stage01', 'Record Stage 01 decisions', 'Record the immutable Stage 01 Final Decision'),
  ('stage01.reactivate', 'stage01', 'Reactivate Stage 01', 'Create a new Stage 01 evaluation execution and Decision Cycle')
on conflict (code) do update set
  module = excluded.module,
  name = excluded.name,
  description = excluded.description;

insert into public.role_permissions (role_id, permission_code)
select company_role.id, permission.code
from public.roles as company_role
cross join public.permissions as permission
where company_role.code = 'company_admin'
  and company_role.is_active
on conflict do nothing;

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
    'workflow_blockers'
  ] loop
    execute format('revoke all on table public.%I from anon, authenticated', relation_name);
    execute format('grant select on table public.%I to authenticated', relation_name);
    execute format('alter table public.%I enable row level security', relation_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_company_permission(tenant_id, company_id, %L))',
      'stage01_' || relation_name || '_read',
      relation_name,
      'journey.read'
    );
  end loop;

  foreach relation_name in array array[
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
    execute format('revoke all on table public.%I from anon, authenticated', relation_name);
    execute format('grant select on table public.%I to authenticated', relation_name);
    execute format('alter table public.%I enable row level security', relation_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_company_permission(tenant_id, company_id, %L))',
      'stage01_' || relation_name || '_read',
      relation_name,
      'opportunity.read'
    );
  end loop;
end $$;

create function private.prevent_stage01_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE';
  return null;
end;
$$;

revoke all on function private.prevent_stage01_history_mutation() from public, anon, authenticated;

create trigger workflow_definition_snapshots_prevent_history_mutation
  before update or delete on public.workflow_definition_snapshots
  for each row execute function private.prevent_stage01_history_mutation();
create trigger workflow_node_events_prevent_history_mutation
  before update or delete on public.workflow_node_events
  for each row execute function private.prevent_stage01_history_mutation();
create trigger opportunity_intake_records_prevent_history_mutation
  before update or delete on public.opportunity_intake_records
  for each row execute function private.prevent_stage01_history_mutation();
create trigger stage01_intake_completion_baselines_prevent_history_mutation
  before update or delete on public.stage01_intake_completion_baselines
  for each row execute function private.prevent_stage01_history_mutation();
create trigger stage01_criterion_evaluations_prevent_history_mutation
  before update or delete on public.stage01_criterion_evaluations
  for each row execute function private.prevent_stage01_history_mutation();
create trigger stage01_recommendations_prevent_history_mutation
  before update or delete on public.stage01_recommendations
  for each row execute function private.prevent_stage01_history_mutation();
create trigger stage01_clarification_returns_prevent_history_mutation
  before update or delete on public.stage01_clarification_returns
  for each row execute function private.prevent_stage01_history_mutation();

create function private.guard_stage01_lifecycle_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_fields text[];
  terminal_field text;
  old_record jsonb;
  new_record jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE';
  end if;

  old_record := pg_catalog.to_jsonb(old);
  new_record := pg_catalog.to_jsonb(new);

  case tg_table_name
    when 'workflow_node_executions' then
      allowed_fields := array[
        'phase', 'needs_revalidation', 'started_by', 'started_at', 'completed_by',
        'completed_at', 'superseded_at', 'version'
      ];
      terminal_field := 'superseded_at';
    when 'workflow_node_assignments' then
      allowed_fields := array['ended_by', 'ended_at', 'end_reason'];
      terminal_field := 'ended_at';
    when 'workflow_blockers' then
      allowed_fields := array['resolved_by', 'resolved_at', 'resolution', 'version'];
      terminal_field := 'resolved_at';
    when 'opportunity_contacts' then
      allowed_fields := array['ended_by', 'ended_at', 'end_reason'];
      terminal_field := 'ended_at';
    when 'opportunity_scopes' then
      allowed_fields := array['retired_by', 'retired_at', 'retire_reason'];
      terminal_field := 'retired_at';
    when 'opportunity_referrers' then
      allowed_fields := array['ended_by', 'ended_at', 'end_reason'];
      terminal_field := 'ended_at';
    when 'opportunity_duplicate_concerns' then
      allowed_fields := array[
        'resolution', 'canonical_opportunity_id', 'resolution_note', 'resolved_by', 'resolved_at'
      ];
      terminal_field := 'resolved_at';
    else
      raise exception using errcode = 'P0001', message = 'STAGE01_LIFECYCLE_GUARD_SCOPE_INVALID';
  end case;

  if (old_record - allowed_fields) is distinct from (new_record - allowed_fields) then
    raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE';
  end if;

  if nullif(old_record ->> terminal_field, '') is not null
     and old_record is distinct from new_record then
    raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_stage01_lifecycle_history() from public, anon, authenticated;

create trigger workflow_node_executions_guard_lifecycle_history
  before update or delete on public.workflow_node_executions
  for each row execute function private.guard_stage01_lifecycle_history();
create trigger workflow_node_assignments_guard_lifecycle_history
  before update or delete on public.workflow_node_assignments
  for each row execute function private.guard_stage01_lifecycle_history();
create trigger workflow_blockers_guard_lifecycle_history
  before update or delete on public.workflow_blockers
  for each row execute function private.guard_stage01_lifecycle_history();
create trigger opportunity_contacts_guard_lifecycle_history
  before update or delete on public.opportunity_contacts
  for each row execute function private.guard_stage01_lifecycle_history();
create trigger opportunity_scopes_guard_lifecycle_history
  before update or delete on public.opportunity_scopes
  for each row execute function private.guard_stage01_lifecycle_history();
create trigger opportunity_referrers_guard_lifecycle_history
  before update or delete on public.opportunity_referrers
  for each row execute function private.guard_stage01_lifecycle_history();
create trigger opportunity_duplicate_concerns_guard_lifecycle_history
  before update or delete on public.opportunity_duplicate_concerns
  for each row execute function private.guard_stage01_lifecycle_history();

create function private.prevent_opportunity_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DELETE_FORBIDDEN';
  return null;
end;
$$;

revoke all on function private.prevent_opportunity_delete() from public, anon, authenticated;

create trigger opportunities_prevent_delete
  before delete on public.opportunities
  for each row execute function private.prevent_opportunity_delete();

create function private.validate_stage01_intake_baseline_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.workflow_node_events as event
    where event.id = new.completion_event_id
      and event.tenant_id = new.tenant_id
      and event.company_id = new.company_id
      and event.node_execution_id = new.node_execution_id
      and event.event_type = 'completed'
      and event.payload ->> 'baselineId' = new.id::text
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_BASELINE_EVENT_INVALID';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_stage01_intake_baseline_event() from public, anon, authenticated;

create trigger stage01_intake_completion_baselines_validate_event
  before insert on public.stage01_intake_completion_baselines
  for each row execute function private.validate_stage01_intake_baseline_event();

create function private.validate_stage01_criterion_evaluation_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_evidence boolean;
begin
  has_evidence := case
    when pg_catalog.jsonb_typeof(new.evidence) = 'array'
      then pg_catalog.jsonb_array_length(new.evidence) > 0
    else false
  end;

  if nullif(pg_catalog.btrim(new.rationale), '') is null and not has_evidence then
    raise exception using errcode = 'P0001', message = 'STAGE01_EVALUATION_EVIDENCE_REQUIRED';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_stage01_criterion_evaluation_evidence() from public, anon, authenticated;

create trigger stage01_criterion_evaluations_validate_evidence
  before insert on public.stage01_criterion_evaluations
  for each row execute function private.validate_stage01_criterion_evaluation_evidence();

create function private.validate_stage01_clarification_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.stage01_recommendations as recommendation
    where recommendation.id = new.recommendation_id
      and recommendation.decision_cycle_id = new.decision_cycle_id
      and recommendation.tenant_id = new.tenant_id
      and recommendation.company_id = new.company_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'STAGE01_CLARIFICATION_RECOMMENDATION_CYCLE_MISMATCH';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_stage01_clarification_reference() from public, anon, authenticated;

create trigger stage01_clarification_returns_validate_reference
  before insert on public.stage01_clarification_returns
  for each row execute function private.validate_stage01_clarification_reference();

create function private.guard_stage01_decision_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recommendation_value text;
  recommendation_outcome text;
  old_record jsonb;
  new_record jsonb;
  mutable_fields text[] := array[
    'final_outcome',
    'final_decision_by',
    'final_decision_at',
    'final_rationale',
    'final_recommendation_id',
    'override_rationale',
    'version'
  ];
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE';
  end if;

  old_record := pg_catalog.to_jsonb(old);
  new_record := pg_catalog.to_jsonb(new);

  if (old_record - mutable_fields) is distinct from (new_record - mutable_fields) then
    raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE';
  end if;

  if old.final_outcome is not null and (
    new.final_outcome is distinct from old.final_outcome
    or new.final_decision_by is distinct from old.final_decision_by
    or new.final_decision_at is distinct from old.final_decision_at
    or new.final_rationale is distinct from old.final_rationale
    or new.final_recommendation_id is distinct from old.final_recommendation_id
    or new.override_rationale is distinct from old.override_rationale
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE';
  end if;

  if new.final_outcome is not null then
    select recommendation.recommendation
    into recommendation_value
    from public.stage01_recommendations as recommendation
    where recommendation.id = new.final_recommendation_id
      and recommendation.decision_cycle_id = new.id
      and recommendation.tenant_id = new.tenant_id
      and recommendation.company_id = new.company_id;

    if recommendation_value is null then
      raise exception using
        errcode = 'P0001',
        message = 'STAGE01_FINAL_RECOMMENDATION_CYCLE_MISMATCH';
    end if;

    recommendation_outcome := case recommendation_value
      when 'recommend_proceed' then 'proceed'
      when 'recommend_not_proceeding' then 'not_proceeding'
    end;

    if new.final_outcome = recommendation_outcome then
      if new.override_rationale is not null then
        raise exception using errcode = 'P0001', message = 'STAGE01_DECISION_OVERRIDE_INVALID';
      end if;
    elsif nullif(pg_catalog.btrim(new.override_rationale), '') is null then
      raise exception using errcode = 'P0001', message = 'STAGE01_OVERRIDE_RATIONALE_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_stage01_decision_cycle() from public, anon, authenticated;

create trigger stage01_decision_cycles_guard_history
  before update or delete on public.stage01_decision_cycles
  for each row execute function private.guard_stage01_decision_cycle();
