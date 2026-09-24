begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

select has_column('public', 'cost_categories', 'posting_strategy', 'category posting strategy exists');
select results_eq(
  $$select code || ':' || posting_strategy from public.cost_categories order by code$$,
  $$values ('direct_labor:ordinary_detail'), ('machinery:ordinary_detail'), ('materials:ordinary_detail'), ('other:ordinary_detail'), ('subcontract_labor:subcontract_payment')$$,
  'the approved catalog mapping is explicit and complete'
);
select has_column('public', 'project_cost_item_details', 'publication_state', 'detail publication state exists');
select has_column('public', 'project_cost_item_details', 'publication_origin', 'detail publication origin exists');
select has_column('public', 'project_cost_item_details', 'published_by', 'detail publisher exists');
select has_column('public', 'project_cost_item_details', 'published_at', 'detail published timestamp exists');
select has_column('public', 'project_cost_item_details', 'publication_request_id', 'detail publication request exists');
select ok(not exists (
  select 1 from public.project_cost_item_details
  where publication_state <> 'published'
     or publication_origin <> 'legacy_backfill'
     or published_at is distinct from created_at
), 'existing details backfill as published legacy history without fabricated attribution');
select function_returns('private', 'c1_resolve_or_create_ordinary_project_cost_item', array['uuid', 'uuid', 'uuid', 'uuid', 'uuid', 'uuid'], 'uuid', 'ordinary parent resolver is private and returns one parent identity');
select function_returns('private', 'c1_can_read_project_cost_detail', array['uuid', 'uuid', 'uuid', 'text'], 'boolean', 'detail RLS evaluates the child publication state');
select ok(exists (
  select 1 from pg_indexes
  where schemaname = 'public' and tablename = 'project_cost_item_details'
    and indexdef like '%(tenant_id, company_id, publication_state, project_cost_item_id%'
), 'detail publication index begins with tenant company state and parent identity');
select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.project_cost_item_details'::regclass
    and conname = 'project_cost_item_details_publication_shape_check'
), 'detail lifecycle shape constraint exists');

select * from finish();
rollback;
