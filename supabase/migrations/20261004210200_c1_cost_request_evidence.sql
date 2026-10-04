set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,31);

alter table public.cost_evidence_files
 add column workflow_evidence_kind text,
 add column workflow_origin boolean not null default false,
 add column workflow_target_kind text,
 add column workflow_target_id uuid;
alter table public.cost_evidence_files add constraint c1_workflow_evidence_target_shape check(
 (not workflow_origin and workflow_evidence_kind is null and workflow_target_kind is null and workflow_target_id is null)
 or (workflow_origin and workflow_evidence_kind is not null and workflow_evidence_kind in('contract','quotation','acceptance_record','invoice','accounting_support','payment_proof','source_workbook','other') and workflow_target_kind is not null and workflow_target_kind in('request','payment','adjustment','adjustment_source')
     and (workflow_target_kind='request' or workflow_target_id is not null)));

create table public.cost_workflow_request_evidence (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,company_id uuid not null,project_id uuid not null,
 request_id uuid not null,request_version bigint not null check(request_version>=0),
 evidence_file_id uuid not null,evidence_kind text not null default 'accounting_support'
 check(evidence_kind in('contract','quotation','acceptance_record','invoice','accounting_support','payment_proof','source_workbook','other')),
 created_by uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
 unique(request_id,request_version,evidence_file_id),
 foreign key(request_id,tenant_id,company_id,project_id) references public.cost_workflow_requests(id,tenant_id,company_id,project_id) on delete restrict,
 foreign key(evidence_file_id,tenant_id,company_id,project_id) references public.cost_evidence_files(id,tenant_id,company_id,project_id) on delete restrict
);
create index c1_workflow_evidence_file_scope on public.cost_workflow_request_evidence(tenant_id,company_id,project_id,evidence_file_id);
create table public.cost_workflow_completion_installments (
 installment_id uuid primary key,tenant_id uuid not null,company_id uuid not null,project_id uuid not null,
 captured_at timestamptz not null default now(),
 foreign key(installment_id,tenant_id,company_id,project_id) references public.cost_workflow_installments(id,tenant_id,company_id,project_id) on delete restrict
);
alter table public.cost_workflow_request_evidence enable row level security;
alter table public.cost_workflow_request_evidence force row level security;
alter table public.cost_workflow_completion_installments enable row level security;
alter table public.cost_workflow_completion_installments force row level security;
revoke all on public.cost_workflow_request_evidence,public.cost_workflow_completion_installments from public,anon,authenticated,service_role;
grant select on public.cost_workflow_request_evidence,public.cost_workflow_completion_installments to authenticated;
create policy c1_workflow_evidence_links_read on public.cost_workflow_request_evidence for select to authenticated using(private.c1_workflow_can_read(tenant_id,company_id,project_id));
create policy c1_workflow_completion_read on public.cost_workflow_completion_installments for select to authenticated using(private.c1_workflow_can_read(tenant_id,company_id,project_id));
create trigger c1_workflow_evidence_retain before update or delete on public.cost_workflow_request_evidence for each row execute function private.c1_workflow_retain_history();
create trigger c1_workflow_completion_retain before update or delete on public.cost_workflow_completion_installments for each row execute function private.c1_workflow_retain_history();

create function private.c1_workflow_capture_completion() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.cost_workflow_completion_installments(installment_id,tenant_id,company_id,project_id)
 select i.id,i.tenant_id,i.company_id,i.project_id from public.cost_workflow_installments i
 where i.tenant_id=new.tenant_id and i.company_id=new.company_id and i.project_id=new.id;
 return new;
end;$$;
revoke all on function private.c1_workflow_capture_completion() from public,anon,authenticated,service_role;
create trigger c1_workflow_capture_completion after update of operational_state on public.projects
 for each row when(old.operational_state<>'completed' and new.operational_state='completed')
 execute function private.c1_workflow_capture_completion();

