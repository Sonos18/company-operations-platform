create or replace function private.restore_opportunity(
  target_company_id uuid,
  target_opportunity_id uuid,
  target_input jsonb,
  target_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_context jsonb;
  restoring_actor_id uuid;
  actor_tenant_id uuid;
  current_opportunity_version bigint;
  current_validity text;
  current_canonical_id uuid;
  current_reason_code text;
  current_semantic_key text;
  current_reason text;
  current_invalidated_by uuid;
  current_invalidated_at timestamptz;
  old_summary jsonb;
  new_summary jsonb;
  supplied_evidence jsonb;
begin
  actor_context := private.stage01_actor_context(
    target_company_id, 'opportunity.restore'
  );
  restoring_actor_id := (actor_context ->> 'actorId')::uuid;
  actor_tenant_id := (actor_context ->> 'tenantId')::uuid;

  perform private.assert_stage01_command_keys(
    target_input, array['reason', 'evidence', 'expectedOpportunityVersion']
  );
  perform private.assert_stage01_required_keys(
    target_input, array['reason', 'expectedOpportunityVersion']
  );
  if nullif(pg_catalog.btrim(target_input ->> 'reason'), '') is null
     or (
       target_input ? 'evidence'
       and pg_catalog.jsonb_typeof(target_input -> 'evidence') is distinct from 'array'
     ) then
    raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
  end if;

  select
    opportunity.version,
    opportunity.validity_state,
    opportunity.canonical_opportunity_id,
    opportunity.current_invalid_reason_code,
    opportunity.current_invalid_reason_semantic_key,
    opportunity.current_invalidation_reason,
    opportunity.invalidated_by,
    opportunity.invalidated_at,
    pg_catalog.to_jsonb(opportunity)
  into
    current_opportunity_version,
    current_validity,
    current_canonical_id,
    current_reason_code,
    current_semantic_key,
    current_reason,
    current_invalidated_by,
    current_invalidated_at,
    old_summary
  from public.opportunities as opportunity
  where opportunity.id = target_opportunity_id
    and opportunity.tenant_id = actor_tenant_id
    and opportunity.company_id = target_company_id
  for update;

  if current_opportunity_version is null then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_NOT_FOUND';
  end if;
  if current_opportunity_version is distinct from
     (target_input ->> 'expectedOpportunityVersion')::bigint then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;
  if current_validity <> 'invalid'
     or nullif(pg_catalog.btrim(current_reason_code), '') is null
     or nullif(pg_catalog.btrim(current_semantic_key), '') is null
     or nullif(pg_catalog.btrim(current_reason), '') is null
     or current_invalidated_by is null
     or current_invalidated_at is null then
    raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
  end if;

  supplied_evidence := target_input -> 'evidence';
  if current_semantic_key = 'duplicate_merged' then
    if current_canonical_id is null
       or pg_catalog.jsonb_typeof(supplied_evidence) is distinct from 'array'
       or pg_catalog.jsonb_array_length(supplied_evidence) = 0 then
      raise exception using errcode = 'P0001', message = 'INVALID_COMMAND_INPUT';
    end if;
  elsif current_canonical_id is not null then
    raise exception using errcode = 'P0001', message = 'STAGE01_INVALID_VALIDITY_TRANSITION';
  end if;

  update public.opportunities as opportunity
  set validity_state = 'valid',
      canonical_opportunity_id = null,
      current_invalid_reason_code = null,
      current_invalid_reason_semantic_key = null,
      current_invalidation_reason = null,
      invalidated_by = null,
      invalidated_at = null,
      version = opportunity.version + 1,
      updated_at = pg_catalog.statement_timestamp()
  where opportunity.id = target_opportunity_id
    and opportunity.tenant_id = actor_tenant_id
    and opportunity.company_id = target_company_id
  returning opportunity.version, pg_catalog.to_jsonb(opportunity)
  into current_opportunity_version, new_summary;

  perform private.write_stage01_audit(
    actor_tenant_id, target_company_id, restoring_actor_id,
    'opportunity.restored', 'opportunity', target_opportunity_id::text,
    target_request_id, old_summary,
    new_summary || pg_catalog.jsonb_build_object(
      'reason', pg_catalog.btrim(target_input ->> 'reason'),
      'evidence', supplied_evidence,
      'restoredInvalidReasonCode', current_reason_code,
      'restoredInvalidReasonSemanticKey', current_semantic_key
    )
  );

  return pg_catalog.jsonb_build_object(
    'opportunityId', target_opportunity_id,
    'validityState', 'valid',
    'opportunityVersion', current_opportunity_version
  );
end;
$$;

revoke all on function private.restore_opportunity(uuid, uuid, jsonb, uuid)
  from public, anon;
grant execute on function private.restore_opportunity(uuid, uuid, jsonb, uuid)
  to authenticated;
