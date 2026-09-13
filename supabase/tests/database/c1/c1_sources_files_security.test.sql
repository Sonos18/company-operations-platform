begin;
do $$ begin
  if to_regclass('public.file_objects') is null or to_regclass('public.accounting_sources') is null then raise exception 'C1 P2 security tables are missing'; end if;
  if not has_function_privilege('authenticated','public.c1_create_file_upload_intent(uuid,jsonb,uuid)','execute') then raise exception 'C1 P2 public file command is unavailable'; end if;
  if has_function_privilege('authenticated','private.c1_source_context(uuid,text)','execute') then raise exception 'C1 P2 private helper is exposed'; end if;
  if exists (select 1 from storage.buckets where id='taskovia-c1-financial' and public) then raise exception 'C1 P2 bucket is public'; end if;
end $$;
select 'C1_P2_SECURITY_COMPLETE' as c1_fixture_completion;
rollback;
