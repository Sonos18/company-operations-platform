begin;

create temporary table c1_import_security_fixture (
  label text primary key,
  company_id uuid not null,
  request jsonb not null,
  payload_digest text not null,
  result jsonb
) on commit drop;
grant select, update on c1_import_security_fixture to authenticated;

do $$
declare
  v_tenant_a constant uuid := 'c1000000-0000-4000-8000-000000000010';
  v_company_a1 constant uuid := 'c1000000-0000-4000-8000-000000000020';
  v_company_a2 constant uuid := 'c1000000-0000-4000-8000-000000000021';
  v_tenant_b constant uuid := 'c1010000-0000-4000-8000-000000000010';
  v_company_b1 constant uuid := 'c1010000-0000-4000-8000-000000000020';
  v_manifest jsonb;
  v_manifest_digest text;
  v_payload_digest text;
begin
  insert into private.controlled_import_adapter_versions(workbook_family, adapter_id, adapter_version)
  values ('synthetic-security-v1', 'synthetic-security', '1.0.0');
  insert into auth.users(id, email) values
    ('c1000000-0000-4000-8000-000000000901', 'c1-security-importer@taskovia.invalid'),
    ('c1000000-0000-4000-8000-000000000902', 'c1-security-viewer@taskovia.invalid'),
    ('c1000000-0000-4000-8000-000000000903', 'c1-security-project-only@taskovia.invalid');
  insert into public.tenants(id, code, name) values
    (v_tenant_a, 'c1-security-a', 'C1 security tenant A'),
    (v_tenant_b, 'c1-security-b', 'C1 security tenant B');
  insert into public.companies(id, tenant_id, code, name) values
    (v_company_a1, v_tenant_a, 'C1-SECURITY-A1', 'C1 security company A1'),
    (v_company_a2, v_tenant_a, 'C1-SECURITY-A2', 'C1 security company A2'),
    (v_company_b1, v_tenant_b, 'C1-SECURITY-B1', 'C1 security company B1');
  insert into public.tenant_memberships(user_id, tenant_id, roles) values
    ('c1000000-0000-4000-8000-000000000901', v_tenant_a, array['member']),
    ('c1000000-0000-4000-8000-000000000902', v_tenant_a, array['member']),
    ('c1000000-0000-4000-8000-000000000903', v_tenant_a, array['member']);
  insert into public.company_memberships(user_id, tenant_id, company_id, roles, is_active) values
    ('c1000000-0000-4000-8000-000000000901', v_tenant_a, v_company_a1, array['member'], true),
    ('c1000000-0000-4000-8000-000000000901', v_tenant_a, v_company_a2, array['member'], true),
    ('c1000000-0000-4000-8000-000000000902', v_tenant_a, v_company_a1, array['member'], true),
    ('c1000000-0000-4000-8000-000000000903', v_tenant_a, v_company_a1, array['member'], true);
  insert into public.roles(id, tenant_id, company_id, code, name, description, is_system) values
    ('c1000000-0000-4000-8000-000000000911', v_tenant_a, v_company_a1, 'c1_security_importer', 'C1 security importer', 'Synthetic source and prepare capability', false),
    ('c1000000-0000-4000-8000-000000000912', v_tenant_a, v_company_a1, 'c1_security_viewer', 'C1 security viewer', 'Synthetic source-only capability', false),
    ('c1000000-0000-4000-8000-000000000913', v_tenant_a, v_company_a1, 'c1_security_project', 'C1 security project reader', 'Synthetic project-only capability', false),
    ('c1000000-0000-4000-8000-000000000921', v_tenant_a, v_company_a2, 'c1_security_disabled_importer', 'C1 disabled importer', 'Synthetic disabled-company capability', false);
  insert into public.role_permissions(role_id, permission_code) values
    ('c1000000-0000-4000-8000-000000000911', 'cost.source.read'),
    ('c1000000-0000-4000-8000-000000000911', 'cost.prepare'),
    ('c1000000-0000-4000-8000-000000000912', 'cost.source.read'),
    ('c1000000-0000-4000-8000-000000000913', 'project.read'),
    ('c1000000-0000-4000-8000-000000000921', 'cost.source.read'),
    ('c1000000-0000-4000-8000-000000000921', 'cost.prepare');
  insert into public.company_role_assignments(tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values
    (v_tenant_a, v_company_a1, 'c1000000-0000-4000-8000-000000000901', 'c1000000-0000-4000-8000-000000000911', 'c1000000-0000-4000-8000-000000000901', 'Synthetic C1 security fixture'),
    (v_tenant_a, v_company_a1, 'c1000000-0000-4000-8000-000000000902', 'c1000000-0000-4000-8000-000000000912', 'c1000000-0000-4000-8000-000000000901', 'Synthetic C1 security fixture'),
    (v_tenant_a, v_company_a1, 'c1000000-0000-4000-8000-000000000903', 'c1000000-0000-4000-8000-000000000913', 'c1000000-0000-4000-8000-000000000901', 'Synthetic C1 security fixture'),
    (v_tenant_a, v_company_a2, 'c1000000-0000-4000-8000-000000000901', 'c1000000-0000-4000-8000-000000000921', 'c1000000-0000-4000-8000-000000000901', 'Synthetic C1 security fixture');
  insert into public.company_cost_settings(company_id, tenant_id, enabled, created_by) values
    (v_company_a1, v_tenant_a, true, 'c1000000-0000-4000-8000-000000000901'),
    (v_company_a2, v_tenant_a, false, 'c1000000-0000-4000-8000-000000000901');

  insert into public.accounting_sources(tenant_id, company_id, code, title, source_system, created_by) values
    (v_tenant_a, v_company_a2, 'C1-SECURITY-A2-SOURCE', 'Synthetic A2 source', 'synthetic', 'c1000000-0000-4000-8000-000000000901'),
    (v_tenant_b, v_company_b1, 'C1-SECURITY-B1-SOURCE', 'Synthetic B1 source', 'synthetic', 'c1000000-0000-4000-8000-000000000901');

  v_manifest := jsonb_build_object(
    'schemaVersion', '1.2', 'workbookFamily', 'synthetic-security-v1', 'adapter', jsonb_build_object('id', 'synthetic-security', 'version', '1.0.0'), 'targetCompanyId', v_company_a1,
    'inputs', jsonb_build_array(jsonb_build_object('fileIdentity', 'security.xlsx', 'sha256', repeat('c', 64), 'originalFilename', 'security.xlsx')),
    'sources', jsonb_build_array(jsonb_build_object('id', 'security-source', 'code', 'C1-SECURITY-A1-SOURCE', 'title', 'Synthetic A1 source', 'sourceSystem', 'synthetic')),
    'sourceVersions', jsonb_build_array(jsonb_build_object('id', 'security-source-v1', 'sourceId', 'security-source', 'inputFileIdentity', 'security.xlsx', 'inputFileSha256', repeat('c', 64), 'originalFilename', 'security.xlsx', 'rawFileReference', null, 'sourceVersionLabel', null, 'sourcePeriodText', null, 'sourceAsOfText', null)),
    'sections', jsonb_build_array(jsonb_build_object('id', 'security-section', 'sourceVersionId', 'security-source-v1', 'inputSha256', repeat('c', 64), 'locator', jsonb_build_object('kind', 'logical_section', 'section', 'Security section'), 'mapping', jsonb_build_object('state', 'pending'), 'observedLabels', jsonb_build_array('Security'), 'rawValues', jsonb_build_array('private-value'), 'unresolvedIssues', jsonb_build_array('unknown scope'))),
    'figures', '[]'::jsonb, 'reviewIssues', '[]'::jsonb, 'duplicateCandidates', '[]'::jsonb,
    'expected', jsonb_build_object('sources', 1, 'versions', 1, 'sections', 1, 'figures', 0, 'reviewIssues', 0)
  );
  v_manifest_digest := encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(v_manifest), 'UTF8'), 'sha256'), 'hex');
  v_payload_digest := encode(extensions.digest(convert_to('c1000000-0000-4000-8000-000000000060|' || v_manifest_digest || '|' || repeat('c', 64) || '|' || v_manifest_digest, 'UTF8'), 'sha256'), 'hex');
  insert into c1_import_security_fixture(label, company_id, request, payload_digest) values
    ('enabled', v_company_a1, jsonb_build_object('runId', 'c1000000-0000-4000-8000-000000000060', 'idempotencyKey', 'c1000000-0000-4000-8000-000000000061', 'approvedManifestDigest', v_manifest_digest, 'actualInputDigests', jsonb_build_array(repeat('c',64)), 'manifest', v_manifest), v_payload_digest);

  v_manifest := jsonb_set(v_manifest, '{targetCompanyId}', to_jsonb(v_company_a2::text));
  v_manifest_digest := encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(v_manifest), 'UTF8'), 'sha256'), 'hex');
  v_payload_digest := encode(extensions.digest(convert_to('c1000000-0000-4000-8000-000000000062|' || v_manifest_digest || '|' || repeat('c', 64) || '|' || v_manifest_digest, 'UTF8'), 'sha256'), 'hex');
  insert into c1_import_security_fixture(label, company_id, request, payload_digest) values
    ('disabled', v_company_a2, jsonb_build_object('runId', 'c1000000-0000-4000-8000-000000000062', 'idempotencyKey', 'c1000000-0000-4000-8000-000000000063', 'approvedManifestDigest', v_manifest_digest, 'actualInputDigests', jsonb_build_array(repeat('c',64)), 'manifest', v_manifest), v_payload_digest);
