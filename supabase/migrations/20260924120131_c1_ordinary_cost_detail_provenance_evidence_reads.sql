set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 12);

do $$
begin
  if to_regclass('public.project_cost_item_detail_sources') is null
    or to_regclass('public.cost_evidence_links') is null
    or to_regprocedure('private.c1_can_read_project_cost_detail(uuid,uuid,uuid,text)') is null then
    raise exception using errcode='P0001', message='C1_DETAIL_PROVENANCE_EVIDENCE_BASELINE_MISSING';
  end if;
end;
$$;

alter table public.cost_evidence_links add column project_cost_item_detail_id uuid;
alter table public.cost_evidence_links
  add constraint cost_evidence_links_detail_scope_fkey
  foreign key (project_cost_item_detail_id, tenant_id, company_id)
  references public.project_cost_item_details(id, tenant_id, company_id) on delete restrict;
do $$
declare v_constraint text;
begin
  select conname into v_constraint from pg_constraint
  where conrelid='public.cost_evidence_links'::regclass and contype='c'
    and pg_get_constraintdef(oid) like '%num_nonnulls(project_cost_item_id, project_subcontract_payment_id)%';
  execute format('alter table public.cost_evidence_links drop constraint %I', v_constraint);
end;
$$;
alter table public.cost_evidence_links
  add constraint cost_evidence_links_exactly_one_target_check
  check (num_nonnulls(project_cost_item_id, project_cost_item_detail_id, project_subcontract_payment_id) = 1);
create index cost_evidence_links_detail_idx on public.cost_evidence_links(tenant_id, company_id, project_cost_item_detail_id, created_at, id) where project_cost_item_detail_id is not null;
create unique index cost_evidence_links_detail_unique on public.cost_evidence_links(evidence_file_id, project_cost_item_detail_id, evidence_kind) where project_cost_item_detail_id is not null;
alter table public.cost_evidence_links drop constraint cost_evidence_links_evidence_kind_check;
alter table public.cost_evidence_links add constraint cost_evidence_links_evidence_kind_check check (evidence_kind in ('contract','acceptance_record','invoice','accounting_support','payment_proof','source_file','source_workbook','other'));

