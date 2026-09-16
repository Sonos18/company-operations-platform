create table public.project_cost_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  description text not null check (btrim(description) <> ''),
  amount numeric(20,4) not null check (amount >= 0),
  currency_code text not null check (char_length(currency_code) = 3),
  work_status text not null check (work_status in ('unknown','in_progress','accepted')),
  business_reference text check (business_reference is null or btrim(business_reference) <> ''),
  party_id uuid,
  engagement_id uuid,
  component_id uuid,
  relevant_date date,
  version bigint not null default 0 check (version >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, company_id),
  foreign key (company_id, tenant_id) references public.companies(id, tenant_id),
  foreign key (project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id),
  foreign key (party_id, tenant_id, company_id) references public.business_parties(id, tenant_id, company_id),
  foreign key (engagement_id, tenant_id, company_id, project_id) references public.project_engagements(id, tenant_id, company_id, project_id),
  foreign key (component_id, tenant_id, company_id, engagement_id) references public.engagement_components(id, tenant_id, company_id, engagement_id),
  check (component_id is null or engagement_id is not null)
);

create table public.project_cost_item_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_cost_item_id uuid not null,
  source_reported_figure_id uuid not null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id, company_id),
  unique (project_cost_item_id, source_reported_figure_id),
  foreign key (company_id, tenant_id) references public.companies(id, tenant_id),
  foreign key (project_cost_item_id, tenant_id, company_id) references public.project_cost_items(id, tenant_id, company_id),
  foreign key (source_reported_figure_id, tenant_id, company_id) references public.source_reported_figures(id, tenant_id, company_id)
);

create unique index project_cost_items_business_reference_unique
  on public.project_cost_items(tenant_id, company_id, project_id, business_reference)
  where business_reference is not null;
create index project_cost_items_project_status_idx on public.project_cost_items(tenant_id, company_id, project_id, work_status, created_at, id);
create index project_cost_item_sources_figure_idx on public.project_cost_item_sources(tenant_id, company_id, source_reported_figure_id, project_cost_item_id);

alter table public.project_cost_items enable row level security;
alter table public.project_cost_item_sources enable row level security;
alter table public.project_cost_items force row level security;
alter table public.project_cost_item_sources force row level security;
revoke all on table public.project_cost_items, public.project_cost_item_sources from public, anon, authenticated;
grant select on public.project_cost_items, public.project_cost_item_sources to authenticated;

create function private.c1_can_read_project_cost(target_tenant_id uuid, target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_cost_settings settings
    where settings.tenant_id = target_tenant_id
      and settings.company_id = target_company_id
      and settings.enabled
  )
  and private.has_company_permission(target_tenant_id, target_company_id, 'cost.read');
$$;

create policy c1_project_cost_items_select on public.project_cost_items for select to authenticated using (private.c1_can_read_project_cost(tenant_id, company_id));
create policy c1_project_cost_item_sources_select on public.project_cost_item_sources for select to authenticated using (private.c1_can_read_project_cost(tenant_id, company_id));

insert into public.permissions(code, module, name, description) values
  ('cost.manage','cost','Manage Project Costs','Create and update C1 Project Cost items')
on conflict (code) do nothing;

do $$
declare
  v_role_id uuid;
  v_active_actor_count integer;
begin
  select role.id into v_role_id
    from public.roles role
   where role.tenant_id = '10000000-0000-4000-8000-000000000010'::uuid
     and role.company_id = '10000000-0000-4000-8000-000000000020'::uuid
     and role.code = 'c1_vqh_cost_operator'
     and role.is_active;
  if v_role_id is null then
    raise exception using errcode = 'P0001', message = 'C1_COST_OPERATOR_ROLE_REQUIRED';
  end if;

  select count(distinct assignment.user_id) into v_active_actor_count
    from public.company_role_assignments assignment
   where assignment.role_id = v_role_id
     and assignment.revoked_at is null;
  if v_active_actor_count <> 1 then
    raise exception using errcode = 'P0001', message = 'C1_COST_OPERATOR_ACTOR_SCOPE_REQUIRED';
  end if;

  if not exists (select 1 from public.permissions permission where permission.code = 'cost.manage') then
    raise exception using errcode = 'P0001', message = 'C1_COST_MANAGE_PERMISSION_REQUIRED';
  end if;

  insert into public.role_permissions (role_id, permission_code)
  select v_role_id, permission.code from public.permissions permission where permission.code = 'cost.manage'
  on conflict do nothing;
end;
$$;

create function private.c1_parse_project_cost_date(target_value text)
returns date
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare
  v_date date;
begin
  if target_value !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  begin
    v_date := pg_catalog.to_date(target_value, 'FXYYYY-MM-DD');
  exception when datetime_field_overflow or invalid_datetime_format then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end;
  if pg_catalog.to_char(v_date, 'YYYY-MM-DD') <> target_value then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  return v_date;
end;
$$;

