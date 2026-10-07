-- Prepared contract checks only. Not executed or applied in the source-only repair task.
begin;
set local statement_timeout='90s';
set local search_path=public,extensions;
select plan(8);
select has_function('public','c1_cost_ocr_azure_f0_read_result',array['jsonb','jsonb'],'completed raw reader exists');
select is((select p.provolatile::text from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='c1_cost_ocr_azure_f0_read_result'),'s','reader is stable');
select ok((select p.prosecdef from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='c1_cost_ocr_azure_f0_read_result'),'private table access uses the narrow definer capability');
select ok(not has_function_privilege('anon','public.c1_cost_ocr_azure_f0_read_result(jsonb,jsonb)','EXECUTE'),'anon cannot read raw');
select ok(not has_function_privilege('authenticated','public.c1_cost_ocr_azure_f0_read_result(jsonb,jsonb)','EXECUTE'),'authenticated cannot read raw');
select ok(has_function_privilege('service_role','public.c1_cost_ocr_azure_f0_read_result(jsonb,jsonb)','EXECUTE'),'service role may use the private read capability');
select ok(not has_table_privilege('service_role','private.c1_cost_ocr_azure_jobs','SELECT'),'service role has no direct job table access');
select ok(not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,
 lateral aclexplode(p.proacl) acl where n.nspname='public' and p.proname='c1_cost_ocr_azure_f0_read_result'
 and acl.grantee=0 and acl.privilege_type='EXECUTE'),'PUBLIC has no execute grant');
select * from finish();
rollback;