alter table public.project_cost_item_detail_sources enable row level security;
alter table public.project_cost_item_detail_sources force row level security;
revoke all on table public.project_cost_item_detail_sources from public, anon, authenticated;
grant select on table public.project_cost_item_detail_sources to authenticated;
create policy c1_project_cost_item_detail_sources_select on public.project_cost_item_detail_sources for select to authenticated using (
  exists (
    select 1 from public.project_cost_item_details detail
    where detail.id = project_cost_item_detail_id and detail.tenant_id = project_cost_item_detail_sources.tenant_id and detail.company_id = project_cost_item_detail_sources.company_id
      and private.c1_can_read_project_cost_detail(detail.tenant_id, detail.company_id, detail.project_cost_item_id, detail.publication_state)
  )
);
create function private.c1_detail_is_published(target_tenant_id uuid,target_company_id uuid,target_detail_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.project_cost_item_details detail where detail.id=target_detail_id and detail.tenant_id=target_tenant_id and detail.company_id=target_company_id and detail.publication_state='published');
$$;
revoke all on function private.c1_detail_is_published(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.c1_detail_is_published(uuid,uuid,uuid) to authenticated;
drop policy c1_cost_evidence_links_select on public.cost_evidence_links;
create policy c1_cost_evidence_links_select on public.cost_evidence_links for select to authenticated using (
  (
    private.has_company_permission(tenant_id, company_id, 'cost.source.read')
    and (
      project_cost_item_detail_id is null
      or private.c1_detail_is_published(tenant_id,company_id,project_cost_item_detail_id)
    )
  )
  or private.has_company_permission(tenant_id, company_id, 'cost.file.read')
);

create or replace function private.c1_can_select_evidence_object(target_bucket_id text, target_object_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.cost_evidence_files file
    where file.bucket_id=target_bucket_id and file.object_path=target_object_path and (
      (file.status='pending_upload' and file.created_by=auth.uid() and file.intent_expires_at>now() and private.has_company_permission(file.tenant_id,file.company_id,'cost.prepare'))
      or (file.status='finalized' and private.has_company_permission(file.tenant_id,file.company_id,'cost.file.read') and exists (
        select 1 from public.cost_evidence_links link
        where link.evidence_file_id=file.id and link.tenant_id=file.tenant_id and link.company_id=file.company_id and (
          (link.project_cost_item_id is not null and private.c1_can_read_project_cost_child(link.tenant_id,link.company_id,link.project_cost_item_id))
          or (link.project_cost_item_detail_id is not null and exists (
            select 1 from public.project_cost_item_details detail
            where detail.id=link.project_cost_item_detail_id and detail.tenant_id=link.tenant_id and detail.company_id=link.company_id and detail.publication_state='published'
              and private.has_company_permission(detail.tenant_id,detail.company_id,'cost.read')
          ))
          or (link.project_subcontract_payment_id is not null and private.has_company_permission(link.tenant_id,link.company_id,'cost.read'))
        )
      ))
    )
  );
$$;

create function private.c1_link_project_cost_detail_evidence(target_company_id uuid,target_detail_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_context jsonb; v_actor_id uuid:=auth.uid(); v_tenant_id uuid; v_detail public.project_cost_item_details%rowtype; v_file public.cost_evidence_files%rowtype; v_link public.cost_evidence_links%rowtype; v_receipt public.cost_command_receipts%rowtype; v_hash text;
begin
  if v_actor_id is null then raise exception using errcode='P0001',message='PERMISSION_DENIED'; end if;
  v_context:=private.c1_master_context(target_company_id,'cost.prepare'); v_tenant_id:=(v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id or target_idempotency_key is null or target_request_id is null or jsonb_typeof(target_input) is distinct from 'object'
    or not(target_input ?& array['evidenceFileId','evidenceKind']) or exists(select 1 from jsonb_object_keys(target_input) key where key not in('evidenceFileId','evidenceKind'))
    or jsonb_typeof(target_input->'evidenceFileId') is distinct from 'string' or jsonb_typeof(target_input->'evidenceKind') is distinct from 'string'
    or target_input->>'evidenceKind' not in('contract','acceptance_record','invoice','accounting_support','payment_proof','source_workbook','other') then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;
  select detail.* into v_detail from public.project_cost_item_details detail join public.project_cost_items item on item.id=detail.project_cost_item_id and item.tenant_id=detail.tenant_id and item.company_id=detail.company_id
    join public.cost_categories category on category.id=item.cost_category_id and category.tenant_id=item.tenant_id and category.company_id=item.company_id
    where detail.id=target_detail_id and detail.tenant_id=v_tenant_id and detail.company_id=target_company_id and category.posting_strategy='ordinary_detail' for update;
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  select file.* into v_file from public.cost_evidence_files file where file.id=(target_input->>'evidenceFileId')::uuid and file.tenant_id=v_tenant_id and file.company_id=target_company_id and file.project_id=(select item.project_id from public.project_cost_items item where item.id=v_detail.project_cost_item_id) and file.status='finalized';
  if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  v_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('companyId',target_company_id,'detailId',target_detail_id,'input',target_input)),'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('c1_evidence:detail-link:'||target_company_id::text||':'||v_actor_id::text||':'||target_idempotency_key::text,0));
  select receipt.* into v_receipt from public.cost_command_receipts receipt where receipt.company_id=target_company_id and receipt.actor_id=v_actor_id and receipt.command_name='cost_evidence.detail_link' and receipt.idempotency_key=target_idempotency_key for update;
  if found then
    if v_receipt.request_hash<>v_hash then raise exception using errcode='P0001',message='IDEMPOTENCY_CONFLICT'; end if;
    select link.* into v_link from public.cost_evidence_links link where link.id=v_receipt.result_resource_id and link.tenant_id=v_tenant_id and link.company_id=target_company_id;
    return jsonb_build_object('linkId',v_link.id,'detailId',v_link.project_cost_item_detail_id,'evidenceFileId',v_link.evidence_file_id,'evidenceKind',v_link.evidence_kind,'replayed',true);
  end if;
  insert into public.cost_evidence_links(tenant_id,company_id,project_id,evidence_file_id,project_cost_item_detail_id,evidence_kind,request_id,created_by)
  values(v_tenant_id,target_company_id,v_file.project_id,v_file.id,v_detail.id,target_input->>'evidenceKind',target_request_id,v_actor_id) returning * into v_link;
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version) values(v_tenant_id,target_company_id,v_actor_id,'cost_evidence.detail_link',target_idempotency_key,v_hash,v_link.id,0);
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,after_summary) values(v_tenant_id,target_company_id,v_actor_id,'c1.cost_evidence.detail_linked','cost_evidence_link',v_link.id::text,target_request_id,jsonb_build_object('detailId',v_detail.id,'evidenceFileId',v_file.id,'evidenceKind',v_link.evidence_kind));
  return jsonb_build_object('linkId',v_link.id,'detailId',v_link.project_cost_item_detail_id,'evidenceFileId',v_link.evidence_file_id,'evidenceKind',v_link.evidence_kind,'replayed',false);
end;
$$;
create function public.c1_link_project_cost_detail_evidence(target_company_id uuid,target_detail_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language sql volatile security definer set search_path='' as $$select private.c1_link_project_cost_detail_evidence(target_company_id,target_detail_id,target_input,target_idempotency_key,target_request_id);$$;
revoke all on function private.c1_link_project_cost_detail_evidence(uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;
revoke all on function public.c1_link_project_cost_detail_evidence(uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.c1_link_project_cost_detail_evidence(uuid,uuid,jsonb,uuid,uuid) to authenticated;

create function private.c1_legacy_parent_detail_lifecycle()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='project_cost_item_details' then
    if current_setting('taskovia.c1_cost_write.snapshot',true)='1' and exists (select 1 from public.project_cost_items item where item.id=new.project_cost_item_id and item.tenant_id=new.tenant_id and item.company_id=new.company_id and item.publication_state='published') then
      new.publication_state:='published'; new.publication_origin:='command'; new.published_by:=coalesce((select item.published_by from public.project_cost_items item where item.id=new.project_cost_item_id),new.created_by); new.published_at:=now(); new.publication_request_id:=(select item.publication_request_id from public.project_cost_items item where item.id=new.project_cost_item_id);
    end if;
    return new;
  end if;
  if old.publication_state='draft' and new.publication_state='published' then
    update public.project_cost_item_details detail set publication_state='published',publication_origin='command',published_by=new.published_by,published_at=now(),publication_request_id=new.publication_request_id,version=detail.version+1,updated_at=now()
    where detail.project_cost_item_id=new.id and detail.tenant_id=new.tenant_id and detail.company_id=new.company_id and detail.publication_state='draft';
  end if;
  return new;
end;
$$;
create trigger c1_legacy_parent_detail_insert before insert on public.project_cost_item_details for each row execute function private.c1_legacy_parent_detail_lifecycle();
create trigger c1_legacy_parent_detail_publish after update of publication_state on public.project_cost_items for each row execute function private.c1_legacy_parent_detail_lifecycle();

notify pgrst,'reload schema';
