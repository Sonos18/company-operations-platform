import { CANONICAL_DEV_PROJECT_REF, assertCloudDevTarget } from './assert-cloud-dev-target.mjs'
import { readDedicatedSupabaseDevAccessToken } from './run-supabase-dev.mjs'

const MANAGEMENT_API_ORIGIN = 'https://api.supabase.com'

export const YONG_MEI_PROMOTION_CONTRACT = Object.freeze({
  tenantId: '10000000-0000-4000-8000-000000000010',
  companyId: '10000000-0000-4000-8000-000000000020',
  sourceProjectId: '7e7e3904-d53b-4337-9360-22256887474a',
  targetProjectId: '22727545-1534-4c1a-9378-06969cb40f97',
  obsoletePartyId: '087485b2-d63f-45a3-90cf-5693abbf25d9',
  obsoleteEngagementId: '83cbc0d2-568b-4b17-b5a8-779f218dbd37',
  actorId: '7c01c684-5c18-4c2f-ac34-5f300910b605',
  sourceProjectCode: 'EO-GIO',
  targetProjectCode: 'YONG-MEI',
  obsoletePartyCode: 'YONG-MEI',
  obsoleteEngagementCode: 'EO-GIO-YONG-MEI',
  selectionIds: Object.freeze([
    '31e60281-c3bb-4d20-b0fb-d22905888b3f', '5423aa68-8299-4ac5-b97b-302c74f60eb1',
    '5522f425-0611-4205-8584-9daa7df31104', '61fa3091-456b-4882-a433-92c783dc0655',
    '6d8b3e35-5db6-4c93-b14b-2fb3ba8e324a', '952aa862-299d-4049-8990-cdb4717f8d0d',
    '978e071d-57dd-41f9-aba0-fe69dea56f66', 'a30b17a3-c90d-4510-9b57-3f249fb99959',
    'ac3cf402-155f-4234-999c-37a173f9e053', 'dee4c09d-e6c6-47b8-b744-c025a77e86ea',
    'f8f6be08-7fe1-451f-9526-374408d26fae',
  ]),
  expectedSelectionCount: 11,
  expectedFigureCount: 22,
  reason: 'Correct misclassified Yong Mei Party/engagement ownership to independent Project Yong Mei.',
})

const fixedSelectionsSql = YONG_MEI_PROMOTION_CONTRACT.selectionIds.map(id => `('${id}'::uuid)`).join(',\n    ')
const fixed = YONG_MEI_PROMOTION_CONTRACT

