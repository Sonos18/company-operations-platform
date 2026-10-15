set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 54);

-- A4/A5 T4: contract-level evidence (amendment, invoice, payment proof) and the
-- read gate for contract-level files.
--
-- Security model for reading material evidence (single source of truth:
-- private.c1_material_can_read_evidence):
--   * unsigned_quotation            -> c1_material_can_read_order (buyers keep access)
--   * every other role              -> c1_material_can_read_finance
-- Signed quotations and signed contracts carry the contract value that buyers
-- must not see, so they are finance-only together with the contract-level roles.
-- Every read path (read-target RPC, Storage SELECT predicate via
-- c1_workflow_can_read_file, and the metadata RLS policies) goes through it.
--
-- The scope table constraints for material_contract targets were already
-- replaced in 20261015090000 and are not touched here.

create function private.c1_material_evidence_role_permission(target_role text)
returns text language sql immutable set search_path = '' as $$
  select case target_role
    when 'unsigned_quotation' then 'material.order.manage'
    when 'payment_proof' then 'material.payment.execute'
    else 'material.contract.record'
  end;
$$;

create function private.c1_material_evidence_mime_allowed(target_role text, target_mime text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    case target_role
      when 'unsigned_quotation' then target_mime = 'application/pdf'
      when 'signed_quotation' then target_mime = 'application/pdf'
      when 'signed_contract' then target_mime = 'application/pdf'
      when 'contract_amendment' then target_mime = 'application/pdf'
      when 'invoice' then target_mime in ('application/pdf','application/xml','text/xml')
      when 'payment_proof' then target_mime in ('application/pdf','image/jpeg','image/png')
      else false
    end,
    false
  );
$$;

create function private.c1_material_can_read_evidence(t uuid, c uuid, p uuid, file_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.material_evidence_scopes as scope
    where scope.evidence_file_id = file_id
      and scope.tenant_id = t
      and scope.company_id = c
      and scope.project_id = p
      and case scope.evidence_role
        when 'unsigned_quotation' then private.c1_material_can_read_order(t, c, p)
        else private.c1_material_can_read_finance(t, c)
      end
  );
$$;

create or replace function private.c1_material_can_upload_evidence(target_file_id uuid)
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
      and private.c1_material_actor_has_permission(
        evidence.tenant_id, evidence.company_id,
        private.c1_material_evidence_role_permission(scope.evidence_role)
      )
      and case scope.evidence_role
        when 'unsigned_quotation' then
          exists (
            select 1 from public.material_proposals as proposal
            where proposal.id = scope.proposal_id
              and proposal.tenant_id = scope.tenant_id
              and proposal.company_id = scope.company_id
              and proposal.project_id = scope.project_id
              and proposal.review_state = 'approved'
              and proposal.approved_revision_id = scope.revision_id
          )
        when 'signed_quotation' then
          exists (
            select 1 from public.material_orders as material_order
            where material_order.id = scope.order_id
              and material_order.tenant_id = scope.tenant_id
              and material_order.company_id = scope.company_id
              and material_order.project_id = scope.project_id
              and material_order.state = 'active'
          )
        when 'signed_contract' then
          exists (
            select 1 from public.material_orders as material_order
            where material_order.id = scope.order_id
              and material_order.tenant_id = scope.tenant_id
              and material_order.company_id = scope.company_id
              and material_order.project_id = scope.project_id
              and material_order.state = 'active'
          )
        when 'contract_amendment' then
          exists (
            select 1 from public.material_contracts as contract
            where contract.id = scope.contract_id
              and contract.tenant_id = scope.tenant_id
              and contract.company_id = scope.company_id
              and contract.project_id = scope.project_id
          )
        when 'invoice' then
          exists (
            select 1 from public.material_contracts as contract
            where contract.id = scope.contract_id
              and contract.tenant_id = scope.tenant_id
              and contract.company_id = scope.company_id
              and contract.project_id = scope.project_id
          )
        when 'payment_proof' then
          exists (
            select 1 from public.material_contracts as contract
            where contract.id = scope.contract_id
              and contract.tenant_id = scope.tenant_id
              and contract.company_id = scope.company_id
              and contract.project_id = scope.project_id
          )
        else false
      end
  );
$$;

