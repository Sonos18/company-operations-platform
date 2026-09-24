-- C1 ORDINARY DETAIL CONCURRENCY FIXTURE
begin;
do $$
declare
  actor_a_holds_lock boolean := false;
begin
  for attempt in 1..100 loop
    actor_a_holds_lock := not pg_catalog.pg_try_advisory_lock(pg_catalog.hashtextextended('c1_ordinary_cost_parent:c1f10000-0000-4000-8000-000000000010:c1f10000-0000-4000-8000-000000000020:c1f10000-0000-4000-8000-000000000102:c1f10000-0000-4000-8000-000000000301',0));
    exit when actor_a_holds_lock;
    perform pg_catalog.pg_advisory_unlock(pg_catalog.hashtextextended('c1_ordinary_cost_parent:c1f10000-0000-4000-8000-000000000010:c1f10000-0000-4000-8000-000000000020:c1f10000-0000-4000-8000-000000000102:c1f10000-0000-4000-8000-000000000301',0));
    perform pg_catalog.pg_sleep(0.1);
  end loop;
  if not actor_a_holds_lock then raise exception 'C1 ordinary detail actor A readiness barrier timed out'; end if;
end;
$$;
select set_config('request.jwt.claims','{"sub":"c1f10000-0000-4000-8000-000000000903","role":"authenticated"}',true);
select private.c1_resolve_or_create_ordinary_project_cost_item('c1f10000-0000-4000-8000-000000000010','c1f10000-0000-4000-8000-000000000020','c1f10000-0000-4000-8000-000000000102','c1f10000-0000-4000-8000-000000000301','c1f10000-0000-4000-8000-000000000903','c1f10000-0000-4000-8000-000000000712');
commit;
select id as parent_id from public.project_cost_items where tenant_id='c1f10000-0000-4000-8000-000000000010' and company_id='c1f10000-0000-4000-8000-000000000020' and project_id='c1f10000-0000-4000-8000-000000000102' and cost_category_id='c1f10000-0000-4000-8000-000000000301';
