set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 4);

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null
    or to_regclass('public.project_cost_items') is null
    or to_regclass('public.project_subcontract_payments') is null
    or to_regclass('public.accounting_source_versions') is null
    or to_regprocedure('private.c1_master_context(uuid,text)') is null then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTING_EVIDENCE_BASELINE_MISSING';
  end if;
  if to_regclass('public.cost_evidence_files') is not null
    or exists (select 1 from storage.buckets bucket where bucket.id = 'c1-accounting-evidence') then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTING_EVIDENCE_ALREADY_EXISTS';
  end if;
end;
$$;

create table public.cost_evidence_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  bucket_id text not null default 'c1-accounting-evidence' check (bucket_id = 'c1-accounting-evidence'),
  object_path text not null check (object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  original_filename text not null check (btrim(original_filename) <> ''),
  declared_mime_type text not null,
  declared_size_bytes bigint not null check (declared_size_bytes > 0 and declared_size_bytes <= 26214400),
  declared_sha256 text not null check (declared_sha256 ~ '^[a-f0-9]{64}$'),
  verified_mime_type text,
  verified_size_bytes bigint,
  verified_sha256 text,
  status text not null default 'pending_upload' check (status in ('pending_upload','finalized')),
  intent_expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  finalized_by uuid references auth.users(id) on delete restrict,
  finalized_at timestamptz,
  version bigint not null default 0 check (version >= 0),
  unique (id, tenant_id, company_id, project_id),
  unique (bucket_id, object_path),
  foreign key (company_id, tenant_id) references public.companies(id, tenant_id) on delete restrict,
  foreign key (project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id) on delete restrict,
  check (
    (status = 'pending_upload' and verified_mime_type is null and verified_size_bytes is null and verified_sha256 is null and finalized_by is null and finalized_at is null)
    or
    (status = 'finalized' and verified_mime_type = declared_mime_type and verified_size_bytes = declared_size_bytes and verified_sha256 = declared_sha256 and finalized_by is not null and finalized_at is not null)
  )
);

