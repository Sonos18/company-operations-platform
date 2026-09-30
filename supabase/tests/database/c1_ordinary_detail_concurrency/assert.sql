-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE
select count(*)::integer as parent_count from public.project_cost_items where tenant_id='c1f10000-0000-4000-8000-000000000010' and company_id='c1f10000-0000-4000-8000-000000000020' and project_id='c1f10000-0000-4000-8000-000000000102' and cost_category_id='c1f10000-0000-4000-8000-000000000301';
