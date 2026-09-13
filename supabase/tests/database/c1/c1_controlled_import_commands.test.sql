begin;

create temporary table c1_import_fixture (
  label text primary key,
  request jsonb not null,
  payload_digest text not null,
  result jsonb
) on commit drop;
grant select, insert, update on c1_import_fixture to authenticated;

do $$
declare
  v_tenant_a constant uuid := 'c1000000-0000-4000-8000-000000000010';
  v_company_a1 constant uuid := 'c1000000-0000-4000-8000-000000000020';
  v_company_a2 constant uuid := 'c1000000-0000-4000-8000-000000000021';
  v_tenant_b constant uuid := 'c1010000-0000-4000-8000-000000000010';
  v_company_b1 constant uuid := 'c1010000-0000-4000-8000-000000000020';
  v_frozen_manifest jsonb;
  v_manifest jsonb;
  v_invalid_manifest jsonb;
  v_manifest_digest text;
  v_invalid_digest text;
  v_payload_digest text;
begin
  insert into private.controlled_import_adapter_versions(workbook_family, adapter_id, adapter_version)
  values ('synthetic-ledger-v1', 'synthetic-ledger', '1.0.0');
  insert into auth.users(id, email) values
    ('c1000000-0000-4000-8000-000000000901', 'c1-importer-one@taskovia.invalid'),
    ('c1000000-0000-4000-8000-000000000902', 'c1-importer-two@taskovia.invalid');
  insert into public.tenants(id, code, name) values
    (v_tenant_a, 'c1-import-a', 'C1 import tenant A'),
    (v_tenant_b, 'c1-import-b', 'C1 import tenant B');
  insert into public.companies(id, tenant_id, code, name) values
    (v_company_a1, v_tenant_a, 'C1-IMPORT-A1', 'C1 import company A1'),
    (v_company_a2, v_tenant_a, 'C1-IMPORT-A2', 'C1 import company A2'),
    (v_company_b1, v_tenant_b, 'C1-IMPORT-B1', 'C1 import company B1');
  insert into public.tenant_memberships(user_id, tenant_id, roles) values
    ('c1000000-0000-4000-8000-000000000901', v_tenant_a, array['member']),
    ('c1000000-0000-4000-8000-000000000902', v_tenant_a, array['member']);
  insert into public.company_memberships(user_id, tenant_id, company_id, roles, is_active) values
    ('c1000000-0000-4000-8000-000000000901', v_tenant_a, v_company_a1, array['member'], true),
    ('c1000000-0000-4000-8000-000000000902', v_tenant_a, v_company_a1, array['member'], true),
    ('c1000000-0000-4000-8000-000000000902', v_tenant_a, v_company_a2, array['member'], true);
  insert into public.roles(id, tenant_id, company_id, code, name, description, is_system) values
    ('c1000000-0000-4000-8000-000000000911', v_tenant_a, v_company_a1, 'c1_importer', 'C1 importer', 'Synthetic controlled-import capability', false),
    ('c1000000-0000-4000-8000-000000000912', v_tenant_a, v_company_a2, 'c1_importer_a2', 'C1 importer A2', 'Synthetic controlled-import capability', false);
  insert into public.role_permissions(role_id, permission_code) values
    ('c1000000-0000-4000-8000-000000000911', 'cost.source.read'),
    ('c1000000-0000-4000-8000-000000000911', 'cost.prepare'),
    ('c1000000-0000-4000-8000-000000000912', 'cost.source.read'),
    ('c1000000-0000-4000-8000-000000000912', 'cost.prepare');
  insert into public.company_role_assignments(tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values
    (v_tenant_a, v_company_a1, 'c1000000-0000-4000-8000-000000000901', 'c1000000-0000-4000-8000-000000000911', 'c1000000-0000-4000-8000-000000000901', 'Synthetic controlled-import fixture'),
    (v_tenant_a, v_company_a1, 'c1000000-0000-4000-8000-000000000902', 'c1000000-0000-4000-8000-000000000911', 'c1000000-0000-4000-8000-000000000901', 'Synthetic controlled-import fixture'),
    (v_tenant_a, v_company_a2, 'c1000000-0000-4000-8000-000000000902', 'c1000000-0000-4000-8000-000000000912', 'c1000000-0000-4000-8000-000000000901', 'Synthetic controlled-import fixture');
  insert into public.company_cost_settings(company_id, tenant_id, enabled, created_by)
  values
    (v_company_a1, v_tenant_a, true, 'c1000000-0000-4000-8000-000000000901'),
    (v_company_a2, v_tenant_a, true, 'c1000000-0000-4000-8000-000000000901');

  insert into public.projects(id, tenant_id, company_id, code, name, origin, created_by) values
    ('c1000000-0000-4000-8000-000000000930', v_tenant_a, v_company_a1, 'C1-IMPORT-PROJECT-A1', 'Synthetic import project A1', 'manual', 'c1000000-0000-4000-8000-000000000901'),
    ('c1000000-0000-4000-8000-000000000940', v_tenant_a, v_company_a2, 'C1-IMPORT-PROJECT-A2', 'Synthetic import project A2', 'manual', 'c1000000-0000-4000-8000-000000000901'),
    ('c1010000-0000-4000-8000-000000000930', v_tenant_b, v_company_b1, 'C1-IMPORT-PROJECT-B1', 'Synthetic import project B1', 'manual', 'c1000000-0000-4000-8000-000000000901');
  insert into public.business_parties(id, tenant_id, company_id, code, display_name, party_kind, created_by)
  values ('c1000000-0000-4000-8000-000000000931', v_tenant_a, v_company_a1, 'C1-IMPORT-PARTY-A1', 'Synthetic import party A1', 'crew', 'c1000000-0000-4000-8000-000000000901');
  insert into public.project_engagements(id, tenant_id, company_id, project_id, party_id, code, name, currency_code, created_by)
  values ('c1000000-0000-4000-8000-000000000932', v_tenant_a, v_company_a1, 'c1000000-0000-4000-8000-000000000930', 'c1000000-0000-4000-8000-000000000931', 'C1-IMPORT-ENGAGEMENT-A1', 'Synthetic import engagement A1', 'VND', 'c1000000-0000-4000-8000-000000000901');
  insert into public.engagement_components(id, tenant_id, company_id, engagement_id, code, name, pricing_method, created_by)
  values ('c1000000-0000-4000-8000-000000000933', v_tenant_a, v_company_a1, 'c1000000-0000-4000-8000-000000000932', 'C1-IMPORT-COMPONENT-A1', 'Synthetic import component A1', 'fixed', 'c1000000-0000-4000-8000-000000000901');

  v_frozen_manifest := $manifest${
    "schemaVersion":"1.2","workbookFamily":"synthetic-ledger-v1","adapter":{"id":"synthetic-ledger","version":"1.0.0"},"targetCompanyId":"c1000000-0000-4000-8000-000000000020",
    "inputs":[{"fileIdentity":"synthetic-ledger-v1.xlsx","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","originalFilename":"synthetic-ledger-v1.xlsx"},{"fileIdentity":"synthetic-ledger-v2.xlsx","sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","originalFilename":"synthetic-ledger-v2.xlsx"}],
    "sources":[{"id":"source-ledger","code":"SYN-LEDGER","title":"Synthetic ledger","sourceSystem":"synthetic"}],
    "sourceVersions":[{"id":"source-ledger-v1","sourceId":"source-ledger","inputFileIdentity":"synthetic-ledger-v1.xlsx","inputFileSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","originalFilename":"synthetic-ledger-v1.xlsx","rawFileReference":null,"sourceVersionLabel":"v1","sourcePeriodText":null,"sourceAsOfText":null},{"id":"source-ledger-v2","sourceId":"source-ledger","inputFileIdentity":"synthetic-ledger-v2.xlsx","inputFileSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","originalFilename":"synthetic-ledger-v2.xlsx","rawFileReference":null,"sourceVersionLabel":"v2","sourcePeriodText":null,"sourceAsOfText":null}],
    "sections":[{"id":"opening-balance","sourceVersionId":"source-ledger-v1","inputSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","locator":{"kind":"cell_range","sheetName":" Nhật ký ","range":"A1:B2"},"mapping":{"state":"pending"},"observedLabels":["Opening balance"],"rawValues":["9007199254740992.0000"],"unresolvedIssues":["engagement uncertain"]},{"id":"source-total","sourceVersionId":"source-ledger-v2","inputSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","locator":{"kind":"whole_file","note":"source total"},"mapping":{"state":"reference_only"},"observedLabels":["Total"],"rawValues":["0"],"unresolvedIssues":[]}],
    "figures":[{"id":"figure-total","sectionId":"source-total","label":"Total","rawValueText":"0","valueState":"known","amount":"0","currencyCode":null,"metricKind":"reported_balance","basis":"unknown","balanceKind":"unknown","roundingBasis":"exact","roundingNote":null,"periodBasis":"unknown","periodFrom":null,"periodTo":null,"asOfDate":null,"mapping":{"state":"reference_only"},"scopeKind":"unknown","scopeDescription":"Synthetic source total","confirmation":"unverified","confirmationReference":null}],
    "reviewIssues":[{"id":"issue-scope","sectionId":"opening-balance","kind":"scope_uncertain","impact":"blocks_normalization","description":"Synthetic scope uncertainty","reference":null}],
    "duplicateCandidates":[{"id":"duplicate-total","sectionId":"opening-balance","candidateSectionId":"source-total","reason":"Synthetic comparison only"}],
    "expected":{"sources":1,"versions":2,"sections":2,"figures":1,"reviewIssues":1}
  }$manifest$::jsonb;
  if encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(v_frozen_manifest), 'UTF8'), 'sha256'), 'hex') <> '8651b0ef29773117d53b09403e9be2762df0709e2b623587938080610d1557f8' then
    raise exception 'C1 frozen P2.1 manifest digest is incompatible with the database canonicalizer';
  end if;

  v_manifest := jsonb_set(jsonb_set(v_frozen_manifest, '{sections,1,mapping}', '{"state":"confirmed","projectId":"c1000000-0000-4000-8000-000000000930","partyId":"c1000000-0000-4000-8000-000000000931","engagementId":"c1000000-0000-4000-8000-000000000932","componentId":"c1000000-0000-4000-8000-000000000933"}'::jsonb), '{figures,0,mapping}', '{"state":"confirmed","projectId":"c1000000-0000-4000-8000-000000000930","partyId":"c1000000-0000-4000-8000-000000000931","engagementId":"c1000000-0000-4000-8000-000000000932","componentId":"c1000000-0000-4000-8000-000000000933"}'::jsonb);
  v_manifest := jsonb_set(v_manifest, '{sections}', v_manifest->'sections' || '[{"id":"reference-note","sourceVersionId":"source-ledger-v2","inputSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","locator":{"kind":"logical_section","section":"Reference note"},"mapping":{"state":"reference_only","note":"Reference only"},"observedLabels":["Reference"],"rawValues":["not posting"],"unresolvedIssues":[]},{"id":"excluded-note","sourceVersionId":"source-ledger-v2","inputSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","locator":{"kind":"logical_section","section":"Excluded note"},"mapping":{"state":"excluded","note":"Reviewed exclusion"},"observedLabels":["Excluded"],"rawValues":["ignored by review"],"unresolvedIssues":[]}]'::jsonb);
  v_manifest := jsonb_set(v_manifest, '{expected,sections}', '4'::jsonb);
  v_manifest_digest := encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(v_manifest), 'UTF8'), 'sha256'), 'hex');
  v_payload_digest := encode(extensions.digest(convert_to('c1000000-0000-4000-8000-000000000060|' || v_manifest_digest || '|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb|' || v_manifest_digest, 'UTF8'), 'sha256'), 'hex');
  insert into c1_import_fixture(label, request, payload_digest) values ('base', jsonb_build_object('runId', 'c1000000-0000-4000-8000-000000000060', 'idempotencyKey', 'c1000000-0000-4000-8000-000000000061', 'approvedManifestDigest', v_manifest_digest, 'actualInputDigests', jsonb_build_array(repeat('a',64), repeat('b',64)), 'manifest', v_manifest), v_payload_digest);

  v_payload_digest := encode(extensions.digest(convert_to('c1000000-0000-4000-8000-000000000062|' || v_manifest_digest || '|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb|' || v_manifest_digest, 'UTF8'), 'sha256'), 'hex');
  insert into c1_import_fixture(label, request, payload_digest) values ('conflict', jsonb_build_object('runId', 'c1000000-0000-4000-8000-000000000062', 'idempotencyKey', 'c1000000-0000-4000-8000-000000000061', 'approvedManifestDigest', v_manifest_digest, 'actualInputDigests', jsonb_build_array(repeat('a',64), repeat('b',64)), 'manifest', v_manifest), v_payload_digest);

  v_payload_digest := encode(extensions.digest(convert_to('c1000000-0000-4000-8000-000000000063|' || v_manifest_digest || '|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb|' || v_manifest_digest, 'UTF8'), 'sha256'), 'hex');
  insert into c1_import_fixture(label, request, payload_digest) values ('new-key', jsonb_build_object('runId', 'c1000000-0000-4000-8000-000000000063', 'idempotencyKey', 'c1000000-0000-4000-8000-000000000064', 'approvedManifestDigest', v_manifest_digest, 'actualInputDigests', jsonb_build_array(repeat('a',64), repeat('b',64)), 'manifest', v_manifest), v_payload_digest);

  v_manifest := jsonb_set(v_frozen_manifest, '{targetCompanyId}', to_jsonb(v_company_a2::text));
  v_manifest_digest := encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(v_manifest), 'UTF8'), 'sha256'), 'hex');
  v_payload_digest := encode(extensions.digest(convert_to('c1000000-0000-4000-8000-000000000060|' || v_manifest_digest || '|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb|' || v_manifest_digest, 'UTF8'), 'sha256'), 'hex');
  insert into c1_import_fixture(label, request, payload_digest) values ('different-company', jsonb_build_object('runId', 'c1000000-0000-4000-8000-000000000060', 'idempotencyKey', 'c1000000-0000-4000-8000-000000000061', 'approvedManifestDigest', v_manifest_digest, 'actualInputDigests', jsonb_build_array(repeat('a',64), repeat('b',64)), 'manifest', v_manifest), v_payload_digest);

  select fixture.request->'manifest' into v_manifest from c1_import_fixture fixture where fixture.label = 'base';
  v_invalid_manifest := jsonb_set(v_manifest, '{sections,1,mapping,projectId}', '"c1000000-0000-4000-8000-000000000940"'::jsonb);
  v_invalid_digest := encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(v_invalid_manifest), 'UTF8'), 'sha256'), 'hex');
  v_payload_digest := encode(extensions.digest(convert_to('c1000000-0000-4000-8000-000000000065|' || v_invalid_digest || '|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb|' || v_invalid_digest, 'UTF8'), 'sha256'), 'hex');
  insert into c1_import_fixture(label, request, payload_digest) values ('invalid-reference', jsonb_build_object('runId', 'c1000000-0000-4000-8000-000000000065', 'idempotencyKey', 'c1000000-0000-4000-8000-000000000066', 'approvedManifestDigest', v_invalid_digest, 'actualInputDigests', jsonb_build_array(repeat('a',64), repeat('b',64)), 'manifest', v_invalid_manifest), v_payload_digest);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
