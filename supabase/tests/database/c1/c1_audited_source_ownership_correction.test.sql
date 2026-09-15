begin;

create temporary table c1_audited_real_snapshot (snapshot jsonb not null);

do $$
begin
  if to_regclass('private.c1_source_ownership_correction_tokens') is null
     or to_regprocedure('private.c1_correct_source_selection_ownership(uuid,uuid,uuid,uuid,text)') is null
     or to_regprocedure('private.c1_correct_source_reported_figure_ownership(uuid,uuid,uuid,uuid,text)') is null then
    raise exception 'C1 audited correction runtime objects are missing';
  end if;
  if not exists (select 1 from pg_trigger trigger where trigger.tgname = 'c1_source_selections_immutable' and trigger.tgrelid = 'public.source_selections'::regclass and not trigger.tgisinternal)
     or not exists (select 1 from pg_trigger trigger where trigger.tgname = 'c1_source_reported_figures_immutable' and trigger.tgrelid = 'public.source_reported_figures'::regclass and not trigger.tgisinternal) then
    raise exception 'C1 audited correction immutable trigger is missing';
  end if;
  if has_table_privilege('public', 'private.c1_source_ownership_correction_tokens', 'insert')
     or has_table_privilege('anon', 'private.c1_source_ownership_correction_tokens', 'insert')
     or has_table_privilege('authenticated', 'private.c1_source_ownership_correction_tokens', 'insert') then
    raise exception 'C1 audited correction token table ACL is unsafe';
  end if;
end;
$$;

do $$
declare
  a_tenant constant uuid := 'c1020000-0000-4000-8000-000000000010';
  a_company constant uuid := 'c1020000-0000-4000-8000-000000000020';
  b_tenant constant uuid := 'c1030000-0000-4000-8000-000000000010';
  b_company constant uuid := 'c1030000-0000-4000-8000-000000000020';
  corrector constant uuid := 'c1020000-0000-4000-8000-000000000901';
  denied_actor constant uuid := 'c1020000-0000-4000-8000-000000000902';
  old_project constant uuid := 'c1020000-0000-4000-8000-000000000101';
  new_project constant uuid := 'c1020000-0000-4000-8000-000000000102';
  foreign_project constant uuid := 'c1030000-0000-4000-8000-000000000101';
  old_party constant uuid := 'c1020000-0000-4000-8000-000000000201';
  new_party constant uuid := 'c1020000-0000-4000-8000-000000000202';
  foreign_party constant uuid := 'c1030000-0000-4000-8000-000000000201';
  old_engagement constant uuid := 'c1020000-0000-4000-8000-000000000301';
  new_engagement constant uuid := 'c1020000-0000-4000-8000-000000000302';
  foreign_engagement constant uuid := 'c1030000-0000-4000-8000-000000000301';
  old_component constant uuid := 'c1020000-0000-4000-8000-000000000401';
  source_id constant uuid := 'c1020000-0000-4000-8000-000000000501';
  source_version_id constant uuid := 'c1020000-0000-4000-8000-000000000502';
  import_run_id constant uuid := 'c1020000-0000-4000-8000-000000000503';
  selection_id constant uuid := 'c1020000-0000-4000-8000-000000000601';
  failed_selection_id constant uuid := 'c1020000-0000-4000-8000-000000000602';
  figure_id constant uuid := 'c1020000-0000-4000-8000-000000000701';
  v_real_before jsonb;
  v_real_after jsonb;
  v_real_selection_count integer;
  v_real_figure_count integer;
  v_audit_count integer;
