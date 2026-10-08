set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 44);

alter table public.material_evidence_scopes add column evidence_role text;

do $$
begin
  if exists (select 1 from public.material_evidence_scopes where evidence_role is null) then
    raise exception using errcode = 'P0001', message = 'MATERIAL_EVIDENCE_ROLE_BACKFILL_REQUIRED';
  end if;
end;
$$;

alter table public.material_evidence_scopes
  alter column evidence_role set not null,
  add constraint material_evidence_scopes_role_target_check check (
    (target_kind = 'material_proposal' and evidence_role = 'unsigned_quotation')
    or (target_kind = 'material_order' and evidence_role in ('signed_quotation','signed_contract'))
  );

create function private.c1_material_evidence_file(target_file_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.material_evidence_scopes as scope
    where scope.evidence_file_id = target_file_id
  );
$$;

create function private.c1_material_size_bytes(target_value jsonb)
returns bigint language plpgsql immutable set search_path = '' as $$
declare v_text text; v_value bigint;
begin
  v_text := target_value#>>'{}';
  if jsonb_typeof(target_value) is distinct from 'number'
    or v_text !~ '^[1-9][0-9]{0,7}$'
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  v_value := v_text::bigint;
  if v_value > 26214400 then raise exception using errcode = 'P0001', message = 'FILE_TOO_LARGE'; end if;
  return v_value;
end;
$$;

create or replace function private.c1_material_version(target_value jsonb)
returns bigint language plpgsql immutable set search_path = '' as $$
declare v_text text;
begin
  v_text := target_value#>>'{}';
  if jsonb_typeof(target_value) is distinct from 'number'
    or v_text !~ '^(0|[1-9][0-9]{0,18})$'
    or char_length(v_text) > 19
    or (char_length(v_text) = 19 and v_text > '9223372036854775807')
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  return v_text::bigint;
end;
$$;

create function private.c1_material_reject_generic_evidence_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.c1_material_evidence_file(new.evidence_file_id) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  return new;
end;
$$;
create trigger c1_material_reject_cost_evidence_link before insert or update on public.cost_evidence_links
for each row execute function private.c1_material_reject_generic_evidence_link();
create trigger c1_material_reject_workflow_evidence_link before insert or update on public.cost_workflow_request_evidence
for each row execute function private.c1_material_reject_generic_evidence_link();

create function private.c1_material_can_upload_evidence(target_file_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.cost_evidence_files as evidence
    join public.material_evidence_scopes as scope
      on scope.evidence_file_id = evidence.id
     and scope.tenant_id = evidence.tenant_id
     and scope.company_id = evidence.company_id
     and scope.project_id = evidence.project_id
    join public.projects as project
      on project.id = evidence.project_id
     and project.tenant_id = evidence.tenant_id
     and project.company_id = evidence.company_id
    where evidence.id = target_file_id
      and evidence.status = 'pending_upload'
      and evidence.intent_expires_at > now()
      and evidence.created_by = auth.uid()
      and scope.created_by = auth.uid()
      and project.operational_state <> 'completed'
      and case scope.evidence_role
        when 'unsigned_quotation' then
          private.c1_material_actor_has_permission(evidence.tenant_id, evidence.company_id, 'material.order.manage')
          and exists (
            select 1 from public.material_proposals as proposal
            where proposal.id = scope.proposal_id
              and proposal.tenant_id = scope.tenant_id
              and proposal.company_id = scope.company_id
              and proposal.project_id = scope.project_id
              and proposal.review_state = 'approved'
              and proposal.approved_revision_id = scope.revision_id
          )
        when 'signed_quotation' then
          private.c1_material_actor_has_permission(evidence.tenant_id, evidence.company_id, 'material.contract.record')
          and exists (
            select 1 from public.material_orders as material_order
            where material_order.id = scope.order_id
              and material_order.tenant_id = scope.tenant_id
              and material_order.company_id = scope.company_id
              and material_order.project_id = scope.project_id
              and material_order.state = 'active'
          )
        when 'signed_contract' then
          private.c1_material_actor_has_permission(evidence.tenant_id, evidence.company_id, 'material.contract.record')
          and exists (
            select 1 from public.material_orders as material_order
            where material_order.id = scope.order_id
              and material_order.tenant_id = scope.tenant_id
              and material_order.company_id = scope.company_id
              and material_order.project_id = scope.project_id
              and material_order.state = 'active'
          )
        else false
      end
  );