update c1_import_fixture fixture set result = public.c1_persist_controlled_import('c1000000-0000-4000-8000-000000000020', fixture.request, fixture.payload_digest, 'c1000000-0000-4000-8000-000000000071') where fixture.label = 'base';
do $$
declare v_result jsonb;
begin
  select fixture.result into v_result from c1_import_fixture fixture where fixture.label = 'base';
  if v_result->>'run_id' <> 'c1000000-0000-4000-8000-000000000060' or (v_result->>'replayed')::boolean then raise exception 'C1 controlled import canonical result failed'; end if;
  if jsonb_array_length(v_result->'source_ids') <> 1 or jsonb_array_length(v_result->'version_ids') <> 2 or jsonb_array_length(v_result->'section_ids') <> 4 or jsonb_array_length(v_result->'figure_ids') <> 1 or jsonb_array_length(v_result->'review_issue_ids') <> 1 then raise exception 'C1 controlled import result counts are not truthful'; end if;
end;
$$;
reset role;

do $$
declare v_run_id uuid; v_result jsonb;
begin
  select run.id, run.result into v_run_id, v_result from public.controlled_import_runs run where run.company_id = 'c1000000-0000-4000-8000-000000000020' and run.run_id = 'c1000000-0000-4000-8000-000000000060';
  if v_run_id is null or (select count(*) from public.controlled_import_descriptor_map map where map.import_run_id = v_run_id) <> 9 then raise exception 'C1 descriptor-to-database mapping failed'; end if;
  if (select count(*) from public.accounting_sources source where source.company_id = 'c1000000-0000-4000-8000-000000000020') <> 1 then raise exception 'C1 source count failed'; end if;
  if (select count(*) from public.accounting_source_versions version where version.company_id = 'c1000000-0000-4000-8000-000000000020') <> 2 then raise exception 'C1 changed input did not append an explicit source version'; end if;
  if not exists (select 1 from public.accounting_source_versions version where version.company_id = 'c1000000-0000-4000-8000-000000000020' group by version.source_id having array_agg(version.version_no order by version.version_no) = array[1,2]::bigint[]) then raise exception 'C1 source version history is not ordered and preserved'; end if;
  if not exists (select 1 from public.source_selections selection where selection.mapping_state = 'pending' and selection.locator_key = 'cell_range| Nhật ký |A1:B2' and selection.raw_values = array['9007199254740992.0000']) then raise exception 'C1 pending unscoped provenance was not retained'; end if;
  if not exists (select 1 from public.source_selections selection where selection.mapping_state = 'confirmed' and selection.mapped_project_id = 'c1000000-0000-4000-8000-000000000930' and selection.mapped_engagement_id = 'c1000000-0000-4000-8000-000000000932' and selection.mapped_component_id = 'c1000000-0000-4000-8000-000000000933') then raise exception 'C1 reviewed scoped mapping failed'; end if;
  if not exists (select 1 from public.source_selections selection where selection.mapping_state = 'reference_only') or not exists (select 1 from public.source_selections selection where selection.mapping_state = 'excluded') then raise exception 'C1 reference-only or excluded mapping was lost'; end if;
  if not exists (select 1 from public.source_reported_figures figure where figure.amount_text = '0' and figure.amount = 0 and figure.status = 'draft') then raise exception 'C1 exact source figure boundary failed'; end if;
  if not exists (select 1 from public.source_review_issues issue where issue.status = 'open' and issue.impact = 'blocks_normalization') then raise exception 'C1 review issue persistence failed'; end if;
  if jsonb_array_length((select run.manifest_snapshot->'duplicateCandidates' from public.controlled_import_runs run where run.id = v_run_id)) <> 1 then raise exception 'C1 duplicate candidate evidence was lost'; end if;
  if (select count(*) from public.projects) <> 3 or (select count(*) from public.business_parties) <> 1 or (select count(*) from public.project_engagements) <> 1 or (select count(*) from public.engagement_components) <> 1 or exists (select 1 from public.cost_document_events event where event.document_id is not null) then raise exception 'C1 import changed master data or created a financial effect'; end if;
  if exists (select 1 from public.cost_document_events event where event.resource_type = 'controlled_import_run' and event.after_summary::text ~ '9007199254740992|Synthetic source') or exists (select 1 from public.audit_events event where event.action = 'controlled_import.persisted' and event.after_summary::text ~ '9007199254740992|Synthetic source') then raise exception 'C1 event or audit leaked source values'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