create function private.c1_workflow_context(target_company_id uuid,target_permission text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c jsonb;
begin
 c:=private.c1_master_context(target_company_id,target_permission);
 if auth.uid() is null or (c->>'actorId')::uuid is distinct from auth.uid() then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 if not exists(select 1 from public.cost_workflow_companies w where w.tenant_id=(c->>'tenantId')::uuid and w.company_id=target_company_id and w.mode='document_backed_v1')
 then raise exception using errcode='P0001',message='WORKFLOW_NOT_ACTIVE';end if;
 return c;
end;$$;
revoke all on function private.c1_workflow_context(uuid,text) from public,anon,authenticated,service_role;

create function private.c1_workflow_evidence_target_allowed(t uuid,c uuid,p uuid,k text,target uuid,completed boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select case
 when k='request' then not completed and (target is null or exists(
   select 1 from public.cost_workflow_requests r where r.id=target and r.tenant_id=t and r.company_id=c and r.project_id=p
   and r.kind in('installment','contract_adjustment') and r.state in('working','returned')))
 when k='payment' then exists(
   select 1 from public.cost_workflow_installments i where i.id=target and i.tenant_id=t and i.company_id=c and i.project_id=p
   and i.authorized_amount>coalesce((select sum(x.amount) from public.cost_workflow_consumptions x where x.installment_id=i.id),0)
   and (not completed or exists(select 1 from public.cost_workflow_completion_installments h where h.installment_id=i.id)))
 when k='adjustment' then exists(
   select 1 from public.cost_workflow_requests r join public.cost_workflow_payments payment
    on payment.id=r.source_payment_id and payment.tenant_id=r.tenant_id and payment.company_id=r.company_id and payment.project_id=r.project_id
   where r.id=target and r.tenant_id=t and r.company_id=c and r.project_id=p and r.kind in('refund','correction')
   and (not completed or exists(select 1 from public.cost_workflow_completion_installments h where h.installment_id=payment.installment_id)))
 else false end;
$$;
revoke all on function private.c1_workflow_evidence_target_allowed(uuid,uuid,uuid,text,uuid,boolean) from public,anon,authenticated,service_role;

create function private.c1_workflow_evidence_completed_exception(file_row jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare project_state text;t uuid:=(file_row->>'tenant_id')::uuid;c uuid:=(file_row->>'company_id')::uuid;p uuid:=(file_row->>'project_id')::uuid;
begin
 select operational_state into project_state from public.projects where id=p and tenant_id=t and company_id=c for share;
 return project_state='completed' and file_row->>'workflow_origin'='true'
 and private.has_company_permission(t,c,'cost.request.submit') and private.has_company_permission(t,c,'cost.prepare')
 and private.c1_workflow_evidence_target_allowed(t,c,p,file_row->>'workflow_target_kind',(file_row->>'workflow_target_id')::uuid,true);
end;$$;
revoke all on function private.c1_workflow_evidence_completed_exception(jsonb) from public,anon,authenticated,service_role;

create function private.c1_workflow_guard_original_target() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.workflow_origin,new.workflow_evidence_kind,new.workflow_target_kind,new.workflow_target_id) is distinct from row(old.workflow_origin,old.workflow_evidence_kind,old.workflow_target_kind,old.workflow_target_id)
 then raise exception using errcode='P0001',message='WORKFLOW_HISTORY_IMMUTABLE';end if;
 return new;
end;$$;
revoke all on function private.c1_workflow_guard_original_target() from public,anon,authenticated,service_role;
create trigger c1_workflow_original_target_immutable before update on public.cost_evidence_files for each row execute function private.c1_workflow_guard_original_target();

-- The shared validator is also called by request/cash commands under project locks.
create function private.c1_workflow_require_evidence(t uuid,c uuid,p uuid,ids uuid[]) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if cardinality(ids) is null or cardinality(ids)<1 or cardinality(ids)>100 or array_position(ids,null) is not null
 or cardinality(ids)<>(select count(distinct id) from unnest(ids) id)
 or cardinality(ids)<>(select count(*) from public.cost_evidence_files f where f.id=any(ids) and f.tenant_id=t and f.company_id=c and f.project_id=p and f.status='finalized')
 then raise exception using errcode='P0001',message='EVIDENCE_UPLOAD_MISMATCH';end if;
end;$$;
revoke all on function private.c1_workflow_require_evidence(uuid,uuid,uuid,uuid[]) from public,anon,authenticated,service_role;

create function private.c1_workflow_can_read_file(t uuid,c uuid,p uuid,file_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.has_company_permission(t,c,'cost.request.file.read') and private.c1_workflow_can_read(t,c,p)
 and exists(select 1 from public.cost_evidence_files f where f.id=file_id and f.tenant_id=t and f.company_id=c and f.project_id=p and f.status='finalized'
 and ((f.workflow_origin and f.created_by=(select auth.uid()) and private.has_company_permission(t,c,'cost.request.submit'))
 or exists(select 1 from public.cost_workflow_request_evidence link where link.evidence_file_id=f.id and link.tenant_id=t and link.company_id=c and link.project_id=p)
 or exists(select 1 from public.cost_workflow_contract_versions basis where f.id=any(basis.evidence_file_ids) and basis.tenant_id=t and basis.company_id=c and basis.project_id=p)
 or (f.workflow_origin and f.workflow_target_id is not null and f.workflow_target_kind in('payment','adjustment'))));
$$;
revoke all on function private.c1_workflow_can_read_file(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.c1_workflow_can_read_file(uuid,uuid,uuid,uuid) to authenticated;

alter function private.c1_can_select_evidence_object(text,text) rename to c1_can_select_evidence_object_legacy;
alter function private.c1_can_insert_evidence_object(text,text) rename to c1_can_insert_evidence_object_legacy;
revoke all on function private.c1_can_select_evidence_object_legacy(text,text),private.c1_can_insert_evidence_object_legacy(text,text) from public,anon,authenticated,service_role;
create function private.c1_can_select_evidence_object(target_bucket_id text,target_object_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cost_evidence_files f where f.bucket_id=target_bucket_id and f.object_path=target_object_path and (
  (not f.workflow_origin and private.c1_can_select_evidence_object_legacy(target_bucket_id,target_object_path))
  or (f.workflow_origin and f.created_by=(select auth.uid()) and f.status='pending_upload' and f.intent_expires_at>now()
      and private.has_company_permission(f.tenant_id,f.company_id,'cost.prepare') and private.has_company_permission(f.tenant_id,f.company_id,'cost.request.submit'))
  or private.c1_workflow_can_read_file(f.tenant_id,f.company_id,f.project_id,f.id)));
$$;
create function private.c1_can_insert_evidence_object(target_bucket_id text,target_object_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cost_evidence_files f join public.projects p on p.id=f.project_id and p.tenant_id=f.tenant_id and p.company_id=f.company_id
 where f.bucket_id=target_bucket_id and f.object_path=target_object_path and(
  (not f.workflow_origin and private.c1_can_insert_evidence_object_legacy(target_bucket_id,target_object_path))
  or (f.workflow_origin and f.created_by=(select auth.uid()) and f.status='pending_upload' and f.intent_expires_at>now()
    and private.has_company_permission(f.tenant_id,f.company_id,'cost.prepare') and private.has_company_permission(f.tenant_id,f.company_id,'cost.request.submit')
    and private.c1_workflow_evidence_target_allowed(f.tenant_id,f.company_id,f.project_id,f.workflow_target_kind,f.workflow_target_id,p.operational_state='completed'))));
$$;
revoke all on function private.c1_can_select_evidence_object(text,text),private.c1_can_insert_evidence_object(text,text) from public,anon,authenticated,service_role;
grant execute on function private.c1_can_select_evidence_object(text,text),private.c1_can_insert_evidence_object(text,text) to authenticated;
-- Preserve Storage policies that refer to the renamed function OIDs: replace their expressions.
alter policy c1_accounting_evidence_objects_insert on storage.objects with check(bucket_id='c1-accounting-evidence' and private.c1_can_insert_evidence_object(bucket_id,name));
alter policy c1_accounting_evidence_objects_select on storage.objects using(bucket_id='c1-accounting-evidence' and private.c1_can_select_evidence_object(bucket_id,name));
alter policy c1_cost_evidence_files_select on public.cost_evidence_files using(
 private.c1_workflow_can_read_file(tenant_id,company_id,project_id,id) or
 (workflow_origin and ((created_by=(select auth.uid()) and private.has_company_permission(tenant_id,company_id,'cost.request.submit') and private.has_company_permission(tenant_id,company_id,'cost.prepare'))
   or private.c1_workflow_can_read_file(tenant_id,company_id,project_id,id)))
 or (not workflow_origin and ((status='pending_upload' and created_by=(select auth.uid()) and private.has_company_permission(tenant_id,company_id,'cost.prepare'))
   or (status='finalized' and private.has_company_permission(tenant_id,company_id,'cost.source.read')))));

CREATE OR REPLACE FUNCTION private.c1_guard_completed_project_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_rows jsonb[]; v_row jsonb; v_project uuid; v_tenant uuid; v_company uuid;
BEGIN
  IF TG_OP <> 'DELETE' AND TG_TABLE_NAME = 'cost_evidence_files' THEN IF private.c1_workflow_evidence_completed_exception(to_jsonb(NEW)) THEN RETURN NEW; END IF; END IF;
  IF TG_OP <> 'DELETE' AND TG_TABLE_NAME = 'objects' THEN IF EXISTS (SELECT 1 FROM public.cost_evidence_files f WHERE f.bucket_id=NEW.bucket_id AND f.object_path=NEW.name AND private.c1_workflow_evidence_completed_exception(to_jsonb(f))) THEN RETURN NEW; END IF; END IF;
  IF TG_TABLE_NAME = 'projects' THEN
    IF OLD.operational_state = 'completed' THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'PROJECT_COMPLETED';
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN v_rows := ARRAY[to_jsonb(NEW)];
    ELSIF TG_OP = 'DELETE' THEN v_rows := ARRAY[to_jsonb(OLD)];
    ELSE v_rows := ARRAY[to_jsonb(OLD), to_jsonb(NEW)]; END IF;
    FOREACH v_row IN ARRAY v_rows LOOP
      v_tenant := (v_row->>'tenant_id')::uuid;
      v_company := (v_row->>'company_id')::uuid;
      v_project := NULL;
      IF TG_ARGV[0] = 'project' THEN v_project := (v_row->>'project_id')::uuid;
      ELSIF TG_ARGV[0] = 'item' THEN
        SELECT project_id INTO v_project FROM public.project_cost_items
        WHERE id=(v_row->>'project_cost_item_id')::uuid AND tenant_id=v_tenant AND company_id=v_company;
      ELSIF TG_ARGV[0] = 'detail' THEN
        SELECT item.project_id INTO v_project
        FROM public.project_cost_item_details detail
        JOIN public.project_cost_items item ON item.id=detail.project_cost_item_id AND item.tenant_id=detail.tenant_id AND item.company_id=detail.company_id
        WHERE detail.id=(v_row->>'project_cost_item_detail_id')::uuid AND detail.tenant_id=v_tenant AND detail.company_id=v_company;
      ELSIF TG_ARGV[0] = 'engagement' THEN
        SELECT project_id INTO v_project FROM public.project_engagements
        WHERE id=(v_row->>'engagement_id')::uuid AND tenant_id=v_tenant AND company_id=v_company;
      ELSIF TG_ARGV[0] = 'storage' THEN
        IF v_row->>'bucket_id' <> 'c1-accounting-evidence' THEN CONTINUE; END IF;
        SELECT project_id,tenant_id,company_id INTO v_project,v_tenant,v_company
        FROM public.cost_evidence_files
        WHERE bucket_id=v_row->>'bucket_id' AND object_path=v_row->>'name';
      END IF;
      PERFORM private.c1_lock_writable_project(v_tenant,v_company,v_project);
    END LOOP;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

create function private.c1_workflow_finalization_target(target_company_id uuid,target_project_id uuid,target_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c jsonb;t uuid;p_state text;f public.cost_evidence_files%rowtype;
begin
 c:=private.c1_workflow_context(target_company_id,'cost.request.submit');t:=(c->>'tenantId')::uuid;
 if not private.has_company_permission(t,target_company_id,'cost.prepare') then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 select operational_state into p_state from public.projects where id=target_project_id and tenant_id=t and company_id=target_company_id for share;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 select * into f from public.cost_evidence_files where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id and workflow_origin and created_by=auth.uid();
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 if f.status<>'finalized' and not private.c1_workflow_evidence_target_allowed(t,target_company_id,target_project_id,f.workflow_target_kind,f.workflow_target_id,p_state='completed')
 then raise exception using errcode='P0001',message='PROJECT_COMPLETED';end if;
 return jsonb_build_object('id',f.id);
end;$$;
create function public.c1_workflow_evidence_finalization_target(target_company_id uuid,target_project_id uuid,target_id uuid)
returns jsonb language sql volatile security definer set search_path='' as $$
 select private.c1_workflow_finalization_target(target_company_id,target_project_id,target_id);
$$;
revoke all on function private.c1_workflow_finalization_target(uuid,uuid,uuid),public.c1_workflow_evidence_finalization_target(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.c1_workflow_evidence_finalization_target(uuid,uuid,uuid) to authenticated;

-- Keep trusted bytes/MIME/hash verification; add fresh workflow authority before finalizer/file locking.
create or replace function public.c1_finalize_cost_evidence_server(target_actor_id uuid,target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare p uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 if target_actor_id is null then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',target_actor_id,'role','authenticated')::text,true);
 select project_id into p from public.cost_evidence_files where id=target_id and company_id=target_company_id and workflow_origin;
 if found then perform private.c1_workflow_finalization_target(target_company_id,p,target_id);end if;
 return private.c1_finalize_cost_evidence(target_company_id,target_id,target_input,target_idempotency_key,target_request_id);
end;$$;
revoke all on function public.c1_finalize_cost_evidence_server(uuid,uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.c1_finalize_cost_evidence_server(uuid,uuid,uuid,jsonb,uuid,uuid) to service_role;

create function public.c1_workflow_evidence_read_target(target_company_id uuid,target_project_id uuid,target_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c jsonb;t uuid;f public.cost_evidence_files%rowtype;
begin
 c:=private.c1_workflow_context(target_company_id,'cost.request.file.read');t:=(c->>'tenantId')::uuid;
 if not private.c1_workflow_can_read_file(t,target_company_id,target_project_id,target_id) then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 select * into f from public.cost_evidence_files where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id and status='finalized';
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 return jsonb_build_object('bucketId',f.bucket_id,'objectPath',f.object_path);
end;$$;
revoke all on function public.c1_workflow_evidence_read_target(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.c1_workflow_evidence_read_target(uuid,uuid,uuid) to authenticated;

create function public.c1_workflow_list_parties(target_company_id uuid,target_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c jsonb;t uuid;result jsonb;
begin
 c:=private.c1_workflow_context(target_company_id,'cost.party.read');t:=(c->>'tenantId')::uuid;
 if not exists(select 1 from public.projects where id=target_project_id and tenant_id=t and company_id=target_company_id) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'kind',p.party_kind,'crewOwnership',case when p.party_kind='crew' then classification.crew_ownership else null end) order by p.display_name,p.id),'[]'::jsonb)
 into result from public.business_parties p left join lateral(
  select x.crew_ownership from public.cost_workflow_party_classifications x where x.party_id=p.id and x.tenant_id=t and x.company_id=target_company_id order by x.version desc limit 1
 ) classification on true where p.tenant_id=t and p.company_id=target_company_id and p.is_active;
 return result;
end;$$;
revoke all on function public.c1_workflow_list_parties(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.c1_workflow_list_parties(uuid,uuid) to authenticated;

create function public.c1_workflow_link_request_evidence(target_company_id uuid,target_project_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c jsonb;t uuid;ids uuid[];r public.cost_workflow_requests%rowtype;receipt public.cost_command_receipts%rowtype;request_hash text;expected bigint;
begin
 c:=private.c1_workflow_context(target_company_id,'cost.request.submit');t:=(c->>'tenantId')::uuid;
 perform private.c1_lock_writable_project(t,target_company_id,target_project_id);
 if target_idempotency_key is null or target_request_id is null or jsonb_typeof(target_input) is distinct from 'object'
 or not(target_input ?& array['expectedVersion','evidenceFileIds'])
 or exists(select 1 from jsonb_object_keys(target_input) key where key not in('expectedVersion','evidenceFileIds'))
 or jsonb_typeof(target_input->'expectedVersion') is distinct from 'number' or target_input->>'expectedVersion' !~ '^\d+$'
 or jsonb_typeof(target_input->'evidenceFileIds') is distinct from 'array'
 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 begin
  expected:=(target_input->>'expectedVersion')::bigint;
  select array_agg(value::uuid order by ordinality) into ids from jsonb_array_elements_text(target_input->'evidenceFileIds') with ordinality;
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception using errcode='P0001',message='INPUT_INVALID';end;
 perform private.c1_workflow_require_evidence(t,target_company_id,target_project_id,ids);
 request_hash:=encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('projectId',target_project_id,'requestId',target_id,'input',target_input)),'UTF8'),'sha256'),'hex');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cost_workflow.evidence_link:'||target_company_id::text||':'||auth.uid()::text||':'||target_idempotency_key::text,0));
 select * into receipt from public.cost_command_receipts where company_id=target_company_id and actor_id=auth.uid() and command_name='cost_workflow.evidence_link' and idempotency_key=target_idempotency_key for update;
 if found then
  if receipt.request_hash<>request_hash then raise exception using errcode='P0001',message='IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('requestId',receipt.result_resource_id,'version',receipt.result_version,'replayed',true);
 end if;
 select * into r from public.cost_workflow_requests where id=target_id and tenant_id=t and company_id=target_company_id and project_id=target_project_id for update;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 if r.version<>expected or r.state not in('working','returned') then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 insert into public.cost_workflow_request_evidence(tenant_id,company_id,project_id,request_id,request_version,evidence_file_id,evidence_kind,created_by)
 select t,target_company_id,target_project_id,r.id,r.version+1,f.id,coalesce(f.workflow_evidence_kind,'accounting_support'),auth.uid() from public.cost_evidence_files f where f.id=any(ids) and f.tenant_id=t and f.company_id=target_company_id and f.project_id=target_project_id;
 update public.cost_workflow_requests set working_input=jsonb_set(working_input,'{evidenceFileIds}',to_jsonb(ids)),version=version+1,updated_at=now() where id=r.id returning * into r;
 insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version)
 values(t,target_company_id,auth.uid(),'cost_workflow.evidence_link',target_idempotency_key,request_hash,r.id,r.version);
 insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,after_summary)
 values(t,target_company_id,auth.uid(),'c1.cost_workflow.evidence_linked','cost_request',r.id::text,target_request_id,jsonb_build_object('version',r.version,'evidenceFileIds',ids));
 return jsonb_build_object('requestId',r.id,'version',r.version,'replayed',false);
end;$$;
revoke all on function public.c1_workflow_link_request_evidence(uuid,uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.c1_workflow_link_request_evidence(uuid,uuid,uuid,jsonb,uuid,uuid) to authenticated;
notify pgrst,'reload schema';

create function public.c1_workflow_create_evidence_intent(target_company_id uuid, target_project_id uuid, target_input jsonb, target_idempotency_key uuid, target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_context jsonb; v_actor_id uuid := auth.uid(); v_tenant_id uuid; v_id uuid := gen_random_uuid();
  v_path text; v_request_hash text; v_receipt public.cost_command_receipts%rowtype; v_file public.cost_evidence_files%rowtype; v_kind text; v_target uuid; v_project_state text;
begin
  if v_actor_id is null then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  v_context := private.c1_master_context(target_company_id, 'cost.prepare'); v_tenant_id := (v_context->>'tenantId')::uuid;
  v_context:=private.c1_workflow_context(target_company_id,'cost.request.submit');
  if (v_context->>'actorId')::uuid is distinct from v_actor_id or target_idempotency_key is null or target_request_id is null
    or jsonb_typeof(target_input) is distinct from 'object'
    or not (target_input ?& array['originalFilename','mimeType','sizeBytes','sha256'])
    or exists (select 1 from jsonb_object_keys(target_input) key where key not in ('evidenceKind','target','originalFilename','mimeType','sizeBytes','sha256'))
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
  if jsonb_typeof(target_input->'target') is distinct from 'object' or jsonb_typeof(target_input->'target'->'kind') is distinct from 'string' or exists(select 1 from jsonb_object_keys(target_input->'target') key where key not in('kind','id')) then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
  v_kind:=target_input->'target'->>'kind'; begin v_target:=(target_input->'target'->>'id')::uuid;exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID';end;
  select operational_state into v_project_state from public.projects where id=target_project_id and tenant_id=v_tenant_id and company_id=target_company_id for share;
  if not private.c1_workflow_evidence_target_allowed(v_tenant_id,target_company_id,target_project_id,v_kind,v_target,v_project_state='completed') then raise exception using errcode='P0001',message='PROJECT_COMPLETED';end if;
  v_request_hash := encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('companyId',target_company_id,'projectId',target_project_id,'input',target_input)),'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('c1_evidence:intent:'||target_company_id::text||':'||v_actor_id::text||':'||target_idempotency_key::text,0));
  select receipt.* into v_receipt from public.cost_command_receipts receipt where receipt.company_id=target_company_id and receipt.actor_id=v_actor_id and receipt.command_name='cost_workflow.evidence_intent' and receipt.idempotency_key=target_idempotency_key for update;
  if found then
    if v_receipt.request_hash <> v_request_hash then raise exception using errcode='P0001', message='IDEMPOTENCY_CONFLICT'; end if;
    select file.* into v_file from public.cost_evidence_files file where file.id=v_receipt.result_resource_id and file.tenant_id=v_tenant_id and file.company_id=target_company_id;
    return jsonb_build_object('evidenceFileId',v_file.id,'version',v_file.version,'bucketId',v_file.bucket_id,'objectPath',v_file.object_path,'expiresAt',v_file.intent_expires_at,'replayed',true);
  end if;
  v_path := v_tenant_id::text||'/'||target_company_id::text||'/'||target_project_id::text||'/'||v_id::text;
  insert into public.cost_evidence_files(id,tenant_id,company_id,project_id,object_path,original_filename,declared_mime_type,declared_size_bytes,declared_sha256,intent_expires_at,created_by,workflow_origin,workflow_target_kind,workflow_target_id,workflow_evidence_kind)
  values(v_id,v_tenant_id,target_company_id,target_project_id,v_path,btrim(target_input->>'originalFilename'),target_input->>'mimeType',(target_input->>'sizeBytes')::bigint,target_input->>'sha256',now()+interval '15 minutes',v_actor_id,true,v_kind,v_target,coalesce(target_input->>'evidenceKind','accounting_support')) returning * into v_file;
  insert into public.cost_command_receipts(tenant_id,company_id,actor_id,command_name,idempotency_key,request_hash,result_resource_id,result_version)
  values(v_tenant_id,target_company_id,v_actor_id,'cost_workflow.evidence_intent',target_idempotency_key,v_request_hash,v_file.id,v_file.version);
  insert into public.audit_events(tenant_id,company_id,actor_id,action,resource_type,resource_id,request_id,after_summary)
  values(v_tenant_id,target_company_id,v_actor_id,'c1.cost_workflow.evidence_intent_created','cost_evidence_file',v_file.id::text,target_request_id,jsonb_build_object('projectId',v_file.project_id,'mimeType',v_file.declared_mime_type,'sizeBytes',v_file.declared_size_bytes,'sha256',v_file.declared_sha256,'version',v_file.version));
  return jsonb_build_object('evidenceFileId',v_file.id,'version',v_file.version,'bucketId',v_file.bucket_id,'objectPath',v_file.object_path,'expiresAt',v_file.intent_expires_at,'replayed',false);
end;
$$;

revoke all on function public.c1_workflow_create_evidence_intent(uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.c1_workflow_create_evidence_intent(uuid,uuid,jsonb,uuid,uuid) to authenticated;

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
