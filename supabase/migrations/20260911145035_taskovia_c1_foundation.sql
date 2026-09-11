create table public.company_cost_settings (
  company_id uuid primary key,
  tenant_id uuid not null,
  enabled boolean not null default false,
  default_currency_code text not null default 'VND' check (char_length(default_currency_code) = 3),
  money_scale smallint not null default 0 check (money_scale between 0 and 4),
  time_zone text not null default 'Asia/Ho_Chi_Minh',
  version bigint not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, tenant_id),
  foreign key (company_id, tenant_id) references public.companies(id, tenant_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  code text not null,
  name text not null,
  client_display_name text,
  location_text text,
  operational_state text not null default 'unknown' check (operational_state in ('active','completed','paused','unknown')),
  origin text not null check (origin in ('legacy_import','manual','opportunity_conversion')),
  source_opportunity_id uuid,
  financial_scope_inventory_status text not null default 'unconfirmed' check (financial_scope_inventory_status in ('unconfirmed','partial','confirmed')),
  financial_scope_inventory_as_of date,
  version bigint not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, company_id), unique (company_id, code),
  foreign key (company_id, tenant_id) references public.companies(id, tenant_id)
);

create table public.business_parties (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null,
  code text not null, display_name text not null, party_kind text not null check (party_kind in ('crew','organization')),
  tax_identifier text, contact_display_name text, contact_phone text, is_active boolean not null default true,
  version bigint not null default 0, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, tenant_id, company_id), unique (company_id, code), foreign key (company_id, tenant_id) references public.companies(id, tenant_id)
);

create table public.project_engagements (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, project_id uuid not null, party_id uuid not null,
  code text not null, name text not null, execution_state text not null default 'unknown' check (execution_state in ('active','completed','paused','unknown')),
  currency_code text not null check (char_length(currency_code) = 3), initial_data_mode text not null default 'source_documents' check (initial_data_mode in ('historical_total','source_documents')),
  contract_reference text, version bigint not null default 0, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, tenant_id, company_id), unique (company_id, project_id, code),
  foreign key (project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id),
  foreign key (party_id, tenant_id, company_id) references public.business_parties(id, tenant_id, company_id)
);

create table public.engagement_components (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, engagement_id uuid not null,
  code text not null, name text not null, pricing_method text not null check (pricing_method in ('time','quantity','fixed','milestone','unknown')), unit_code text, is_active boolean not null default true,
  version bigint not null default 0, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, tenant_id, company_id), unique (engagement_id, code), foreign key (engagement_id, tenant_id, company_id) references public.project_engagements(id, tenant_id, company_id)
);

create table public.cost_document_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, document_id uuid, resource_type text not null, resource_id uuid not null, event_kind text not null, actor_id uuid not null references auth.users(id), request_id uuid, reason text, before_summary jsonb, after_summary jsonb, created_at timestamptz not null default now(), foreign key (company_id, tenant_id) references public.companies(id, tenant_id)
);
create table public.cost_command_receipts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, company_id uuid not null, actor_id uuid not null references auth.users(id), command_name text not null, idempotency_key uuid not null, request_hash text not null, result_resource_id uuid, result_version bigint, created_at timestamptz not null default now(), unique (company_id, actor_id, command_name, idempotency_key), foreign key (company_id, tenant_id) references public.companies(id, tenant_id)
);

create index projects_scope_idx on public.projects(tenant_id, company_id, created_at, id);
create index business_parties_scope_idx on public.business_parties(tenant_id, company_id, created_at, id);
create index project_engagements_project_idx on public.project_engagements(tenant_id, company_id, project_id, created_at, id);
create index project_engagements_party_idx on public.project_engagements(tenant_id, company_id, party_id, created_at, id);
create index engagement_components_engagement_idx on public.engagement_components(tenant_id, company_id, engagement_id, created_at, id);
create index cost_document_events_scope_idx on public.cost_document_events(tenant_id, company_id, created_at, id);