begin
  select pg_catalog.jsonb_build_object(
    'projects', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(project) order by project.id) from public.projects project where project.id in ('7e7e3904-d53b-4337-9360-22256887474a'::uuid, '22727545-1534-4c1a-9378-06969cb40f97'::uuid)),
    'party', (select pg_catalog.to_jsonb(party) from public.business_parties party where party.id = '087485b2-d63f-45a3-90cf-5693abbf25d9'::uuid),
    'engagement', (select pg_catalog.to_jsonb(engagement) from public.project_engagements engagement where engagement.id = '83cbc0d2-568b-4b17-b5a8-779f218dbd37'::uuid),
    'selections', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(selection) order by selection.id) from public.source_selections selection where selection.mapped_party_id = '087485b2-d63f-45a3-90cf-5693abbf25d9'::uuid and selection.mapped_engagement_id = '83cbc0d2-568b-4b17-b5a8-779f218dbd37'::uuid),
    'figures', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(figure) order by figure.id) from public.source_reported_figures figure where figure.party_id = '087485b2-d63f-45a3-90cf-5693abbf25d9'::uuid and figure.engagement_id = '83cbc0d2-568b-4b17-b5a8-779f218dbd37'::uuid)
  ) into v_real_before;
  select pg_catalog.count(*) into v_real_selection_count from public.source_selections selection where selection.mapped_party_id = '087485b2-d63f-45a3-90cf-5693abbf25d9'::uuid and selection.mapped_engagement_id = '83cbc0d2-568b-4b17-b5a8-779f218dbd37'::uuid;
  select pg_catalog.count(*) into v_real_figure_count from public.source_reported_figures figure where figure.party_id = '087485b2-d63f-45a3-90cf-5693abbf25d9'::uuid and figure.engagement_id = '83cbc0d2-568b-4b17-b5a8-779f218dbd37'::uuid;
  if v_real_selection_count <> 11 or v_real_figure_count <> 22 or v_real_before->'projects' is null or v_real_before->'party' is null or v_real_before->'engagement' is null then
    raise exception 'C1 audited correction real-object snapshot is incomplete';
  end if;
  insert into c1_audited_real_snapshot(snapshot) values (v_real_before);

  insert into auth.users(id, email) values
    (corrector, 'c1-audited-corrector@taskovia.invalid'),
    (denied_actor, 'c1-audited-denied@taskovia.invalid');
  insert into public.tenants(id, code, name) values
    (a_tenant, 'c1-audited-a', 'C1 audited correction A'),
    (b_tenant, 'c1-audited-b', 'C1 audited correction B');
  insert into public.companies(id, tenant_id, code, name) values
    (a_company, a_tenant, 'C1-AUDITED-A', 'C1 audited correction A'),
    (b_company, b_tenant, 'C1-AUDITED-B', 'C1 audited correction B');
  insert into public.tenant_memberships(user_id, tenant_id, roles) values
    (corrector, a_tenant, array['member']),
    (denied_actor, a_tenant, array['member']);
  insert into public.company_memberships(user_id, tenant_id, company_id, roles, is_active) values
    (corrector, a_tenant, a_company, array['member'], true),
    (denied_actor, a_tenant, a_company, array['member'], true);
  insert into public.roles(id, tenant_id, company_id, code, name, description, is_system) values
    ('c1020000-0000-4000-8000-000000000911', a_tenant, a_company, 'c1_audited_corrector', 'C1 audited corrector', 'Synthetic cost correction capability', false),
    ('c1020000-0000-4000-8000-000000000912', a_tenant, a_company, 'c1_audited_denied', 'C1 audited denied', 'Synthetic denied capability', false);
  insert into public.role_permissions(role_id, permission_code) values
    ('c1020000-0000-4000-8000-000000000911', 'cost.correct');
  insert into public.company_role_assignments(tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values
    (a_tenant, a_company, corrector, 'c1020000-0000-4000-8000-000000000911', corrector, 'Synthetic audited correction fixture'),
    (a_tenant, a_company, denied_actor, 'c1020000-0000-4000-8000-000000000912', corrector, 'Synthetic audited correction fixture');
  insert into public.company_cost_settings(company_id, tenant_id, enabled, created_by) values
    (a_company, a_tenant, true, corrector);

  insert into public.projects(id, tenant_id, company_id, code, name, origin, created_by) values
    (old_project, a_tenant, a_company, 'C1-AUDITED-OLD', 'C1 audited old project', 'manual', corrector),
    (new_project, a_tenant, a_company, 'C1-AUDITED-NEW', 'C1 audited new project', 'manual', corrector),
    (foreign_project, b_tenant, b_company, 'C1-AUDITED-FOREIGN', 'C1 audited foreign project', 'manual', corrector);
  insert into public.business_parties(id, tenant_id, company_id, code, display_name, party_kind, created_by) values
    (old_party, a_tenant, a_company, 'C1-AUDITED-OLD', 'C1 audited old party', 'organization', corrector),
    (new_party, a_tenant, a_company, 'C1-AUDITED-NEW', 'C1 audited new party', 'organization', corrector),
    (foreign_party, b_tenant, b_company, 'C1-AUDITED-FOREIGN', 'C1 audited foreign party', 'organization', corrector);
  insert into public.project_engagements(id, tenant_id, company_id, project_id, party_id, code, name, currency_code, created_by) values
    (old_engagement, a_tenant, a_company, old_project, old_party, 'C1-AUDITED-OLD', 'C1 audited old engagement', 'VND', corrector),
    (new_engagement, a_tenant, a_company, new_project, new_party, 'C1-AUDITED-NEW', 'C1 audited new engagement', 'VND', corrector),
    (foreign_engagement, b_tenant, b_company, foreign_project, foreign_party, 'C1-AUDITED-FOREIGN', 'C1 audited foreign engagement', 'VND', corrector);
  insert into public.engagement_components(id, tenant_id, company_id, engagement_id, code, name, pricing_method, created_by) values
    (old_component, a_tenant, a_company, old_engagement, 'C1-AUDITED-OLD', 'C1 audited old component', 'fixed', corrector);

  insert into public.controlled_import_runs(id, tenant_id, company_id, run_id, actor_id, idempotency_key, payload_digest, manifest_digest, input_digests, workbook_family, adapter_id, adapter_version, manifest_snapshot, request_id) values
    (import_run_id, a_tenant, a_company, 'c1020000-0000-4000-8000-000000000504', corrector, 'c1020000-0000-4000-8000-000000000505', repeat('a', 64), repeat('b', 64), array[repeat('c', 64)], 'c1-audited', 'c1-audited', '1.0.0', '{}'::jsonb, 'c1020000-0000-4000-8000-000000000506');
  insert into public.accounting_sources(id, tenant_id, company_id, code, title, source_system, created_by) values
    (source_id, a_tenant, a_company, 'C1-AUDITED-SOURCE', 'C1 audited source', 'synthetic', corrector);
  insert into public.accounting_source_versions(id, tenant_id, company_id, source_id, import_run_id, version_no, input_file_identity, input_file_sha256, original_filename, created_by) values
    (source_version_id, a_tenant, a_company, source_id, import_run_id, 1, 'c1-audited.xlsx', repeat('d', 64), 'c1-audited.xlsx', corrector);
  insert into public.source_selections(id, tenant_id, company_id, source_version_id, import_run_id, locator, locator_key, mapping_state, reviewed_mapping, mapped_project_id, mapped_party_id, mapped_engagement_id, mapped_component_id, observed_labels, raw_values, unresolved_issues, created_by) values
    (selection_id, a_tenant, a_company, source_version_id, import_run_id, '{"kind":"logical_section"}'::jsonb, 'c1-audited-selection', 'confirmed', '{}'::jsonb, old_project, old_party, old_engagement, null, array['C1 audited selection'], array['source fact'], array[]::text[], corrector),
    (failed_selection_id, a_tenant, a_company, source_version_id, import_run_id, '{"kind":"logical_section"}'::jsonb, 'c1-audited-failed-selection', 'confirmed', '{}'::jsonb, old_project, old_party, old_engagement, old_component, array['C1 audited failure selection'], array['source fact'], array[]::text[], corrector);
  insert into public.source_reported_figures(id, tenant_id, company_id, source_selection_id, import_run_id, figure_identity, label, raw_value_text, value_state, amount_text, amount, metric_kind, basis, rounding_basis, period_basis, mapping_state, reviewed_mapping, project_id, party_id, engagement_id, scope_kind, scope_description, confirmation, created_by) values
    (figure_id, a_tenant, a_company, selection_id, import_run_id, repeat('e', 64), 'C1 audited figure', '100', 'known', '100', 100, 'cost_total', 'net', 'exact', 'unknown', 'confirmed', '{}'::jsonb, old_project, old_party, old_engagement, 'whole_project', 'Synthetic audited correction fixture', 'unverified', corrector);

  if pg_catalog.has_function_privilege('public', 'private.c1_correct_source_selection_ownership(uuid,uuid,uuid,uuid,text)', 'execute')
     or pg_catalog.has_function_privilege('anon', 'private.c1_correct_source_selection_ownership(uuid,uuid,uuid,uuid,text)', 'execute')
     or pg_catalog.has_function_privilege('authenticated', 'private.c1_correct_source_selection_ownership(uuid,uuid,uuid,uuid,text)', 'execute')
     or pg_catalog.has_function_privilege('authenticated', 'private.c1_correct_source_reported_figure_ownership(uuid,uuid,uuid,uuid,text)', 'execute') then
    raise exception 'C1 audited correction private function ACL is unsafe';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"c1020000-0000-4000-8000-000000000901","role":"authenticated"}', true);

