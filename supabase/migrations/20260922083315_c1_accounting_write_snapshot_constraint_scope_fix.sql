set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,8);

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_corrected text;
begin
  foreach v_signature in array array[
    'private.c1_prepare_project_cost_financials(uuid,uuid,jsonb,uuid)'::regprocedure,
    'private.c1_correct_published_project_cost(uuid,uuid,jsonb,uuid,uuid)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_corrected:=regexp_replace(regexp_replace(v_definition,
      'set\s+constraints\s+c1_project_cost_item_details_sync\s+immediate',
      'set constraints public.c1_project_cost_item_details_sync immediate','gi'),
      'set\s+constraints\s+c1_project_cost_item_details_sync\s+deferred',
      'set constraints public.c1_project_cost_item_details_sync deferred','gi');
    if v_corrected=v_definition then
      raise exception using errcode='P0001',message='C1_ACCOUNTING_SNAPSHOT_CONSTRAINT_SCOPE_DRIFT';
    end if;
    execute v_corrected;
  end loop;
end $$;

revoke all on function private.c1_prepare_project_cost_financials(uuid,uuid,jsonb,uuid),private.c1_correct_published_project_cost(uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