alter table public.company_cost_settings enable row level security;
alter table public.projects enable row level security;
alter table public.business_parties enable row level security;
alter table public.project_engagements enable row level security;
alter table public.engagement_components enable row level security;
alter table public.cost_document_events enable row level security;
alter table public.cost_command_receipts enable row level security;
alter table public.company_cost_settings force row level security;
alter table public.projects force row level security;
alter table public.business_parties force row level security;
alter table public.project_engagements force row level security;
alter table public.engagement_components force row level security;
alter table public.cost_document_events force row level security;
alter table public.cost_command_receipts force row level security;

revoke all on public.company_cost_settings, public.projects, public.business_parties, public.project_engagements, public.engagement_components, public.cost_document_events, public.cost_command_receipts from public, anon, authenticated;

insert into public.permissions(code, module, name, description) values
  ('project.register.manage','cost','Manage project register','Create and update C1 project register records'),
  ('party.manage','cost','Manage business parties','Create and update C1 business parties'),
  ('engagement.manage','cost','Manage engagements','Create and update C1 engagements and components'),
  ('cost.read','cost','Read costs','Read published C1 financial records'),
  ('cost.source.read','cost','Read cost sources','Read shared C1 source records'),
  ('cost.prepare','cost','Prepare costs','Prepare C1 drafts and source records'),
  ('cost.publish_import','cost','Publish cost import','Publish C1 imported records'),
  ('cost.record_cash','cost','Record cash','Record C1 cash data'),
  ('cost.correct','cost','Correct costs','Create C1 corrections and disputes'),
  ('cost.file.read','cost','Read cost files','Read C1 financial source bytes'),
  ('cost.coverage.assert','cost','Assert cost coverage','Assert C1 coverage'),
  ('cost.config.manage','cost','Manage cost configuration','Manage C1 company configuration')
on conflict (code) do nothing;