create table public.cost_evidence_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  evidence_file_id uuid not null,
  project_cost_item_id uuid,
  project_subcontract_payment_id uuid,
  evidence_kind text not null check (evidence_kind in ('contract','acceptance_record','invoice','accounting_support','payment_proof','source_file','other')),
  accounting_source_version_id uuid,
  request_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, tenant_id, company_id),
  unique (evidence_file_id, project_cost_item_id, project_subcontract_payment_id, evidence_kind),
  foreign key (company_id, tenant_id) references public.companies(id, tenant_id) on delete restrict,
  foreign key (evidence_file_id, tenant_id, company_id, project_id) references public.cost_evidence_files(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (project_cost_item_id, tenant_id, company_id) references public.project_cost_items(id, tenant_id, company_id) on delete restrict,
  foreign key (project_subcontract_payment_id, tenant_id, company_id, project_id) references public.project_subcontract_payments(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (accounting_source_version_id, tenant_id, company_id) references public.accounting_source_versions(id, tenant_id, company_id) on delete restrict,
  check (num_nonnulls(project_cost_item_id, project_subcontract_payment_id) = 1)
);

create index cost_evidence_files_scope_idx on public.cost_evidence_files(tenant_id, company_id, project_id, status, created_at, id);
create index cost_evidence_links_cost_idx on public.cost_evidence_links(tenant_id, company_id, project_cost_item_id, created_at, id) where project_cost_item_id is not null;
create index cost_evidence_links_payment_idx on public.cost_evidence_links(tenant_id, company_id, project_subcontract_payment_id, created_at, id) where project_subcontract_payment_id is not null;
create unique index cost_evidence_links_cost_unique on public.cost_evidence_links(evidence_file_id, project_cost_item_id, evidence_kind) where project_cost_item_id is not null;
create unique index cost_evidence_links_payment_unique on public.cost_evidence_links(evidence_file_id, project_subcontract_payment_id, evidence_kind) where project_subcontract_payment_id is not null;

alter table public.cost_evidence_files enable row level security;
alter table public.cost_evidence_links enable row level security;
alter table public.cost_evidence_files force row level security;
alter table public.cost_evidence_links force row level security;
revoke all on table public.cost_evidence_files, public.cost_evidence_links from public, anon, authenticated;
grant select on table public.cost_evidence_files, public.cost_evidence_links to authenticated;

create policy c1_cost_evidence_files_select on public.cost_evidence_files for select to authenticated using (
  (status = 'pending_upload' and created_by = auth.uid() and private.has_company_permission(tenant_id, company_id, 'cost.prepare'))
  or
  (status = 'finalized' and (
    private.has_company_permission(tenant_id, company_id, 'cost.source.read')
    or private.has_company_permission(tenant_id, company_id, 'cost.file.read')
  ))
);
create policy c1_cost_evidence_links_select on public.cost_evidence_links for select to authenticated using (
  private.has_company_permission(tenant_id, company_id, 'cost.source.read')
  or private.has_company_permission(tenant_id, company_id, 'cost.file.read')
);

create function private.c1_guard_evidence_history()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception using errcode = 'P0001', message = 'HISTORY_IMMUTABLE'; end if;
  if tg_table_name = 'cost_evidence_links' then raise exception using errcode = 'P0001', message = 'HISTORY_IMMUTABLE'; end if;
  if current_setting('taskovia.c1_evidence.finalize', true) <> '1'
    or old.status <> 'pending_upload' or new.status <> 'finalized'
    or row(new.id,new.tenant_id,new.company_id,new.project_id,new.bucket_id,new.object_path,new.original_filename,new.declared_mime_type,new.declared_size_bytes,new.declared_sha256,new.intent_expires_at,new.created_by,new.created_at)
      is distinct from row(old.id,old.tenant_id,old.company_id,old.project_id,old.bucket_id,old.object_path,old.original_filename,old.declared_mime_type,old.declared_size_bytes,old.declared_sha256,old.intent_expires_at,old.created_by,old.created_at)
  then raise exception using errcode = 'P0001', message = 'HISTORY_IMMUTABLE'; end if;
  return new;
end;
$$;
create trigger c1_cost_evidence_files_immutable before update or delete on public.cost_evidence_files for each row execute function private.c1_guard_evidence_history();
create trigger c1_cost_evidence_links_immutable before update or delete on public.cost_evidence_links for each row execute function private.c1_guard_evidence_history();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('c1-accounting-evidence', 'c1-accounting-evidence', false, 26214400,
  array['application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg']);

create function private.c1_can_insert_evidence_object(target_bucket_id text, target_object_path text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.cost_evidence_files file
    where file.bucket_id = target_bucket_id and file.object_path = target_object_path
      and file.status = 'pending_upload' and file.created_by = auth.uid()
      and file.intent_expires_at > now()
      and private.has_company_permission(file.tenant_id, file.company_id, 'cost.prepare')
  );
$$;
create function private.c1_can_select_evidence_object(target_bucket_id text, target_object_path text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.cost_evidence_files file
    where file.bucket_id = target_bucket_id and file.object_path = target_object_path
      and (
        (file.status = 'pending_upload' and file.created_by = auth.uid() and file.intent_expires_at > now() and private.has_company_permission(file.tenant_id, file.company_id, 'cost.prepare'))
        or (file.status = 'finalized'
          and private.has_company_permission(file.tenant_id, file.company_id, 'cost.file.read')
          and exists (
            select 1 from public.cost_evidence_links link
            where link.evidence_file_id = file.id
              and link.tenant_id = file.tenant_id
              and link.company_id = file.company_id
              and (
                (link.project_cost_item_id is not null and private.c1_can_read_project_cost_child(link.tenant_id, link.company_id, link.project_cost_item_id))
                or
                (link.project_subcontract_payment_id is not null and private.has_company_permission(link.tenant_id, link.company_id, 'cost.read'))
              )
          ))
      )
  );
$$;
revoke all on function private.c1_can_insert_evidence_object(text,text), private.c1_can_select_evidence_object(text,text) from public, anon, authenticated;
grant execute on function private.c1_can_insert_evidence_object(text,text), private.c1_can_select_evidence_object(text,text) to authenticated;

create policy c1_accounting_evidence_objects_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'c1-accounting-evidence' and private.c1_can_insert_evidence_object(bucket_id, name)
);
create policy c1_accounting_evidence_objects_select on storage.objects for select to authenticated using (
  bucket_id = 'c1-accounting-evidence' and private.c1_can_select_evidence_object(bucket_id, name)
);