end;
$$;

do $$
declare v_function_id oid;
begin
  foreach v_function_id in array array['public.c1_persist_controlled_import(uuid,jsonb,text,uuid)'::regprocedure, 'public.c1_get_controlled_import_result(uuid,uuid)'::regprocedure] loop
    if pg_catalog.has_function_privilege('anon', v_function_id, 'execute') or not pg_catalog.has_function_privilege('authenticated', v_function_id, 'execute') then raise exception 'C1 controlled-import public RPC ACL failed for %', v_function_id::regprocedure; end if;
  end loop;
  foreach v_function_id in array array['private.c1_can_read_import_draft(uuid,uuid)'::regprocedure, 'private.c1_jsonb_canonical_text(jsonb)'::regprocedure, 'private.c1_jsonb_is_string_array(jsonb)'::regprocedure, 'private.c1_assert_controlled_import_mapping(uuid,uuid,jsonb)'::regprocedure, 'private.c1_normalize_import_cell_range(text)'::regprocedure, 'private.c1_persist_controlled_import(uuid,jsonb,text,uuid)'::regprocedure, 'private.c1_get_controlled_import_result(uuid,uuid)'::regprocedure] loop
    if pg_catalog.has_function_privilege('anon', v_function_id, 'execute') then raise exception 'C1 controlled-import private helper anon ACL failed for %', v_function_id::regprocedure; end if;
    if v_function_id <> 'private.c1_can_read_import_draft(uuid,uuid)'::regprocedure and pg_catalog.has_function_privilege('authenticated', v_function_id, 'execute') then raise exception 'C1 controlled-import private helper authenticated ACL failed for %', v_function_id::regprocedure; end if;
  end loop;
  if not pg_catalog.has_function_privilege('authenticated', 'private.c1_can_read_import_draft(uuid,uuid)', 'execute') then raise exception 'C1 RLS helper is not executable by authenticated'; end if;
