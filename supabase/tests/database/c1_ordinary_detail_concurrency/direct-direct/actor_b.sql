-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE
begin;
do $$
declare actor_a_holds_lock boolean := false;
begin
  for attempt in 1..100 loop
    actor_a_holds_lock:=not pg_catalog.pg_try_advisory_lock(pg_catalog.hashtextextended('c1_project_cost_category:c1f10000-0000-4000-8000-000000000010:c1f10000-0000-4000-8000-000000000020:c1f10000-0000-4000-8000-000000000102:c1f10000-0000-4000-8000-000000000301',0));
    exit when actor_a_holds_lock;
    perform pg_catalog.pg_advisory_unlock(pg_catalog.hashtextextended('c1_project_cost_category:c1f10000-0000-4000-8000-000000000010:c1f10000-0000-4000-8000-000000000020:c1f10000-0000-4000-8000-000000000102:c1f10000-0000-4000-8000-000000000301',0));
    perform pg_catalog.pg_sleep(0.1);
  end loop;
  if not actor_a_holds_lock then raise exception 'C1 ordinary detail actor A readiness barrier timed out'; end if;
end;
$$;
select set_config('request.jwt.claims','{"sub":"c1f10000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select public.c1_create_and_publish_project_cost_detail('c1f10000-0000-4000-8000-000000000020',jsonb_build_object('projectId','c1f10000-0000-4000-8000-000000000102','categoryId','c1f10000-0000-4000-8000-000000000301','description','race direct B','amount','2.0000'),'c1f10000-0000-4000-8000-000000000812','c1f10000-0000-4000-8000-000000000822');
commit;
select id as parent_id from public.project_cost_items where tenant_id='c1f10000-0000-4000-8000-000000000010' and company_id='c1f10000-0000-4000-8000-000000000020' and project_id='c1f10000-0000-4000-8000-000000000102' and cost_category_id='c1f10000-0000-4000-8000-000000000301';