create function private.c1_create_cost_evidence_intent(target_company_id uuid, target_project_id uuid, target_input jsonb, target_idempotency_key uuid, target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_context jsonb; v_actor_id uuid := auth.uid(); v_tenant_id uuid; v_id uuid := gen_random_uuid();
  v_path text; v_request_hash text; v_receipt public.cost_command_receipts%rowtype; v_file public.cost_evidence_files%rowtype;
begin
  if v_actor_id is null then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  v_context := private.c1_master_context(target_company_id, 'cost.prepare'); v_tenant_id := (v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id or target_idempotency_key is null or target_request_id is null
    or jsonb_typeof(target_input) is distinct from 'object'
    or not (target_input ?& array['originalFilename','mimeType','sizeBytes','sha256'])
    or exists (select 1 from jsonb_object_keys(target_input) key where key not in ('originalFilename','mimeType','sizeBytes','sha256'))
    or jsonb_typeof(target_input->'originalFilename') is distinct from 'string' or btrim(target_input->>'originalFilename') = ''
    or jsonb_typeof(target_input->'mimeType') is distinct from 'string' or target_input->>'mimeType' not in ('application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg')
    or jsonb_typeof(target_input->'sizeBytes') is distinct from 'number' or target_input->>'sizeBytes' !~ '^\d+$' or (target_input->>'sizeBytes')::bigint < 1 or (target_input->>'sizeBytes')::bigint > 26214400
    or jsonb_typeof(target_input->'sha256') is distinct from 'string' or target_input->>'sha256' !~ '^[a-f0-9]{64}$'
  then
    if jsonb_typeof(target_input) = 'object' and target_input ? 'sizeBytes' and target_input->>'sizeBytes' ~ '^\d+$' and (target_input->>'sizeBytes')::bigint > 26214400 then raise exception using errcode = 'P0001', message = 'FILE_TOO_LARGE'; end if;
    if jsonb_typeof(target_input) = 'object' and target_input ? 'mimeType' and target_input->>'mimeType' not in ('application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg') then raise exception using errcode = 'P0001', message = 'FILE_TYPE_UNSUPPORTED'; end if;
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  if not exists (select 1 from public.projects project where project.id = target_project_id and project.tenant_id = v_tenant_id and project.company_id = target_company_id) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  v_request_hash := encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('companyId',target_company_id,'projectId',target_project_id,'input',target_input)),'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('c1_evidence:intent:'||target_company_id::text||':'||v_actor_id::text||':'||target_idempotency_key::text,0));
  select receipt.* into v_receipt from public.cost_command_receipts receipt where receipt.company_id=target_company_id and receipt.actor_id=v_actor_id and receipt.command_name='cost_evidence.intent' and receipt.idempotency_key=target_idempotency_key for update;
  if found then
    if v_receipt.request_hash <> v_request_hash then raise exception using errcode='P0001', message='IDEMPOTENCY_CONFLICT'; end if;
    select file.* into v_file from public.cost_evidence_files file where file.id=v_receipt.result_resource_id and file.tenant_id=v_tenant_id and file.company_id=target_company_id;
    return jsonb_build_object('evidenceFileId',v_file.id,'version',v_file.version,'bucketId',v_file.bucket_id,'objectPath',v_file.object_path,'expiresAt',v_file.intent_expires_at,'replayed',true);
  end if;
  v_path := v_tenant_id::text||'/'||target_company_id::text||'/'||target_project_id::text||'/'||v_id::text;
  insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,intent_expires_at,created_by)
  values(v_id,v_tenant_id,target_company_id,target_project_id,v_path,btrim(target_input->>'originalFilename'),target_input->>'mimeType',(target_input->>'sizeBytes')::bigint,target_input->>'sha256',now()+interval '15 minutes',v_actor_id) returning * into v_file;
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version)
  values(v_tenant_id,target_company_id,v_actor_id,'cost_evidence.intent',target_idempotency_key,v_request_hash,v_file.id,v_file.version);
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,after_summary)
  values(v_tenant_id,target_company_id,v_actor_id,'c1.cost_evidence.intent_created','cost_evidence_file',v_file.id::text,target_request_id,jsonb_build_object('projectId',v_file.project_id,'mimeType',v_file.declared_mime_type,'sizeBytes',v_file.declared_size_bytes,'sha256',v_file.declared_sha256,'version',v_file.version));
  return jsonb_build_object('evidenceFileId',v_file.id,'version',v_file.version,'bucketId',v_file.bucket_id,'objectPath',v_file.object_path,'expiresAt',v_file.intent_expires_at,'replayed',false);
end;
$$;

