set local transaction_timeout='120s';
set local application_name='taskovia-c107f700-cutover-ddl';
set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,31);
-- SOURCE ONLY: unapplied. No classifications, role grants, onboarding or activation.
-- Shared legacy writers and exclusive transition commands use the same company key.
-- RC is mandatory: a persistent transaction snapshot cannot observe a mode committed
-- while waiting. Each VOLATILE caller obtains the barrier in a standalone PERFORM,
-- then reads admission in a subsequent SQL command. No business-row lock in activation.

create function private.c1_workflow_transition_barrier(t uuid,c uuid,exclusive boolean default false) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if t is null or c is null or pg_catalog.current_setting('transaction_isolation')<>'read committed'
 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 if exclusive then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('c1_workflow_transition:'||t::text||':'||c::text,0));
 else
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('c1_workflow_transition:'||t::text||':'||c::text,0));
 end if;
end;$$;

create function private.c1_workflow_transition_row_barrier() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare previous jsonb;current_row jsonb;scope record;
begin
 if tg_op<>'INSERT' then previous:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then current_row:=to_jsonb(new);end if;
 -- Protect both scopes on moves, in deterministic order. Never lock business rows.
 for scope in
  select distinct x.t,x.c from (values
   ((previous->>'tenant_id')::uuid,(previous->>'company_id')::uuid),
   ((current_row->>'tenant_id')::uuid,(current_row->>'company_id')::uuid)) x(t,c)
  where x.t is not null and x.c is not null order by x.t,x.c
 loop perform private.c1_workflow_transition_barrier(scope.t,scope.c,false);end loop;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;

-- All contributors read by cutover_snapshot_data or the existing inventory.
-- These triggers coordinate only; they do not ban active project/party maintenance.
do $$
declare name text;
begin
 foreach name in array array[
  'projects','business_parties','project_subcontracts','project_engagements',
  'company_cost_settings','cost_categories','accounting_sources','accounting_source_versions',
  'source_selections','source_reported_figures','project_cost_item_sources',
  'project_cost_item_detail_sources','cost_evidence_files','cost_evidence_links',
  'cost_workflow_companies','cost_workflow_party_classifications',
  'cost_workflow_manager_assignments','cost_workflow_contracts','cost_workflow_contract_versions',
  'cost_workflow_payments','cost_workflow_installments','cost_workflow_refunds',
  'cost_workflow_corrections','cost_workflow_legacy_cash_reconciliation'
 ] loop
  execute pg_catalog.format('create trigger aa_c1_workflow_transition_barrier before insert or update or delete on public.%I for each row execute function private.c1_workflow_transition_row_barrier()',name);
 end loop;
end;$$;