-- Same body as 20261008140741 plus the Storage guard settings injected by
-- 20261009063331 (the taskovia.c1_material_evidence.intent set_config pair).
create or replace function private.c1_material_create_evidence_intent(
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
  v_mime text;
  v_target_kind text;
  v_proposal_id uuid;
  v_revision_id uuid;
  v_order_id uuid;
  v_contract_id uuid;
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
  v_mime := target_input->>'mimeType';
  v_target_kind := target_input#>>'{target,kind}';
  if jsonb_typeof(target_input->'originalFilename') is distinct from 'string'
    or btrim(target_input->>'originalFilename') = ''
    or jsonb_typeof(target_input->'mimeType') is distinct from 'string'
    or not private.c1_material_evidence_mime_allowed(v_role, v_mime)
    or jsonb_typeof(target_input->'sha256') is distinct from 'string'
    or target_input->>'sha256' !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(target_input->'target') is distinct from 'object'
    or jsonb_typeof(target_input->'evidenceRole') is distinct from 'string'
    or jsonb_typeof(target_input#>'{target,kind}') is distinct from 'string'
    or v_role is null
    or v_role <> all(array['unsigned_quotation','signed_quotation','signed_contract','contract_amendment','invoice','payment_proof'])
    or v_target_kind is null
    or v_target_kind <> all(array['material_proposal','material_order','material_contract'])
  then
    -- A type outside the supported set, or a non-PDF file for one of the original
    -- PDF-only roles, keeps the historical code. A supported type that the new
    -- contract-level role does not accept is a plain input error.
    if coalesce(v_mime <> all(array['application/pdf','application/xml','text/xml','image/jpeg','image/png']), true)
      or (v_role in ('unsigned_quotation','signed_quotation','signed_contract') and coalesce(v_mime <> 'application/pdf', true))
    then
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
    v_proposal_id := private.c1_material_uuid(target_input#>'{target,proposalId}');
    v_revision_id := private.c1_material_uuid(target_input#>'{target,revisionId}');
  elsif v_target_kind = 'material_order' then
    perform private.c1_workflow_require_keys(
      target_input->'target', array['kind','orderId'], array['kind','orderId']
    );
    if v_role not in ('signed_quotation','signed_contract') then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end if;
    v_order_id := private.c1_material_uuid(target_input#>'{target,orderId}');
  else
    perform private.c1_workflow_require_keys(
      target_input->'target', array['kind','contractId'], array['kind','contractId']
    );
    if v_role not in ('contract_amendment','invoice','payment_proof') then
      raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
    end if;
    v_contract_id := private.c1_material_uuid(target_input#>'{target,contractId}');
  end if;
  v_permission := private.c1_material_evidence_role_permission(v_role);

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
  elsif v_target_kind = 'material_order' then
    perform material_order.id
    from public.material_orders as material_order
    where material_order.id = v_order_id
      and material_order.tenant_id = v_tenant_id
      and material_order.company_id = target_company_id
      and material_order.project_id = target_project_id
      and material_order.state = 'active'
    for share;
  else
    perform contract.id
    from public.material_contracts as contract
    where contract.id = v_contract_id
      and contract.tenant_id = v_tenant_id
      and contract.company_id = target_company_id
      and contract.project_id = target_project_id
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
  perform set_config('taskovia.c1_material_evidence.intent', v_file_id::text, true);
  insert into public.cost_evidence_files(
    id, tenant_id, company_id, project_id, object_path, original_filename,
    declared_mime_type, declared_size_bytes, declared_sha256, intent_expires_at, created_by
  ) values (
    v_file_id, v_tenant_id, target_company_id, target_project_id, v_path,
    btrim(target_input->>'originalFilename'), v_mime,
    v_size_bytes, target_input->>'sha256',
    now() + interval '15 minutes', v_actor_id
  ) returning * into v_file;
  perform set_config('taskovia.c1_material_evidence.intent', '', true);

  insert into public.material_evidence_scopes(
    evidence_file_id, tenant_id, company_id, project_id, target_kind,
    proposal_id, revision_id, order_id, contract_id, evidence_role, created_by
  ) values (
    v_file.id, v_tenant_id, target_company_id, target_project_id, v_target_kind,
    v_proposal_id, v_revision_id, v_order_id, v_contract_id, v_role, v_actor_id
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
      'revisionId', v_revision_id, 'orderId', v_order_id, 'contractId', v_contract_id,
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

create or replace function private.c1_material_evidence_finalization_target(
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
  v_evidence_scope record;
  v_permission text;
begin
  select evidence as evidence_file, scope as evidence_scope into v_evidence_scope
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
  v_file := v_evidence_scope.evidence_file;
  v_scope := v_evidence_scope.evidence_scope;
  v_permission := private.c1_material_evidence_role_permission(v_scope.evidence_role);
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

create or replace function private.c1_finalize_material_evidence(
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
  v_evidence_scope record;
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
    -- The MIME type must match the declared one (checked against the file below);
    -- here it only has to be a type material evidence can carry at all.
    if jsonb_typeof(target_input->'mimeType') is distinct from 'string'
      or target_input->>'mimeType' <> all(array['application/pdf','application/xml','text/xml','image/jpeg','image/png'])
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

  select evidence as evidence_file, scope as evidence_scope into v_evidence_scope
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
  v_file := v_evidence_scope.evidence_file;
  v_scope := v_evidence_scope.evidence_scope;
  v_permission := private.c1_material_evidence_role_permission(v_scope.evidence_role);
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

-- Read target: any reader with order or finance visibility passes the coarse gate
-- (so engineers still get PERMISSION_DENIED without learning whether a file exists);
-- the per-file decision is then made by private.c1_material_can_read_evidence.
create or replace function public.c1_material_evidence_read_target(target_company_id uuid,target_project_id uuid,target_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb; v_tenant_id uuid; v_file public.cost_evidence_files%rowtype;
begin
  v_context := private.c1_material_context(target_company_id, 'material.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  perform private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id);
  if not (
    private.c1_material_can_read_order(v_tenant_id, target_company_id, target_project_id)
    or private.c1_material_can_read_finance(v_tenant_id, target_company_id)
  ) then
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
  if not private.c1_material_can_read_evidence(v_tenant_id, target_company_id, target_project_id, v_file.id) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  return jsonb_build_object('bucketId', v_file.bucket_id, 'objectPath', v_file.object_path);
end;
$$;

-- Storage SELECT path: c1_can_select_evidence_object delegates material files to
-- this function (20261008140741), whose material branch was "can read order" for
-- every file. Keep the generic workflow branch verbatim (20261008150648) and
-- route the material branch through the role-aware predicate.
create or replace function private.c1_workflow_can_read_file(
  t uuid,
  c uuid,
  p uuid,
  file_id uuid
)
returns boolean language sql stable security definer set search_path='' as $$
  select (
    private.c1_workflow_actor_has_permission(t,c,'cost.request.file.read')
    and private.c1_workflow_can_read(t,c,p)
    and exists (
      select 1
      from public.cost_evidence_files as evidence
      where evidence.id=file_id
        and evidence.tenant_id=t
        and evidence.company_id=c
        and evidence.project_id=p
        and evidence.status='finalized'
        and not private.c1_material_evidence_file(evidence.id)
        and (
          (evidence.workflow_origin and evidence.created_by=(select auth.uid())
            and private.c1_workflow_actor_has_permission(t,c,'cost.request.submit'))
          or exists (
            select 1 from public.cost_workflow_request_evidence as request_evidence
            where request_evidence.evidence_file_id=evidence.id
              and request_evidence.tenant_id=t
              and request_evidence.company_id=c
              and request_evidence.project_id=p
          )
          or exists (
            select 1 from public.cost_workflow_contract_versions as basis
            where evidence.id=any(basis.evidence_file_ids)
              and basis.tenant_id=t
              and basis.company_id=c
              and basis.project_id=p
          )
          or exists (
            select 1 from public.cost_workflow_legacy_cash_reconciliation as mapping
            where evidence.id=any(mapping.evidence_file_ids)
              and mapping.tenant_id=t
              and mapping.company_id=c
              and mapping.project_id=p
          )
          or exists (
            select 1 from public.cost_workflow_payments as payment
            where evidence.id=any(payment.evidence_file_ids)
              and payment.tenant_id=t
              and payment.company_id=c
              and payment.project_id=p
          )
          or (
            evidence.workflow_origin
            and evidence.workflow_target_id is not null
            and evidence.workflow_target_kind in ('payment','adjustment','adjustment_source')
          )
        )
    )
  ) or (
    private.c1_material_can_read_evidence(t,c,p,file_id)
    and exists (
      select 1
      from public.cost_evidence_files as evidence
      where evidence.id=file_id
        and evidence.tenant_id=t
        and evidence.company_id=c
        and evidence.project_id=p
        and evidence.status='finalized'
    )
  );
$$;

-- Row metadata (file name, size, hash) follows the same rule as the file itself.
-- The policies run as authenticated, so the predicate needs EXECUTE (see 20261010072624).
alter policy material_evidence_scopes_financial_read on public.material_evidence_scopes
using (private.c1_material_can_read_evidence(tenant_id, company_id, project_id, evidence_file_id));

alter policy material_cost_evidence_financial_read on public.cost_evidence_files
using (private.c1_material_can_read_evidence(tenant_id, company_id, project_id, id));

-- Evidence bucket: add the MIME types of XML invoices and image payment proofs.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime order by mime)
  from unnest(
    coalesce(allowed_mime_types, '{}')
    || array['application/xml','text/xml','image/jpeg','image/png','application/pdf']
  ) as mime
)
where id = 'c1-accounting-evidence';

revoke all on function
  private.c1_material_evidence_role_permission(text),
  private.c1_material_evidence_mime_allowed(text,text),
  private.c1_material_can_read_evidence(uuid,uuid,uuid,uuid),
  private.c1_material_can_upload_evidence(uuid),
  private.c1_material_create_evidence_intent(uuid,uuid,jsonb,uuid,uuid),
  private.c1_material_evidence_finalization_target(uuid,uuid,uuid),
  private.c1_finalize_material_evidence(uuid,uuid,uuid,jsonb,uuid,uuid)
from public,anon,authenticated,service_role;

revoke all on function public.c1_material_evidence_read_target(uuid,uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.c1_material_evidence_read_target(uuid,uuid,uuid) to authenticated;

revoke all on function private.c1_workflow_can_read_file(uuid,uuid,uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function private.c1_workflow_can_read_file(uuid,uuid,uuid,uuid) to authenticated;

grant execute on function private.c1_material_can_read_evidence(uuid,uuid,uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
