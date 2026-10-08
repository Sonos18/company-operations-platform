set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 45);

-- Reject the material namespace at every generic workflow evidence gateway.
create or replace function private.c1_workflow_require_evidence(t uuid,c uuid,p uuid,ids uuid[]) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if cardinality(ids) is null or cardinality(ids)<1 or cardinality(ids)>100 or array_position(ids,null) is not null
 or cardinality(ids)<>(select count(distinct id) from unnest(ids) id)
 or cardinality(ids)<>(select count(*) from public.cost_evidence_files f
   where f.id=any(ids) and f.tenant_id=t and f.company_id=c and f.project_id=p
     and f.status='finalized' and not private.c1_material_evidence_file(f.id))
 then raise exception using errcode='P0001',message='EVIDENCE_UPLOAD_MISMATCH';end if;
end;$$;
revoke all on function private.c1_workflow_require_evidence(uuid,uuid,uuid,uuid[])
from public,anon,authenticated,service_role;

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
    private.c1_material_can_read_order(t,c,p)
    and exists (
      select 1
      from public.cost_evidence_files as evidence
      join public.material_evidence_scopes as evidence_scope
        on evidence_scope.evidence_file_id=evidence.id
       and evidence_scope.tenant_id=evidence.tenant_id
       and evidence_scope.company_id=evidence.company_id
       and evidence_scope.project_id=evidence.project_id
      where evidence.id=file_id
        and evidence.tenant_id=t
        and evidence.company_id=c
        and evidence.project_id=p
        and evidence.status='finalized'
    )
  );
$$;

revoke all on function private.c1_workflow_can_read_file(uuid,uuid,uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function private.c1_workflow_can_read_file(uuid,uuid,uuid,uuid)
to authenticated;

-- The largest accepted expected version must leave room for version + 1.
create or replace function private.c1_material_version(target_value jsonb)
returns bigint language plpgsql immutable set search_path = '' as $$
declare v_text text;
begin
  v_text := target_value#>>'{}';
  if jsonb_typeof(target_value) is distinct from 'number'
    or v_text !~ '^(0|[1-9][0-9]{0,18})$'
    or char_length(v_text) > 19
    or (char_length(v_text) = 19 and v_text > '9223372036854775806')
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  return v_text::bigint;
end;
$$;

-- Keep the private finalizer OID and all legacy logic; inject a namespace
-- gate before its receipt lookup, including replay.
do $$
declare
  v_definition text;
  v_corrected text;
  v_anchor text := 'v_context:=private.c1_master_context(target_company_id,''cost.prepare'');';
begin
  if to_regprocedure('private.c1_finalize_cost_evidence(uuid,uuid,jsonb,uuid,uuid)') is null
  then raise exception using errcode='P0001',message='C1_FINALIZE_NAMESPACE_BASELINE_MISSING';end if;
  select pg_get_functiondef('private.c1_finalize_cost_evidence(uuid,uuid,jsonb,uuid,uuid)'::regprocedure)
    into v_definition;
  if position(v_anchor in v_definition)=0
    or position('if private.c1_material_evidence_file(target_id)' in v_definition)>0
  then raise exception using errcode='P0001',message='C1_FINALIZE_NAMESPACE_FUNCTION_DRIFT';end if;
  v_corrected:=replace(v_definition,v_anchor,
    'if private.c1_material_evidence_file(target_id) then raise exception using errcode=''P0001'',message=''PERMISSION_DENIED'';end if;' || chr(10) || '  ' || v_anchor);
  if v_corrected=v_definition
  then raise exception using errcode='P0001',message='C1_FINALIZE_NAMESPACE_FUNCTION_DRIFT';end if;
  execute v_corrected;
end $$;
revoke all on function private.c1_finalize_cost_evidence(uuid,uuid,jsonb,uuid,uuid)
from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