create or replace function private.c1_workflow_require_legacy(target_company_id uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare t uuid;
begin
 select tenant_id into t from public.companies where id=target_company_id;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 perform private.c1_workflow_transition_barrier(t,target_company_id,false);
 if exists(select 1 from public.cost_workflow_companies w where w.company_id=target_company_id and w.mode='document_backed_v1')
 then raise exception using errcode='P0001',message='LEGACY_WORKFLOW_WRITE_DISABLED';end if;
end;$$;

create or replace function private.c1_workflow_guard_legacy_write() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare data jsonb;mode text;scope record;previous jsonb;
begin
 data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if tg_op='UPDATE' then previous:=to_jsonb(old);end if;
 for scope in select distinct x.t,x.c from(values
  ((data->>'tenant_id')::uuid,(data->>'company_id')::uuid),
  ((previous->>'tenant_id')::uuid,(previous->>'company_id')::uuid)) x(t,c)
  where x.t is not null and x.c is not null order by x.t,x.c
 loop
  perform private.c1_workflow_transition_barrier(scope.t,scope.c,false);
  select w.mode into mode from public.cost_workflow_companies w where w.tenant_id=scope.t and w.company_id=scope.c;
  if mode='document_backed_v1' then
   if tg_table_name='project_subcontract_payments' and tg_op='INSERT' and private.c1_workflow_canonical_payment_staged(data) then return new;end if;
   raise exception using errcode='P0001',message='LEGACY_WORKFLOW_WRITE_DISABLED';
  end if;
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;

create or replace function private.c1_workflow_guard_legacy_file() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.c1_workflow_transition_barrier(new.tenant_id,new.company_id,false);
 if tg_op='UPDATE' and (old.tenant_id,old.company_id) is distinct from (new.tenant_id,new.company_id)
 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 if exists(select 1 from public.cost_workflow_companies w where w.tenant_id=new.tenant_id and w.company_id=new.company_id and w.mode='document_backed_v1')
 and not new.workflow_origin and (tg_op='INSERT' or old.status='pending_upload') then raise exception using errcode='P0001',message='LEGACY_WORKFLOW_WRITE_DISABLED';end if;
 return new;
end;$$;

create or replace function private.c1_workflow_guard_legacy_link() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.c1_workflow_transition_barrier(new.tenant_id,new.company_id,false);
 if exists(select 1 from public.cost_workflow_companies w where w.tenant_id=new.tenant_id and w.company_id=new.company_id and w.mode='document_backed_v1')
 then raise exception using errcode='P0001',message='LEGACY_WORKFLOW_WRITE_DISABLED';end if;
 if exists(select 1 from public.cost_evidence_files f where f.id=new.evidence_file_id and f.tenant_id=new.tenant_id and f.company_id=new.company_id and f.workflow_origin)
 then raise exception using errcode='P0001',message='LEGACY_WORKFLOW_WRITE_DISABLED';end if;
 return new;
end;$$;

create function private.c1_workflow_cutover_recipient(t uuid,c uuid,recipient uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 -- VQH rollout has a fixed director, resolved by scoped account identity.
 -- The operation packet additionally pins the exact existing Auth UUID.
 if not exists(select 1 from public.companies x where x.id=c and x.tenant_id=t and x.code='VQH')
 or not exists(select 1 from auth.users u where u.id=recipient and pg_catalog.lower(u.email)='vqh-director@taskovia.invalid'
  and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()))
 or not exists(select 1 from public.company_memberships m where m.tenant_id=t and m.company_id=c and m.user_id=recipient and m.is_active)
 or not private.c1_workflow_user_has_permission(t,c,recipient,'project.read')
 or not private.c1_workflow_user_has_permission(t,c,recipient,'cost.request.read')
 or not private.c1_workflow_user_has_permission(t,c,recipient,'project.cost_manager.assign')
 or not private.c1_workflow_user_has_permission(t,c,recipient,'cost.notification.read')
 then raise exception using errcode='P0001',message='PERMISSION_DENIED';end if;
end;$$;

create function private.c1_workflow_cutover_snapshot_data(t uuid,c uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare state jsonb;projects jsonb;crews jsonb;extra jsonb;config public.cost_workflow_companies%rowtype;pending bigint;
begin
 select * into config from public.cost_workflow_companies where tenant_id=t and company_id=c;
 select coalesce(jsonb_agg(jsonb_build_object('project',to_jsonb(p),'inventory',private.c1_workflow_inventory(t,c,p.id)) order by p.id),'[]'::jsonb)
 into projects from public.projects p where p.tenant_id=t and p.company_id=c;
 select coalesce(jsonb_agg(jsonb_build_object('party',to_jsonb(p),'classification',(
  select to_jsonb(v) from public.cost_workflow_party_classifications v where v.tenant_id=t and v.company_id=c and v.party_id=p.id order by v.version desc limit 1)) order by p.id),'[]'::jsonb)
 into crews from public.business_parties p where p.tenant_id=t and p.company_id=c and p.party_kind='crew' and p.is_active;
 extra:=jsonb_build_object(
  'subcontracts',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.project_subcontracts x where x.tenant_id=t and x.company_id=c),'[]'::jsonb),
  'engagements',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.project_engagements x where x.tenant_id=t and x.company_id=c),'[]'::jsonb),
  'detailSources',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.project_cost_item_detail_sources x where x.tenant_id=t and x.company_id=c),'[]'::jsonb),
  'legacyEvidenceLinks',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.cost_evidence_links x where x.tenant_id=t and x.company_id=c),'[]'::jsonb),
  'settings',coalesce((select to_jsonb(x) from public.company_cost_settings x where x.tenant_id=t and x.company_id=c),'{}'::jsonb));
 select count(*) into pending from public.cost_evidence_files f where f.tenant_id=t and f.company_id=c and not f.workflow_origin and f.status='pending_upload';
 state:=jsonb_build_object('configuration',coalesce(to_jsonb(config),'{}'::jsonb),'projects',projects,'crews',crews,'extra',extra);
 return jsonb_build_object('companyId',c,'snapshotHash',private.c1_workflow_row_hash(state),
  'configurationVersion',coalesce(config.version,0),'mode',coalesce(config.mode,'legacy'),
  'notificationRecipientId',config.notification_recipient_id,'projectCount',jsonb_array_length(projects),
  'activeCrewCount',jsonb_array_length(crews),'unclassifiedCrewCount',(select count(*) from jsonb_array_elements(crews) x where x->'classification'='null'::jsonb),
  'pendingLegacyUploads',pending,'historyPolicy','preserve_readonly_unknown');
end;$$;

