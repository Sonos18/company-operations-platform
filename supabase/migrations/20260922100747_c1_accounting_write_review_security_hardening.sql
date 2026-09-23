set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,11);

do $$
begin
  if to_regprocedure('private.c1_can_read_project_cost_item(uuid,uuid,text)') is null
    or to_regprocedure('private.c1_finalize_cost_evidence(uuid,uuid,jsonb,uuid,uuid)') is null
    or to_regprocedure('private.c1_can_insert_evidence_object(text,text)') is null
    or to_regprocedure('private.c1_can_select_evidence_object(text,text)') is null
    or not exists(select 1 from pg_policies where schemaname='public' and tablename='project_cost_items' and policyname='c1_project_cost_items_select')
    or not exists(select 1 from pg_policies where schemaname='public' and tablename='cost_evidence_files' and policyname='c1_cost_evidence_files_select')
    or not exists(select 1 from pg_policies where schemaname='public' and tablename='cost_evidence_links' and policyname='c1_cost_evidence_links_select')
  then raise exception using errcode='P0001',message='C1_REVIEW_SECURITY_BASELINE_MISSING'; end if;
  if to_regprocedure('public.c1_read_project_cost_draft_operational(uuid,uuid)') is not null
    or to_regprocedure('public.c1_get_cost_evidence_read_target(uuid,uuid)') is not null
  then raise exception using errcode='P0001',message='C1_REVIEW_SECURITY_ALREADY_APPLIED'; end if;
end $$;

create or replace function private.c1_can_read_project_cost_item(target_tenant_id uuid,target_company_id uuid,target_publication_state text)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.company_cost_settings settings
    where settings.tenant_id=target_tenant_id and settings.company_id=target_company_id and settings.enabled
  ) and (
    (target_publication_state='published' and private.has_company_permission(target_tenant_id,target_company_id,'cost.read'))
    or (target_publication_state='draft' and private.has_company_permission(target_tenant_id,target_company_id,'cost.prepare'))
  );