do $$
declare v_result jsonb;
begin
  select public.c1_persist_controlled_import('c1000000-0000-4000-8000-000000000020', fixture.request, fixture.payload_digest, 'c1000000-0000-4000-8000-000000000072') into v_result from c1_import_fixture fixture where fixture.label = 'base';
  if not (v_result->>'replayed')::boolean then raise exception 'C1 same actor replay did not return canonical result'; end if;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000902","role":"authenticated"}', true);
do $$
declare v_result jsonb;
begin
  select public.c1_persist_controlled_import('c1000000-0000-4000-8000-000000000020', fixture.request, fixture.payload_digest, 'c1000000-0000-4000-8000-000000000073') into v_result from c1_import_fixture fixture where fixture.label = 'base';
  if not (v_result->>'replayed')::boolean then raise exception 'C1 second authorized actor replay did not return canonical result'; end if;
  update c1_import_fixture fixture set result = public.c1_persist_controlled_import('c1000000-0000-4000-8000-000000000021', fixture.request, fixture.payload_digest, 'c1000000-0000-4000-8000-000000000077') where fixture.label = 'different-company';
  if (select (fixture.result->>'replayed')::boolean from c1_import_fixture fixture where fixture.label = 'different-company') then raise exception 'C1 different company was treated as the same receipt'; end if;
  begin
    perform public.c1_persist_controlled_import('c1000000-0000-4000-8000-000000000020', fixture.request, fixture.payload_digest, 'c1000000-0000-4000-8000-000000000074') from c1_import_fixture fixture where fixture.label = 'conflict';
    raise exception 'C1 changed payload reused a company-scoped key';
  exception when sqlstate 'P0001' then if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if; end;
  update c1_import_fixture fixture set result = public.c1_persist_controlled_import('c1000000-0000-4000-8000-000000000020', fixture.request, fixture.payload_digest, 'c1000000-0000-4000-8000-000000000075') where fixture.label = 'new-key';
