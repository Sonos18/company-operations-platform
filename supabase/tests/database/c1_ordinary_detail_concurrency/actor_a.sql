-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE
begin;
select set_config('request.jwt.claims','{"sub":"c1f10000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select private.c1_resolve_or_create_ordinary_project_cost_item('c1f10000-0000-4000-8000-000000000010','c1f10000-0000-4000-8000-000000000020','c1f10000-0000-4000-8000-000000000102','c1f10000-0000-4000-8000-000000000301','c1f10000-0000-4000-8000-000000000903','c1f10000-0000-4000-8000-000000000711');
select pg_catalog.pg_sleep(3);
commit;
select id as parent_id from public.project_cost_items where tenant_id='c1f10000-0000-4000-8000-000000000010' and company_id='c1f10000-0000-4000-8000-000000000020' and project_id='c1f10000-0000-4000-8000-000000000102' and cost_category_id='c1f10000-0000-4000-8000-000000000301';
