set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,31);

-- Mode discovery must work before activation. Legacy read only discovers the
-- mode; the directory never confers workflow request scope.
create function public.c1_workflow_directory(target_company_id uuid,target_after_id uuid default null,target_page_size integer default 25) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare context jsonb;t uuid;permission text;mode text;items jsonb;cursor uuid;
begin
 if target_page_size is null or target_page_size<1 or target_page_size>100 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 if auth.uid() is null then raise exception using errcode='P0001',message='AUTH_REQUIRED';end if;
 select m.tenant_id into t from public.company_memberships m where m.company_id=target_company_id and m.user_id=auth.uid() and m.is_active;
 if t is null then raise exception using errcode='P0001',message='COMPANY_FORBIDDEN';end if;
 permission:=case when private.c1_workflow_actor_has_permission(t,target_company_id,'cost.request.read') then 'cost.request.read' else 'cost.read' end;
 context:=private.c1_master_context(target_company_id,permission);
 if auth.uid() is null or (context->>'actorId')::uuid is distinct from auth.uid() then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 if not (private.c1_workflow_actor_has_permission(t,target_company_id,'cost.request.read') or private.c1_workflow_actor_has_permission(t,target_company_id,'cost.read')) then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
 select w.mode into mode from public.cost_workflow_companies w where w.tenant_id=t and w.company_id=target_company_id;
 with scoped as (
  select p.id,p.code,p.name,p.operational_state from public.projects p
  where p.tenant_id=t and p.company_id=target_company_id
  and (target_after_id is null or p.id>target_after_id)
  and private.c1_workflow_can_read(t,target_company_id,p.id)
  order by p.id limit target_page_size+1
 ), numbered as (select s.*,row_number() over(order by id) as position from scoped s)
 select coalesce(jsonb_agg(jsonb_build_object('projectId',id,'code',code,'name',name,'operationalState',operational_state) order by id) filter(where position<=target_page_size),'[]'::jsonb),
 (array_agg(id order by id) filter(where position=target_page_size))[1]
 into items,cursor from numbered;
 if jsonb_array_length(items)<target_page_size or not exists(
  select 1 from public.projects p where p.tenant_id=t and p.company_id=target_company_id
  and p.id>cursor and private.c1_workflow_can_read(t,target_company_id,p.id)
 ) then cursor:=null;end if;
 return jsonb_build_object('mode',coalesce(mode,'legacy'),'projects',items,'nextCursor',cursor);
end;$$;

-- Snapshots and assignment identities are immutable, including across handover.
create function public.c1_workflow_request_history(target_company_id uuid,target_project_id uuid,target_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid;result jsonb;
begin
 t:=private.c1_workflow_read_scope(target_company_id,target_project_id);
 if not exists(select 1 from public.cost_workflow_requests r where r.id=target_id and r.tenant_id=t and r.company_id=target_company_id and r.project_id=target_project_id) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'input',v.snapshot,'evidenceFileIds',v.evidence_file_ids,'assignmentId',v.manager_assignment_id,'submittedBy',v.submitted_by,'submittedAt',v.submitted_at,'decision',private.c1_workflow_decision_view(v.id)) order by v.version),'[]'::jsonb)
 into result from public.cost_workflow_request_versions v where v.request_id=target_id and v.tenant_id=t and v.company_id=target_company_id and v.project_id=target_project_id;
 return result;
end;$$;

revoke all on function public.c1_workflow_directory(uuid,uuid,integer),public.c1_workflow_request_history(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.c1_workflow_directory(uuid,uuid,integer),public.c1_workflow_request_history(uuid,uuid,uuid) to authenticated;

-- The request refers to an immutable version, never the parent contract UUID.
create or replace function private.c1_workflow_contract_view(contract_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'versionId',v.id,'partyId',c.party_id,'reference',c.reference,'currencyCode',c.currency_code,'version',c.current_version,'cap',v.cap::text,'evidenceFileIds',v.evidence_file_ids,'sourceSubcontractId',c.source_subcontract_id)
 from public.cost_workflow_contracts c join public.cost_workflow_contract_versions v on v.contract_id=c.id and v.version=c.current_version and v.tenant_id=c.tenant_id and v.company_id=c.company_id and v.project_id=c.project_id where c.id=$1;
$$;
