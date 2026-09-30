-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE
begin;
select set_config('request.jwt.claims','{"sub":"c1f10000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select public.c1_create_project_cost_draft('c1f10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1f10000-0000-4000-8000-000000000102','costCategoryId','c1f10000-0000-4000-8000-000000000301','description','legacy resolver race parent'),'c1f10000-0000-4000-8000-000000000711','c1f10000-0000-4000-8000-000000000721');
select pg_catalog.pg_sleep(3);
commit;
select id as parent_id from public.project_cost_items where tenant_id='c1f10000-0000-4000-8000-000000000010' and company_id='c1f10000-0000-4000-8000-000000000020' and project_id='c1f10000-0000-4000-8000-000000000102' and cost_category_id='c1f10000-0000-4000-8000-000000000301';
