set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,12);

do $$
declare v_definition text;v_corrected text;
begin
  if to_regprocedure('private.c1_finalize_cost_evidence(uuid,uuid,jsonb,uuid,uuid)') is null then raise exception using errcode='P0001',message='C1_FINALIZE_VALIDATION_BASELINE_MISSING';end if;
  select pg_get_functiondef('private.c1_finalize_cost_evidence(uuid,uuid,jsonb,uuid,uuid)'::regprocedure) into v_definition;
  v_corrected:=regexp_replace(v_definition,'jsonb_object_length\(target_input\)\s*<>\s*4','(select count(*) from jsonb_object_keys(target_input))<>4','gi');
  if v_corrected=v_definition or v_corrected like '%jsonb_object_length(target_input)%' then raise exception using errcode='P0001',message='C1_FINALIZE_VALIDATION_FUNCTION_DRIFT';end if;
  execute v_corrected;
end $$;
revoke all on function private.c1_finalize_cost_evidence(uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
