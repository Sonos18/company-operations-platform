begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

select has_table('public', 'project_cost_item_detail_sources', 'detail source provenance is introduced with the command slice');
select has_function('public', 'c1_create_project_cost_detail_draft', 'draft-detail create RPC exists');
select has_function('public', 'c1_update_project_cost_detail_draft', 'operational update RPC exists');
select has_function('public', 'c1_prepare_project_cost_detail_financials', 'one-detail financial preparation RPC exists');
select has_function('public', 'c1_read_project_cost_detail_draft', 'financial draft read RPC exists');
select has_function('public', 'c1_read_project_cost_detail_draft_operational', 'operational draft read RPC exists');
select has_function('public', 'c1_publish_project_cost_detail', 'existing-detail publish RPC exists');
select has_function('public', 'c1_create_and_publish_project_cost_detail', 'atomic direct publish RPC exists');
select has_function('public', 'c1_correct_published_project_cost_detail', 'published-detail correction RPC exists');
select col_is_null('public', 'project_cost_item_details', 'amount_text', 'draft detail may remain financially unprepared');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.project_cost_item_detail_sources'::regclass and contype = 'u'), 'detail source linkage is unique');
select ok(not has_table_privilege('authenticated', 'public.project_cost_item_detail_sources', 'insert'), 'authenticated has no direct detail-source DML');
select ok(not has_table_privilege('authenticated', 'public.project_cost_item_details', 'insert'), 'authenticated has no direct detail DML');
select ok(pg_catalog.has_function_privilege('authenticated', 'public.c1_create_project_cost_detail_draft(uuid,jsonb,uuid,uuid)', 'execute'), 'authenticated can use guarded draft create');
select ok(pg_catalog.has_function_privilege('authenticated', 'public.c1_publish_project_cost_detail(uuid,uuid,bigint,uuid,uuid)', 'execute'), 'authenticated can use guarded detail publish');
select ok(pg_catalog.has_function_privilege('authenticated', 'public.c1_create_and_publish_project_cost_detail(uuid,jsonb,uuid,uuid)', 'execute'), 'authenticated can use guarded direct publish');
select ok(pg_catalog.has_function_privilege('authenticated', 'public.c1_correct_published_project_cost_detail(uuid,uuid,jsonb,uuid,uuid)', 'execute'), 'authenticated can use guarded correction');
select ok(exists (select 1 from pg_proc where proname = 'c1_read_project_cost_detail_draft_operational'), 'manage-only projection remains a separate boundary');

select * from finish();
rollback;