end;
$$;

set local role anon;
do $$ begin
  begin perform public.c1_get_controlled_import_result('c1000000-0000-4000-8000-000000000020', 'c1000000-0000-4000-8000-000000000060'); raise exception 'C1 anon executed controlled-import result RPC'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
update c1_import_security_fixture fixture set result = public.c1_persist_controlled_import(fixture.company_id, fixture.request, fixture.payload_digest, 'c1000000-0000-4000-8000-000000000071') where fixture.label = 'enabled';
do $$ begin
  if (select count(*) from public.controlled_import_runs) <> 1 or (select count(*) from public.accounting_sources) <> 1 or (select count(*) from public.cost_document_events where resource_type = 'controlled_import_run') <> 1 then raise exception 'C1 authorized importer visibility failed'; end if;
  if exists (select 1 from public.accounting_sources source where source.code in ('C1-SECURITY-A2-SOURCE', 'C1-SECURITY-B1-SOURCE')) then raise exception 'C1 importer can read same-tenant or cross-tenant source'; end if;
  begin insert into public.accounting_sources(tenant_id, company_id, code, title, source_system, created_by) values ('c1000000-0000-4000-8000-000000000010', 'c1000000-0000-4000-8000-000000000020', 'C1-DIRECT-WRITE', 'Denied', 'synthetic', 'c1000000-0000-4000-8000-000000000901'); raise exception 'C1 authenticated direct source write succeeded'; exception when insufficient_privilege then null; end;
  begin perform private.c1_jsonb_canonical_text('{}'::jsonb); raise exception 'C1 authenticated actor executed private helper'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.audit_events; raise exception 'C1 source importer read broad audit table'; exception when insufficient_privilege then null; end;