create function private.c1_finalize_cost_evidence(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_context jsonb; v_actor_id uuid:=auth.uid(); v_tenant_id uuid; v_file public.cost_evidence_files%rowtype; v_request_hash text; v_receipt public.cost_command_receipts%rowtype;
begin
  if v_actor_id is null then raise exception using errcode='P0001',message='PERMISSION_DENIED'; end if;
  v_context:=private.c1_master_context(target_company_id,'cost.prepare'); v_tenant_id:=(v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id or target_idempotency_key is null or target_request_id is null or jsonb_typeof(target_input) is distinct from 'object'
    or not(target_input ?& array['expectedVersion','mimeType','sizeBytes','sha256']) or exists(select 1 from jsonb_object_keys(target_input) key where key not in('expectedVersion','mimeType','sizeBytes','sha256'))
    or jsonb_typeof(target_input->'expectedVersion') is distinct from 'number' or target_input->>'expectedVersion' !~ '^\d+$'
    or jsonb_typeof(target_input->'mimeType') is distinct from 'string' or jsonb_typeof(target_input->'sizeBytes') is distinct from 'number' or target_input->>'sizeBytes' !~ '^\d+$'
    or jsonb_typeof(target_input->'sha256') is distinct from 'string' or target_input->>'sha256' !~ '^[a-f0-9]{64}$'
  then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  v_request_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('companyId',target_company_id,'id',target_id,'input',target_input)),'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('c1_evidence:finalize:'||target_company_id::text||':'||v_actor_id::text||':'||target_idempotency_key::text,0));
  select receipt.* into v_receipt from public.cost_command_receipts receipt where receipt.company_id=target_company_id and receipt.actor_id=v_actor_id and receipt.command_name='cost_evidence.finalize' and receipt.idempotency_key=target_idempotency_key for update;
  if found then
    if v_receipt.request_hash<>v_request_hash then raise exception using errcode='P0001',message='IDEMPOTENCY_CONFLICT'; end if;
    select file.* into v_file from public.cost_evidence_files file where file.id=v_receipt.result_resource_id and file.tenant_id=v_tenant_id and file.company_id=target_company_id;
    return jsonb_build_object('id',v_file.id,'status',v_file.status,'originalFilename',v_file.original_filename,'mimeType',v_file.verified_mime_type,'sizeBytes',v_file.verified_size_bytes,'sha256',v_file.verified_sha256,'version',v_file.version,'finalizedAt',v_file.finalized_at,'replayed',true);
  end if;
  select file.* into v_file from public.cost_evidence_files file where file.id=target_id and file.tenant_id=v_tenant_id and file.company_id=target_company_id for update;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  if v_file.created_by<>v_actor_id or v_file.status<>'pending_upload' or v_file.intent_expires_at<=now() then raise exception using errcode='P0001',message='EVIDENCE_UPLOAD_MISMATCH'; end if;
  if v_file.version<>(target_input->>'expectedVersion')::bigint then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
  if v_file.declared_mime_type<>target_input->>'mimeType' or v_file.declared_size_bytes<>(target_input->>'sizeBytes')::bigint or v_file.declared_sha256<>target_input->>'sha256' then raise exception using errcode='P0001',message='EVIDENCE_UPLOAD_MISMATCH'; end if;
  perform set_config('taskovia.c1_evidence.finalize','1',true);
  update public.cost_evidence_files file set status='finalized',verified_mime_type=target_input->>'mimeType',verified_size_bytes=(target_input->>'sizeBytes')::bigint,verified_sha256=target_input->>'sha256',finalized_by=v_actor_id,finalized_at=now(),version=file.version+1 where file.id=v_file.id returning * into v_file;
  perform set_config('taskovia.c1_evidence.finalize','0',true);
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version) values(v_tenant_id,target_company_id,v_actor_id,'cost_evidence.finalize',target_idempotency_key,v_request_hash,v_file.id,v_file.version);
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,after_summary) values(v_tenant_id,target_company_id,v_actor_id,'c1.cost_evidence.finalized','cost_evidence_file',v_file.id::text,target_request_id,jsonb_build_object('mimeType',v_file.verified_mime_type,'sizeBytes',v_file.verified_size_bytes,'sha256',v_file.verified_sha256,'version',v_file.version));
  return jsonb_build_object('id',v_file.id,'status',v_file.status,'originalFilename',v_file.original_filename,'mimeType',v_file.verified_mime_type,'sizeBytes',v_file.verified_size_bytes,'sha256',v_file.verified_sha256,'version',v_file.version,'finalizedAt',v_file.finalized_at,'replayed',false);
end;
$$;

