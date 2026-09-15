create function private.c1_can_read_source(target_tenant_id uuid, target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_cost_settings settings
    where settings.tenant_id = target_tenant_id
      and settings.company_id = target_company_id
      and settings.enabled
  )
  and private.has_company_permission(target_tenant_id, target_company_id, 'cost.source.read');
$$;

drop policy c1_accounting_sources_select on public.accounting_sources;
drop policy c1_accounting_source_versions_select on public.accounting_source_versions;
drop policy c1_source_selections_select on public.source_selections;
drop policy c1_source_reported_figures_select on public.source_reported_figures;
drop policy c1_source_review_issues_select on public.source_review_issues;

create policy c1_accounting_sources_select on public.accounting_sources for select to authenticated using (private.c1_can_read_source(tenant_id, company_id));
create policy c1_accounting_source_versions_select on public.accounting_source_versions for select to authenticated using (private.c1_can_read_source(tenant_id, company_id));
create policy c1_source_selections_select on public.source_selections for select to authenticated using (private.c1_can_read_source(tenant_id, company_id));
create policy c1_source_reported_figures_select on public.source_reported_figures for select to authenticated using (private.c1_can_read_source(tenant_id, company_id));
create policy c1_source_review_issues_select on public.source_review_issues for select to authenticated using (private.c1_can_read_source(tenant_id, company_id));

create function private.c1_probe_cost_source_read(target_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_context jsonb;
begin
  v_context := private.c1_master_context(target_company_id, 'cost.source.read');
  return jsonb_build_object('tenantId', v_context->>'tenantId', 'companyId', target_company_id);
end;
$$;

create function private.c1_read_cost_source_hierarchy(target_company_id uuid)
returns table(
  source_selection_id uuid,
  project_id uuid,
  project_code text,
  project_name text,
  engagement_id uuid,
  engagement_code text,
  engagement_name text,
  contractor_id uuid,
  contractor_code text,
  contractor_display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_context jsonb; v_tenant_id uuid;
begin
  v_context := private.c1_master_context(target_company_id, 'cost.source.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  return query
    select
      selection.id,
      project.id, project.code, project.name,
      engagement.id, engagement.code, engagement.name,
      party.id, party.code, party.display_name
    from public.source_selections selection
    left join public.projects project on project.id = selection.mapped_project_id and project.tenant_id = selection.tenant_id and project.company_id = selection.company_id
    left join public.project_engagements engagement on engagement.id = selection.mapped_engagement_id and engagement.tenant_id = selection.tenant_id and engagement.company_id = selection.company_id
    left join public.business_parties party on party.id = selection.mapped_party_id and party.tenant_id = selection.tenant_id and party.company_id = selection.company_id
    where selection.tenant_id = v_tenant_id and selection.company_id = target_company_id;
end;
$$;

create function public.c1_probe_cost_source_read(target_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.c1_probe_cost_source_read(target_company_id); $$;

create function public.c1_read_cost_source_hierarchy(target_company_id uuid)
returns table(
  source_selection_id uuid,
  project_id uuid,
  project_code text,
  project_name text,
  engagement_id uuid,
  engagement_code text,
  engagement_name text,
  contractor_id uuid,
  contractor_code text,
  contractor_display_name text
)
language sql
stable
security definer
set search_path = ''
as $$ select * from private.c1_read_cost_source_hierarchy(target_company_id); $$;

revoke all on function private.c1_can_read_source(uuid, uuid), private.c1_probe_cost_source_read(uuid), private.c1_read_cost_source_hierarchy(uuid) from public, anon, authenticated;
grant execute on function private.c1_can_read_source(uuid, uuid) to authenticated;
revoke all on function public.c1_probe_cost_source_read(uuid), public.c1_read_cost_source_hierarchy(uuid) from public, anon, authenticated;
grant execute on function public.c1_probe_cost_source_read(uuid), public.c1_read_cost_source_hierarchy(uuid) to authenticated;
