set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 46);

do $$
declare
  v_definition text;
  v_corrected text;
  v_insert_anchor text := '  insert into public.cost_evidence_files(';
  v_returning_anchor text := '  ) returning * into v_file;';
begin
  if to_regprocedure('private.c1_material_create_evidence_intent(uuid,uuid,jsonb,uuid,uuid)') is null then
    raise exception using errcode='P0001', message='C1_MATERIAL_EVIDENCE_INTENT_BASELINE_MISSING';
  end if;
  select pg_get_functiondef(
    'private.c1_material_create_evidence_intent(uuid,uuid,jsonb,uuid,uuid)'::regprocedure
  ) into v_definition;
  if position(v_insert_anchor in v_definition) = 0
    or position(v_returning_anchor in v_definition) = 0
    or length(v_definition) - length(replace(v_definition,v_insert_anchor,'')) <> length(v_insert_anchor)
    or length(v_definition) - length(replace(v_definition,v_returning_anchor,'')) <> length(v_returning_anchor)
    or position('taskovia.c1_material_evidence.intent' in v_definition) > 0
  then raise exception using errcode='P0001', message='C1_MATERIAL_EVIDENCE_INTENT_FUNCTION_DRIFT'; end if;
  v_corrected := replace(
    v_definition, v_insert_anchor,
    '  perform set_config(''taskovia.c1_material_evidence.intent'', v_file_id::text, true);' || chr(10) || v_insert_anchor
  );
  v_corrected := replace(
    v_corrected, v_returning_anchor,
    v_returning_anchor || chr(10) || '  perform set_config(''taskovia.c1_material_evidence.intent'', '''', true);'
  );
  if v_corrected = v_definition then
    raise exception using errcode='P0001', message='C1_MATERIAL_EVIDENCE_INTENT_FUNCTION_DRIFT';
  end if;
  execute v_corrected;
end;
$$;

create or replace function private.c1_workflow_guard_legacy_file() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
  perform private.c1_workflow_transition_barrier(new.tenant_id,new.company_id,false);
  if tg_op='UPDATE' and (old.tenant_id,old.company_id) is distinct from (new.tenant_id,new.company_id)
  then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  if exists(select 1 from public.cost_workflow_companies w where w.tenant_id=new.tenant_id and w.company_id=new.company_id and w.mode='document_backed_v1')
    and not new.workflow_origin and (tg_op='INSERT' or old.status='pending_upload')
    and not (
      (tg_op='INSERT' and coalesce(current_setting('taskovia.c1_material_evidence.intent',true),'')=new.id::text)
      or (tg_op='UPDATE' and old.status='pending_upload' and new.status='finalized'
        and coalesce(current_setting('taskovia.c1_evidence.finalize',true),'')='1'
        and private.c1_material_evidence_file(new.id))
    )
  then raise exception using errcode='P0001',message='LEGACY_WORKFLOW_WRITE_DISABLED';end if;
  return new;
end;
$$;
