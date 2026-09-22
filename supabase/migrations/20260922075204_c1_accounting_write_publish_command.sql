set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 5);

do $$
begin
  if to_regprocedure('private.c1_project_cost_publish_readiness(uuid,uuid,uuid)') is null
    or to_regclass('public.project_cost_items') is null
    or to_regclass('public.cost_command_receipts') is null then
    raise exception using errcode='P0001',message='C1_ACCOUNTING_PUBLISH_BASELINE_MISSING';
  end if;
  if to_regprocedure('public.c1_publish_project_cost(uuid,uuid,bigint,uuid,uuid)') is not null then
    raise exception using errcode='P0001',message='C1_ACCOUNTING_PUBLISH_ALREADY_EXISTS';
  end if;
end;
$$;

create function private.c1_publish_project_cost(target_company_id uuid,target_id uuid,target_expected_version bigint,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare
  v_context jsonb; v_actor_id uuid:=auth.uid(); v_tenant_id uuid; v_request_hash text;
  v_receipt public.cost_command_receipts%rowtype; v_item public.project_cost_items%rowtype; v_published public.project_cost_items%rowtype; v_readiness jsonb;
begin
  if v_actor_id is null then raise exception using errcode='P0001',message='PERMISSION_DENIED'; end if;
  v_context:=private.c1_master_context(target_company_id, 'cost.publish_import'); v_tenant_id:=(v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id or target_expected_version is null or target_expected_version<0 or target_idempotency_key is null or target_request_id is null then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  v_request_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('companyId',target_company_id,'id',target_id,'expectedVersion',target_expected_version)),'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('c1_project_cost:publish:'||target_company_id::text||':'||v_actor_id::text||':'||target_idempotency_key::text,0));
  select receipt.* into v_receipt from public.cost_command_receipts receipt where receipt.company_id=target_company_id and receipt.actor_id=v_actor_id and receipt.command_name='project_cost.publish' and receipt.idempotency_key=target_idempotency_key for update;
  if found then
    if v_receipt.request_hash<>v_request_hash then raise exception using errcode='P0001',message='IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('id',v_receipt.result_resource_id,'version',v_receipt.result_version,'publicationState','published','replayed',true);
  end if;
  select item.* into v_item from public.project_cost_items item where item.id=target_id and item.tenant_id=v_tenant_id and item.company_id=target_company_id for update;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  if v_item.publication_state='published' then raise exception using errcode='P0001',message='COST_ALREADY_PUBLISHED'; end if;
  if v_item.version<>target_expected_version then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
  v_readiness:=private.c1_project_cost_publish_readiness(v_tenant_id,target_company_id,v_item.id);
  if not (v_readiness->>'ready')::boolean then
    if v_readiness->'blockingCodes' ? 'SUBCONTRACT_COST_MODEL_UNSUPPORTED' then raise exception using errcode='P0001',message='SUBCONTRACT_COST_MODEL_UNSUPPORTED'; end if;
    raise exception using errcode='P0001',message='COST_PUBLISH_NOT_READY',detail=(v_readiness->'blockingCodes')::text;
  end if;
  update public.project_cost_items item set publication_state = 'published',publication_origin = 'command',published_by=v_actor_id,published_at=now(),publication_request_id=target_request_id,version=item.version+1,updated_at=now() where item.id=v_item.id returning * into v_published;
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version) values(v_tenant_id,target_company_id,v_actor_id,'project_cost.publish',target_idempotency_key,v_request_hash,v_published.id,v_published.version);
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,before_summary,after_summary)
  values(v_tenant_id,target_company_id,v_actor_id,'c1.project_cost_item.published','project_cost_item',v_item.id::text,target_request_id,jsonb_build_object('publicationState',v_item.publication_state,'version',v_item.version),jsonb_build_object('publicationState',v_published.publication_state,'amount',v_published.amount_text,'version',v_published.version));
  return jsonb_build_object('id',v_published.id,'version',v_published.version,'publicationState',v_published.publication_state,'replayed',false);
end;
$$;

create function public.c1_publish_project_cost(target_company_id uuid,target_id uuid,target_expected_version bigint,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language sql volatile security definer set search_path='' as $$select private.c1_publish_project_cost(target_company_id,target_id,target_expected_version,target_idempotency_key,target_request_id);$$;
revoke all on function private.c1_publish_project_cost(uuid, uuid, bigint, uuid, uuid) from public, anon, authenticated;
revoke all on function public.c1_publish_project_cost(uuid, uuid, bigint, uuid, uuid) from public, anon, authenticated;
grant execute on function public.c1_publish_project_cost(uuid, uuid, bigint, uuid, uuid) to authenticated;

notify pgrst,'reload schema';