do $$
begin
  begin
    update public.source_selections set mapped_project_id = 'c1020000-0000-4000-8000-000000000102'::uuid where id = 'c1020000-0000-4000-8000-000000000601'::uuid;
    raise exception 'C1 direct source selection correction unexpectedly succeeded';
  exception when sqlstate 'P0001' then if sqlerrm <> 'HISTORY_IMMUTABLE' then raise; end if; end;
  begin
    update public.source_reported_figures set project_id = 'c1020000-0000-4000-8000-000000000102'::uuid where id = 'c1020000-0000-4000-8000-000000000701'::uuid;
    raise exception 'C1 direct source figure correction unexpectedly succeeded';
  exception when sqlstate 'P0001' then if sqlerrm <> 'HISTORY_IMMUTABLE' then raise; end if; end;
  begin
    delete from public.source_selections where id = 'c1020000-0000-4000-8000-000000000601'::uuid;
    raise exception 'C1 direct source selection delete unexpectedly succeeded';
  exception when sqlstate 'P0001' then if sqlerrm <> 'HISTORY_IMMUTABLE' then raise; end if; end;
  begin
    delete from public.source_reported_figures where id = 'c1020000-0000-4000-8000-000000000701'::uuid;
    raise exception 'C1 direct source figure delete unexpectedly succeeded';
  exception when sqlstate 'P0001' then if sqlerrm <> 'HISTORY_IMMUTABLE' then raise; end if; end;