create function private.c1_link_cost_evidence(target_company_id uuid,target_project_cost_item_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_context jsonb; v_actor_id uuid:=auth.uid(); v_tenant_id uuid; v_cost public.project_cost_items%rowtype; v_file public.cost_evidence_files%rowtype; v_source_version_id uuid; v_link public.cost_evidence_links%rowtype; v_request_hash text; v_receipt public.cost_command_receipts%rowtype;
begin
  if v_actor_id is null then raise exception using errcode='P0001',message='PERMISSION_DENIED'; end if;
  v_context:=private.c1_master_context(target_company_id,'cost.prepare'); v_tenant_id:=(v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id or target_idempotency_key is null or target_request_id is null or jsonb_typeof(target_input) is distinct from 'object'
    or not(target_input ?& array['evidenceFileId','evidenceKind']) or exists(select 1 from jsonb_object_keys(target_input) key where key not in('evidenceFileId','evidenceKind','accountingSourceVersionId'))
    or jsonb_typeof(target_input->'evidenceFileId') is distinct from 'string' or jsonb_typeof(target_input->'evidenceKind') is distinct from 'string'
    or target_input->>'evidenceKind' not in('contract','acceptance_record','invoice','accounting_support','payment_proof','source_file','other')
    or (target_input ? 'accountingSourceVersionId' and jsonb_typeof(target_input->'accountingSourceVersionId') is distinct from 'string')
  then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  begin v_source_version_id:=case when target_input ? 'accountingSourceVersionId' then (target_input->>'accountingSourceVersionId')::uuid end; exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID'; end;
  select item.* into v_cost from public.project_cost_items item where item.id=target_project_cost_item_id and item.tenant_id=v_tenant_id and item.company_id=target_company_id for update;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  select file.* into v_file from public.cost_evidence_files file where file.id=(target_input->>'evidenceFileId')::uuid and file.tenant_id=v_tenant_id and file.company_id=target_company_id and file.project_id=v_cost.project_id and file.status='finalized';
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  if v_source_version_id is not null and not exists(select 1 from public.accounting_source_versions version where version.id=v_source_version_id and version.tenant_id=v_tenant_id and version.company_id=target_company_id) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  v_request_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('companyId',target_company_id,'costId',target_project_cost_item_id,'input',target_input)),'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('c1_evidence:link:'||target_company_id::text||':'||v_actor_id::text||':'||target_idempotency_key::text,0));
  select receipt.* into v_receipt from public.cost_command_receipts receipt where receipt.company_id=target_company_id and receipt.actor_id=v_actor_id and receipt.command_name='cost_evidence.link' and receipt.idempotency_key=target_idempotency_key for update;
  if found then
    if v_receipt.request_hash<>v_request_hash then raise exception using errcode='P0001',message='IDEMPOTENCY_CONFLICT'; end if;
    select link.* into v_link from public.cost_evidence_links link where link.id=v_receipt.result_resource_id and link.tenant_id=v_tenant_id and link.company_id=target_company_id;
    return jsonb_build_object('linkId',v_link.id,'costId',v_link.project_cost_item_id,'evidenceFileId',v_link.evidence_file_id,'evidenceKind',v_link.evidence_kind,'replayed',true);
  end if;
  insert into public.cost_evidence_links(tenant_id,company_id,project_id,evidence_file_id,project_cost_item_id,evidence_kind,accounting_source_version_id,request_id,created_by)
  values(v_tenant_id,target_company_id,v_cost.project_id,v_file.id,v_cost.id,target_input->>'evidenceKind',v_source_version_id,target_request_id,v_actor_id) returning * into v_link;
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version) values(v_tenant_id,target_company_id,v_actor_id,'cost_evidence.link',target_idempotency_key,v_request_hash,v_link.id,0);
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,after_summary) values(v_tenant_id,target_company_id,v_actor_id,'c1.cost_evidence.linked','cost_evidence_link',v_link.id::text,target_request_id,jsonb_build_object('costId',v_cost.id,'evidenceFileId',v_file.id,'evidenceKind',v_link.evidence_kind,'accountingSourceVersionId',v_source_version_id));
  return jsonb_build_object('linkId',v_link.id,'costId',v_link.project_cost_item_id,'evidenceFileId',v_link.evidence_file_id,'evidenceKind',v_link.evidence_kind,'replayed',false);
end;
$$;

