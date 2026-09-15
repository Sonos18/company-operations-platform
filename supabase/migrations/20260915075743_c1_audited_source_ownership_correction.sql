create table private.c1_source_ownership_correction_tokens (
  record_type text not null check (record_type in ('source_selection', 'source_reported_figure')),
  record_id uuid not null,
  transaction_id bigint not null,
  backend_pid integer not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  audit_event_id bigint not null references public.audit_events(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (record_type, record_id, transaction_id, backend_pid, actor_user_id)
);

alter table private.c1_source_ownership_correction_tokens enable row level security;
revoke all on table private.c1_source_ownership_correction_tokens from public, anon, authenticated;

create or replace function private.c1_reject_import_history_mutation()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_record_type text;
  v_token_record_id uuid;
begin
  if TG_OP = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'HISTORY_IMMUTABLE';
  end if;

  if TG_TABLE_NAME = 'source_selections' then
    if (pg_catalog.to_jsonb(OLD) - array['mapped_project_id', 'mapped_party_id', 'mapped_engagement_id']::text[])
       is distinct from
       (pg_catalog.to_jsonb(NEW) - array['mapped_project_id', 'mapped_party_id', 'mapped_engagement_id']::text[]) then
      raise exception using errcode = 'P0001', message = 'HISTORY_IMMUTABLE';
    end if;
    v_record_type := 'source_selection';
  elsif TG_TABLE_NAME = 'source_reported_figures' then
    if (pg_catalog.to_jsonb(OLD) - array['project_id', 'party_id', 'engagement_id']::text[])
       is distinct from
       (pg_catalog.to_jsonb(NEW) - array['project_id', 'party_id', 'engagement_id']::text[]) then
      raise exception using errcode = 'P0001', message = 'HISTORY_IMMUTABLE';
    end if;
    v_record_type := 'source_reported_figure';
  else
    raise exception using errcode = 'P0001', message = 'HISTORY_IMMUTABLE';
  end if;

  delete from private.c1_source_ownership_correction_tokens token
   where token.record_type = v_record_type
     and token.record_id = OLD.id
     and token.transaction_id = pg_catalog.txid_current()
     and token.backend_pid = pg_catalog.pg_backend_pid()
     and token.actor_user_id = auth.uid()
  returning token.record_id into v_token_record_id;

  if v_token_record_id is null then
    raise exception using errcode = 'P0001', message = 'HISTORY_IMMUTABLE';
  end if;

  return NEW;
end;
$$;

create function private.c1_correct_source_selection_ownership(
  target_selection_id uuid,
  target_project_id uuid,
  target_party_id uuid,
  target_engagement_id uuid,
  target_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_source public.source_selections%rowtype;
  v_context jsonb;
  v_actor_id uuid;
  v_tenant_id uuid;
  v_reason text;
  v_audit_event_id bigint;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  select source.* into v_source
    from public.source_selections source
   where source.id = target_selection_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  v_context := private.c1_master_context(v_source.company_id, 'cost.correct');
  v_tenant_id := (v_context ->> 'tenantId')::uuid;
  if (v_context ->> 'actorId')::uuid is distinct from v_actor_id
     or v_source.tenant_id is distinct from v_tenant_id then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  v_reason := pg_catalog.btrim(target_reason);
  if v_reason is null or v_reason = '' then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  if target_engagement_id is not null and (target_project_id is null or target_party_id is null) then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  if target_project_id is not null and not exists (
    select 1 from public.projects project
     where project.id = target_project_id and project.tenant_id = v_tenant_id and project.company_id = v_source.company_id
  ) then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  if target_party_id is not null and not exists (
    select 1 from public.business_parties party
     where party.id = target_party_id and party.tenant_id = v_tenant_id and party.company_id = v_source.company_id
  ) then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  if target_engagement_id is not null and not exists (
    select 1 from public.project_engagements engagement
     where engagement.id = target_engagement_id
       and engagement.tenant_id = v_tenant_id
       and engagement.company_id = v_source.company_id
       and engagement.project_id = target_project_id
       and engagement.party_id = target_party_id
  ) then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  if v_source.mapped_project_id is not distinct from target_project_id
     and v_source.mapped_party_id is not distinct from target_party_id
     and v_source.mapped_engagement_id is not distinct from target_engagement_id then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;

  insert into public.audit_events (
    tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, before_summary, after_summary
  ) values (
    v_tenant_id, v_source.company_id, v_actor_id, 'c1.source_ownership.corrected', 'source_selection', v_source.id::text,
    pg_catalog.gen_random_uuid(),
    pg_catalog.jsonb_build_object('projectId', v_source.mapped_project_id, 'partyId', v_source.mapped_party_id, 'engagementId', v_source.mapped_engagement_id),
    pg_catalog.jsonb_build_object('projectId', target_project_id, 'partyId', target_party_id, 'engagementId', target_engagement_id, 'reason', v_reason)
  ) returning id into v_audit_event_id;

  insert into private.c1_source_ownership_correction_tokens (
    record_type, record_id, transaction_id, backend_pid, actor_user_id, audit_event_id
  ) values (
    'source_selection', v_source.id, pg_catalog.txid_current(), pg_catalog.pg_backend_pid(), v_actor_id, v_audit_event_id
  );

  update public.source_selections source
     set mapped_project_id = target_project_id,
         mapped_party_id = target_party_id,
         mapped_engagement_id = target_engagement_id
   where source.id = v_source.id
  returning source.* into v_source;

  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  return pg_catalog.jsonb_build_object('recordId', v_source.id, 'auditEventId', v_audit_event_id);
end;
$$;

create function private.c1_correct_source_reported_figure_ownership(
  target_figure_id uuid,
  target_project_id uuid,
  target_party_id uuid,
  target_engagement_id uuid,
  target_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_source public.source_reported_figures%rowtype;
  v_context jsonb;
  v_actor_id uuid;
  v_tenant_id uuid;
  v_reason text;
  v_audit_event_id bigint;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  select source.* into v_source
    from public.source_reported_figures source
   where source.id = target_figure_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  v_context := private.c1_master_context(v_source.company_id, 'cost.correct');
  v_tenant_id := (v_context ->> 'tenantId')::uuid;
  if (v_context ->> 'actorId')::uuid is distinct from v_actor_id
     or v_source.tenant_id is distinct from v_tenant_id then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  v_reason := pg_catalog.btrim(target_reason);
  if v_reason is null or v_reason = '' then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  if target_engagement_id is not null and (target_project_id is null or target_party_id is null) then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  if target_project_id is not null and not exists (
    select 1 from public.projects project
     where project.id = target_project_id and project.tenant_id = v_tenant_id and project.company_id = v_source.company_id
  ) then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  if target_party_id is not null and not exists (
    select 1 from public.business_parties party
     where party.id = target_party_id and party.tenant_id = v_tenant_id and party.company_id = v_source.company_id
  ) then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  if target_engagement_id is not null and not exists (
    select 1 from public.project_engagements engagement
     where engagement.id = target_engagement_id
       and engagement.tenant_id = v_tenant_id
       and engagement.company_id = v_source.company_id
       and engagement.project_id = target_project_id
       and engagement.party_id = target_party_id
  ) then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  if v_source.project_id is not distinct from target_project_id
     and v_source.party_id is not distinct from target_party_id
     and v_source.engagement_id is not distinct from target_engagement_id then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;

  insert into public.audit_events (
    tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, before_summary, after_summary
  ) values (
    v_tenant_id, v_source.company_id, v_actor_id, 'c1.source_ownership.corrected', 'source_reported_figure', v_source.id::text,
    pg_catalog.gen_random_uuid(),
    pg_catalog.jsonb_build_object('projectId', v_source.project_id, 'partyId', v_source.party_id, 'engagementId', v_source.engagement_id),
    pg_catalog.jsonb_build_object('projectId', target_project_id, 'partyId', target_party_id, 'engagementId', target_engagement_id, 'reason', v_reason)
  ) returning id into v_audit_event_id;

  insert into private.c1_source_ownership_correction_tokens (
    record_type, record_id, transaction_id, backend_pid, actor_user_id, audit_event_id
  ) values (
    'source_reported_figure', v_source.id, pg_catalog.txid_current(), pg_catalog.pg_backend_pid(), v_actor_id, v_audit_event_id
  );

  update public.source_reported_figures source
     set project_id = target_project_id,
         party_id = target_party_id,
         engagement_id = target_engagement_id
   where source.id = v_source.id
  returning source.* into v_source;

  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;
  return pg_catalog.jsonb_build_object('recordId', v_source.id, 'auditEventId', v_audit_event_id);
end;
$$;

revoke all on function private.c1_reject_import_history_mutation() from public, anon, authenticated;
revoke all on function private.c1_correct_source_selection_ownership(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.c1_correct_source_reported_figure_ownership(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
