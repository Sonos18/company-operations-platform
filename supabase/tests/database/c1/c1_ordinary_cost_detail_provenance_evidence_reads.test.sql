begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;

select plan(24);

select has_table('public', 'project_cost_item_detail_sources', 'detail source provenance table exists');
select has_table('public', 'cost_evidence_links', 'evidence links table exists');
select has_column('public', 'cost_evidence_links', 'project_cost_item_detail_id', 'evidence links can target a detail');
select col_not_null('public', 'project_cost_item_detail_sources', 'tenant_id', 'detail provenance remains tenant scoped');
select col_not_null('public', 'project_cost_item_detail_sources', 'company_id', 'detail provenance remains company scoped');
select has_index('public', 'project_cost_item_detail_sources', 'project_cost_item_detail_sources_scope_idx', 'detail provenance has a scoped index');
select has_index('public', 'cost_evidence_links', 'cost_evidence_links_detail_idx', 'detail evidence has a scoped index');
select has_index('public', 'cost_evidence_links', 'cost_evidence_links_detail_unique', 'detail evidence prevents duplicate links');
select ok(not has_table_privilege('authenticated', 'public.project_cost_item_detail_sources', 'insert'), 'authenticated cannot write source provenance directly');
select ok(not has_table_privilege('authenticated', 'public.project_cost_item_detail_sources', 'update'), 'authenticated cannot update source provenance directly');
select ok(not has_table_privilege('authenticated', 'public.project_cost_item_detail_sources', 'delete'), 'authenticated cannot delete source provenance directly');
select ok(not has_table_privilege('authenticated', 'public.cost_evidence_links', 'insert'), 'authenticated cannot write evidence links directly');
select ok(not has_table_privilege('authenticated', 'public.cost_evidence_links', 'update'), 'authenticated cannot update evidence links directly');
select ok(not has_table_privilege('authenticated', 'public.cost_evidence_links', 'delete'), 'authenticated cannot delete evidence links directly');
select ok(to_regprocedure('public.c1_link_project_cost_detail_evidence(uuid,uuid,jsonb,uuid,uuid)') is not null, 'detail evidence link RPC exists');
select ok(has_function_privilege('authenticated', 'public.c1_link_project_cost_detail_evidence(uuid,uuid,jsonb,uuid,uuid)', 'execute'), 'authenticated may call guarded detail evidence link RPC');
select ok(to_regprocedure('public.c1_get_cost_evidence_read_target(uuid,uuid)') is not null, 'guarded raw evidence target remains available');
select ok(exists (select 1 from pg_constraint where conrelid='public.cost_evidence_links'::regclass and contype='c' and pg_get_constraintdef(oid) like '%project_cost_item_detail_id%'), 'exactly-one target check includes detail links');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='project_cost_item_detail_sources' and policyname='c1_project_cost_item_detail_sources_select'), 'detail source RLS is explicit');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='cost_evidence_links' and policyname='c1_cost_evidence_links_select'), 'evidence link RLS remains explicit');
select ok(not has_table_privilege('authenticated', 'public.project_cost_item_details', 'update'), 'detail lifecycle remains command-only');
select ok(to_regprocedure('private.c1_sync_project_cost_item_amount(uuid)') is not null, 'parent aggregate remains derived from details');
select ok(to_regprocedure('private.c1_can_read_project_cost_detail(uuid,uuid,uuid,text)') is not null, 'detail read authorization remains lifecycle-aware');
select ok(to_regprocedure('private.c1_can_select_evidence_object(text,text)') is not null, 'storage raw read remains resource-aware');

select * from finish();
rollback;