$$;
revoke all on function private.c1_can_read_project_cost_item(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.c1_can_read_project_cost_item(uuid,uuid,text) to authenticated;

create function private.c1_project_cost_draft_operational_json(target_tenant_id uuid,target_company_id uuid,target_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'id',item.id,'projectId',item.project_id,'description',item.description,'costCategoryId',item.cost_category_id,
    'businessReference',item.business_reference,'partyId',item.party_id,'engagementId',item.engagement_id,
    'componentId',item.component_id,'relevantDate',item.relevant_date,'workStatus',item.work_status,
    'publicationState',item.publication_state,'version',item.version,'createdAt',item.created_at,'updatedAt',item.updated_at
  )
  from public.project_cost_items item
  where item.id=target_id and item.tenant_id=target_tenant_id and item.company_id=target_company_id and item.publication_state='draft';
$$;

create function private.c1_read_project_cost_draft_operational(target_company_id uuid,target_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_context jsonb;v_tenant_id uuid;v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
  v_context:=private.c1_master_context(target_company_id,'cost.manage');v_tenant_id:=(v_context->>'tenantId')::uuid;
  select private.c1_project_cost_draft_operational_json(v_tenant_id,target_company_id,target_id) into v_result;
  if v_result is null then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
  return v_result;
end;
$$;

create function private.c1_list_project_cost_drafts_operational(target_company_id uuid,target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_context jsonb;v_tenant_id uuid;v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
  v_context:=private.c1_master_context(target_company_id,'cost.manage');v_tenant_id:=(v_context->>'tenantId')::uuid;
  if not exists(select 1 from public.projects project where project.id=target_project_id and project.tenant_id=v_tenant_id and project.company_id=target_company_id) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
  select coalesce(jsonb_agg(private.c1_project_cost_draft_operational_json(v_tenant_id,target_company_id,item.id) order by item.created_at,item.id),'[]'::jsonb)
  into v_result from public.project_cost_items item
  where item.tenant_id=v_tenant_id and item.company_id=target_company_id and item.project_id=target_project_id and item.publication_state='draft';
  return v_result;
end;
$$;

create function public.c1_read_project_cost_draft_operational(target_company_id uuid,target_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$select private.c1_read_project_cost_draft_operational(target_company_id,target_id);$$;
create function public.c1_list_project_cost_drafts_operational(target_company_id uuid,target_project_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$select private.c1_list_project_cost_drafts_operational(target_company_id,target_project_id);$$;
revoke all on function private.c1_project_cost_draft_operational_json(uuid,uuid,uuid),private.c1_read_project_cost_draft_operational(uuid,uuid),private.c1_list_project_cost_drafts_operational(uuid,uuid) from public,anon,authenticated;
revoke all on function public.c1_read_project_cost_draft_operational(uuid,uuid),public.c1_list_project_cost_drafts_operational(uuid,uuid) from public,anon,authenticated;
grant execute on function public.c1_read_project_cost_draft_operational(uuid,uuid),public.c1_list_project_cost_drafts_operational(uuid,uuid) to authenticated;

drop policy c1_cost_evidence_files_select on public.cost_evidence_files;
create policy c1_cost_evidence_files_select on public.cost_evidence_files for select to authenticated using(
  (status='pending_upload' and created_by=(select auth.uid()) and private.has_company_permission(tenant_id,company_id,'cost.prepare'))
  or (status='finalized' and private.has_company_permission(tenant_id,company_id,'cost.source.read'))
);
drop policy c1_cost_evidence_links_select on public.cost_evidence_links;
create policy c1_cost_evidence_links_select on public.cost_evidence_links for select to authenticated using(
  private.has_company_permission(tenant_id,company_id,'cost.source.read')
);

create or replace function private.c1_can_insert_evidence_object(target_bucket_id text,target_object_path text)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.cost_evidence_files file
    where file.bucket_id=target_bucket_id and file.object_path=target_object_path
      and file.status='pending_upload' and file.created_by=(select auth.uid()) and file.intent_expires_at>now()
      and private.has_company_permission(file.tenant_id,file.company_id,'cost.prepare')
  );
$$;
revoke all on function private.c1_can_insert_evidence_object(text,text) from public,anon,authenticated;
grant execute on function private.c1_can_insert_evidence_object(text,text) to authenticated;
drop policy c1_accounting_evidence_objects_insert on storage.objects;
create policy c1_accounting_evidence_objects_insert on storage.objects for insert to authenticated with check(
  bucket_id='c1-accounting-evidence' and private.c1_can_insert_evidence_object(bucket_id,name)
);

create function private.c1_get_cost_evidence_read_target(target_company_id uuid,target_id uuid)
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
  return jsonb_build_object('bucketId',v_file.bucket_id,'objectPath',v_file.object_path,'originalFilename',v_file.original_filename);
end;
$$;
create function public.c1_get_cost_evidence_read_target(target_company_id uuid,target_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$select private.c1_get_cost_evidence_read_target(target_company_id,target_id);$$;
revoke all on function private.c1_get_cost_evidence_read_target(uuid,uuid) from public,anon,authenticated;
revoke all on function public.c1_get_cost_evidence_read_target(uuid,uuid) from public,anon,authenticated;
grant execute on function public.c1_get_cost_evidence_read_target(uuid,uuid) to authenticated;

create or replace function private.c1_finalize_cost_evidence(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare
  v_context jsonb;v_actor_id uuid:=auth.uid();v_tenant_id uuid;v_file public.cost_evidence_files%rowtype;v_request_hash text;v_receipt public.cost_command_receipts%rowtype;v_expected_version bigint;
begin
  if v_actor_id is null then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
  v_context:=private.c1_master_context(target_company_id,'cost.prepare');v_tenant_id:=(v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id or target_idempotency_key is null or target_request_id is null
    or jsonb_typeof(target_input) is distinct from 'object' or not(target_input ? 'expectedVersion')
    or exists(select 1 from jsonb_object_keys(target_input) key where key not in('expectedVersion','mimeType','sizeBytes','sha256'))
    or jsonb_typeof(target_input->'expectedVersion') is distinct from 'number' or target_input->>'expectedVersion' !~ '^\d+$'
  then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  v_expected_version:=(target_input->>'expectedVersion')::bigint;
  perform pg_advisory_xact_lock(hashtextextended('c1_evidence:finalize:'||target_company_id::text||':'||v_actor_id::text||':'||target_idempotency_key::text,0));
  select receipt.* into v_receipt from public.cost_command_receipts receipt
  where receipt.company_id=target_company_id and receipt.actor_id=v_actor_id and receipt.command_name='cost_evidence.finalize' and receipt.idempotency_key=target_idempotency_key for update;
  if found then
    if v_receipt.result_resource_id<>target_id or v_receipt.result_version<>v_expected_version+1 then raise exception using errcode='P0001',message='IDEMPOTENCY_CONFLICT';end if;
    select file.* into v_file from public.cost_evidence_files file where file.id=target_id and file.tenant_id=v_tenant_id and file.company_id=target_company_id and file.status='finalized';
    if not found then raise exception using errcode='P0001',message='IDEMPOTENCY_CONFLICT';end if;
    return jsonb_build_object('id',v_file.id,'status',v_file.status,'originalFilename',v_file.original_filename,'mimeType',v_file.verified_mime_type,'sizeBytes',v_file.verified_size_bytes,'sha256',v_file.verified_sha256,'version',v_file.version,'finalizedAt',v_file.finalized_at,'replayed',true);
  end if;
  if not(target_input ?& array['mimeType','sizeBytes','sha256']) or jsonb_object_length(target_input)<>4
    or jsonb_typeof(target_input->'mimeType') is distinct from 'string'
    or jsonb_typeof(target_input->'sizeBytes') is distinct from 'number' or target_input->>'sizeBytes' !~ '^\d+$'
    or jsonb_typeof(target_input->'sha256') is distinct from 'string' or target_input->>'sha256' !~ '^[a-f0-9]{64}$'
  then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  v_request_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('companyId',target_company_id,'id',target_id,'input',target_input)),'UTF8'),'sha256'),'hex');
  select file.* into v_file from public.cost_evidence_files file where file.id=target_id and file.tenant_id=v_tenant_id and file.company_id=target_company_id for update;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
  if v_file.created_by<>v_actor_id or v_file.status<>'pending_upload' or v_file.intent_expires_at<=now() then raise exception using errcode='P0001',message='EVIDENCE_UPLOAD_MISMATCH';end if;
  if v_file.version<>v_expected_version then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
  if v_file.declared_mime_type<>target_input->>'mimeType' or v_file.declared_size_bytes<>(target_input->>'sizeBytes')::bigint or v_file.declared_sha256<>target_input->>'sha256' then raise exception using errcode='P0001',message='EVIDENCE_UPLOAD_MISMATCH';end if;
  perform set_config('taskovia.c1_evidence.finalize','1',true);
  update public.cost_evidence_files file set status='finalized',verified_mime_type=target_input->>'mimeType',verified_size_bytes=(target_input->>'sizeBytes')::bigint,verified_sha256=target_input->>'sha256',finalized_by=v_actor_id,finalized_at=now(),version=file.version+1 where file.id=v_file.id returning * into v_file;
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version)
  values(v_tenant_id,target_company_id,v_actor_id,'cost_evidence.finalize',target_idempotency_key,v_request_hash,v_file.id,v_file.version);
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,after_summary)
  values(v_tenant_id,target_company_id,v_actor_id,'c1.cost_evidence.finalized','cost_evidence_file',v_file.id::text,target_request_id,jsonb_build_object('mimeType',v_file.verified_mime_type,'sizeBytes',v_file.verified_size_bytes,'sha256',v_file.verified_sha256,'version',v_file.version));
  return jsonb_build_object('id',v_file.id,'status',v_file.status,'originalFilename',v_file.original_filename,'mimeType',v_file.verified_mime_type,'sizeBytes',v_file.verified_size_bytes,'sha256',v_file.verified_sha256,'version',v_file.version,'finalizedAt',v_file.finalized_at,'replayed',false);
end;
$$;
revoke all on function private.c1_finalize_cost_evidence(uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;

notify pgrst,'reload schema';