end;
$$;

set local role authenticated;
do $$
begin
  begin
    perform private.c1_correct_source_selection_ownership('c1020000-0000-4000-8000-000000000601'::uuid, 'c1020000-0000-4000-8000-000000000102'::uuid, 'c1020000-0000-4000-8000-000000000202'::uuid, 'c1020000-0000-4000-8000-000000000302'::uuid, 'direct access denied');
    raise exception 'C1 authenticated actor executed private correction function';
  exception when insufficient_privilege then null; end;
  begin
    insert into private.c1_source_ownership_correction_tokens(record_type, record_id, transaction_id, backend_pid, actor_user_id, audit_event_id)
    values ('source_selection', 'c1020000-0000-4000-8000-000000000601'::uuid, txid_current(), pg_backend_pid(), 'c1020000-0000-4000-8000-000000000901'::uuid, 0);
    raise exception 'C1 authenticated actor created correction token';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

do $$
declare v_audit_count integer;
begin
  perform private.c1_correct_source_selection_ownership('c1020000-0000-4000-8000-000000000601'::uuid, 'c1020000-0000-4000-8000-000000000102'::uuid, 'c1020000-0000-4000-8000-000000000202'::uuid, 'c1020000-0000-4000-8000-000000000302'::uuid, 'selection correction');
  if not exists (select 1 from public.source_selections selection where selection.id = 'c1020000-0000-4000-8000-000000000601'::uuid and selection.mapped_project_id = 'c1020000-0000-4000-8000-000000000102'::uuid and selection.mapped_party_id = 'c1020000-0000-4000-8000-000000000202'::uuid and selection.mapped_engagement_id = 'c1020000-0000-4000-8000-000000000302'::uuid and selection.locator = '{"kind":"logical_section"}'::jsonb and selection.raw_values = array['source fact']) then
    raise exception 'C1 audited selection correction did not preserve source facts';
  end if;
  if not exists (select 1 from public.audit_events audit where audit.resource_type = 'source_selection' and audit.resource_id = 'c1020000-0000-4000-8000-000000000601' and audit.actor_id = 'c1020000-0000-4000-8000-000000000901'::uuid and audit.before_summary @> '{"projectId":"c1020000-0000-4000-8000-000000000101","partyId":"c1020000-0000-4000-8000-000000000201","engagementId":"c1020000-0000-4000-8000-000000000301"}'::jsonb and audit.after_summary @> '{"projectId":"c1020000-0000-4000-8000-000000000102","partyId":"c1020000-0000-4000-8000-000000000202","engagementId":"c1020000-0000-4000-8000-000000000302","reason":"selection correction"}'::jsonb and audit.created_at is not null) then
    raise exception 'C1 audited selection correction audit is incomplete';
  end if;
  perform private.c1_correct_source_reported_figure_ownership('c1020000-0000-4000-8000-000000000701'::uuid, 'c1020000-0000-4000-8000-000000000102'::uuid, 'c1020000-0000-4000-8000-000000000202'::uuid, 'c1020000-0000-4000-8000-000000000302'::uuid, 'figure correction');
  if not exists (select 1 from public.source_reported_figures figure where figure.id = 'c1020000-0000-4000-8000-000000000701'::uuid and figure.project_id = 'c1020000-0000-4000-8000-000000000102'::uuid and figure.party_id = 'c1020000-0000-4000-8000-000000000202'::uuid and figure.engagement_id = 'c1020000-0000-4000-8000-000000000302'::uuid and figure.label = 'C1 audited figure' and figure.raw_value_text = '100') then
    raise exception 'C1 audited figure correction did not preserve source facts';
  end if;
  if not exists (select 1 from public.audit_events audit where audit.resource_type = 'source_reported_figure' and audit.resource_id = 'c1020000-0000-4000-8000-000000000701' and audit.actor_id = 'c1020000-0000-4000-8000-000000000901'::uuid and audit.before_summary @> '{"projectId":"c1020000-0000-4000-8000-000000000101","partyId":"c1020000-0000-4000-8000-000000000201","engagementId":"c1020000-0000-4000-8000-000000000301"}'::jsonb and audit.after_summary @> '{"projectId":"c1020000-0000-4000-8000-000000000102","partyId":"c1020000-0000-4000-8000-000000000202","engagementId":"c1020000-0000-4000-8000-000000000302","reason":"figure correction"}'::jsonb and audit.created_at is not null) then
    raise exception 'C1 audited figure correction audit is incomplete';
  end if;
  if exists (select 1 from private.c1_source_ownership_correction_tokens token where token.record_id in ('c1020000-0000-4000-8000-000000000601'::uuid, 'c1020000-0000-4000-8000-000000000701'::uuid)) then
    raise exception 'C1 successful correction left token residue';
  end if;

  select count(*) into v_audit_count from public.audit_events audit where audit.resource_id = 'c1020000-0000-4000-8000-000000000601';
  begin
    perform private.c1_correct_source_selection_ownership('c1020000-0000-4000-8000-000000000601'::uuid, 'c1020000-0000-4000-8000-000000000101'::uuid, 'c1020000-0000-4000-8000-000000000201'::uuid, 'c1020000-0000-4000-8000-000000000301'::uuid, '   ');
    raise exception 'C1 empty correction reason unexpectedly succeeded';
  exception when sqlstate 'P0001' then if sqlerrm <> 'INPUT_INVALID' then raise; end if; end;
  if (select count(*) from public.audit_events audit where audit.resource_id = 'c1020000-0000-4000-8000-000000000601') <> v_audit_count then
    raise exception 'C1 empty correction reason left audit residue';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"c1020000-0000-4000-8000-000000000902","role":"authenticated"}', true);
