begin;
do $$ begin
  if to_regclass('public.accounting_source_versions') is null or to_regclass('public.source_selections') is null or to_regclass('public.source_reported_figures') is null or to_regclass('public.source_review_issues') is null then raise exception 'C1 P2 command tables are missing'; end if;
  if to_regprocedure('public.c1_create_accounting_source(uuid,jsonb,uuid)') is null or to_regprocedure('public.c1_create_source_selection(uuid,uuid,jsonb,uuid)') is null then raise exception 'C1 P2 source commands are missing'; end if;
  if exists (select 1 from public.file_objects where tenant_id::text like '10000000-%') then raise exception 'C1 P2 fixture must not use production-like scope'; end if;
end $$;
select 'C1_P2_COMMANDS_COMPLETE' as c1_fixture_completion;
rollback;