create or replace function private.c1_project_cost_publish_readiness(target_tenant_id uuid,target_company_id uuid,target_project_cost_item_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_item public.project_cost_items%rowtype; v_blocking_codes text[]:=array[]::text[];
begin
  select item.* into v_item from public.project_cost_items item where item.id=target_project_cost_item_id and item.tenant_id=target_tenant_id and item.company_id=target_company_id;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  if v_item.publication_state<>'draft' then raise exception using errcode='P0001',message='COST_NOT_DRAFT'; end if;
  if v_item.amount is null or not exists(select 1 from public.project_cost_item_details detail where detail.project_cost_item_id=v_item.id and detail.tenant_id=target_tenant_id and detail.company_id=target_company_id) then v_blocking_codes:=array_append(v_blocking_codes,'FINANCIAL_DETAILS_REQUIRED'); end if;
  if exists(select 1 from public.project_cost_item_sources link join public.source_reported_figures figure on figure.id=link.source_reported_figure_id and figure.tenant_id=link.tenant_id and figure.company_id=link.company_id where link.project_cost_item_id=v_item.id and link.tenant_id=target_tenant_id and link.company_id=target_company_id and figure.status<>'shared') then v_blocking_codes:=array_append(v_blocking_codes,'SOURCE_NOT_SHARED'); end if;
  if exists(select 1 from public.project_cost_item_sources link join public.source_reported_figures figure on figure.id=link.source_reported_figure_id and figure.tenant_id=link.tenant_id and figure.company_id=link.company_id join public.source_review_issues issue on issue.source_selection_id=figure.source_selection_id and issue.tenant_id=figure.tenant_id and issue.company_id=figure.company_id where link.project_cost_item_id=v_item.id and link.tenant_id=target_tenant_id and link.company_id=target_company_id and issue.status='open' and issue.impact='blocks_normalization') then v_blocking_codes:=array_append(v_blocking_codes,'SOURCE_REVIEW_BLOCKING'); end if;
  if exists(select 1 from public.cost_evidence_links link join public.cost_evidence_files file on file.id=link.evidence_file_id and file.tenant_id=link.tenant_id and file.company_id=link.company_id where link.project_cost_item_id=v_item.id and link.tenant_id=target_tenant_id and link.company_id=target_company_id and file.status<>'finalized') then v_blocking_codes:=array_append(v_blocking_codes,'EVIDENCE_NOT_FINALIZED'); end if;
  if exists(select 1 from public.cost_categories category where category.id=v_item.cost_category_id and category.tenant_id=target_tenant_id and category.company_id=target_company_id and category.code='subcontract_labor') then v_blocking_codes:=array_append(v_blocking_codes,'SUBCONTRACT_COST_MODEL_UNSUPPORTED'); end if;
  return jsonb_build_object('ready',cardinality(v_blocking_codes)=0,'blockingCodes',to_jsonb(v_blocking_codes));
end;
$$;

create function public.c1_create_cost_evidence_intent(target_company_id uuid,target_project_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language sql volatile security definer set search_path='' as $$select private.c1_create_cost_evidence_intent(target_company_id,target_project_id,target_input,target_idempotency_key,target_request_id);$$;
create function public.c1_finalize_cost_evidence(target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language sql volatile security definer set search_path='' as $$select private.c1_finalize_cost_evidence(target_company_id,target_id,target_input,target_idempotency_key,target_request_id);$$;
create function public.c1_link_cost_evidence(target_company_id uuid,target_project_cost_item_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language sql volatile security definer set search_path='' as $$select private.c1_link_cost_evidence(target_company_id,target_project_cost_item_id,target_input,target_idempotency_key,target_request_id);$$;

revoke all on function private.c1_guard_evidence_history(),private.c1_create_cost_evidence_intent(uuid,uuid,jsonb,uuid,uuid),private.c1_finalize_cost_evidence(uuid,uuid,jsonb,uuid,uuid),private.c1_link_cost_evidence(uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;
revoke all on function public.c1_create_cost_evidence_intent(uuid,uuid,jsonb,uuid,uuid),public.c1_finalize_cost_evidence(uuid,uuid,jsonb,uuid,uuid),public.c1_link_cost_evidence(uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.c1_create_cost_evidence_intent(uuid,uuid,jsonb,uuid,uuid),public.c1_finalize_cost_evidence(uuid,uuid,jsonb,uuid,uuid),public.c1_link_cost_evidence(uuid,uuid,jsonb,uuid,uuid) to authenticated;
revoke all on function private.c1_project_cost_publish_readiness(uuid,uuid,uuid) from public,anon,authenticated;

notify pgrst,'reload schema';