do $$
declare v_audit_count integer; v_real_before jsonb; v_real_after jsonb;
begin
  select count(*) into v_audit_count from public.audit_events audit where audit.resource_id = 'c1020000-0000-4000-8000-000000000601';
  begin
    perform private.c1_correct_source_selection_ownership('c1020000-0000-4000-8000-000000000601'::uuid, 'c1020000-0000-4000-8000-000000000101'::uuid, 'c1020000-0000-4000-8000-000000000201'::uuid, 'c1020000-0000-4000-8000-000000000301'::uuid, 'unauthorized correction');
    raise exception 'C1 unauthorized correction unexpectedly succeeded';
  exception when sqlstate 'P0001' then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
  if (select count(*) from public.audit_events audit where audit.resource_id = 'c1020000-0000-4000-8000-000000000601') <> v_audit_count then
    raise exception 'C1 unauthorized correction left audit residue';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"c1020000-0000-4000-8000-000000000901","role":"authenticated"}', true);
do $$
declare v_audit_count integer; v_real_before jsonb; v_real_after jsonb;
begin
  select count(*) into v_audit_count from public.audit_events audit where audit.resource_id = 'c1020000-0000-4000-8000-000000000601';
  begin
    perform private.c1_correct_source_selection_ownership('c1020000-0000-4000-8000-000000000601'::uuid, 'c1030000-0000-4000-8000-000000000101'::uuid, 'c1030000-0000-4000-8000-000000000201'::uuid, 'c1030000-0000-4000-8000-000000000301'::uuid, 'cross company correction');
    raise exception 'C1 cross-company correction unexpectedly succeeded';
  exception when sqlstate 'P0001' then if sqlerrm <> 'RESOURCE_NOT_FOUND' then raise; end if; end;
  if (select count(*) from public.audit_events audit where audit.resource_id = 'c1020000-0000-4000-8000-000000000601') <> v_audit_count then
    raise exception 'C1 cross-company correction left audit residue';
  end if;
  begin
    perform private.c1_correct_source_selection_ownership('c1020000-0000-4000-8000-000000000602'::uuid, 'c1020000-0000-4000-8000-000000000102'::uuid, 'c1020000-0000-4000-8000-000000000202'::uuid, 'c1020000-0000-4000-8000-000000000302'::uuid, 'force foreign-key failure');
    raise exception 'C1 failed correction unexpectedly succeeded';
  exception when foreign_key_violation then null; end;
  if not exists (select 1 from public.source_selections selection where selection.id = 'c1020000-0000-4000-8000-000000000602'::uuid and selection.mapped_project_id = 'c1020000-0000-4000-8000-000000000101'::uuid and selection.mapped_party_id = 'c1020000-0000-4000-8000-000000000201'::uuid and selection.mapped_engagement_id = 'c1020000-0000-4000-8000-000000000301'::uuid) then
    raise exception 'C1 failed correction changed ownership';
  end if;
  if exists (select 1 from public.audit_events audit where audit.resource_id = 'c1020000-0000-4000-8000-000000000602') or exists (select 1 from private.c1_source_ownership_correction_tokens token where token.record_id = 'c1020000-0000-4000-8000-000000000602'::uuid) then
    raise exception 'C1 failed correction left audit or token residue';
  end if;
  begin
    update public.source_reported_figures set label = 'immutable mutation' where id = 'c1020000-0000-4000-8000-000000000701'::uuid;
    raise exception 'C1 immutable figure field mutation unexpectedly succeeded';
  exception when sqlstate 'P0001' then if sqlerrm <> 'HISTORY_IMMUTABLE' then raise; end if; end;

  select pg_catalog.jsonb_build_object(
    'projects', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(project) order by project.id) from public.projects project where project.id in ('7e7e3904-d53b-4337-9360-22256887474a'::uuid, '22727545-1534-4c1a-9378-06969cb40f97'::uuid)),
    'party', (select pg_catalog.to_jsonb(party) from public.business_parties party where party.id = '087485b2-d63f-45a3-90cf-5693abbf25d9'::uuid),
    'engagement', (select pg_catalog.to_jsonb(engagement) from public.project_engagements engagement where engagement.id = '83cbc0d2-568b-4b17-b5a8-779f218dbd37'::uuid),
    'selections', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(selection) order by selection.id) from public.source_selections selection where selection.mapped_party_id = '087485b2-d63f-45a3-90cf-5693abbf25d9'::uuid and selection.mapped_engagement_id = '83cbc0d2-568b-4b17-b5a8-779f218dbd37'::uuid),
    'figures', (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(figure) order by figure.id) from public.source_reported_figures figure where figure.party_id = '087485b2-d63f-45a3-90cf-5693abbf25d9'::uuid and figure.engagement_id = '83cbc0d2-568b-4b17-b5a8-779f218dbd37'::uuid)
  ) into v_real_after;
  select snapshot into v_real_before from c1_audited_real_snapshot;
  if v_real_after is distinct from v_real_before then
    raise exception 'C1 audited correction changed real Yong Mei state';
  end if;
end;
$$;

select 'C1_AUDITED_SOURCE_OWNERSHIP_CORRECTION_COMPLETE' as c1_fixture_completion;

rollback;