end $$;
do $$ begin
  begin perform public.c1_persist_controlled_import(fixture.company_id, fixture.request, fixture.payload_digest, 'c1000000-0000-4000-8000-000000000072') from c1_import_security_fixture fixture where fixture.label = 'disabled'; raise exception 'C1 disabled module import succeeded'; exception when sqlstate 'P0001' then if sqlerrm <> 'MODULE_DISABLED' then raise; end if; end;
  begin perform public.c1_persist_controlled_import('c1000000-0000-4000-8000-000000000020', fixture.request, fixture.payload_digest, 'c1000000-0000-4000-8000-000000000073') from c1_import_security_fixture fixture where fixture.label = 'disabled'; raise exception 'C1 manifest selected another company'; exception when sqlstate 'P0001' then if sqlerrm <> 'INPUT_INVALID' then raise; end if; end;
  begin perform public.c1_get_controlled_import_result('c1010000-0000-4000-8000-000000000020', 'c1000000-0000-4000-8000-000000000060'); raise exception 'C1 cross-tenant result read succeeded'; exception when sqlstate 'P0001' then if sqlerrm <> 'COMPANY_FORBIDDEN' then raise; end if; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000902","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.controlled_import_runs) or exists (select 1 from public.accounting_sources) or exists (select 1 from public.source_selections) or exists (select 1 from public.cost_document_events where resource_type = 'controlled_import_run') then raise exception 'C1 source-only viewer can read draft import data'; end if;
  begin perform public.c1_get_controlled_import_result('c1000000-0000-4000-8000-000000000020', 'c1000000-0000-4000-8000-000000000060'); raise exception 'C1 source-only viewer read canonical draft result'; exception when sqlstate 'P0001' then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000903","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.controlled_import_runs) or exists (select 1 from public.accounting_sources) or exists (select 1 from public.source_review_issues) then raise exception 'C1 project-only actor can read import data'; end if;
  begin perform public.c1_get_controlled_import_result('c1000000-0000-4000-8000-000000000020', 'c1000000-0000-4000-8000-000000000060'); raise exception 'C1 project-only actor read canonical result'; exception when sqlstate 'P0001' then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
end $$;
reset role;

update public.company_role_assignments assignment set revoked_at = now(), revoked_by = 'c1000000-0000-4000-8000-000000000901', revoke_reason = 'Synthetic replay revocation' where assignment.company_id = 'c1000000-0000-4000-8000-000000000020' and assignment.user_id = 'c1000000-0000-4000-8000-000000000901' and assignment.role_id = 'c1000000-0000-4000-8000-000000000911';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
do $$ begin
  begin perform public.c1_persist_controlled_import(fixture.company_id, fixture.request, fixture.payload_digest, 'c1000000-0000-4000-8000-000000000074') from c1_import_security_fixture fixture where fixture.label = 'enabled'; raise exception 'C1 revoked actor retrieved replay'; exception when sqlstate 'P0001' then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
  if exists (select 1 from public.controlled_import_runs) or exists (select 1 from public.accounting_sources where company_id = 'c1000000-0000-4000-8000-000000000020') then raise exception 'C1 revoked actor retained draft visibility'; end if;
end $$;
reset role;

select 'C1_CONTROLLED_IMPORT_SECURITY_COMPLETE' as c1_fixture_completion;

rollback;