export function buildYongMeiPromotionDryRunSql() {
  return `
with fixed_selection(id) as (values
    ${fixedSelectionsSql}
), reviewed_selection as (
  select selection.id
    from public.source_selections selection
    join fixed_selection fixed_selection on fixed_selection.id = selection.id
   where selection.mapped_project_id = '${fixed.sourceProjectId}'::uuid
     and selection.mapped_party_id = '${fixed.obsoletePartyId}'::uuid
     and selection.mapped_engagement_id = '${fixed.obsoleteEngagementId}'::uuid
), reviewed_figure as (
  select figure.id
    from public.source_reported_figures figure
    join reviewed_selection selection on selection.id = figure.source_selection_id
   where figure.project_id = '${fixed.sourceProjectId}'::uuid
     and figure.party_id = '${fixed.obsoletePartyId}'::uuid
     and figure.engagement_id = '${fixed.obsoleteEngagementId}'::uuid
), all_old_selection as (
  select selection.id from public.source_selections selection
   where selection.mapped_project_id = '${fixed.sourceProjectId}'::uuid
     and selection.mapped_party_id = '${fixed.obsoletePartyId}'::uuid
     and selection.mapped_engagement_id = '${fixed.obsoleteEngagementId}'::uuid
), all_old_figure as (
  select figure.id from public.source_reported_figures figure
   where figure.project_id = '${fixed.sourceProjectId}'::uuid
     and figure.party_id = '${fixed.obsoletePartyId}'::uuid
     and figure.engagement_id = '${fixed.obsoleteEngagementId}'::uuid
)
select jsonb_build_object(
  'selectionIds', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from reviewed_selection),
  'selectionCount', (select count(*) from reviewed_selection),
  'oldSelectionCount', (select count(*) from all_old_selection),
  'figureCount', (select count(*) from reviewed_figure),
  'oldFigureCount', (select count(*) from all_old_figure),
  'sourceProjectVerified', exists (select 1 from public.projects project where project.id = '${fixed.sourceProjectId}'::uuid and project.tenant_id = '${fixed.tenantId}'::uuid and project.company_id = '${fixed.companyId}'::uuid and project.code = '${fixed.sourceProjectCode}'),
  'targetProjectVerified', exists (select 1 from public.projects project where project.id = '${fixed.targetProjectId}'::uuid and project.tenant_id = '${fixed.tenantId}'::uuid and project.company_id = '${fixed.companyId}'::uuid and project.code = '${fixed.targetProjectCode}'),
  'actorAuthorized', exists (select 1 from public.company_memberships membership join public.company_role_assignments assignment on assignment.user_id = membership.user_id and assignment.tenant_id = membership.tenant_id and assignment.company_id = membership.company_id and assignment.revoked_at is null join public.roles role on role.id = assignment.role_id and role.is_active join public.role_permissions permission on permission.role_id = role.id and permission.permission_code = 'cost.correct' where membership.user_id = '${fixed.actorId}'::uuid and membership.tenant_id = '${fixed.tenantId}'::uuid and membership.company_id = '${fixed.companyId}'::uuid and membership.is_active),
  'partyVerified', exists (select 1 from public.business_parties party where party.id = '${fixed.obsoletePartyId}'::uuid and party.tenant_id = '${fixed.tenantId}'::uuid and party.company_id = '${fixed.companyId}'::uuid and party.code = '${fixed.obsoletePartyCode}'),
  'engagementVerified', exists (select 1 from public.project_engagements engagement where engagement.id = '${fixed.obsoleteEngagementId}'::uuid and engagement.tenant_id = '${fixed.tenantId}'::uuid and engagement.company_id = '${fixed.companyId}'::uuid and engagement.project_id = '${fixed.sourceProjectId}'::uuid and engagement.party_id = '${fixed.obsoletePartyId}'::uuid and engagement.code = '${fixed.obsoleteEngagementCode}'),
  'componentSafe', not exists (select 1 from public.source_selections selection join fixed_selection fixed_selection on fixed_selection.id = selection.id where selection.mapped_component_id is not null),
  'oldOwnershipVerified', (select count(*) from reviewed_selection) = ${fixed.expectedSelectionCount} and (select count(*) from all_old_selection) = ${fixed.expectedSelectionCount} and (select count(*) from reviewed_figure) = ${fixed.expectedFigureCount} and (select count(*) from all_old_figure) = ${fixed.expectedFigureCount},
  'correctionApiVerified', to_regprocedure('private.c1_correct_source_selection_ownership(uuid,uuid,uuid,uuid,text)') is not null and to_regprocedure('private.c1_correct_source_reported_figure_ownership(uuid,uuid,uuid,uuid,text)') is not null
) as readiness;`
}