end;
$$;
reset role;

do $$
declare v_base jsonb; v_new jsonb;
begin
  select fixture.result into v_base from c1_import_fixture fixture where fixture.label = 'base';
  select fixture.result into v_new from c1_import_fixture fixture where fixture.label = 'new-key';
  if v_base->'source_ids' is distinct from v_new->'source_ids' or v_base->'version_ids' is distinct from v_new->'version_ids' or v_base->'section_ids' is distinct from v_new->'section_ids' or v_base->'figure_ids' is distinct from v_new->'figure_ids' or v_base->'review_issue_ids' is distinct from v_new->'review_issue_ids' then raise exception 'C1 different retry key duplicated source effects'; end if;
  if (select count(*) from public.controlled_import_runs where company_id = 'c1000000-0000-4000-8000-000000000020') <> 2 or (select count(*) from public.accounting_sources where company_id = 'c1000000-0000-4000-8000-000000000020') <> 1 or (select count(*) from public.accounting_source_versions where company_id = 'c1000000-0000-4000-8000-000000000020') <> 2 or (select count(*) from public.source_selections where company_id = 'c1000000-0000-4000-8000-000000000020') <> 4 or (select count(*) from public.source_reported_figures where company_id = 'c1000000-0000-4000-8000-000000000020') <> 1 or (select count(*) from public.source_review_issues where company_id = 'c1000000-0000-4000-8000-000000000020') <> 1 then raise exception 'C1 replay or duplicate prevention counts failed'; end if;
  if (select count(*) from public.cost_command_receipts where company_id = 'c1000000-0000-4000-8000-000000000020' and command_name = 'controlled_import') <> 2 or (select count(*) from public.cost_document_events where company_id = 'c1000000-0000-4000-8000-000000000020' and resource_type = 'controlled_import_run') <> 2 or (select count(*) from public.audit_events where company_id = 'c1000000-0000-4000-8000-000000000020' and action = 'controlled_import.persisted') <> 2 then raise exception 'C1 receipt/event/audit count failed'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.c1_persist_controlled_import('c1000000-0000-4000-8000-000000000020', fixture.request, fixture.payload_digest, 'c1000000-0000-4000-8000-000000000076') from c1_import_fixture fixture where fixture.label = 'invalid-reference';
    raise exception 'C1 invalid scoped mapping unexpectedly imported';
  exception when sqlstate 'P0001' then if sqlerrm <> 'RESOURCE_NOT_FOUND' then raise; end if; end;
end;
$$;
reset role;

do $$
begin
  if exists (select 1 from public.controlled_import_runs run where run.company_id = 'c1000000-0000-4000-8000-000000000020' and run.run_id = 'c1000000-0000-4000-8000-000000000065') or (select count(*) from public.accounting_sources where company_id = 'c1000000-0000-4000-8000-000000000020') <> 1 or (select count(*) from public.accounting_source_versions where company_id = 'c1000000-0000-4000-8000-000000000020') <> 2 then raise exception 'C1 failed import left partial state'; end if;
  begin
    update public.accounting_source_versions set source_version_label = 'mutated';
    raise exception 'C1 immutable source version was updated';
  exception when sqlstate 'P0001' then if sqlerrm <> 'HISTORY_IMMUTABLE' then raise; end if; end;
end;
$$;

select 'C1_CONTROLLED_IMPORT_COMMANDS_COMPLETE' as c1_fixture_completion;

rollback;
