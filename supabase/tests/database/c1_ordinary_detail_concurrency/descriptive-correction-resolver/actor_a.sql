-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE
begin;
select set_config('request.jwt.claims','{"sub":"c1f10000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select id from public.project_cost_items where tenant_id='c1f10000-0000-4000-8000-000000000010' and company_id='c1f10000-0000-4000-8000-000000000020' and project_id='c1f10000-0000-4000-8000-000000000102' and cost_category_id='c1f10000-0000-4000-8000-000000000301' for update;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('c1_descriptive_parent_row_ready:c1f10000-0000-4000-8000-000000000010:c1f10000-0000-4000-8000-000000000020:c1f10000-0000-4000-8000-000000000102:c1f10000-0000-4000-8000-000000000301',0));
do $$
declare actor_b_holds_category boolean := false;
begin
  for attempt in 1..100 loop
    actor_b_holds_category := not pg_catalog.pg_try_advisory_lock(pg_catalog.hashtextextended('c1_project_cost_category:c1f10000-0000-4000-8000-000000000010:c1f10000-0000-4000-8000-000000000020:c1f10000-0000-4000-8000-000000000102:c1f10000-0000-4000-8000-000000000301',0));
    exit when actor_b_holds_category;
    perform pg_catalog.pg_advisory_unlock(pg_catalog.hashtextextended('c1_project_cost_category:c1f10000-0000-4000-8000-000000000010:c1f10000-0000-4000-8000-000000000020:c1f10000-0000-4000-8000-000000000102:c1f10000-0000-4000-8000-000000000301',0));
    perform pg_catalog.pg_sleep(0.1);
  end loop;
  if not actor_b_holds_category then raise exception 'C1 ordinary detail actor B category-lock readiness barrier timed out'; end if;
end;
$$;
select public.c1_correct_published_project_cost('c1f10000-0000-4000-8000-000000000020',(select id from public.project_cost_items where tenant_id='c1f10000-0000-4000-8000-000000000010' and company_id='c1f10000-0000-4000-8000-000000000020' and project_id='c1f10000-0000-4000-8000-000000000102' and cost_category_id='c1f10000-0000-4000-8000-000000000301'),jsonb_build_object('expectedVersion',(select version from public.project_cost_items where tenant_id='c1f10000-0000-4000-8000-000000000010' and company_id='c1f10000-0000-4000-8000-000000000020' and project_id='c1f10000-0000-4000-8000-000000000102' and cost_category_id='c1f10000-0000-4000-8000-000000000301'),'reason','concurrency descriptive correction','operationalChanges',jsonb_build_object('description','corrected during resolver race')),'c1f10000-0000-4000-8000-000000000714','c1f10000-0000-4000-8000-000000000724');
commit;
select id as parent_id from public.project_cost_items where tenant_id='c1f10000-0000-4000-8000-000000000010' and company_id='c1f10000-0000-4000-8000-000000000020' and project_id='c1f10000-0000-4000-8000-000000000102' and cost_category_id='c1f10000-0000-4000-8000-000000000301';
