create or replace function private.c1_create_project_cost_item(
  target_company_id uuid,
  target_input jsonb,
  target_idempotency_key uuid,
  target_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_actor_id uuid;
  v_tenant_id uuid;
  v_project_id uuid;
  v_party_id uuid;
  v_engagement_id uuid;
  v_component_id uuid;
  v_relevant_date date;
  v_amount numeric(20,4);
  v_business_reference text;
  v_confirmation_reference text;
  v_source_figure_ids uuid[] := array[]::uuid[];
  v_request_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_item public.project_cost_items%rowtype;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  v_context := private.c1_master_context(target_company_id, 'cost.manage');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  if target_idempotency_key is null or target_request_id is null or jsonb_typeof(target_input) is distinct from 'object' then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  if not (target_input ?& array['projectId','description','amount','currencyCode','workStatus','nonOverlapConfirmationReference'])
     or exists (select 1 from jsonb_object_keys(target_input) key where key not in ('projectId','description','amount','currencyCode','workStatus','businessReference','partyId','engagementId','componentId','relevantDate','nonOverlapConfirmationReference','sourceFigureIds'))
     or jsonb_typeof(target_input->'projectId') is distinct from 'string'
     or target_input->>'projectId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(target_input->'description') is distinct from 'string' or btrim(target_input->>'description') = ''
     or jsonb_typeof(target_input->'amount') is distinct from 'string' or target_input->>'amount' !~ '^\d{1,16}(\.\d{1,4})?$'
     or jsonb_typeof(target_input->'currencyCode') is distinct from 'string' or char_length(btrim(target_input->>'currencyCode')) <> 3
     or jsonb_typeof(target_input->'workStatus') is distinct from 'string' or target_input->>'workStatus' not in ('unknown','in_progress','accepted')
     or jsonb_typeof(target_input->'nonOverlapConfirmationReference') is distinct from 'string' or btrim(target_input->>'nonOverlapConfirmationReference') = ''
     or (target_input ? 'businessReference' and (jsonb_typeof(target_input->'businessReference') not in ('string','null') or (jsonb_typeof(target_input->'businessReference') = 'string' and btrim(target_input->>'businessReference') = '')))
     or (target_input ? 'partyId' and (jsonb_typeof(target_input->'partyId') is distinct from 'string' or target_input->>'partyId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
     or (target_input ? 'engagementId' and (jsonb_typeof(target_input->'engagementId') is distinct from 'string' or target_input->>'engagementId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
     or (target_input ? 'componentId' and (jsonb_typeof(target_input->'componentId') is distinct from 'string' or target_input->>'componentId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
     or (target_input ? 'relevantDate' and (jsonb_typeof(target_input->'relevantDate') is distinct from 'string' or target_input->>'relevantDate' !~ '^\d{4}-\d{2}-\d{2}$'))
     or (target_input ? 'sourceFigureIds' and (
       jsonb_typeof(target_input->'sourceFigureIds') is distinct from 'array'
       or not (jsonb_array_length(target_input->'sourceFigureIds') > 0)
       or exists (select 1 from jsonb_array_elements(target_input->'sourceFigureIds') source_figure_id where jsonb_typeof(source_figure_id) is distinct from 'string' or source_figure_id #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
       or (select count(*) from jsonb_array_elements_text(target_input->'sourceFigureIds')) <> (select count(distinct source_figure_id) from jsonb_array_elements_text(target_input->'sourceFigureIds') source_figure_id)
     ))
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

  if target_input ? 'sourceFigureIds' then
    select array_agg(source_figure_id.value::uuid order by source_figure_id.ordinality) into v_source_figure_ids
      from jsonb_array_elements_text(target_input->'sourceFigureIds') with ordinality source_figure_id(value, ordinality);
    if (select count(*) from public.source_reported_figures figure where figure.id = any(v_source_figure_ids) and figure.tenant_id = v_tenant_id and figure.company_id = target_company_id) <> cardinality(v_source_figure_ids) then
      raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
    end if;
  end if;

  v_project_id := (target_input->>'projectId')::uuid;
  v_party_id := case when target_input ? 'partyId' then (target_input->>'partyId')::uuid end;
  v_engagement_id := case when target_input ? 'engagementId' then (target_input->>'engagementId')::uuid end;
  v_component_id := case when target_input ? 'componentId' then (target_input->>'componentId')::uuid end;
  v_relevant_date := case when target_input ? 'relevantDate' then private.c1_parse_project_cost_date(target_input->>'relevantDate') end;
  v_amount := (target_input->>'amount')::numeric;
  v_business_reference := case when jsonb_typeof(target_input->'businessReference') = 'string' then btrim(target_input->>'businessReference') end;
  v_confirmation_reference := btrim(target_input->>'nonOverlapConfirmationReference');
  if not exists (select 1 from public.projects project where project.id = v_project_id and project.tenant_id = v_tenant_id and project.company_id = target_company_id) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if v_party_id is not null and not exists (select 1 from public.business_parties party where party.id = v_party_id and party.tenant_id = v_tenant_id and party.company_id = target_company_id) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if v_engagement_id is not null and not exists (select 1 from public.project_engagements engagement where engagement.id = v_engagement_id and engagement.tenant_id = v_tenant_id and engagement.company_id = target_company_id and engagement.project_id = v_project_id and (v_party_id is null or engagement.party_id = v_party_id)) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if v_component_id is not null and (v_engagement_id is null or not exists (select 1 from public.engagement_components component where component.id = v_component_id and component.tenant_id = v_tenant_id and component.company_id = target_company_id and component.engagement_id = v_engagement_id)) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;

  v_request_hash := encode(extensions.digest(convert_to(private.c1_jsonb_canonical_text(jsonb_build_object('companyId', target_company_id, 'input', target_input)), 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('c1_project_cost_item:create:' || target_company_id::text || ':' || v_actor_id::text || ':' || target_idempotency_key::text, 0));
  select receipt.* into v_receipt from public.cost_command_receipts receipt where receipt.company_id = target_company_id and receipt.actor_id = v_actor_id and receipt.command_name = 'project_cost_item.create' and receipt.idempotency_key = target_idempotency_key for update;
  if found then
    if v_receipt.request_hash <> v_request_hash then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('id', v_receipt.result_resource_id, 'version', v_receipt.result_version, 'replayed', true);
  end if;

  insert into public.project_cost_items(tenant_id, company_id, project_id, description, amount, amount_text, currency_code, work_status, business_reference, party_id, engagement_id, component_id, relevant_date, created_by)
  values (v_tenant_id, target_company_id, v_project_id, btrim(target_input->>'description'), v_amount, target_input->>'amount', btrim(target_input->>'currencyCode'), target_input->>'workStatus', v_business_reference, v_party_id, v_engagement_id, v_component_id, v_relevant_date, v_actor_id)
  returning * into v_item;
  insert into public.project_cost_item_sources(tenant_id, company_id, project_cost_item_id, source_reported_figure_id)
  select v_tenant_id, target_company_id, v_item.id, source_figure_id.value from unnest(v_source_figure_ids) source_figure_id(value);
  insert into public.cost_command_receipts(tenant_id, company_id, actor_id, command_name, idempotency_key, request_hash, result_resource_id, result_version)
  values (v_tenant_id, target_company_id, v_actor_id, 'project_cost_item.create', target_idempotency_key, v_request_hash, v_item.id, v_item.version);
  insert into public.audit_events(tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, after_summary)
  values (v_tenant_id, target_company_id, v_actor_id, 'c1.project_cost_item.created', 'project_cost_item', v_item.id::text, target_request_id, jsonb_build_object('item', to_jsonb(v_item), 'nonOverlapConfirmationReference', v_confirmation_reference, 'sourceFigureIds', to_jsonb(v_source_figure_ids)));
  return jsonb_build_object('id', v_item.id, 'version', v_item.version, 'replayed', false);
end;
$$;