create function private.c1_create_project_cost_item(
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
     or exists (select 1 from jsonb_object_keys(target_input) key where key not in ('projectId','description','amount','currencyCode','workStatus','businessReference','partyId','engagementId','componentId','relevantDate','nonOverlapConfirmationReference'))
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
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

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

  insert into public.project_cost_items(tenant_id, company_id, project_id, description, amount, currency_code, work_status, business_reference, party_id, engagement_id, component_id, relevant_date, created_by)
  values (v_tenant_id, target_company_id, v_project_id, btrim(target_input->>'description'), v_amount, btrim(target_input->>'currencyCode'), target_input->>'workStatus', v_business_reference, v_party_id, v_engagement_id, v_component_id, v_relevant_date, v_actor_id)
  returning * into v_item;
  insert into public.cost_command_receipts(tenant_id, company_id, actor_id, command_name, idempotency_key, request_hash, result_resource_id, result_version)
  values (v_tenant_id, target_company_id, v_actor_id, 'project_cost_item.create', target_idempotency_key, v_request_hash, v_item.id, v_item.version);
  insert into public.audit_events(tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, after_summary)
  values (v_tenant_id, target_company_id, v_actor_id, 'c1.project_cost_item.created', 'project_cost_item', v_item.id::text, target_request_id, jsonb_build_object('item', to_jsonb(v_item), 'nonOverlapConfirmationReference', v_confirmation_reference));
  return jsonb_build_object('id', v_item.id, 'version', v_item.version, 'replayed', false);
end;
$$;

create function private.c1_update_project_cost_item(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid)
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
  v_item public.project_cost_items%rowtype;
  v_updated public.project_cost_items%rowtype;
  v_party_id uuid;
  v_engagement_id uuid;
  v_component_id uuid;
  v_relevant_date date;
  v_description text;
  v_work_status text;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  v_context := private.c1_master_context(target_company_id, 'cost.manage');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id or target_request_id is null or jsonb_typeof(target_input) is distinct from 'object' then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  if not (target_input ? 'expectedVersion') or not (target_input ?| array['description','partyId','engagementId','componentId','relevantDate','workStatus'])
     or exists (select 1 from jsonb_object_keys(target_input) key where key not in ('description','partyId','engagementId','componentId','relevantDate','workStatus','expectedVersion'))
     or jsonb_typeof(target_input->'expectedVersion') is distinct from 'number' or target_input->>'expectedVersion' !~ '^\d+$'
     or (target_input ? 'description' and (jsonb_typeof(target_input->'description') is distinct from 'string' or btrim(target_input->>'description') = ''))
     or (target_input ? 'partyId' and jsonb_typeof(target_input->'partyId') not in ('string','null'))
     or (target_input ? 'engagementId' and jsonb_typeof(target_input->'engagementId') not in ('string','null'))
     or (target_input ? 'componentId' and jsonb_typeof(target_input->'componentId') not in ('string','null'))
     or (target_input ? 'relevantDate' and (jsonb_typeof(target_input->'relevantDate') not in ('string','null') or (jsonb_typeof(target_input->'relevantDate') = 'string' and target_input->>'relevantDate' !~ '^\d{4}-\d{2}-\d{2}$')))
     or (target_input ? 'workStatus' and (jsonb_typeof(target_input->'workStatus') is distinct from 'string' or target_input->>'workStatus' not in ('unknown','in_progress','accepted')))
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  if (target_input ? 'partyId' and jsonb_typeof(target_input->'partyId') = 'string' and target_input->>'partyId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     or (target_input ? 'engagementId' and jsonb_typeof(target_input->'engagementId') = 'string' and target_input->>'engagementId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     or (target_input ? 'componentId' and jsonb_typeof(target_input->'componentId') = 'string' and target_input->>'componentId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;

  select item.* into v_item from public.project_cost_items item where item.id = target_id and item.tenant_id = v_tenant_id and item.company_id = target_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if v_item.version <> (target_input->>'expectedVersion')::bigint then raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT'; end if;
  v_description := case when target_input ? 'description' then btrim(target_input->>'description') else v_item.description end;
  v_party_id := case when target_input ? 'partyId' then case when jsonb_typeof(target_input->'partyId') = 'null' then null else (target_input->>'partyId')::uuid end else v_item.party_id end;
  v_engagement_id := case when target_input ? 'engagementId' then case when jsonb_typeof(target_input->'engagementId') = 'null' then null else (target_input->>'engagementId')::uuid end else v_item.engagement_id end;
  v_component_id := case when target_input ? 'componentId' then case when jsonb_typeof(target_input->'componentId') = 'null' then null else (target_input->>'componentId')::uuid end else v_item.component_id end;
  v_relevant_date := case when target_input ? 'relevantDate' then case when jsonb_typeof(target_input->'relevantDate') = 'null' then null else private.c1_parse_project_cost_date(target_input->>'relevantDate') end else v_item.relevant_date end;
  v_work_status := case when target_input ? 'workStatus' then target_input->>'workStatus' else v_item.work_status end;
  if v_party_id is not null and not exists (select 1 from public.business_parties party where party.id = v_party_id and party.tenant_id = v_tenant_id and party.company_id = target_company_id) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if v_engagement_id is not null and not exists (select 1 from public.project_engagements engagement where engagement.id = v_engagement_id and engagement.tenant_id = v_tenant_id and engagement.company_id = target_company_id and engagement.project_id = v_item.project_id and (v_party_id is null or engagement.party_id = v_party_id)) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if v_component_id is not null and (v_engagement_id is null or not exists (select 1 from public.engagement_components component where component.id = v_component_id and component.tenant_id = v_tenant_id and component.company_id = target_company_id and component.engagement_id = v_engagement_id)) then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if v_work_status <> v_item.work_status and not ((v_item.work_status = 'unknown' and v_work_status in ('in_progress','accepted')) or (v_item.work_status = 'in_progress' and v_work_status = 'accepted')) then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  update public.project_cost_items item set description = v_description, party_id = v_party_id, engagement_id = v_engagement_id, component_id = v_component_id, relevant_date = v_relevant_date, work_status = v_work_status, version = version + 1, updated_at = now() where item.id = v_item.id returning * into v_updated;
  insert into public.audit_events(tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, before_summary, after_summary)
  values (v_tenant_id, target_company_id, v_actor_id, 'c1.project_cost_item.updated', 'project_cost_item', v_item.id::text, target_request_id, to_jsonb(v_item), to_jsonb(v_updated));
  return jsonb_build_object('id', v_updated.id, 'version', v_updated.version);
end;
$$;

create function private.c1_correct_project_cost_item(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid)
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
  v_item public.project_cost_items%rowtype;
  v_updated public.project_cost_items%rowtype;
  v_amount numeric(20,4);
  v_work_status text;
  v_reason text;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  v_context := private.c1_master_context(target_company_id, 'cost.correct');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id or target_request_id is null or jsonb_typeof(target_input) is distinct from 'object' then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  if not (target_input ?& array['expectedVersion','reason']) or not (target_input ?| array['amount','workStatus'])
     or exists (select 1 from jsonb_object_keys(target_input) key where key not in ('expectedVersion','reason','amount','workStatus'))
     or jsonb_typeof(target_input->'expectedVersion') is distinct from 'number' or target_input->>'expectedVersion' !~ '^\d+$'
     or jsonb_typeof(target_input->'reason') is distinct from 'string' or btrim(target_input->>'reason') = ''
     or (target_input ? 'amount' and (jsonb_typeof(target_input->'amount') is distinct from 'string' or target_input->>'amount' !~ '^\d{1,16}(\.\d{1,4})?$'))
     or (target_input ? 'workStatus' and (jsonb_typeof(target_input->'workStatus') is distinct from 'string' or target_input->>'workStatus' not in ('unknown','in_progress','accepted')))
  then raise exception using errcode = 'P0001', message = 'INPUT_INVALID'; end if;
  select item.* into v_item from public.project_cost_items item where item.id = target_id and item.tenant_id = v_tenant_id and item.company_id = target_company_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  if v_item.version <> (target_input->>'expectedVersion')::bigint then raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT'; end if;
  v_amount := case when target_input ? 'amount' then (target_input->>'amount')::numeric else v_item.amount end;
  v_work_status := case when target_input ? 'workStatus' then target_input->>'workStatus' else v_item.work_status end;
  v_reason := btrim(target_input->>'reason');
  update public.project_cost_items item set amount = v_amount, work_status = v_work_status, version = version + 1, updated_at = now() where item.id = v_item.id returning * into v_updated;
  insert into public.audit_events(tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, before_summary, after_summary)
  values (v_tenant_id, target_company_id, v_actor_id, 'c1.project_cost_item.corrected', 'project_cost_item', v_item.id::text, target_request_id, to_jsonb(v_item), jsonb_build_object('item', to_jsonb(v_updated), 'reason', v_reason));
  return jsonb_build_object('id', v_updated.id, 'version', v_updated.version);
end;
$$;

create function public.c1_create_project_cost_item(target_company_id uuid, target_input jsonb, target_idempotency_key uuid, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$ select private.c1_create_project_cost_item(target_company_id, target_input, target_idempotency_key, target_request_id); $$;
create function public.c1_update_project_cost_item(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$ select private.c1_update_project_cost_item(target_company_id, target_id, target_input, target_request_id); $$;
create function public.c1_correct_project_cost_item(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$ select private.c1_correct_project_cost_item(target_company_id, target_id, target_input, target_request_id); $$;

revoke all on function private.c1_create_project_cost_item(uuid, jsonb, uuid, uuid), private.c1_update_project_cost_item(uuid, uuid, jsonb, uuid), private.c1_correct_project_cost_item(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function private.c1_can_read_project_cost(uuid, uuid), private.c1_parse_project_cost_date(text) from public, anon, authenticated;
grant execute on function private.c1_can_read_project_cost(uuid, uuid) to authenticated;
revoke all on function public.c1_create_project_cost_item(uuid, jsonb, uuid, uuid), public.c1_update_project_cost_item(uuid, uuid, jsonb, uuid), public.c1_correct_project_cost_item(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.c1_create_project_cost_item(uuid, jsonb, uuid, uuid), public.c1_update_project_cost_item(uuid, uuid, jsonb, uuid), public.c1_correct_project_cost_item(uuid, uuid, jsonb, uuid) to authenticated;