export function buildYongMeiPromotionExecuteSql() {
  return `
begin;
select set_config('request.jwt.claims', '{"sub":"${fixed.actorId}","role":"authenticated"}', true);
do $$
declare
  target_figure uuid;
  target_selection uuid;
  deleted_engagement uuid;
  deleted_party uuid;
  obsolete_engagement public.project_engagements%rowtype;
  obsolete_party public.business_parties%rowtype;
begin
  perform private.c1_master_context('${fixed.companyId}'::uuid, 'cost.correct');
  if not exists (select 1 from public.projects project where project.id = '${fixed.sourceProjectId}'::uuid and project.tenant_id = '${fixed.tenantId}'::uuid and project.company_id = '${fixed.companyId}'::uuid and project.code = '${fixed.sourceProjectCode}') then raise exception 'YONG_MEI_SOURCE_PROJECT_DRIFT'; end if;
  if not exists (select 1 from public.projects project where project.id = '${fixed.targetProjectId}'::uuid and project.tenant_id = '${fixed.tenantId}'::uuid and project.company_id = '${fixed.companyId}'::uuid and project.code = '${fixed.targetProjectCode}') then raise exception 'YONG_MEI_TARGET_PROJECT_DRIFT'; end if;
  if not exists (select 1 from public.business_parties party where party.id = '${fixed.obsoletePartyId}'::uuid and party.tenant_id = '${fixed.tenantId}'::uuid and party.company_id = '${fixed.companyId}'::uuid and party.code = '${fixed.obsoletePartyCode}') then raise exception 'YONG_MEI_PARTY_DRIFT'; end if;
  if not exists (select 1 from public.project_engagements engagement where engagement.id = '${fixed.obsoleteEngagementId}'::uuid and engagement.tenant_id = '${fixed.tenantId}'::uuid and engagement.company_id = '${fixed.companyId}'::uuid and engagement.project_id = '${fixed.sourceProjectId}'::uuid and engagement.party_id = '${fixed.obsoletePartyId}'::uuid and engagement.code = '${fixed.obsoleteEngagementCode}') then raise exception 'YONG_MEI_ENGAGEMENT_DRIFT'; end if;
  if (select count(*) from public.source_selections selection where selection.id in (select id from (values ${fixedSelectionsSql}) fixed_selection(id)) and selection.mapped_project_id = '${fixed.sourceProjectId}'::uuid and selection.mapped_party_id = '${fixed.obsoletePartyId}'::uuid and selection.mapped_engagement_id = '${fixed.obsoleteEngagementId}'::uuid) <> ${fixed.expectedSelectionCount} then raise exception 'YONG_MEI_SELECTION_SCOPE_DRIFT'; end if;
  if exists (select 1 from public.source_selections selection where selection.id in (select id from (values ${fixedSelectionsSql}) fixed_selection(id)) and selection.mapped_component_id is not null) then raise exception 'YONG_MEI_COMPONENT_SCOPE_DRIFT'; end if;
  if (select count(*) from public.source_reported_figures figure join public.source_selections selection on selection.id = figure.source_selection_id where selection.id in (select id from (values ${fixedSelectionsSql}) fixed_selection(id)) and figure.project_id = '${fixed.sourceProjectId}'::uuid and figure.party_id = '${fixed.obsoletePartyId}'::uuid and figure.engagement_id = '${fixed.obsoleteEngagementId}'::uuid) <> ${fixed.expectedFigureCount} then raise exception 'YONG_MEI_FIGURE_SCOPE_DRIFT'; end if;
  for target_figure in select figure.id from public.source_reported_figures figure join public.source_selections selection on selection.id = figure.source_selection_id where selection.id in (select id from (values ${fixedSelectionsSql}) fixed_selection(id)) order by figure.id for update loop perform private.c1_correct_source_reported_figure_ownership(target_figure, '${fixed.targetProjectId}'::uuid, null, null, '${fixed.reason}'); end loop;
  for target_selection in select selection.id from public.source_selections selection where selection.id in (select id from (values ${fixedSelectionsSql}) fixed_selection(id)) order by selection.id for update loop perform private.c1_correct_source_selection_ownership(target_selection, '${fixed.targetProjectId}'::uuid, null, null, '${fixed.reason}'); end loop;
  if exists (select 1 from public.source_selections selection where selection.id in (select id from (values ${fixedSelectionsSql}) fixed_selection(id)) and (selection.mapped_project_id is distinct from '${fixed.targetProjectId}'::uuid or selection.mapped_party_id is not null or selection.mapped_engagement_id is not null)) or exists (select 1 from public.source_reported_figures figure join public.source_selections selection on selection.id = figure.source_selection_id where selection.id in (select id from (values ${fixedSelectionsSql}) fixed_selection(id)) and (figure.project_id is distinct from '${fixed.targetProjectId}'::uuid or figure.party_id is not null or figure.engagement_id is not null)) then raise exception 'YONG_MEI_CORRECTION_VERIFICATION_FAILED'; end if;
  if (select count(*) from public.audit_events audit where audit.actor_id = '${fixed.actorId}'::uuid and audit.action = 'c1.source_ownership.corrected' and ((audit.resource_type = 'source_selection' and audit.resource_id in (select id::text from (values ${fixedSelectionsSql}) fixed_selection(id))) or (audit.resource_type = 'source_reported_figure' and audit.resource_id in (select figure.id::text from public.source_reported_figures figure join public.source_selections selection on selection.id = figure.source_selection_id where selection.id in (select id from (values ${fixedSelectionsSql}) fixed_selection(id))))) ) <> 33 then raise exception 'YONG_MEI_AUDIT_VERIFICATION_FAILED'; end if;
  if exists (select 1 from public.source_selections selection where selection.mapped_party_id = '${fixed.obsoletePartyId}'::uuid or selection.mapped_engagement_id = '${fixed.obsoleteEngagementId}'::uuid) or exists (select 1 from public.source_reported_figures figure where figure.party_id = '${fixed.obsoletePartyId}'::uuid or figure.engagement_id = '${fixed.obsoleteEngagementId}'::uuid) then raise exception 'YONG_MEI_SOURCE_REFERENCE_REMAINS'; end if;
  select engagement.* into obsolete_engagement from public.project_engagements engagement where engagement.id = '${fixed.obsoleteEngagementId}'::uuid for update;
  if not found or obsolete_engagement.tenant_id is distinct from '${fixed.tenantId}'::uuid or obsolete_engagement.company_id is distinct from '${fixed.companyId}'::uuid or obsolete_engagement.project_id is distinct from '${fixed.sourceProjectId}'::uuid or obsolete_engagement.party_id is distinct from '${fixed.obsoletePartyId}'::uuid or obsolete_engagement.code is distinct from '${fixed.obsoleteEngagementCode}' then raise exception 'YONG_MEI_ENGAGEMENT_DELETE_IDENTITY_DRIFT'; end if;
  if exists (select 1 from public.engagement_components component where component.engagement_id = obsolete_engagement.id) or exists (select 1 from public.source_selections selection where selection.mapped_engagement_id = obsolete_engagement.id) or exists (select 1 from public.source_reported_figures figure where figure.engagement_id = obsolete_engagement.id) then raise exception 'YONG_MEI_ENGAGEMENT_REFERENCE_REMAINS'; end if;
  insert into public.audit_events(tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, before_summary, after_summary) values (obsolete_engagement.tenant_id, obsolete_engagement.company_id, '${fixed.actorId}'::uuid, 'c1.source_ownership_cleanup.engagement_deleted', 'project_engagement', obsolete_engagement.id::text, pg_catalog.gen_random_uuid(), pg_catalog.jsonb_build_object('id', obsolete_engagement.id, 'projectId', obsolete_engagement.project_id, 'partyId', obsolete_engagement.party_id, 'code', obsolete_engagement.code, 'name', obsolete_engagement.name, 'executionState', obsolete_engagement.execution_state, 'currencyCode', obsolete_engagement.currency_code), pg_catalog.jsonb_build_object('deleted', true, 'reason', '${fixed.reason}'));
  delete from public.project_engagements engagement where engagement.id = '${fixed.obsoleteEngagementId}'::uuid returning engagement.id into deleted_engagement;
  if deleted_engagement is null then raise exception 'YONG_MEI_ENGAGEMENT_DELETE_REQUIRED'; end if;
  select party.* into obsolete_party from public.business_parties party where party.id = '${fixed.obsoletePartyId}'::uuid for update;
  if not found or obsolete_party.tenant_id is distinct from '${fixed.tenantId}'::uuid or obsolete_party.company_id is distinct from '${fixed.companyId}'::uuid or obsolete_party.code is distinct from '${fixed.obsoletePartyCode}' then raise exception 'YONG_MEI_PARTY_DELETE_IDENTITY_DRIFT'; end if;
  if exists (select 1 from public.project_engagements engagement where engagement.party_id = obsolete_party.id) or exists (select 1 from public.source_selections selection where selection.mapped_party_id = obsolete_party.id) or exists (select 1 from public.source_reported_figures figure where figure.party_id = obsolete_party.id) then raise exception 'YONG_MEI_PARTY_REFERENCE_REMAINS'; end if;
  insert into public.audit_events(tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, before_summary, after_summary) values (obsolete_party.tenant_id, obsolete_party.company_id, '${fixed.actorId}'::uuid, 'c1.source_ownership_cleanup.party_deleted', 'business_party', obsolete_party.id::text, pg_catalog.gen_random_uuid(), pg_catalog.jsonb_build_object('id', obsolete_party.id, 'code', obsolete_party.code, 'displayName', obsolete_party.display_name, 'partyKind', obsolete_party.party_kind, 'isActive', obsolete_party.is_active), pg_catalog.jsonb_build_object('deleted', true, 'reason', '${fixed.reason}'));
  delete from public.business_parties party where party.id = '${fixed.obsoletePartyId}'::uuid returning party.id into deleted_party;
  if deleted_party is null then raise exception 'YONG_MEI_PARTY_DELETE_REQUIRED'; end if;
end;
$$;
commit;`
}