$$;

create function private.c1_material_create_evidence_intent(
  target_company_id uuid,
  target_project_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_actor_id uuid := auth.uid();
  v_permission text;
  v_role text;
  v_target_kind text;
  v_proposal_id uuid;
  v_revision_id uuid;
  v_order_id uuid;
  v_size_bytes bigint;
  v_file_id uuid := gen_random_uuid();
  v_path text;
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_file public.cost_evidence_files%rowtype;
begin
  perform private.c1_workflow_require_keys(
    target_input,
    array['originalFilename','mimeType','sizeBytes','sha256','evidenceRole','target'],
    array['originalFilename','mimeType','sizeBytes','sha256','evidenceRole','target']
  );
  v_role := target_input->>'evidenceRole';
  v_target_kind := target_input#>>'{target,kind}';
  if jsonb_typeof(target_input->'originalFilename') is distinct from 'string'
    or btrim(target_input->>'originalFilename') = ''
    or jsonb_typeof(target_input->'mimeType') is distinct from 'string'
    or target_input->>'mimeType' is distinct from 'application/pdf'
    or jsonb_typeof(target_input->'sha256') is distinct from 'string'
    or target_input->>'sha256' !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(target_input->'target') is distinct from 'object'
    or jsonb_typeof(target_input->'evidenceRole') is distinct from 'string'
    or jsonb_typeof(target_input#>'{target,kind}') is distinct from 'string'
    or v_role is null
    or v_role <> all(array['unsigned_quotation','signed_quotation','signed_contract'])
    or v_target_kind is null
    or v_target_kind <> all(array['material_proposal','material_order'])
  then
    if target_input->>'mimeType' is distinct from 'application/pdf' then
      raise exception using errcode = 'P0001', message = 'FILE_TYPE_UNSUPPORTED';
    end if;
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  v_size_bytes := private.c1_material_size_bytes(target_input->'sizeBytes');

  if v_target_kind = 'material_proposal' then
    perform private.c1_workflow_require_keys(
      target_input->'target', array['kind','proposalId','revisionId'], array['kind','proposalId','revisionId']
    );
    if v_role <> 'unsigned_quotation' then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end if;
    v_permission := 'material.order.manage';
    v_proposal_id := private.c1_material_uuid(target_input#>'{target,proposalId}');
    v_revision_id := private.c1_material_uuid(target_input#>'{target,revisionId}');
  else
    perform private.c1_workflow_require_keys(
      target_input->'target', array['kind','orderId'], array['kind','orderId']
    );
    if v_role not in ('signed_quotation','signed_contract') then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end if;
    v_permission := 'material.contract.record';
    v_order_id := private.c1_material_uuid(target_input#>'{target,orderId}');
  end if;

  v_context := private.c1_material_context(target_company_id, v_permission);
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if v_actor_id is null or (v_context->>'actorId')::uuid is distinct from v_actor_id
    or target_idempotency_key is null or target_request_id is null
  then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  if (private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id)).operational_state = 'completed' then
    raise exception using errcode = 'P0001', message = 'PROJECT_COMPLETED';
  end if;

  if v_target_kind = 'material_proposal' then
    perform proposal.id
    from public.material_proposals as proposal
    where proposal.id = v_proposal_id
      and proposal.tenant_id = v_tenant_id
      and proposal.company_id = target_company_id
      and proposal.project_id = target_project_id
      and proposal.review_state = 'approved'
      and proposal.approved_revision_id = v_revision_id
    for share;
  else
    perform material_order.id
    from public.material_orders as material_order
    where material_order.id = v_order_id
      and material_order.tenant_id = v_tenant_id
      and material_order.company_id = target_company_id
      and material_order.project_id = target_project_id
      and material_order.state = 'active'
    for share;
  end if;
  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  v_hash := private.c1_workflow_hash(target_project_id, target_project_id, target_input);
  v_receipt := private.c1_workflow_receipt(
    v_tenant_id, target_company_id, 'material.evidence_intent', target_idempotency_key, v_hash
  );
  if v_receipt.id is not null then
    select evidence.* into v_file
    from public.cost_evidence_files as evidence
    join public.material_evidence_scopes as scope
      on scope.evidence_file_id = evidence.id
     and scope.tenant_id = evidence.tenant_id
     and scope.company_id = evidence.company_id
     and scope.project_id = evidence.project_id
    where evidence.id = v_receipt.result_resource_id
      and evidence.tenant_id = v_tenant_id
      and evidence.company_id = target_company_id
      and evidence.project_id = target_project_id
      and scope.evidence_role = v_role;
    if not found then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object(
      'evidenceFileId', v_file.id, 'version', v_file.version,
      'bucketId', v_file.bucket_id, 'objectPath', v_file.object_path,
      'expiresAt', v_file.intent_expires_at, 'replayed', true
    );
  end if;

  v_path := v_tenant_id::text || '/' || target_company_id::text || '/' || target_project_id::text || '/' || v_file_id::text;
  insert into public.cost_evidence_files(
    id, tenant_id, company_id, project_id, object_path, original_filename,
    declared_mime_type, declared_size_bytes, declared_sha256, intent_expires_at, created_by
  ) values (
    v_file_id, v_tenant_id, target_company_id, target_project_id, v_path,
    btrim(target_input->>'originalFilename'), 'application/pdf',
    v_size_bytes, target_input->>'sha256',
    now() + interval '15 minutes', v_actor_id
  ) returning * into v_file;

  insert into public.material_evidence_scopes(
    evidence_file_id, tenant_id, company_id, project_id, target_kind,
    proposal_id, revision_id, order_id, evidence_role, created_by
  ) values (
    v_file.id, v_tenant_id, target_company_id, target_project_id, v_target_kind,
    v_proposal_id, v_revision_id, v_order_id, v_role, v_actor_id
  );
  insert into public.cost_command_receipts(
    tenant_id, company_id, actor_id, command_name, idempotency_key,
    request_hash, result_resource_id, result_version
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'material.evidence_intent', target_idempotency_key,
    v_hash, v_file.id, v_file.version
  );
  insert into public.audit_events(
    tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, after_summary
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'c1.material_evidence.intent_created',
    'cost_evidence_file', v_file.id::text, target_request_id,
    jsonb_build_object(
      'projectId', target_project_id, 'evidenceRole', v_role,
      'targetKind', v_target_kind, 'proposalId', v_proposal_id,
      'revisionId', v_revision_id, 'orderId', v_order_id,
      'mimeType', v_file.declared_mime_type, 'sizeBytes', v_file.declared_size_bytes,
      'sha256', v_file.declared_sha256, 'version', v_file.version
    )
  );
  return jsonb_build_object(
    'evidenceFileId', v_file.id, 'version', v_file.version,
    'bucketId', v_file.bucket_id, 'objectPath', v_file.object_path,
    'expiresAt', v_file.intent_expires_at, 'replayed', false
  );
end;
$$;

create function private.c1_material_evidence_finalization_target(
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_file public.cost_evidence_files%rowtype;
  v_scope public.material_evidence_scopes%rowtype;
  v_permission text;
begin
  select evidence, scope into v_file, v_scope
  from public.cost_evidence_files as evidence
  join public.material_evidence_scopes as scope
    on scope.evidence_file_id = evidence.id
   and scope.tenant_id = evidence.tenant_id
   and scope.company_id = evidence.company_id
   and scope.project_id = evidence.project_id
  where evidence.id = target_id
    and evidence.company_id = target_company_id
    and evidence.project_id = target_project_id
    and evidence.created_by = auth.uid()
    and scope.created_by = auth.uid();
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  v_permission := case when v_scope.evidence_role = 'unsigned_quotation'
    then 'material.order.manage' else 'material.contract.record' end;
  v_context := private.c1_material_context(target_company_id, v_permission);
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if v_file.tenant_id <> v_tenant_id then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  if v_file.status = 'finalized' then
    return jsonb_build_object('status', 'finalized');
  end if;
  if not private.c1_material_can_upload_evidence(v_file.id) then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_MISMATCH';
  end if;
  return jsonb_build_object(
    'status', v_file.status,
    'bucketId', v_file.bucket_id,
    'objectPath', v_file.object_path,
    'declaredMimeType', v_file.declared_mime_type,
    'declaredSizeBytes', v_file.declared_size_bytes,
    'declaredSha256', v_file.declared_sha256
  );
end;
$$;

create function private.c1_finalize_material_evidence(
  target_company_id uuid,
  target_project_id uuid,
  target_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_actor_id uuid := auth.uid();
  v_file public.cost_evidence_files%rowtype;
  v_scope public.material_evidence_scopes%rowtype;
  v_permission text;
  v_expected_version bigint;
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_verified_field_count integer;
  v_size_bytes bigint;
begin
  if target_idempotency_key is null or target_request_id is null
    or jsonb_typeof(target_input) is distinct from 'object'
    or not (target_input ? 'expectedVersion')
    or exists (select 1 from jsonb_object_keys(target_input) as key where key not in ('expectedVersion','mimeType','sizeBytes','sha256'))
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  v_expected_version := private.c1_material_version(target_input->'expectedVersion');
  v_verified_field_count := (target_input ? 'mimeType')::integer
    + (target_input ? 'sizeBytes')::integer
    + (target_input ? 'sha256')::integer;
  if v_verified_field_count not in (0,3) then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  if v_verified_field_count = 3 then
    if jsonb_typeof(target_input->'mimeType') is distinct from 'string'
      or target_input->>'mimeType' is distinct from 'application/pdf'
      or jsonb_typeof(target_input->'sha256') is distinct from 'string'
      or target_input->>'sha256' !~ '^[a-f0-9]{64}$'
    then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
    v_size_bytes := private.c1_material_size_bytes(target_input->'sizeBytes');
    v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'c1_material:evidence_finalize:' || target_company_id::text || ':' || v_actor_id::text || ':' || target_idempotency_key::text, 0
  ));
  select receipt.* into v_receipt
  from public.cost_command_receipts as receipt
  where receipt.company_id = target_company_id
    and receipt.actor_id = v_actor_id
    and receipt.command_name = 'material.evidence_finalize'
    and receipt.idempotency_key = target_idempotency_key
  for update;
  if found then
    if v_receipt.result_resource_id <> target_id or v_receipt.result_version <> v_expected_version + 1 then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    if v_verified_field_count = 3 and v_receipt.request_hash <> v_hash then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    select evidence.* into v_file
    from public.cost_evidence_files as evidence
    where evidence.id = target_id
      and evidence.company_id = target_company_id
      and evidence.project_id = target_project_id
      and evidence.created_by = v_actor_id
      and evidence.status = 'finalized';
    if not found then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object(
      'id', v_file.id, 'status', v_file.status, 'originalFilename', v_file.original_filename,
      'mimeType', v_file.verified_mime_type, 'sizeBytes', v_file.verified_size_bytes,
      'sha256', v_file.verified_sha256, 'version', v_file.version,
      'finalizedAt', v_file.finalized_at, 'replayed', true
    );
  end if;

  if v_verified_field_count <> 3 then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

  select evidence, scope into v_file, v_scope
  from public.cost_evidence_files as evidence
  join public.material_evidence_scopes as scope
    on scope.evidence_file_id = evidence.id
   and scope.tenant_id = evidence.tenant_id
   and scope.company_id = evidence.company_id
   and scope.project_id = evidence.project_id
  where evidence.id = target_id
    and evidence.company_id = target_company_id
    and evidence.project_id = target_project_id
  for update of evidence;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  v_permission := case when v_scope.evidence_role = 'unsigned_quotation'
    then 'material.order.manage' else 'material.contract.record' end;
  v_context := private.c1_material_context(target_company_id, v_permission);
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if v_file.tenant_id <> v_tenant_id or v_file.created_by <> v_actor_id or v_scope.created_by <> v_actor_id
    or not private.c1_material_can_upload_evidence(v_file.id)
  then raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_MISMATCH'; end if;
  if v_file.version <> v_expected_version then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;
  if v_file.declared_mime_type <> target_input->>'mimeType'
    or v_file.declared_size_bytes <> v_size_bytes
    or v_file.declared_sha256 <> target_input->>'sha256'
  then raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_MISMATCH'; end if;

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  perform set_config('taskovia.c1_evidence.finalize', '1', true);
  update public.cost_evidence_files as evidence
  set status = 'finalized',
      verified_mime_type = target_input->>'mimeType',
      verified_size_bytes = v_size_bytes,
      verified_sha256 = target_input->>'sha256',
      finalized_by = v_actor_id,
      finalized_at = now(),
      version = evidence.version + 1
  where evidence.id = v_file.id
  returning evidence.* into v_file;

  insert into public.cost_command_receipts(
    tenant_id, company_id, actor_id, command_name, idempotency_key,
    request_hash, result_resource_id, result_version
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'material.evidence_finalize', target_idempotency_key,
    v_hash, v_file.id, v_file.version
  );
  insert into public.audit_events(
    tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, after_summary
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'c1.material_evidence.finalized',
    'cost_evidence_file', v_file.id::text, target_request_id,
    jsonb_build_object(
      'projectId', target_project_id, 'evidenceRole', v_scope.evidence_role,
      'targetKind', v_scope.target_kind, 'mimeType', v_file.verified_mime_type,
      'sizeBytes', v_file.verified_size_bytes, 'sha256', v_file.verified_sha256,
      'version', v_file.version
    )
  );
  return jsonb_build_object(
    'id', v_file.id, 'status', v_file.status, 'originalFilename', v_file.original_filename,
    'mimeType', v_file.verified_mime_type, 'sizeBytes', v_file.verified_size_bytes,
    'sha256', v_file.verified_sha256, 'version', v_file.version,
    'finalizedAt', v_file.finalized_at, 'replayed', false
  );
end;
$$;

create function public.c1_material_create_evidence_intent(target_company_id uuid,target_project_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.c1_material_create_evidence_intent(target_company_id,target_project_id,target_input,target_idempotency_key,target_request_id);
$$;

create function public.c1_material_evidence_finalization_target(target_company_id uuid,target_project_id uuid,target_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.c1_material_evidence_finalization_target(target_company_id,target_project_id,target_id);
$$;

create function public.c1_finalize_material_evidence_server(target_actor_id uuid,target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  if target_actor_id is null then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',target_actor_id,'role','authenticated')::text, true);
  perform private.c1_material_evidence_finalization_target(target_company_id,target_project_id,target_id);
  return private.c1_finalize_material_evidence(
    target_company_id,target_project_id,target_id,target_input,target_idempotency_key,target_request_id
  );
end;
$$;

create function public.c1_material_evidence_read_target(target_company_id uuid,target_project_id uuid,target_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb; v_tenant_id uuid; v_file public.cost_evidence_files%rowtype;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id);
  if not private.c1_material_can_read_order(v_tenant_id, target_company_id, target_project_id) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  select evidence.* into v_file
  from public.cost_evidence_files as evidence
  join public.material_evidence_scopes as scope
    on scope.evidence_file_id = evidence.id
   and scope.tenant_id = evidence.tenant_id
   and scope.company_id = evidence.company_id
   and scope.project_id = evidence.project_id
  where evidence.id = target_id
    and evidence.tenant_id = v_tenant_id
    and evidence.company_id = target_company_id
    and evidence.project_id = target_project_id
    and evidence.status = 'finalized';
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  return jsonb_build_object('bucketId', v_file.bucket_id, 'objectPath', v_file.object_path);
end;
$$;

create or replace function private.c1_can_select_evidence_object(target_bucket_id text,target_object_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cost_evidence_files as evidence
    where evidence.bucket_id = target_bucket_id
      and evidence.object_path = target_object_path
      and exists (
        select 1 from auth.users as account
        where account.id = auth.uid()
          and (account.banned_until is null or account.banned_until <= now())
      )
      and (
        private.c1_material_can_upload_evidence(evidence.id)
        or (private.c1_material_evidence_file(evidence.id)
          and private.c1_workflow_can_read_file(evidence.tenant_id,evidence.company_id,evidence.project_id,evidence.id))
        or (not private.c1_material_evidence_file(evidence.id) and (
          (not evidence.workflow_origin and private.c1_can_select_evidence_object_legacy(target_bucket_id,target_object_path))
          or (evidence.workflow_origin and evidence.created_by = auth.uid()
            and evidence.status = 'pending_upload' and evidence.intent_expires_at > now()
            and private.c1_workflow_actor_has_permission(evidence.tenant_id,evidence.company_id,'cost.prepare')
            and private.c1_workflow_actor_has_permission(evidence.tenant_id,evidence.company_id,'cost.request.submit'))
          or private.c1_workflow_can_read_file(evidence.tenant_id,evidence.company_id,evidence.project_id,evidence.id)
        ))
      )
  );
$$;

create or replace function private.c1_can_insert_evidence_object(target_bucket_id text,target_object_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.cost_evidence_files as evidence
    join public.projects as project
      on project.id = evidence.project_id
     and project.tenant_id = evidence.tenant_id
     and project.company_id = evidence.company_id
    where evidence.bucket_id = target_bucket_id
      and evidence.object_path = target_object_path
      and (
        private.c1_material_can_upload_evidence(evidence.id)
        or (not private.c1_material_evidence_file(evidence.id) and (
          (not evidence.workflow_origin
            and not exists (
              select 1 from public.cost_workflow_companies as workflow
              where workflow.tenant_id = evidence.tenant_id
                and workflow.company_id = evidence.company_id
                and workflow.mode = 'document_backed_v1'
            )
            and private.c1_can_insert_evidence_object_legacy(target_bucket_id,target_object_path))
          or (evidence.workflow_origin and evidence.created_by = auth.uid()
            and evidence.status = 'pending_upload' and evidence.intent_expires_at > now()
            and private.c1_workflow_actor_has_permission(evidence.tenant_id,evidence.company_id,'cost.prepare')
            and private.c1_workflow_actor_has_permission(evidence.tenant_id,evidence.company_id,'cost.request.submit')
            and private.c1_workflow_evidence_target_allowed(
              evidence.tenant_id,evidence.company_id,evidence.project_id,
              evidence.workflow_target_kind,evidence.workflow_target_id,project.operational_state = 'completed'
            ))
        ))
      )
  );
$$;

alter policy c1_cost_evidence_files_select on public.cost_evidence_files using (
  not private.c1_material_evidence_file(id)
  and (
    private.c1_workflow_can_read_file(tenant_id,company_id,project_id,id)
    or (workflow_origin and (
      (created_by = auth.uid()
        and private.c1_workflow_actor_has_permission(tenant_id,company_id,'cost.request.submit')
        and private.c1_workflow_actor_has_permission(tenant_id,company_id,'cost.prepare'))
      or private.c1_workflow_can_read_file(tenant_id,company_id,project_id,id)
    ))
    or (not workflow_origin and (
      (status = 'pending_upload' and created_by = auth.uid()
        and private.c1_workflow_actor_has_permission(tenant_id,company_id,'cost.prepare'))
      or (status = 'finalized'
        and private.c1_workflow_actor_has_permission(tenant_id,company_id,'cost.source.read'))
    ))
  )
);

create or replace function private.c1_get_cost_evidence_read_target(target_company_id uuid,target_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb; v_tenant_id uuid; v_file public.cost_evidence_files%rowtype;
begin
  if auth.uid() is null or private.c1_material_evidence_file(target_id) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  v_context := private.c1_master_context(target_company_id,'cost.file.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  select file.* into v_file from public.cost_evidence_files as file
  where file.id = target_id and file.tenant_id = v_tenant_id and file.company_id = target_company_id
    and file.status = 'finalized' and private.c1_can_select_evidence_object(file.bucket_id,file.object_path);
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  return jsonb_build_object('bucketId',v_file.bucket_id,'objectPath',v_file.object_path);
end;
$$;

revoke all on function
  private.c1_material_evidence_file(uuid),
  private.c1_material_size_bytes(jsonb),
  private.c1_material_reject_generic_evidence_link(),
  private.c1_material_can_upload_evidence(uuid),
  private.c1_material_create_evidence_intent(uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_evidence_finalization_target(uuid,uuid,uuid),
  private.c1_finalize_material_evidence(uuid,uuid,uuid,jsonb,uuid,uuid)
from public,anon,authenticated,service_role;

revoke all on function
  public.c1_material_create_evidence_intent(uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_evidence_finalization_target(uuid,uuid,uuid),
  public.c1_finalize_material_evidence_server(uuid,uuid,uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_evidence_read_target(uuid,uuid,uuid),
  private.c1_can_insert_evidence_object(text,text),
  private.c1_can_select_evidence_object(text,text)
from public,anon,authenticated,service_role;

grant execute on function
  public.c1_material_create_evidence_intent(uuid,uuid,jsonb,uuid,uuid),
  public.c1_material_evidence_finalization_target(uuid,uuid,uuid),
  public.c1_material_evidence_read_target(uuid,uuid,uuid),
  private.c1_can_insert_evidence_object(text,text),
  private.c1_can_select_evidence_object(text,text)
to authenticated;

grant execute on function public.c1_finalize_material_evidence_server(uuid,uuid,uuid,uuid,jsonb,uuid,uuid)
to service_role;

notify pgrst, 'reload schema';