create function public.c1_workflow_cutover_snapshot(target_company_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;
begin
 context:=private.c1_master_context(target_company_id,'cost.config.manage');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_transition_barrier(t,target_company_id,true);
 context:=private.c1_master_context(target_company_id,'cost.config.manage');
 return private.c1_workflow_cutover_snapshot_data(t,target_company_id);
end;$$;

create function public.c1_workflow_configure_company(target_company_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;config public.cost_workflow_companies%rowtype;receipt public.cost_command_receipts%rowtype;hash text;expected bigint;recipient uuid;reason text;
begin
 context:=private.c1_master_context(target_company_id,'cost.config.manage');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_transition_barrier(t,target_company_id,true);
 context:=private.c1_master_context(target_company_id,'cost.config.manage');
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.config.manage');
 perform private.c1_workflow_require_keys(target_input,array['expectedVersion','notificationRecipientId','reason'],array['expectedVersion','notificationRecipientId','reason']);
 expected:=private.c1_detail_expected_version(target_input);reason:=private.c1_workflow_text(target_input->'reason');
 begin recipient:=(target_input->>'notificationRecipientId')::uuid;exception when invalid_text_representation then raise exception using errcode='P0001',message='INPUT_INVALID';end;
 perform private.c1_workflow_cutover_recipient(t,target_company_id,recipient);
 hash:=private.c1_workflow_hash(null,null,target_input);
 receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.configure_company',target_idempotency_key,hash);
 if receipt.id is not null then return jsonb_build_object('companyId',target_company_id,'mode','legacy','version',receipt.result_version,'replayed',true);end if;
 select * into config from public.cost_workflow_companies where tenant_id=t and company_id=target_company_id;
 if coalesce(config.version,0)<>expected then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 if config.mode='document_backed_v1' then raise exception using errcode='P0001',message='LEGACY_WORKFLOW_WRITE_DISABLED';end if;
 insert into public.cost_workflow_companies(tenant_id,company_id,mode,notification_recipient_id,version)
 values(t,target_company_id,'legacy',recipient,expected+1)
 on conflict(company_id) do update set notification_recipient_id=excluded.notification_recipient_id,version=excluded.version;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.configure_company',target_idempotency_key,hash,target_company_id,expected+1,target_request_id,jsonb_build_object('mode','legacy','recipientId',recipient,'reason',reason));
 return jsonb_build_object('companyId',target_company_id,'mode','legacy','version',expected+1,'replayed',false);
end;$$;

create function public.c1_workflow_append_party_classification(target_company_id uuid,target_party_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;party public.business_parties%rowtype;config public.cost_workflow_companies%rowtype;receipt public.cost_command_receipts%rowtype;hash text;expected bigint;party_expected bigint;ownership text;reason text;current_version bigint;created uuid;
begin
 context:=private.c1_master_context(target_company_id,'party.manage');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_transition_barrier(t,target_company_id,true);
 context:=private.c1_master_context(target_company_id,'party.manage');
 perform private.c1_workflow_lock_actor(t,target_company_id,'party.manage');
 perform private.c1_workflow_require_keys(target_input,array['expectedPartyVersion','expectedClassificationVersion','crewOwnership','reason'],array['expectedPartyVersion','expectedClassificationVersion','crewOwnership','reason']);
 expected:=private.c1_detail_expected_version(jsonb_build_object('expectedVersion',target_input->'expectedClassificationVersion'));
 party_expected:=private.c1_detail_expected_version(jsonb_build_object('expectedVersion',target_input->'expectedPartyVersion'));
 ownership:=private.c1_workflow_text(target_input->'crewOwnership');reason:=private.c1_workflow_text(target_input->'reason');
 if ownership not in('vqh_internal','external') then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 hash:=private.c1_workflow_hash(null,target_party_id,target_input);
 receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.append_party_classification',target_idempotency_key,hash);
 if receipt.id is not null then return jsonb_build_object('classificationId',receipt.result_resource_id,'version',receipt.result_version,'replayed',true);end if;
 select * into config from public.cost_workflow_companies where tenant_id=t and company_id=target_company_id;
 if config.mode='document_backed_v1' then raise exception using errcode='P0001',message='LEGACY_WORKFLOW_WRITE_DISABLED';end if;
 select * into party from public.business_parties where id=target_party_id and tenant_id=t and company_id=target_company_id and party_kind='crew' and is_active;
 if not found then raise exception using errcode='P0001',message='RESOURCE_NOT_FOUND';end if;
 select coalesce(max(version),0) into current_version from public.cost_workflow_party_classifications where party_id=target_party_id and tenant_id=t and company_id=target_company_id;
 if party.version<>party_expected or current_version<>expected then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 insert into public.cost_workflow_party_classifications(tenant_id,company_id,party_id,version,crew_ownership,reviewed_by)
 values(t,target_company_id,target_party_id,expected+1,ownership,auth.uid()) returning id into created;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.append_party_classification',target_idempotency_key,hash,created,expected+1,target_request_id,jsonb_build_object('partyId',target_party_id,'partyVersion',party_expected,'ownership',ownership,'reason',reason));
 return jsonb_build_object('classificationId',created,'version',expected+1,'replayed',false);
end;$$;

create function public.c1_workflow_activate_company(target_company_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare context jsonb;t uuid;config public.cost_workflow_companies%rowtype;receipt public.cost_command_receipts%rowtype;hash text;expected bigint;reason text;snapshot jsonb;
begin
 context:=private.c1_master_context(target_company_id,'cost.config.manage');t:=(context->>'tenantId')::uuid;
 perform private.c1_workflow_transition_barrier(t,target_company_id,true);
 context:=private.c1_master_context(target_company_id,'cost.config.manage');
 perform private.c1_workflow_lock_actor(t,target_company_id,'cost.config.manage');
 perform private.c1_workflow_require_keys(target_input,array['expectedVersion','expectedSnapshotHash','historyPolicy','reason'],array['expectedVersion','expectedSnapshotHash','historyPolicy','reason']);
 expected:=private.c1_detail_expected_version(target_input);reason:=private.c1_workflow_text(target_input->'reason');
 if target_input->>'historyPolicy' is distinct from 'preserve_readonly_unknown' or coalesce(target_input->>'expectedSnapshotHash','')!~'^[a-f0-9]{64}$'
 then raise exception using errcode='P0001',message='INPUT_INVALID';end if;
 hash:=private.c1_workflow_hash(null,null,target_input);
 receipt:=private.c1_workflow_receipt(t,target_company_id,'cost_workflow.activate_company',target_idempotency_key,hash);
 if receipt.id is not null then return jsonb_build_object('companyId',target_company_id,'mode','document_backed_v1','version',receipt.result_version,'replayed',true);end if;
 select * into config from public.cost_workflow_companies where tenant_id=t and company_id=target_company_id;
 if not found or config.version<>expected then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 if config.mode<>'legacy' then raise exception using errcode='P0001',message='LEGACY_WORKFLOW_WRITE_DISABLED';end if;
 perform private.c1_workflow_cutover_recipient(t,target_company_id,config.notification_recipient_id);
 snapshot:=private.c1_workflow_cutover_snapshot_data(t,target_company_id);
 if snapshot->>'snapshotHash'<>target_input->>'expectedSnapshotHash' then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 if (snapshot->>'unclassifiedCrewCount')::bigint<>0 or (snapshot->>'pendingLegacyUploads')::bigint<>0
 then raise exception using errcode='P0001',message='LEGACY_RECONCILIATION_REQUIRED';end if;
 update public.cost_workflow_companies set mode='document_backed_v1',version=expected+1 where tenant_id=t and company_id=target_company_id and version=expected and mode='legacy';
 if not found then raise exception using errcode='P0001',message='VERSION_CONFLICT';end if;
 perform private.c1_workflow_record_command(t,target_company_id,'cost_workflow.activate_company',target_idempotency_key,hash,target_company_id,expected+1,target_request_id,jsonb_build_object('mode','document_backed_v1','reason',reason,'historyPolicy','preserve_readonly_unknown','snapshotHash',snapshot->>'snapshotHash','projectCount',snapshot->'projectCount','activeCrewCount',snapshot->'activeCrewCount'));
 return jsonb_build_object('companyId',target_company_id,'mode','document_backed_v1','version',expected+1,'replayed',false);
end;$$;

revoke all on function private.c1_workflow_transition_barrier(uuid,uuid,boolean),private.c1_workflow_transition_row_barrier(),private.c1_workflow_cutover_recipient(uuid,uuid,uuid),private.c1_workflow_cutover_snapshot_data(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.c1_workflow_cutover_snapshot(uuid),public.c1_workflow_configure_company(uuid,jsonb,uuid,uuid),public.c1_workflow_append_party_classification(uuid,uuid,jsonb,uuid,uuid),public.c1_workflow_activate_company(uuid,jsonb,uuid,uuid) from public,anon,service_role;
grant execute on function public.c1_workflow_cutover_snapshot(uuid),public.c1_workflow_configure_company(uuid,jsonb,uuid,uuid),public.c1_workflow_append_party_classification(uuid,uuid,jsonb,uuid,uuid),public.c1_workflow_activate_company(uuid,jsonb,uuid,uuid) to authenticated;

-- Refresh the exposed authenticated RPC signatures after the migration commits.
notify pgrst,'reload schema';
