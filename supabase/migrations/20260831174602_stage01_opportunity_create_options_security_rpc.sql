create function public.get_stage01_opportunity_create_options(target_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_tenant_id uuid;
  snapshot_id uuid;
  snapshot_definition jsonb;
  create_options jsonb;
begin
  select company.tenant_id
    into target_tenant_id
    from public.companies as company
   where company.id = target_company_id;

  if target_tenant_id is null
     or not private.has_company_permission(target_tenant_id, target_company_id, 'opportunity.read')
     or not private.has_company_permission(target_tenant_id, target_company_id, 'opportunity.create') then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  select snapshot.id, snapshot.definition
    into snapshot_id, snapshot_definition
    from public.workflow_definition_snapshots as snapshot
   where snapshot.tenant_id = target_tenant_id
     and snapshot.company_id = target_company_id
     and snapshot.workflow_key = 'vqh.stage01'
   order by snapshot.template_version desc
   limit 1;

  if snapshot_id is null then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE';
  end if;

  select pg_catalog.jsonb_build_object(
    'workflowKey', 'vqh.stage01',
    'publishedSnapshotId', snapshot_id,
    'taxonomies', pg_catalog.jsonb_build_object(
      'customer_type', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code', entry.value ->> 'code', 'label', entry.value ->> 'label') order by entry.ordinality)
        from pg_catalog.jsonb_array_elements(snapshot_definition -> 'taxonomies' -> 'customer_type') with ordinality as entry(value, ordinality)
      ), '[]'::jsonb),
      'lead_source', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code', entry.value ->> 'code', 'label', entry.value ->> 'label', 'behavior', pg_catalog.jsonb_build_object('requiresReferrer', coalesce((entry.value -> 'behavior' ->> 'requiresReferrer')::boolean, false))) order by entry.ordinality)
        from pg_catalog.jsonb_array_elements(snapshot_definition -> 'taxonomies' -> 'lead_source') with ordinality as entry(value, ordinality)
      ), '[]'::jsonb),
      'engagement_status', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code', entry.value ->> 'code', 'label', entry.value ->> 'label') order by entry.ordinality)
        from pg_catalog.jsonb_array_elements(snapshot_definition -> 'taxonomies' -> 'engagement_status') with ordinality as entry(value, ordinality)
      ), '[]'::jsonb),
      'budget_status', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code', entry.value ->> 'code', 'label', entry.value ->> 'label') order by entry.ordinality)
        from pg_catalog.jsonb_array_elements(snapshot_definition -> 'taxonomies' -> 'budget_status') with ordinality as entry(value, ordinality)
      ), '[]'::jsonb),
      'timeline_status', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code', entry.value ->> 'code', 'label', entry.value ->> 'label') order by entry.ordinality)
        from pg_catalog.jsonb_array_elements(snapshot_definition -> 'taxonomies' -> 'timeline_status') with ordinality as entry(value, ordinality)
      ), '[]'::jsonb),
      'priority', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code', entry.value ->> 'code', 'label', entry.value ->> 'label') order by entry.ordinality)
        from pg_catalog.jsonb_array_elements(snapshot_definition -> 'taxonomies' -> 'priority') with ordinality as entry(value, ordinality)
      ), '[]'::jsonb)
    )
  ) into create_options;

  return create_options;
end;
$$;

revoke all on function public.get_stage01_opportunity_create_options(uuid) from public, anon;
grant execute on function public.get_stage01_opportunity_create_options(uuid) to authenticated;
