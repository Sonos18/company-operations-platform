-- STAGE01 CLOUD DEV FIXED CONCURRENCY FIXTURE
set local session_replication_role = replica;

delete from public.audit_events
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.stage01_intake_completion_baselines
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.stage01_clarification_returns
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.stage01_criterion_evaluations
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.stage01_recommendations
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.stage01_decision_cycles
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.workflow_node_events
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.workflow_blockers
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.workflow_node_assignments
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.workflow_node_executions
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.workflow_node_instances
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.workflow_instances
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.opportunity_duplicate_concerns
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.opportunity_intake_records
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.opportunity_referrers
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.opportunity_scopes
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.opportunity_contacts
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.contact_methods
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.contacts
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.opportunities
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.workflow_definition_snapshots
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.company_role_assignments
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.role_permissions
where role_id = '7c000000-0000-4000-8000-000000000100';
delete from public.roles
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.company_memberships
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.tenant_memberships
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.companies
where tenant_id = '7c000000-0000-4000-8000-000000000010';
delete from public.tenants
where id = '7c000000-0000-4000-8000-000000000010';
delete from auth.users
where id = '7c000000-0000-4000-8000-000000000001';

do $$
begin
  if exists (
    select 1 from public.audit_events
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.stage01_intake_completion_baselines
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.stage01_clarification_returns
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.stage01_criterion_evaluations
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.stage01_recommendations
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.stage01_decision_cycles
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.workflow_node_events
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.workflow_blockers
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.workflow_node_assignments
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.workflow_node_executions
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.workflow_node_instances
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.workflow_instances
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.opportunity_duplicate_concerns
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.opportunity_intake_records
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.opportunity_referrers
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.opportunity_scopes
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.opportunity_contacts
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.contact_methods
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.contacts
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.opportunities
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.workflow_definition_snapshots
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.company_role_assignments
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.role_permissions
    where role_id = '7c000000-0000-4000-8000-000000000100'
  ) or exists (
    select 1 from public.roles
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.company_memberships
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.tenant_memberships
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.companies
    where tenant_id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from public.tenants
    where id = '7c000000-0000-4000-8000-000000000010'
  ) or exists (
    select 1 from auth.users
    where id = '7c000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Stage 01 concurrency cleanup left namespaced fixture residue';
  end if;
end;
$$;

commit;
