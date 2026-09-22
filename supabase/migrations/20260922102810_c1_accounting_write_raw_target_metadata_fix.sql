set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,13);

do $$begin
  if to_regprocedure('private.c1_get_cost_evidence_read_target(uuid,uuid)') is null or to_regprocedure('public.c1_get_cost_evidence_read_target(uuid,uuid)') is null then raise exception using errcode='P0001',message='C1_RAW_TARGET_METADATA_BASELINE_MISSING';end if;
end $$;

create or replace function private.c1_get_cost_evidence_read_target(target_company_id uuid,target_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_context jsonb;v_tenant_id uuid;v_file public.cost_evidence_files%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
  v_context:=private.c1_master_context(target_company_id,'cost.file.read');v_tenant_id:=(v_context->>'tenantId')::uuid;
  select file.* into v_file from public.cost_evidence_files file
  where file.id=target_id and file.tenant_id=v_tenant_id and file.company_id=target_company_id and file.status='finalized'
    and private.c1_can_select_evidence_object(file.bucket_id,file.object_path);
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
  return jsonb_build_object('bucketId',v_file.bucket_id,'objectPath',v_file.object_path);
end;
$$;
revoke all on function private.c1_get_cost_evidence_read_target(uuid,uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
