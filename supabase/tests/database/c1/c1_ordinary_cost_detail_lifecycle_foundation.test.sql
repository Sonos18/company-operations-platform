begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

select has_column('public', 'cost_categories', 'posting_strategy', 'category posting strategy exists');
select results_eq(
  $$select code || ':' || posting_strategy from public.cost_categories order by code$$,
  $$values ('direct_labor:ordinary_detail'), ('machinery:ordinary_detail'), ('materials:ordinary_detail'), ('other:ordinary_detail'), ('subcontract_labor:subcontract_payment')$$,
  'all and only the approved catalog codes map to the required strategies'
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
select ok(pg_catalog.has_function_privilege('authenticated', 'private.c1_can_read_project_cost_detail(uuid,uuid,uuid,text)', 'execute'), 'authenticated can execute the detail RLS helper');
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

do $$
declare
  tenant_a constant uuid := 'c1f10000-0000-4000-8000-000000000010';
  tenant_b constant uuid := 'c1f10000-0000-4000-8000-000000000011';
  company_a constant uuid := 'c1f10000-0000-4000-8000-000000000020';
  company_b constant uuid := 'c1f10000-0000-4000-8000-000000000021';
  reader constant uuid := 'c1f10000-0000-4000-8000-000000000901';
  preparer constant uuid := 'c1f10000-0000-4000-8000-000000000902';
  manager constant uuid := 'c1f10000-0000-4000-8000-000000000903';
begin
  insert into auth.users(id, email) values
    (reader, 'c1f-reader@taskovia.invalid'), (preparer, 'c1f-preparer@taskovia.invalid'), (manager, 'c1f-manager@taskovia.invalid');
  insert into public.tenants(id, code, name) values
    (tenant_a, 'C1F-A', 'C1F tenant A'), (tenant_b, 'C1F-B', 'C1F tenant B');
  insert into public.companies(id, tenant_id, code, name) values
    (company_a, tenant_a, 'C1FA', 'C1F company A'), (company_b, tenant_b, 'C1FB', 'C1F company B');
  insert into public.tenant_memberships(user_id, tenant_id, roles) values
    (reader, tenant_a, array['member']), (preparer, tenant_a, array['member']), (manager, tenant_a, array['member']);
  insert into public.company_memberships(user_id, tenant_id, company_id, roles, is_active) values
    (reader, tenant_a, company_a, array['member'], true), (preparer, tenant_a, company_a, array['member'], true), (manager, tenant_a, company_a, array['member'], true);
  insert into public.roles(id, tenant_id, company_id, code, name, description, is_system) values
    ('c1f10000-0000-4000-8000-000000000911', tenant_a, company_a, 'c1f_reader', 'C1F reader', 'fixture', false),
    ('c1f10000-0000-4000-8000-000000000912', tenant_a, company_a, 'c1f_preparer', 'C1F preparer', 'fixture', false),
    ('c1f10000-0000-4000-8000-000000000913', tenant_a, company_a, 'c1f_manager', 'C1F manager', 'fixture', false);
  insert into public.role_permissions(role_id, permission_code) values
    ('c1f10000-0000-4000-8000-000000000911', 'cost.read'), ('c1f10000-0000-4000-8000-000000000912', 'cost.prepare'), ('c1f10000-0000-4000-8000-000000000913', 'cost.manage');
  insert into public.company_role_assignments(tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values
    (tenant_a, company_a, reader, 'c1f10000-0000-4000-8000-000000000911', manager, 'fixture'),
    (tenant_a, company_a, preparer, 'c1f10000-0000-4000-8000-000000000912', manager, 'fixture'),
    (tenant_a, company_a, manager, 'c1f10000-0000-4000-8000-000000000913', manager, 'fixture');
  insert into public.company_cost_settings(company_id, tenant_id, enabled, created_by) values
    (company_a, tenant_a, true, manager), (company_b, tenant_b, true, manager);
  insert into public.projects(id, tenant_id, company_id, code, name, origin, created_by) values
    ('c1f10000-0000-4000-8000-000000000101', tenant_a, company_a, 'C1F-A1', 'C1F project A', 'manual', manager),
    ('c1f10000-0000-4000-8000-000000000102', tenant_a, company_a, 'C1F-A2', 'C1F resolver project', 'manual', manager),
    ('c1f10000-0000-4000-8000-000000000103', tenant_b, company_b, 'C1F-B1', 'C1F project B', 'manual', manager);
  perform set_config('taskovia.c1_finance.actor_id', manager::text, true);
  perform set_config('taskovia.c1_finance.request_id', 'c1f10000-0000-4000-8000-000000000601', true);
  perform set_config('taskovia.c1_finance.change_reason', 'fixture', true);
  insert into public.cost_categories(id, tenant_id, company_id, code, name, display_order, posting_strategy, created_by, updated_by) values
    ('c1f10000-0000-4000-8000-000000000301', tenant_a, company_a, 'materials', 'Materials', 1, 'ordinary_detail', manager, manager),
    ('c1f10000-0000-4000-8000-000000000302', tenant_a, company_a, 'subcontract_labor', 'Subcontract', 2, 'subcontract_payment', manager, manager);
  insert into public.project_cost_items(id, tenant_id, company_id, project_id, cost_category_id, description, amount, amount_text, currency_code, work_status, publication_state, publication_origin, published_at, created_by) values
    ('c1f10000-0000-4000-8000-000000000201', tenant_a, company_a, 'c1f10000-0000-4000-8000-000000000101', 'c1f10000-0000-4000-8000-000000000301', 'C1F published aggregate', 0, '0', 'VND', 'unknown', 'published', 'legacy_backfill', now(), manager),
    ('c1f10000-0000-4000-8000-000000000202', tenant_a, company_a, 'c1f10000-0000-4000-8000-000000000101', null, 'C1F legacy draft parent', null, null, 'VND', 'unknown', 'draft', null, null, manager),
    ('c1f10000-0000-4000-8000-000000000203', tenant_b, company_b, 'c1f10000-0000-4000-8000-000000000103', null, 'C1F foreign parent', 0, '0', 'VND', 'unknown', 'published', 'legacy_backfill', now(), manager);
end;
$$;

select throws_ok(
  $$insert into public.project_cost_item_details(tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, publication_state, publication_origin, published_at, created_by) values ('c1f10000-0000-4000-8000-000000000010','c1f10000-0000-4000-8000-000000000020','c1f10000-0000-4000-8000-000000000201',9,'invalid published',null,'published','legacy_backfill',now(),'c1f10000-0000-4000-8000-000000000903')$$,
  '23514', null, 'published detail requires an amount'
);
select throws_ok(
  $$insert into public.project_cost_item_details(tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, publication_state, publication_origin, published_by, published_at, created_by) values ('c1f10000-0000-4000-8000-000000000010','c1f10000-0000-4000-8000-000000000020','c1f10000-0000-4000-8000-000000000201',8,'invalid command', '1','published','command','c1f10000-0000-4000-8000-000000000903',now(),'c1f10000-0000-4000-8000-000000000903')$$,
  '23514', null, 'command-published detail requires a publication request'
);
insert into public.project_cost_item_details(id, tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, publication_state, publication_origin, published_at, created_by) values
  ('c1f10000-0000-4000-8000-000000000401', 'c1f10000-0000-4000-8000-000000000010', 'c1f10000-0000-4000-8000-000000000020', 'c1f10000-0000-4000-8000-000000000201', 1, 'published detail', '10', 'published', 'legacy_backfill', now(), 'c1f10000-0000-4000-8000-000000000903'),
  ('c1f10000-0000-4000-8000-000000000402', 'c1f10000-0000-4000-8000-000000000010', 'c1f10000-0000-4000-8000-000000000020', 'c1f10000-0000-4000-8000-000000000201', 2, 'draft detail', null, 'draft', null, null, 'c1f10000-0000-4000-8000-000000000903'),
  ('c1f10000-0000-4000-8000-000000000403', 'c1f10000-0000-4000-8000-000000000010', 'c1f10000-0000-4000-8000-000000000020', 'c1f10000-0000-4000-8000-000000000202', 1, 'legacy draft snapshot', '3', 'draft', null, null, 'c1f10000-0000-4000-8000-000000000903'),
  ('c1f10000-0000-4000-8000-000000000404', 'c1f10000-0000-4000-8000-000000000011', 'c1f10000-0000-4000-8000-000000000021', 'c1f10000-0000-4000-8000-000000000203', 1, 'foreign published detail', '7', 'published', 'legacy_backfill', now(), 'c1f10000-0000-4000-8000-000000000903');
set constraints all immediate;
select is((select amount_text from public.project_cost_items where id = 'c1f10000-0000-4000-8000-000000000201'), '10', 'published aggregate sums published details only');
select is((select amount_text from public.project_cost_items where id = 'c1f10000-0000-4000-8000-000000000202'), '3', 'deprecated draft parent still sums its complete snapshot');
update public.project_cost_item_details set amount_text = '99' where id = 'c1f10000-0000-4000-8000-000000000402';
set constraints all immediate;
select is((select amount_text from public.project_cost_items where id = 'c1f10000-0000-4000-8000-000000000201'), '10', 'draft insert and update have zero published-parent effect');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1f10000-0000-4000-8000-000000000901","role":"authenticated"}', true);
select is((select count(*) from public.project_cost_item_details where company_id = 'c1f10000-0000-4000-8000-000000000020'), 1::bigint, 'cost.read sees published detail but not draft detail');
select is((select count(*) from public.project_cost_item_details where company_id = 'c1f10000-0000-4000-8000-000000000021'), 0::bigint, 'detail RLS preserves tenant and company isolation');
select set_config('request.jwt.claims', '{"sub":"c1f10000-0000-4000-8000-000000000902","role":"authenticated"}', true);
select is((select count(*) from public.project_cost_item_details where project_cost_item_id = 'c1f10000-0000-4000-8000-000000000201'), 0::bigint, 'cost.prepare has no raw detail visibility, including drafts');
select set_config('request.jwt.claims', '{"sub":"c1f10000-0000-4000-8000-000000000903","role":"authenticated"}', true);
select is((select count(*) from public.project_cost_item_details where company_id = 'c1f10000-0000-4000-8000-000000000020'), 0::bigint, 'cost.manage has no raw financial detail visibility');

reset role;
select set_config('request.jwt.claims', '{"sub":"c1f10000-0000-4000-8000-000000000903","role":"authenticated"}', true);
create temp table c1f_resolved_parent as
select private.c1_resolve_or_create_ordinary_project_cost_item(
  'c1f10000-0000-4000-8000-000000000010', 'c1f10000-0000-4000-8000-000000000020', 'c1f10000-0000-4000-8000-000000000102', 'c1f10000-0000-4000-8000-000000000301', 'c1f10000-0000-4000-8000-000000000903', 'c1f10000-0000-4000-8000-000000000701'
) id;
-- Sequential repeat proves the deterministic same-scope invariant; real session contention needs the later two-session acceptance command.
select is(private.c1_resolve_or_create_ordinary_project_cost_item(
  'c1f10000-0000-4000-8000-000000000010', 'c1f10000-0000-4000-8000-000000000020', 'c1f10000-0000-4000-8000-000000000102', 'c1f10000-0000-4000-8000-000000000301', 'c1f10000-0000-4000-8000-000000000903', 'c1f10000-0000-4000-8000-000000000702'
), (select id from c1f_resolved_parent), 'resolver returns the same parent for a repeated same-scope call');
select is((select count(*) from public.project_cost_items where project_id = 'c1f10000-0000-4000-8000-000000000102' and cost_category_id = 'c1f10000-0000-4000-8000-000000000301'), 1::bigint, 'one project/category parent remains unique');
select throws_ok(
  $$insert into public.project_cost_items(tenant_id,company_id,project_id,cost_category_id,description,amount,amount_text,currency_code,work_status,publication_state,publication_origin,published_by,published_at,publication_request_id,created_by) values ('c1f10000-0000-4000-8000-000000000010','c1f10000-0000-4000-8000-000000000020','c1f10000-0000-4000-8000-000000000102','c1f10000-0000-4000-8000-000000000301','duplicate',0,'0','VND','unknown','published','command','c1f10000-0000-4000-8000-000000000903',now(),'c1f10000-0000-4000-8000-000000000703','c1f10000-0000-4000-8000-000000000903')$$,
  '23505', null, 'duplicate parent is rejected by c1fc_cost_item_one_category'
);
select throws_ok(
  $$select private.c1_resolve_or_create_ordinary_project_cost_item('c1f10000-0000-4000-8000-000000000010','c1f10000-0000-4000-8000-000000000020','c1f10000-0000-4000-8000-000000000102','c1f10000-0000-4000-8000-000000000302','c1f10000-0000-4000-8000-000000000903','c1f10000-0000-4000-8000-000000000704')$$,
  'P0001', 'SUBCONTRACT_COST_MODEL_UNSUPPORTED', 'resolver rejects subcontract payment categories'
);
insert into public.cost_categories(id,tenant_id,company_id,code,name,display_order,posting_strategy,created_by,updated_by) values ('c1f10000-0000-4000-8000-000000000303','c1f10000-0000-4000-8000-000000000010','c1f10000-0000-4000-8000-000000000020','other','Other',3,'ordinary_detail','c1f10000-0000-4000-8000-000000000903','c1f10000-0000-4000-8000-000000000903');
insert into public.project_cost_items(id,tenant_id,company_id,project_id,cost_category_id,description,amount,amount_text,currency_code,work_status,publication_state,created_by) values ('c1f10000-0000-4000-8000-000000000204','c1f10000-0000-4000-8000-000000000010','c1f10000-0000-4000-8000-000000000020','c1f10000-0000-4000-8000-000000000101','c1f10000-0000-4000-8000-000000000303','real colliding draft parent',0,'0','VND','unknown','draft','c1f10000-0000-4000-8000-000000000903');
select throws_ok($$select private.c1_resolve_or_create_ordinary_project_cost_item('c1f10000-0000-4000-8000-000000000010','c1f10000-0000-4000-8000-000000000020','c1f10000-0000-4000-8000-000000000101','c1f10000-0000-4000-8000-000000000303','c1f10000-0000-4000-8000-000000000903','c1f10000-0000-4000-8000-000000000705')$$,'P0001','COST_DETAIL_PUBLISH_NOT_READY','resolver rejects a real same-scope draft parent collision');

select * from finish();
rollback;