function assertReady(readiness) {
  const expectedIds = [...fixed.selectionIds].sort()
  const selectionIds = Array.isArray(readiness?.selectionIds) ? [...readiness.selectionIds].sort() : []
  const checks = [
    readiness?.selectionCount === fixed.expectedSelectionCount,
    readiness?.oldSelectionCount === fixed.expectedSelectionCount,
    readiness?.figureCount === fixed.expectedFigureCount,
    readiness?.oldFigureCount === fixed.expectedFigureCount,
    JSON.stringify(selectionIds) === JSON.stringify(expectedIds),
    readiness?.sourceProjectVerified === true,
    readiness?.targetProjectVerified === true,
    readiness?.actorAuthorized === true,
    readiness?.partyVerified === true,
    readiness?.engagementVerified === true,
    readiness?.componentSafe === true,
    readiness?.oldOwnershipVerified === true,
    readiness?.correctionApiVerified === true,
  ]
  if (!checks.every(Boolean)) throw new Error('Yong Mei promotion dry run is not ready')
  return { mode: 'c1-promote-yong-mei-project', readiness: 'READY_FOR_EXECUTION', mutations: 0 }
}

export async function runYongMeiPromotion({ execute = false, cwd = process.cwd(), fetchImpl = globalThis.fetch } = {}) {
  assertCloudDevTarget({ cwd })
  const response = await fetchImpl(`${MANAGEMENT_API_ORIGIN}/v1/projects/${CANONICAL_DEV_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${readDedicatedSupabaseDevAccessToken(cwd)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: execute ? buildYongMeiPromotionExecuteSql() : buildYongMeiPromotionDryRunSql(), read_only: !execute }),
    signal: AbortSignal.timeout(20_000),
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`Yong Mei promotion ${execute ? 'execute' : 'dry run'} failed: ${response.status}`)
  if (execute) return { mode: 'c1-promote-yong-mei-project', execute: true, result: body }
  let rows
  try { rows = JSON.parse(body) } catch { throw new Error('Yong Mei promotion dry run returned malformed data') }
  return assertReady(Array.isArray(rows) ? rows[0]?.readiness : undefined)
}
