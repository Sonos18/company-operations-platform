set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 20);

do $$
begin
  if to_regprocedure('private.c1_publish_project_cost_detail(uuid,uuid,jsonb,uuid,uuid)') is null
    or to_regprocedure('private.c1_jsonb_canonical_text(jsonb)') is null then
    raise exception using errcode = 'P0001', message = 'C1_DETAIL_PUBLISH_HASH_BASELINE_MISSING';
  end if;
end;
$$;

create or replace function private.c1_publish_project_cost_detail(
  target_company_id uuid,
  target_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_actor_id uuid;
  v_detail public.project_cost_item_details%rowtype;
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_expected_version bigint;
begin
  v_context := private.c1_detail_context(target_company_id, 'cost.publish_import');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  v_actor_id := (v_context->>'actorId')::uuid;
  if target_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;

  v_expected_version := private.c1_detail_publish_expected_version(target_input);
  v_hash := encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(
    jsonb_build_object('id', target_id, 'expectedVersion', v_expected_version)
  ), 'UTF8'), 'sha256'), 'hex');
  v_receipt := private.c1_detail_receipt(
    v_tenant_id,
    target_company_id,
    v_actor_id,
    'project_cost_detail.publish',
    target_idempotency_key,
    v_hash
  );
  if v_receipt.id is not null then
    return private.c1_detail_ack(v_receipt.result_resource_id, true);
  end if;

  v_detail := private.c1_detail_require_scope(target_id, v_tenant_id, target_company_id);
  if v_detail.publication_state = 'published' then
    raise exception using errcode = 'P0001', message = 'COST_DETAIL_ALREADY_PUBLISHED';
  end if;
  if v_detail.version is distinct from v_expected_version then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;
  if v_detail.amount_text is null then
    raise exception using errcode = 'P0001', message = 'COST_DETAIL_PUBLISH_NOT_READY';
  end if;
  perform private.c1_detail_validate_linked_sources(v_detail.id, v_tenant_id, target_company_id);

  update public.project_cost_item_details detail
  set publication_state = 'published',
      publication_origin = 'command',
      published_by = v_actor_id,
      published_at = now(),
      publication_request_id = target_request_id,
      version = detail.version + 1,
      updated_at = now()
  where detail.id = v_detail.id
  returning * into v_detail;
  perform private.c1_sync_project_cost_item_amount(v_detail.project_cost_item_id);

  insert into public.audit_events(
    tenant_id, company_id, actor_id, action, resource_type, resource_id,
    request_id, before_summary, after_summary
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'c1.project_cost_detail.published',
    'project_cost_item_detail', v_detail.id::text, target_request_id, null, to_jsonb(v_detail)
  );
  insert into public.cost_command_receipts(
    tenant_id, company_id, actor_id, command_name, idempotency_key,
    request_hash, result_resource_id, result_version
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'project_cost_detail.publish',
    target_idempotency_key, v_hash, v_detail.id, v_detail.version
  );
  return private.c1_detail_ack(v_detail.id, false);
end;
$$;

revoke all on function private.c1_publish_project_cost_detail(uuid, uuid, jsonb, uuid, uuid)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