create function private.c1_master_context(target_company_id uuid, target_permission text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_context jsonb;
begin
  v_context := private.stage01_actor_context(target_company_id, target_permission);
  if not exists (select 1 from public.company_cost_settings settings where settings.company_id = target_company_id and settings.tenant_id = (v_context ->> 'tenantId')::uuid and settings.enabled) then
    raise exception using errcode = 'P0001', message = 'MODULE_DISABLED';
  end if;
  return v_context;
end;
$$;

create function private.c1_create_project(target_company_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_context jsonb; v_id uuid := gen_random_uuid();
begin
  v_context := private.c1_master_context(target_company_id, 'project.register.manage');
  insert into public.projects(id, tenant_id, company_id, code, name, origin, client_display_name, location_text, operational_state, created_by)
  values (v_id, (v_context->>'tenantId')::uuid, target_company_id, btrim(target_input->>'code'), btrim(target_input->>'name'), coalesce(target_input->>'origin','manual'), nullif(btrim(target_input->>'clientDisplayName'),''), nullif(btrim(target_input->>'locationText'),''), coalesce(target_input->>'operationalState','unknown'), (v_context->>'actorId')::uuid);
  return jsonb_build_object('id',v_id,'version',0);
end;
$$;

create function private.c1_create_party(target_company_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_context jsonb; v_id uuid := gen_random_uuid();
begin
  v_context := private.c1_master_context(target_company_id, 'party.manage');
  insert into public.business_parties(id, tenant_id, company_id, code, display_name, party_kind, tax_identifier, contact_display_name, contact_phone, created_by)
  values (v_id,(v_context->>'tenantId')::uuid,target_company_id,btrim(target_input->>'code'),btrim(target_input->>'displayName'),target_input->>'partyKind',nullif(btrim(target_input->>'taxIdentifier'),''),nullif(btrim(target_input->>'contactDisplayName'),''),nullif(btrim(target_input->>'contactPhone'),''),(v_context->>'actorId')::uuid);
  return jsonb_build_object('id',v_id,'version',0);
end;
$$;

create function private.c1_create_engagement(target_company_id uuid, target_project_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_context jsonb; v_id uuid := gen_random_uuid();
begin
  v_context := private.c1_master_context(target_company_id, 'engagement.manage');
  if not exists (select 1 from public.projects where id=target_project_id and tenant_id=(v_context->>'tenantId')::uuid and company_id=target_company_id) or not exists (select 1 from public.business_parties where id=(target_input->>'partyId')::uuid and tenant_id=(v_context->>'tenantId')::uuid and company_id=target_company_id) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  insert into public.project_engagements(id,tenant_id,company_id,project_id,party_id,code,name,currency_code,execution_state,initial_data_mode,contract_reference,created_by)
  values(v_id,(v_context->>'tenantId')::uuid,target_company_id,target_project_id,(target_input->>'partyId')::uuid,btrim(target_input->>'code'),btrim(target_input->>'name'),target_input->>'currencyCode',coalesce(target_input->>'executionState','unknown'),coalesce(target_input->>'initialDataMode','source_documents'),nullif(btrim(target_input->>'contractReference'),''),(v_context->>'actorId')::uuid);
  return jsonb_build_object('id',v_id,'version',0);
end;
$$;

create function private.c1_create_component(target_company_id uuid, target_engagement_id uuid, target_input jsonb, target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_context jsonb; v_id uuid := gen_random_uuid();
begin
  v_context := private.c1_master_context(target_company_id, 'engagement.manage');
  if not exists (select 1 from public.project_engagements where id=target_engagement_id and tenant_id=(v_context->>'tenantId')::uuid and company_id=target_company_id) then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  insert into public.engagement_components(id,tenant_id,company_id,engagement_id,code,name,pricing_method,unit_code,created_by)
  values(v_id,(v_context->>'tenantId')::uuid,target_company_id,target_engagement_id,btrim(target_input->>'code'),btrim(target_input->>'name'),target_input->>'pricingMethod',nullif(btrim(target_input->>'unitCode'),''),(v_context->>'actorId')::uuid);
  return jsonb_build_object('id',v_id,'version',0);
end;
$$;

create function private.c1_update_project(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_context jsonb; v_version bigint;
begin
  v_context := private.c1_master_context(target_company_id,'project.register.manage');
  select version into v_version from public.projects where id=target_id and tenant_id=(v_context->>'tenantId')::uuid and company_id=target_company_id for update;
  if v_version is null then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if;
  if v_version <> (target_input->>'expectedVersion')::bigint then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
  update public.projects set code=coalesce(nullif(btrim(target_input->>'code'),''),code),name=coalesce(nullif(btrim(target_input->>'name'),''),name),client_display_name=coalesce(target_input->>'clientDisplayName',client_display_name),location_text=coalesce(target_input->>'locationText',location_text),operational_state=coalesce(target_input->>'operationalState',operational_state),version=version+1,updated_at=now() where id=target_id returning version into v_version;
  return jsonb_build_object('id',target_id,'version',v_version);
end; $$;

create function private.c1_update_party(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_context jsonb; v_version bigint;
begin
  v_context:=private.c1_master_context(target_company_id,'party.manage'); select version into v_version from public.business_parties where id=target_id and tenant_id=(v_context->>'tenantId')::uuid and company_id=target_company_id for update;
  if v_version is null then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if; if v_version<>(target_input->>'expectedVersion')::bigint then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
  update public.business_parties set code=coalesce(nullif(btrim(target_input->>'code'),''),code),display_name=coalesce(nullif(btrim(target_input->>'displayName'),''),display_name),contact_display_name=coalesce(target_input->>'contactDisplayName',contact_display_name),contact_phone=coalesce(target_input->>'contactPhone',contact_phone),version=version+1,updated_at=now() where id=target_id returning version into v_version; return jsonb_build_object('id',target_id,'version',v_version);
end; $$;

create function private.c1_update_engagement(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_context jsonb; v_version bigint;
begin
  v_context:=private.c1_master_context(target_company_id,'engagement.manage'); select version into v_version from public.project_engagements where id=target_id and tenant_id=(v_context->>'tenantId')::uuid and company_id=target_company_id for update;
  if v_version is null then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if; if v_version<>(target_input->>'expectedVersion')::bigint then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
  update public.project_engagements set code=coalesce(nullif(btrim(target_input->>'code'),''),code),name=coalesce(nullif(btrim(target_input->>'name'),''),name),execution_state=coalesce(target_input->>'executionState',execution_state),contract_reference=coalesce(target_input->>'contractReference',contract_reference),version=version+1,updated_at=now() where id=target_id returning version into v_version; return jsonb_build_object('id',target_id,'version',v_version);
end; $$;

create function private.c1_update_component(target_company_id uuid, target_id uuid, target_input jsonb, target_request_id uuid) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_context jsonb; v_version bigint;
begin
  v_context:=private.c1_master_context(target_company_id,'engagement.manage'); select version into v_version from public.engagement_components where id=target_id and tenant_id=(v_context->>'tenantId')::uuid and company_id=target_company_id for update;
  if v_version is null then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND'; end if; if v_version<>(target_input->>'expectedVersion')::bigint then raise exception using errcode='P0001',message='VERSION_CONFLICT'; end if;
  update public.engagement_components set code=coalesce(nullif(btrim(target_input->>'code'),''),code),name=coalesce(nullif(btrim(target_input->>'name'),''),name),pricing_method=coalesce(target_input->>'pricingMethod',pricing_method),unit_code=coalesce(target_input->>'unitCode',unit_code),version=version+1,updated_at=now() where id=target_id returning version into v_version; return jsonb_build_object('id',target_id,'version',v_version);
end; $$;

create function public.c1_create_project(target_company_id uuid, target_input jsonb, target_request_id uuid) returns jsonb language sql security definer set search_path = '' as $$ select private.c1_create_project(target_company_id,target_input,target_request_id); $$;
create function public.c1_create_business_party(target_company_id uuid, target_input jsonb, target_request_id uuid) returns jsonb language sql security definer set search_path = '' as $$ select private.c1_create_party(target_company_id,target_input,target_request_id); $$;
create function public.c1_create_engagement(target_company_id uuid, target_project_id uuid, target_input jsonb, target_request_id uuid) returns jsonb language sql security definer set search_path = '' as $$ select private.c1_create_engagement(target_company_id,target_project_id,target_input,target_request_id); $$;
create function public.c1_create_engagement_component(target_company_id uuid, target_engagement_id uuid, target_input jsonb, target_request_id uuid) returns jsonb language sql security definer set search_path = '' as $$ select private.c1_create_component(target_company_id,target_engagement_id,target_input,target_request_id); $$;
create function public.c1_update_project(target_company_id uuid,target_id uuid,target_input jsonb,target_request_id uuid) returns jsonb language sql security definer set search_path = '' as $$ select private.c1_update_project(target_company_id,target_id,target_input,target_request_id); $$;
create function public.c1_update_business_party(target_company_id uuid,target_id uuid,target_input jsonb,target_request_id uuid) returns jsonb language sql security definer set search_path = '' as $$ select private.c1_update_party(target_company_id,target_id,target_input,target_request_id); $$;
create function public.c1_update_engagement(target_company_id uuid,target_id uuid,target_input jsonb,target_request_id uuid) returns jsonb language sql security definer set search_path = '' as $$ select private.c1_update_engagement(target_company_id,target_id,target_input,target_request_id); $$;
create function public.c1_update_engagement_component(target_company_id uuid,target_id uuid,target_input jsonb,target_request_id uuid) returns jsonb language sql security definer set search_path = '' as $$ select private.c1_update_component(target_company_id,target_id,target_input,target_request_id); $$;
grant execute on function public.c1_create_project(uuid,jsonb,uuid), public.c1_create_business_party(uuid,jsonb,uuid), public.c1_create_engagement(uuid,uuid,jsonb,uuid), public.c1_create_engagement_component(uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function public.c1_update_project(uuid,uuid,jsonb,uuid), public.c1_update_business_party(uuid,uuid,jsonb,uuid), public.c1_update_engagement(uuid,uuid,jsonb,uuid), public.c1_update_engagement_component(uuid,uuid,jsonb,uuid) to authenticated;
revoke all on function private.c1_master_context(uuid,text), private.c1_create_project(uuid,jsonb,uuid), private.c1_create_party(uuid,jsonb,uuid), private.c1_create_engagement(uuid,uuid,jsonb,uuid), private.c1_create_component(uuid,uuid,jsonb,uuid) from public, anon, authenticated;
